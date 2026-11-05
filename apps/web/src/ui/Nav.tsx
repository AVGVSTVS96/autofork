import { useAtomValue } from "@effect/atom-react";
import { Link, useRouterState } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import * as client from "../lib/api/client.ts";
import { Account } from "./Account.tsx";
import { Logo } from "./icons.tsx";

export const Nav = ({ children }: { children?: ReactNode }) => (
  <nav>
    <Link
      to="/"
      search={{}}
      activeOptions={{ includeSearch: false }}
      className="brand"
      aria-label="autofork"
    >
      <Logo />
    </Link>
    <div className="links">
      {children}
      <Me />
    </div>
  </nav>
);

const unchanging = () => () => {};

/* False while hydrating the prerendered home page, so the first render matches the HTML built for "/" */
const useHydrated = () =>
  useSyncExternalStore(
    unchanging,
    () => true,
    () => false,
  );

const Me = () => {
  const me = useAtomValue(client.me);
  const location = useRouterState({ select: (state) => state.location.href });
  const here = useHydrated() ? location : "/";
  const user = AsyncResult.isSuccess(me) ? me.value : null;

  return user ? (
    <Account login={user.login} avatar={user.avatar} />
  ) : (
    <a href={`/api/github/start?back=${encodeURIComponent(here)}`}>Sign in</a>
  );
};
