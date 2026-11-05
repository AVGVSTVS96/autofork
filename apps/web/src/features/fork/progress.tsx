import { useAtomValue } from "@effect/atom-react";
import * as Atom from "effect/reactivity/Atom";

import type { Fork, Run } from "../../../shared/api.ts";
import { Item } from "../../ui/item.tsx";

const clock = Atom.readable((get) => {
  const timer = setInterval(() => {
    get.setSelf(Date.now());
  }, 1000);

  get.addFinalizer(() => {
    clearInterval(timer);
  });

  return Date.now();
});

const elapsed = (from: string, to: number) => {
  const seconds = Math.max(0, Math.round((to - Date.parse(from)) / 1000));

  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
};

const Ticking = ({ from }: { from: string }) => elapsed(from, useAtomValue(clock));

const builtSomething = (fork: Fork, run: Run) =>
  run.change === null
    ? run.conclusion !== "success" && fork.changes.some((change) => change.state === "building")
    : run.log.some((line) => /^(?:Built|Rebuilt) "/u.test(line));

const agentStep = (fork: Fork, run: Run, yours: boolean) => {
  if (builtSomething(fork, run)) {
    return `The agent builds ${yours ? "your" : "the"} change`;
  }

  return fork.upstream === null ? "Syncing" : `Syncing with ${fork.upstream}`;
};

const label = (step: string, fork: Fork, run: Run, yours: boolean) => {
  if (step === "Set up job") {
    return "Starting a computer";
  }

  if (step.includes("checkout")) {
    return "Getting the code";
  }

  if (/setup|action-setup/u.test(step)) {
    return "Installing tools";
  }

  return /autofork|autopatch/u.test(step) ? agentStep(fork, run, yours) : undefined;
};

const stepState = (step: Run["steps"][number]) => {
  if (step.status === "in_progress") {
    return "now";
  }

  if (step.status !== "completed") {
    return "wait";
  }

  return step.conclusion === "success" || step.conclusion === "skipped" ? "ok" : "bad";
};

const SyncIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className="icon">
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.25 6.5A5.5 5.5 0 0 0 3.2 5M2.75 9.5a5.5 5.5 0 0 0 10.05 1.5M3 2v3h3M13 14v-3h-3"
    />
  </svg>
);

const Log = ({ run }: { run: Run }) => {
  if (run.moved) {
    return (
      <p className="moved">
        <SyncIcon />
        {run.log[0]}
      </p>
    );
  }

  return run.log.length > 0 ? (
    <ul className="log">
      {run.log.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  ) : null;
};

const heading = (run: Run) => {
  if (run.status !== "completed") {
    return "Working";
  }

  return run.conclusion === "success" ? "Last run" : "Last run didn't finish";
};

export const Progress = ({
  run,
  waiting,
  fork,
  yours,
}: {
  run: Run | null;
  waiting: boolean;
  fork: Fork;
  yours: boolean;
}) => {
  if (waiting) {
    return (
      <section className="card run">
        <ul className="list">
          <Item state="now">Starting the build in {yours ? "your " : ""}GitHub Actions…</Item>
        </ul>
      </section>
    );
  }

  if (run === null) {
    return null;
  }

  const steps = run.steps.flatMap((step) => {
    const text = label(step.name, fork, run, yours);

    return text !== undefined && !step.name.startsWith("Post ") ? [{ ...step, text }] : [];
  });

  const unique = steps.filter(
    (step, index) =>
      steps.findIndex((other) => other.text === step.text) === index || step.status !== "completed",
  );

  const done = run.status === "completed";

  return (
    <section className="card run">
      <div className="run-head">
        <b>{heading(run)}</b>
        <span>
          {done ? (
            elapsed(run.startedAt, Date.parse(run.updatedAt))
          ) : (
            <Ticking from={run.startedAt} />
          )}
        </span>
      </div>
      <ul className="list">
        {unique.map((step) => (
          <Item
            key={step.text}
            state={stepState(step)}
            end={step.status === "in_progress" ? "now" : undefined}
          >
            {step.text}
          </Item>
        ))}
      </ul>
      {done ? <Log run={run} /> : null}
      <p className="run-links">
        <a href={run.url} target="_blank" rel="noreferrer">
          See the run on GitHub
        </a>
        {done && run.change !== null ? (
          <a href={run.change} target="_blank" rel="noreferrer">
            See the change
          </a>
        ) : null}
      </p>
    </section>
  );
};
