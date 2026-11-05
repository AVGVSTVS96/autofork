import { RegistryContext, useAtom, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import type * as AtomRegistry from "effect/reactivity/AtomRegistry";
import { useCallback, useContext, useId, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";

import type { MyFork } from "../../shared/api.ts";
import * as client from "../lib/api/client.ts";
import { repoIcon } from "../lib/repos/known.ts";

const HOVER_INTENT = 120;
const HOVER_GRACE = 300;
const WARM_AGAIN_AFTER = 10_000;

let warmedAt = 0;

const warmForks = (registry: AtomRegistry.AtomRegistry) => {
  if (Date.now() - warmedAt < WARM_AGAIN_AFTER) {
    return;
  }

  warmedAt = Date.now();
  registry.refresh(client.mine);
  registry.mount(client.mine)();
};

type Opened = "hover" | "click" | null;

type Move = "next" | "previous" | "first" | "last";

const MOVES = new Map<string, Move>([
  ["ArrowDown", "next"],
  ["ArrowUp", "previous"],
  ["Home", "first"],
  ["End", "last"],
]);

const Chevron = () => (
  <svg className="chev" viewBox="0 0 12 12" aria-hidden="true">
    <path
      d="M3 4.75 6 7.75l3-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Row = ({ fork, login, onPick }: { fork: MyFork; login: string; onPick: () => void }) => (
  <Link
    role="menuitem"
    tabIndex={-1}
    to="/$owner/$name"
    params={{ owner: fork.owner, name: fork.name }}
    search={{}}
    onClick={onPick}
  >
    <img
      src={
        fork.upstream === null
          ? `https://github.com/${fork.owner}.png?size=40`
          : repoIcon(fork.upstream)
      }
      alt=""
      width={20}
      height={20}
    />
    <span className="name">
      {fork.owner === login ? null : <span className="owner">{fork.owner}/</span>}
      {fork.name}
    </span>
  </Link>
);

const Forks = ({ login, onPick }: { login: string; onPick: () => void }) => {
  const result = useAtomValue(client.mine);
  const retry = useAtomRefresh(client.mine);

  if (AsyncResult.isInitial(result)) {
    return (
      <div className="menu-list">
        <span className="menu-sk" />
        <span className="menu-sk" />
      </div>
    );
  }

  if (AsyncResult.isFailure(result)) {
    return (
      <div className="menu-list">
        <div className="menu-note">
          <p className="bad">{client.failure(result.cause)}</p>
          <button type="button" role="menuitem" tabIndex={-1} onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="menu-list">
      {result.value.length > 0 ? (
        result.value.map((fork) => (
          <Row key={`${fork.owner}/${fork.name}`} fork={fork} login={login} onPick={onPick} />
        ))
      ) : (
        <p className="menu-note">Forks you make show up here.</p>
      )}
    </div>
  );
};

const SignOut = () => {
  const [result, signOut] = useAtom(client.signOut);
  const failed = AsyncResult.isFailure(result) && !result.waiting;

  if (failed) {
    client.failure(result.cause);
  }

  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={failed ? "bad" : undefined}
      disabled={result.waiting}
      onClick={() => {
        signOut({ reactivityKeys: [client.SESSION] });
      }}
    >
      {result.waiting ? "Signing out…" : null}
      {failed ? "Couldn't sign out. Try again" : null}
      {result.waiting || failed ? null : "Sign out"}
    </button>
  );
};

export const Account = ({ login, avatar }: { login: string; avatar: string }) => {
  const registry = useContext(RegistryContext);
  const [opened, setOpened] = useState<Opened>(null);
  const [seen, setSeen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();
  const open = opened !== null;

  const show = (how: Exclude<Opened, null>) => {
    clearTimeout(timer.current);
    warmForks(registry);
    setSeen(true);
    setOpened(how);
  };

  const close = useCallback(() => {
    clearTimeout(timer.current);

    if (panel.current?.contains(document.activeElement) === true) {
      trigger.current?.focus({ preventScroll: true });
    }

    setOpened(null);
  }, []);

  const closeOnPointerOutside = useCallback(
    (root: HTMLDivElement) => {
      const outside = (event: globalThis.PointerEvent) => {
        if (!(event.target instanceof Node && root.contains(event.target))) {
          close();
        }
      };

      document.addEventListener("pointerdown", outside);

      return () => {
        document.removeEventListener("pointerdown", outside);
        clearTimeout(timer.current);
      };
    },
    [close],
  );

  const step = (move: Move) =>
    requestAnimationFrame(() => {
      const items = [...(panel.current?.querySelectorAll("[role=menuitem]") ?? [])];
      const at = items.indexOf(document.activeElement ?? document.body);
      const to = { next: at + 1, previous: at === -1 ? -1 : at - 1, first: 0, last: -1 }[move];
      const item = items.at(to % items.length);

      if (item instanceof HTMLElement) {
        item.focus();
      }
    });

  const enter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") {
      return;
    }

    warmForks(registry);
    clearTimeout(timer.current);

    if (!open) {
      timer.current = setTimeout(() => {
        show("hover");
      }, HOVER_INTENT);
    }
  };

  const leave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") {
      return;
    }

    clearTimeout(timer.current);

    if (opened === "hover") {
      timer.current = setTimeout(close, HOVER_GRACE);
    }
  };

  const toggle = (event: MouseEvent) => {
    if (opened === "click") {
      close();

      return;
    }

    show("click");

    if (event.detail === 0) {
      step("first");
    }
  };

  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
      trigger.current?.focus();

      return;
    }

    if (event.key === "Tab") {
      if (open) {
        close();
      }

      return;
    }

    const move = MOVES.get(event.key);

    if (move === undefined || (!open && (move === "first" || move === "last"))) {
      return;
    }

    event.preventDefault();

    if (!open) {
      show("click");
    }

    step(move);
  };

  return (
    <div
      ref={closeOnPointerOutside}
      className={open ? "account open" : "account"}
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <button
        ref={trigger}
        type="button"
        className="me"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        onKeyDown={keys}
      >
        <img src={avatar} alt="" width={22} height={22} />
        <span>{login}</span>
        <Chevron />
      </button>
      <div
        ref={panel}
        id={id}
        className="menu"
        role="menu"
        tabIndex={-1}
        aria-label={`Signed in as ${login}`}
        inert={!open}
        onKeyDown={keys}
      >
        <p className="menu-who">
          Signed in as <b>{login}</b>
        </p>
        <Link className="menu-label" role="menuitem" tabIndex={-1} to="/forks" onClick={close}>
          Your forks and spend
        </Link>
        {seen ? <Forks login={login} onPick={close} /> : null}
        <hr />
        <SignOut />
      </div>
    </div>
  );
};
