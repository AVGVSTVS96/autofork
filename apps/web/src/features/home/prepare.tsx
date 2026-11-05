import { useAtomMount, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import { useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import type { Agent, ForkState, Repo } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { GitHubIcon } from "../../ui/icons.tsx";
import { Retry } from "../../ui/retry.tsx";
import { Connect } from "./connect.tsx";
import { Sk } from "./skeleton.tsx";

type Prepared = AsyncResult.AsyncResult<ForkState, client.ApiError>;

const RECHECK = 15_000;
const RECHECK_ON_RETURN_AFTER = 3000;

const visible = () => document.visibilityState === "visible";

const settled = (result: Prepared) =>
  AsyncResult.isFailure(result) ||
  (AsyncResult.isSuccess(result) &&
    (result.value.status === "ready" || result.value.status === "new"));

const watching = (atom: Atom.Atom<Prepared>) =>
  Atom.readable((get) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let checkedAt = 0;

    const check = () => {
      const result = get.once(atom);

      if (result.waiting || settled(result) || Date.now() - checkedAt < RECHECK_ON_RETURN_AFTER) {
        return;
      }

      clearTimeout(timer);
      get.refresh(atom);
    };

    const back = () => {
      if (visible()) {
        check();
      }
    };

    get.subscribe(atom, (result) => {
      if (result.waiting) {
        return;
      }

      checkedAt = Date.now();
      clearTimeout(timer);

      if (AsyncResult.isFailure(result) && client.isSignedOut(result.cause)) {
        get.refresh(client.me);
      }

      timer = !settled(result) && visible() ? setTimeout(check, RECHECK) : undefined;
    });

    addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    get.addFinalizer(() => {
      clearTimeout(timer);
      removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    });
  });

const GitHubStep = ({
  link,
  action,
  children,
}: {
  link: string | null;
  action: string;
  children: ReactNode;
}) => (
  <div>
    <p>{children}</p>
    <a className="btn primary" href={link ?? "#"} target="_blank" rel="noreferrer">
      <GitHubIcon /> {action}
    </a>
  </div>
);

type Shown = (state: ForkState, repo: Repo, named: ReactElement) => ReactElement;

const STATUS: Readonly<Record<ForkState["status"], Shown>> = {
  new: (_state, _repo, named) => <p>Your fork will be {named}</p>,
  ready: (_state, _repo, named) => <p>Your fork: {named}</p>,
  install: ({ link }) => (
    <GitHubStep link={link} action="Install autofork">
      Install autofork on GitHub so it can make your fork, then come back here.
    </GitHubStep>
  ),
  fork: ({ link }, repo) => (
    <GitHubStep link={link} action={`Fork ${repo.name} on GitHub`}>
      autofork can only see the repos you picked. Fork it on GitHub, then come back here.
    </GitHubStep>
  ),
  grant: ({ link }, _repo, named) => (
    <GitHubStep link={link} action="Open autofork's access">
      Add {named} to autofork&apos;s repos on GitHub, then come back here.
    </GitHubStep>
  ),
};

const Status = ({ state, repo, making }: { state: ForkState; repo: Repo; making: boolean }) => {
  const named = (
    <b>
      {state.owner}/{state.name}
    </b>
  );

  return making ? (
    <p className="wait">
      <span>Making {named}…</span>
    </p>
  ) : (
    STATUS[state.status](state, repo, named)
  );
};

const Places = ({ state, onPick }: { state: ForkState; onPick: (place: string) => void }) => (
  <fieldset className="segments" aria-label="Fork into">
    {state.places.map((place) => (
      <button
        type="button"
        key={place}
        className={place === state.owner ? "on" : ""}
        onClick={() => {
          onPick(place);
        }}
      >
        {place}
      </button>
    ))}
  </fieldset>
);

const Progress = ({
  state,
  failed,
  repo,
  making,
  onRetry,
}: {
  state: ForkState | null;
  failed: AsyncResult.Failure<ForkState, client.ApiError> | null;
  repo: Repo;
  making: boolean;
  onRetry: () => void;
}) => {
  if (failed !== null) {
    return <Retry message={client.failure(failed.cause)} onRetry={onRetry} />;
  }

  return state === null ? (
    <p>
      Your fork: <Sk w="16ch" />
    </p>
  ) : (
    <Status state={state} repo={repo} making={making} />
  );
};

export const Prepare = ({
  repo,
  change,
  agent,
}: {
  repo: Repo;
  change: Atom.Atom<string>;
  agent: Agent | undefined;
}) => {
  const [into, setInto] = useState<string | undefined>(undefined);
  const [pick, setPick] = useState(agent);
  const [held, setHeld] = useState<ForkState | null>(null);
  const committed = pick !== undefined;
  const atom = client.prepared({ owner: repo.owner, name: repo.name, into, preview: !committed });
  const result = useAtomValue(atom);
  const retry = useAtomRefresh(atom);

  useAtomMount(useMemo(() => watching(atom), [atom]));

  const state = Option.getOrNull(AsyncResult.value(result)) ?? held;
  const status = state?.status;
  const open = status === "new" || status === "ready";
  const making = committed && status === "new";

  return (
    <>
      <li className={open && !making ? "done" : "now"}>
        <span className="n">2</span>
        <div>
          {state !== null && state.places.length > 1 && !committed ? (
            <Places state={state} onPick={setInto} />
          ) : null}
          <Progress
            state={state}
            failed={AsyncResult.isFailure(result) && !result.waiting ? result : null}
            repo={repo}
            making={making}
            onRetry={retry}
          />
        </div>
      </li>
      {open || committed ? (
        <Connect
          fork={committed && status === "ready" ? state : null}
          pick={pick}
          onPick={(next) => {
            setHeld(state);
            setPick(next);
          }}
          change={change}
        />
      ) : (
        <li className="later">
          <span className="n">3</span>
          <p>The agent builds it on your ChatGPT or Claude plan</p>
        </li>
      )}
    </>
  );
};
