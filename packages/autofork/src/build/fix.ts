import { existsSync } from "node:fs";
import path from "node:path";

import { runAgent } from "../agent/run.ts";
import type { Fork } from "../config/types.ts";
import { AutoforkError } from "../failure.ts";
import { upstreamDoc } from "../layout.ts";
import { patchId } from "../patches/id.ts";
import { say } from "../platform/action.ts";
import { readText } from "../platform/files.ts";
import { bot, git, gitWith, reset, short } from "../platform/git.ts";
import { run } from "../platform/process.ts";
import { failureAt, prepared } from "./checks.ts";
import { fixPrompt } from "./prompts.ts";
import { lastStep, stepAt, stepPairs } from "./types.ts";
import type { Build, Failed } from "./types.ts";
import { restoreControl } from "./worktree.ts";

const passesAt = (config: Fork, build: Build, step: string) =>
  failureAt(config, build, step) === undefined;

const justRebuiltFails = (config: Fork, build: Build, ids: string[], alone: boolean) => {
  const last = ids.findLastIndex((id) => build.healed.has(id));

  return (
    last !== -1 &&
    (last === 0 || !alone || passesAt(config, build, stepAt(build, last))) &&
    (last === ids.length - 1 || !passesAt(config, build, stepAt(build, last + 1)))
  );
};

const pauseWhatUpstreamHas = (build: Build, ids: string[]) => {
  const pausing = new Set<string>();

  for (const id of ids) {
    const reason = readText(upstreamDoc(build.dir, id)).trim();

    if (reason && !build.upstreamHas.has(id)) {
      build.upstreamHas.set(id, reason);
      build.healed.delete(id);
      pausing.add(id);
    }
  }

  return pausing;
};

const requireOneCommitPerPatch = (build: Build, ids: string[], check: string) => {
  const base = build.steps[0];
  const rebasing = ["rebase-merge", "rebase-apply"].some((state) =>
    existsSync(path.resolve(build.dir, git(build.dir, "rev-parse", "--git-path", state))),
  );

  if (rebasing) {
    throw new AutoforkError(`the agent left a rebase unfinished while fixing ${check}`);
  }
  const onUpstream = run("git", ["merge-base", "--is-ancestor", base, "HEAD"], build.dir).ok;

  if (
    !onUpstream ||
    git(build.dir, "log", "--reverse", "--format=%s", `${base}..HEAD`) !== ids.join("\n")
  ) {
    throw new AutoforkError(
      `the agent's commits on upstream aren't ${ids.join(", ")}, one per patch in that order, so nothing was pushed`,
    );
  }
};

const readBackPatches = (config: Fork, build: Build, ids: string[], pausing: Set<string>) => {
  const was = stepPairs(build.steps);
  const base = build.steps[0];

  build.steps = [base, ...git(build.dir, "rev-list", "--reverse", `${base}..HEAD`).split("\n")];
  const now = stepPairs(build.steps);

  for (const [index, id] of ids.entries()) {
    const before = was[index];
    const after = now[index];
    const wasId = before === undefined ? "" : patchId(config, build.dir, before.from, before.to);
    const nowId = after === undefined ? "" : patchId(config, build.dir, after.from, after.to);

    if (build.upstreamHas.has(id)) {
      if (nowId) {
        throw new AutoforkError(
          pausing.has(id)
            ? `the agent wrote UPSTREAM.md for ${id} but left its change in, so nothing was pushed`
            : `the agent's fix changed ${id}, which upstream already has, so nothing was pushed`,
        );
      }
    } else if (wasId && !nowId) {
      throw new AutoforkError(
        `the agent's fix left ${id} with nothing to add, so nothing was pushed: say in the PATCH.md files which patch makes which change, or merge them into one`,
      );
    } else if (nowId !== wasId) {
      build.healed.set(id, build.healed.get(id) ?? "healed");
    }
  }
};

export const fix = async (
  config: Fork,
  build: Build,
  failed: Failed,
  from: string,
  alone: boolean,
) => {
  const ids = config.patches.slice(0, build.steps.length - 1);
  const command = config[failed.check] ?? "";

  if (ids.every((id) => build.upstreamHas.has(id))) {
    if (ids.length < config.patches.length) {
      return;
    }
    throw new AutoforkError(
      `${failed.check} fails on upstream ${short(build.source)}, which has every patch: ${command}`,
    );
  }
  if (justRebuiltFails(config, build, ids, alone)) {
    const last = ids.findLast((id) => build.healed.has(id)) ?? "";

    say(`${failed.check} fails with ${last}, which an agent just built, so run it again`);

    if (passesAt(config, build, lastStep(build))) {
      return;
    }
    throw new AutoforkError(
      `${failed.check} fails with ${last}, which the agent ${build.healed.get(last) ?? ""}: ${command}`,
    );
  }
  const top = lastStep(build);

  reset(build.dir, top);

  if (failed.check === "verify") {
    prepared(config, build);
  }
  say(`fixing ${failed.check} in the patches`);
  const prompt = fixPrompt(config, build, ids, failed, from);

  if (!(await runAgent(config, build.dir, `${failed.check} fix`, prompt, bot))) {
    throw new AutoforkError(`the agent failed while fixing ${failed.check}`);
  }
  const pausing = pauseWhatUpstreamHas(build, ids);

  requireOneCommitPerPatch(build, ids, failed.check);
  git(build.dir, "reset", "--quiet");
  restoreControl(build.dir, top);

  if (!run("git", ["diff", "--cached", "--quiet"], build.dir).ok) {
    gitWith(
      build.dir,
      bot,
      "commit",
      "--amend",
      "--quiet",
      "--no-verify",
      "--allow-empty",
      "--no-edit",
    );
  }
  readBackPatches(config, build, ids, pausing);
  build.ready = undefined;
  const still = failureAt(config, build, lastStep(build));

  if (still !== undefined) {
    throw new AutoforkError(
      `${still.check} still fails after the agent's fix: ${config[still.check] ?? ""}`,
    );
  }
};
