import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
} from "@tanstack/react-router";
import type { ParsedLocation, RouterHistory } from "@tanstack/react-router";

import { isAgent } from "../shared/api.ts";
import type { Agent } from "../shared/api.ts";
import { Home } from "./features/home/home.tsx";
import { NotFound } from "./ui/not-found.tsx";

const root = createRootRoute({ component: Outlet });

const home = createRoute({
  getParentRoute: () => root,
  path: "/",
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string; agent?: Agent; error?: string } => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(isAgent(search.agent) ? { agent: search.agent } : {}),
    ...(typeof search.error === "string" && search.error ? { error: search.error } : {}),
  }),
  component: function HomeRoute() {
    const { q, agent, error } = home.useSearch();

    return <Home q={q ?? ""} agent={agent} error={error} />;
  },
});

const fork = createRoute({
  getParentRoute: () => root,
  path: "/$owner/$name",
  validateSearch: (search: Record<string, unknown>): { since?: string; error?: string } => ({
    ...(typeof search.since === "string" ? { since: search.since } : {}),
    ...(typeof search.error === "string" ? { error: search.error } : {}),
  }),
  component: lazyRouteComponent(async () => import("./features/fork/fork-page.tsx"), "ForkRoute"),
});

const forks = createRoute({
  getParentRoute: () => root,
  path: "/forks",
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === "string" ? { error: search.error } : {},
  component: lazyRouteComponent(
    async () => import("./features/dashboard/dashboard.tsx"),
    "Dashboard",
  ),
});

const link = createRoute({
  getParentRoute: () => root,
  path: "/link/$owner/$name",
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === "string" ? { error: search.error } : {},
  component: lazyRouteComponent(async () => import("./features/link/link-page.tsx"), "LinkRoute"),
});

const verify = createRoute({
  getParentRoute: () => root,
  path: "/verify",
  validateSearch: (
    search: Record<string, unknown>,
  ): { email?: string; error?: string; back?: string } => ({
    ...(typeof search.email === "string" ? { email: search.email } : {}),
    ...(typeof search.back === "string" && /^\/(?![/\\])[^\\\s\p{Cc}]*$/u.test(search.back)
      ? { back: search.back }
      : {}),
    ...(typeof search.error === "string" ? { error: search.error } : {}),
  }),
  component: lazyRouteComponent(async () => import("./features/verify/verify.tsx"), "VerifyRoute"),
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

export const makeRouter = (history?: RouterHistory) =>
  createRouter({
    routeTree: root.addChildren([home, forks, link, verify, fork]),
    defaultViewTransition: { types: forkIt },
    defaultNotFoundComponent: NotFound,
    ...(history ? { history } : {}),
  });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}
