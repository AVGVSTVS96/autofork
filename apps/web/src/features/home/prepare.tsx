import { useAtomRefresh, useAtomSet } from "@effect/atom-react";
import { useEffect, useState } from "react";

import type { Agent, ForkState, Repo } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { GitHubIcon } from "../../ui/icons.tsx";
import { Retry } from "../../ui/retry.tsx";
import { Connect } from "./connect.tsx";
import { Sk } from "./skeleton.tsx";

export const Prepare = ({
  repo,
  change,
  agent,
}: {
  repo: Repo;
  change: string;
  agent: Agent | undefined;
}) => {
  const prepare = useAtomSet(client.prepare, { mode: "promiseExit" });
  const meRefresh = useAtomRefresh(client.me);
  const [state, setState] = useState<ForkState | null>(null);
  const [into, setInto] = useState<string | undefined>(undefined);
  const [pick, setPick] = useState(agent);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const committed = pick !== undefined;

  useEffect(() => {
    let live = true;
    let checking = false;
    let settled = false;
    let last = 0;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      if (checking || settled || Date.now() - last < 3000) {
        return;
      }

      checking = true;
      clearTimeout(timer);

      const exit = await prepare({
        payload: { owner: repo.owner, name: repo.name, into, preview: !committed },
      });

      checking = false;
      last = Date.now();

      if (!live) {
        return;
      }

      try {
        const next = client.unwrap(exit);
        settled = next.status === "ready" || next.status === "new";
        setState(next);
        setError(null);

        if (!settled && document.visibilityState === "visible") {
          timer = setTimeout(check, 15000);
        }
      } catch (error_) {
        settled = true;
        setError((error_ as Error).message);

        if ((error_ as Error).message.startsWith("Your GitHub sign-in")) {
          meRefresh();
        }
      }
    };

    const back = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };

    void check();
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);

    return () => {
      live = false;
      clearTimeout(timer);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [repo.owner, repo.name, into, committed, attempt]);

  const open = state?.status === "new" || state?.status === "ready";
  const making = committed && state?.status === "new";
  const fork = committed && state?.status === "ready" ? state : null;

  return (
    <>
      <li className={open && !making ? "done" : "now"}>
        <span className="n">2</span>
        <div>
          {state && state.places.length > 1 && !committed ? (
            <div className="segments" role="group" aria-label="Fork into">
              {state.places.map((place) => (
                <button
                  type="button"
                  key={place}
                  className={place === state.owner ? "on" : ""}
                  onClick={() => {
                    setState(null);
                    setInto(place);
                  }}
                >
                  {place}
                </button>
              ))}
            </div>
          ) : null}
          {error ? (
            <Retry
              message={error}
              onRetry={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            />
          ) : state ? (
            making ? (
              <p className="wait">
                <span>
                  Making{" "}
                  <b>
                    {state.owner}/{state.name}
                  </b>
                  …
                </span>
              </p>
            ) : state.status === "new" ? (
              <p>
                Your fork will be{" "}
                <b>
                  {state.owner}/{state.name}
                </b>
              </p>
            ) : state.status === "ready" ? (
              <p>
                Your fork:{" "}
                <b>
                  {state.owner}/{state.name}
                </b>
              </p>
            ) : state.status === "install" ? (
              <div>
                <p>Install autofork on GitHub so it can make your fork, then come back here.</p>
                <a
                  className="btn primary"
                  href={state.link ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitHubIcon /> Install autofork
                </a>
              </div>
            ) : state.status === "fork" ? (
              <div>
                <p>
                  autofork can only see the repos you picked. Fork it on GitHub, then come back
                  here.
                </p>
                <a
                  className="btn primary"
                  href={state.link ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitHubIcon /> Fork {repo.name} on GitHub
                </a>
              </div>
            ) : (
              <div>
                <p>
                  Add{" "}
                  <b>
                    {state.owner}/{state.name}
                  </b>{" "}
                  to autofork's repos on GitHub, then come back here.
                </p>
                <a
                  className="btn primary"
                  href={state.link ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitHubIcon /> Open autofork's access
                </a>
              </div>
            )
          ) : (
            <p>
              Your fork: <Sk w="16ch" />
            </p>
          )}
        </div>
      </li>
      {open || committed ? (
        <Connect fork={fork} pick={pick} onPick={setPick} change={change} />
      ) : (
        <li className="later">
          <span className="n">3</span>
          <p>The agent builds it on your ChatGPT or Claude plan</p>
        </li>
      )}
    </>
  );
};
