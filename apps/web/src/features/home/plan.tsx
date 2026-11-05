import { useAtom, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import { useState } from "react";
import type { ReactNode } from "react";

import { split } from "../../../shared/api.ts";
import type { Agent, Repo } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { known } from "../../lib/repos/known.ts";
import type { Found } from "../../lib/repos/known.ts";
import { GitHubIcon } from "../../ui/icons.tsx";
import { Retry } from "../../ui/retry.tsx";
import { Prepare } from "./prepare.tsx";
import { Sk } from "./skeleton.tsx";

const stars = (count: number) =>
  count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);

interface Asked {
  app: string;
  initialChange: string;
  agent: Agent | undefined;
  error: string | undefined;
}

const askAgain = (named: string, change: string, agent: Agent | undefined) => {
  const search = new URLSearchParams({ q: change.trim() === "" ? named : `${named}: ${change}` });

  if (agent !== undefined) {
    search.set("agent", agent);
  }

  return `/?${search}`;
};

const Target = ({ repo, cold }: { repo: Repo | undefined; cold: boolean }) => {
  const arrive = cold ? "arrive" : undefined;

  if (repo === undefined) {
    return (
      <div className="card target">
        <span className="sk face" />
        <span className="who">
          <span className="repo">
            <Sk w="12ch" />
          </span>
          <span className="about">
            <Sk w="22ch" />
          </span>
        </span>
        <span className="stars">
          <Sk w="3.5ch" />
        </span>
      </div>
    );
  }

  return (
    <a
      className="card target"
      href={`https://github.com/${repo.owner}/${repo.name}`}
      target="_blank"
      rel="noreferrer"
    >
      <img className={arrive} src={repo.avatar} alt="" width={44} height={44} />
      <span className="who">
        <span className="repo">
          <span className={arrive}>
            {repo.owner} / <b>{repo.name}</b>
          </span>
        </span>
        {repo.description === null || repo.description === "" ? null : (
          <span className={cold ? "about arrive" : "about"}>{repo.description}</span>
        )}
      </span>
      <span className="stars">
        <span className={arrive}>★ {stars(repo.stars)}</span>
      </span>
    </a>
  );
};

const Others = ({
  others,
  cold,
  change,
  agent,
}: {
  others: readonly Repo[];
  cold: boolean;
  change: string;
  agent: Agent | undefined;
}) => {
  const navigate = useNavigate();

  return (
    <p className={cold ? "others arrive" : "others"}>
      Not it?{" "}
      {others.map((other) => (
        <button
          type="button"
          key={`${other.owner}/${other.name}`}
          className="pill"
          onClick={() => {
            void navigate({
              to: "/",
              search: { q: `${other.owner}/${other.name}: ${change}`, agent },
            });
          }}
        >
          {other.owner}/{other.name}
        </button>
      ))}
    </p>
  );
};

const SignIn = ({ back, error }: { back: string; error: string | undefined }) => {
  const me = useAtomValue(client.me);

  if (AsyncResult.isInitial(me)) {
    return (
      <div>
        <p>
          <Sk w="26ch" />
        </p>
        <span className="sk button" />
        <p className="fine">
          <Sk w="38ch" />
        </p>
      </div>
    );
  }

  if (AsyncResult.isSuccess(me) && me.value !== null) {
    return (
      <p>
        Signed in to GitHub as <b>{me.value.login}</b>
      </p>
    );
  }

  return (
    <div>
      <p>Your fork lives in your GitHub account.</p>
      <a className="btn primary" href={`/api/github/start?back=${encodeURIComponent(back)}`}>
        <GitHubIcon /> Continue with GitHub
      </a>
      {error === undefined ? null : <p className="bad">{error}</p>}
      <p className="fine">
        Keep &quot;All repositories&quot; so autofork can make the fork. It only changes the forks
        it makes.
      </p>
    </div>
  );
};

const Later = ({ step, children }: { step: 2 | 3; children: ReactNode }) => (
  <li className="later">
    <span className="n">{step}</span>
    <p>{children}</p>
  </li>
);

const AGENT_STEP = "The agent builds it on your ChatGPT or Claude plan";

const NextSteps = ({
  signedIn,
  repo,
  change,
  agent,
}: {
  signedIn: boolean;
  repo: Repo | undefined;
  change: Atom.Atom<string>;
  agent: Agent | undefined;
}) => {
  const asked = useAtomValue(change).trim() !== "";

  if (signedIn && asked && repo !== undefined) {
    return <Prepare repo={repo} change={change} agent={agent} />;
  }

  return (
    <>
      {signedIn && asked ? (
        <li className="now">
          <span className="n">2</span>
          <p>
            Your fork: <Sk w="16ch" />
          </p>
        </li>
      ) : (
        <Later step={2}>Your fork of {repo === undefined ? <Sk w="7ch" /> : repo.name}</Later>
      )}
      <Later step={3}>{AGENT_STEP}</Later>
    </>
  );
};

const Plan = ({
  found,
  app,
  initialChange,
  agent,
  error,
}: Asked & { found: Found | undefined }) => {
  // oxlint-disable-next-line react/hook-use-state -- both are fixed on the first render: whether the repo still has to arrive, and the atom the steps read the change from
  const [{ cold, changeAtom }] = useState(() => ({
    cold: found === undefined,
    changeAtom: Atom.make(initialChange),
  }));

  const [change, setChange] = useAtom(changeAtom);
  const me = useAtomValue(client.me);
  const signedIn = AsyncResult.isSuccess(me) && me.value !== null;
  const repo = found?.repo;
  const named = repo === undefined ? app : `${repo.owner}/${repo.name}`;

  return (
    <section className="plan">
      <Target repo={repo} cold={cold} />
      {found !== undefined && found.others.length > 0 ? (
        <Others others={found.others} cold={cold} change={change} agent={agent} />
      ) : null}
      <label className="change">
        <span>What you&apos;d change</span>
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
        <li className={signedIn ? "done" : "now"}>
          <span className="n">1</span>
          <SignIn back={askAgain(named, change, agent)} error={error} />
        </li>
        <NextSteps signedIn={signedIn} repo={repo} change={changeAtom} agent={agent} />
      </ol>
    </section>
  );
};

const Lookup = (asked: Asked) => {
  const atom = client.resolve(asked.app);
  const result = useAtomValue(atom);
  const retry = useAtomRefresh(atom);

  if (AsyncResult.isFailure(result)) {
    return <Retry className="note" message={client.failure(result.cause)} onRetry={retry} />;
  }

  return <Plan found={AsyncResult.isSuccess(result) ? result.value : undefined} {...asked} />;
};

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

  return ready === undefined ? (
    <Lookup app={app} initialChange={change} agent={agent} error={error} />
  ) : (
    <Plan found={ready} app={app} initialChange={change} agent={agent} error={error} />
  );
};
