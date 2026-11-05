import {
  createRootRoute,
  createRoute,
  createRouter,
  HeadContent,
  lazyRouteComponent,
  Outlet,
} from "@tanstack/react-router";
import type { ParsedLocation, RouterHistory } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Agent, split } from "../shared/api.ts";
import { Home } from "./features/home/home.tsx";
import { NotFound } from "./ui/not-found.tsx";

const HOME_TITLE = "autofork: customized forks that maintain themselves";

const titled = (title: string) => ({ meta: [{ title }] });

const Text = Schema.NonEmptyString;
const LocalPath = Text.check(Schema.isPattern(/^\/(?![/\\])[^\\\s\p{Cc}]*$/u));

const ignoredIfInvalid = <S extends Schema.Top>(schema: S) =>
  Schema.optional(schema.pipe(Schema.catchDecoding(() => Effect.succeedNone)));

const ErrorSearch = Schema.toStandardSchemaV1(Schema.Struct({ error: ignoredIfInvalid(Text) }));

const root = createRootRoute({
  head: () => titled("Not found · autofork"),
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
});

const home = createRoute({
  getParentRoute: () => root,
  path: "/",
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({
      q: ignoredIfInvalid(Text),
      agent: ignoredIfInvalid(Agent),
      error: ignoredIfInvalid(Text),
    }),
  ),
  head: ({ match }) => {
    const { app } = split(match.search.q ?? "");

    return titled(app ? `${app} · autofork` : HOME_TITLE);
  },
  component: () => {
    const { q, agent, error } = home.useSearch();

    return <Home q={q ?? ""} agent={agent} error={error} />;
  },
});

const fork = createRoute({
  getParentRoute: () => root,
  path: "/$owner/$name",
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({ since: ignoredIfInvalid(Text), error: ignoredIfInvalid(Text) }),
  ),
  head: ({ params }) => titled(`${params.owner}/${params.name} · autofork`),
  component: lazyRouteComponent(
    async () => await import("./features/fork/fork-page.tsx"),
    "ForkRoute",
  ),
});

const forks = createRoute({
  getParentRoute: () => root,
  path: "/forks",
  validateSearch: ErrorSearch,
  head: () => titled("Your forks · autofork"),
  component: lazyRouteComponent(
    async () => await import("./features/dashboard/dashboard.tsx"),
    "Dashboard",
  ),
});

const link = createRoute({
  getParentRoute: () => root,
  path: "/link/$owner/$name",
  validateSearch: ErrorSearch,
  head: ({ params }) => titled(`Link ${params.owner}/${params.name} · autofork`),
  component: lazyRouteComponent(
    async () => await import("./features/link/link-page.tsx"),
    "LinkRoute",
  ),
});

const verify = createRoute({
  getParentRoute: () => root,
  path: "/verify",
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({
      email: ignoredIfInvalid(Text),
      error: ignoredIfInvalid(Text),
      back: ignoredIfInvalid(LocalPath),
    }),
  ),
  head: () => titled("Check your email · autofork"),
  component: lazyRouteComponent(
    async () => await import("./features/verify/verify.tsx"),
    "VerifyRoute",
  ),
});

const asking = (location: ParsedLocation) => "q" in location.search;

const forkIt = ({
  fromLocation: from,
  toLocation: to,
}: {
  fromLocation?: ParsedLocation;
  toLocation: ParsedLocation;
}) =>
  from?.pathname === "/" &&
  to.pathname === "/" &&
  asking(from) !== asking(to) &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches
    ? [asking(to) ? "fork-it" : "back"]
    : false;

export const appRouter = (history: RouterHistory) =>
  createRouter({
    routeTree: root.addChildren([home, forks, link, verify, fork]),
    defaultViewTransition: { types: forkIt },
    defaultNotFoundComponent: NotFound,
    history,
  });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof appRouter>;
  }
}
