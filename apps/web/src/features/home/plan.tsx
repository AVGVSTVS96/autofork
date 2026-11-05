import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useState } from "react";

import { split } from "../../../shared/api.ts";
import type { Agent } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { known } from "../../lib/repos/known.ts";
import type { Found } from "../../lib/repos/known.ts";
import { GitHubIcon } from "../../ui/icons.tsx";
import { Retry } from "../../ui/retry.tsx";
import { Prepare } from "./prepare.tsx";
import { Sk } from "./skeleton.tsx";

const stars = (count: number) =>
  count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);

export const Flow = ({
  q,
  agent,
  error,
}: {
  q: string;
  agent: Agent | undefined;
  error: string | undefined;
}) => {
  const { app, change } = split(q);
  const ready = known(app);

  return ready ? (
    <Plan found={ready} app={app} initialChange={change} agent={agent} error={error} />
  ) : (
    <Lookup app={app} initialChange={change} agent={agent} error={error} />
  );
};

interface Asked {
  app: string;
  initialChange: string;
  agent: Agent | undefined;
  error: string | undefined;
}

const Lookup = (asked: Asked) => {
  const atom = client.resolve(asked.app);
  const retry = useAtomRefresh(atom);

  return AsyncResult.match(useAtomValue(atom), {
    onInitial: () => <Plan found={undefined} {...asked} />,
    onFailure: ({ cause }) => (
      <Retry className="note" message={client.failure(cause)} onRetry={retry} />
    ),
    onSuccess: ({ value }) => <Plan found={value} {...asked} />,
  });
};

const Plan = ({
  found,
  app,
  initialChange,
  agent,
  error,
}: Asked & { found: Found | undefined }) => {
  const [change, setChange] = useState(initialChange);
  const [cold] = useState(!found);
  const arrive = cold ? "arrive" : undefined;
  const navigate = useNavigate();
  const me = useAtomValue(client.me);
  const user = AsyncResult.isSuccess(me) ? me.value : undefined;
  const repo = found?.repo;
  const named = repo ? `${repo.owner}/${repo.name}` : app;
  const back = `/?${new URLSearchParams({ q: change.trim() ? `${named}: ${change}` : named, ...(agent ? { agent } : {}) })}`;

  return (
    <section className="plan">
      <a
        className="card target"
        href={repo ? `https://github.com/${repo.owner}/${repo.name}` : undefined}
        target="_blank"
        rel="noreferrer"
      >
        {repo ? (
          <img className={arrive} src={repo.avatar} alt="" width={44} height={44} />
        ) : (
          <span className="sk face" />
        )}
        <span className="who">
          <span className="repo">
            {repo ? (
              <span className={arrive}>
                {repo.owner} / <b>{repo.name}</b>
              </span>
            ) : (
              <Sk w="12ch" />
            )}
          </span>
          {repo ? (
            repo.description ? (
              <span className={cold ? "about arrive" : "about"}>{repo.description}</span>
            ) : null
          ) : (
            <span className="about">
              <Sk w="22ch" />
            </span>
          )}
        </span>
        <span className="stars">
          {repo ? <span className={arrive}>★ {stars(repo.stars)}</span> : <Sk w="3.5ch" />}
        </span>
      </a>
      {found?.others.length ? (
        <p className={cold ? "others arrive" : "others"}>
          Not it?{" "}
          {found.others.map((other) => (
            <button
              type="button"
              key={`${other.owner}/${other.name}`}
              className="pill"
              onClick={() =>
                void navigate({
                  to: "/",
                  search: { q: `${other.owner}/${other.name}: ${change}`, agent },
                })
              }
            >
              {other.owner}/{other.name}
            </button>
          ))}
        </p>
      ) : null}
      <label className="change">
        <span>What you'd change</span>
        <textarea
          value={change}
          onChange={(event) => {
            setChange(event.target.value);
          }}
          rows={1}
          placeholder="always show context usage"
        />
      </label>

      <ol className="steps">
        <li className={user ? "done" : "now"}>
          <span className="n">1</span>
          {AsyncResult.isInitial(me) ? (
            <div>
              <p>
                <Sk w="26ch" />
              </p>
              <span className="sk button" />
              <p className="fine">
                <Sk w="38ch" />
              </p>
            </div>
          ) : user ? (
            <p>
              Signed in to GitHub as <b>{user.login}</b>
            </p>
          ) : (
            <div>
              <p>Your fork lives in your GitHub account.</p>
              <a
                className="btn primary"
                href={`/api/github/start?back=${encodeURIComponent(back)}`}
              >
                <GitHubIcon /> Continue with GitHub
              </a>
              {error ? <p className="bad">{error}</p> : null}
              <p className="fine">
                Keep "All repositories" so autofork can make the fork. It only changes the forks it
                makes.
              </p>
            </div>
          )}
        </li>
        {user && change.trim() && repo ? (
          <Prepare repo={repo} change={change} agent={agent} />
        ) : user && change.trim() ? (
          <>
            <li className="now">
              <span className="n">2</span>
              <p>
                Your fork: <Sk w="16ch" />
              </p>
            </li>
            <li className="later">
              <span className="n">3</span>
              <p>The agent builds it on your ChatGPT or Claude plan</p>
            </li>
          </>
        ) : (
          <>
            <li className="later">
              <span className="n">2</span>
              <p>Your fork of {repo ? repo.name : <Sk w="7ch" />}</p>
            </li>
            <li className="later">
              <span className="n">3</span>
              <p>The agent builds it on your ChatGPT or Claude plan</p>
            </li>
          </>
        )}
      </ol>
    </section>
  );
};
