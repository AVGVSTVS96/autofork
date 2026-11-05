import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runAgent } from "../agent/run.ts";
import { CHECKS } from "../config/types.ts";
import type { Checks, Config, Fork } from "../config/types.ts";
import { AutoforkError } from "../failure.ts";
import { configFile, DIR, patchDoc, sourcePaths, upstreamDoc } from "../layout.ts";
import { merge, unfinished } from "../patches/apply.ts";
import type { Left } from "../patches/apply.ts";
import { unbuilt } from "../patches/files.ts";
import { say } from "../platform/action.ts";
import { readText } from "../platform/files.ts";
import { bot, git, reset, workingTree } from "../platform/git.ts";
import { has, isObject, isText, parseJson } from "../platform/json.ts";
import { run } from "../platform/process.ts";
import { prepared } from "./checks.ts";
import { healPrompt } from "./prompts.ts";
import { lastStep } from "./types.ts";
import type { Build } from "./types.ts";
import { restoreControl } from "./worktree.ts";

const CONFLICT_MARKER = /^(?:<{7} ours|>{7} theirs)\r?$/mu;

export interface PatchToHeal {
  file: string;
  from?: string | undefined;
}

interface Healing {
  id: string;
  step: string;
  left: Left | undefined;
  rejects: string[];
  before: string;
  fresh: boolean;
  wish: string;
}

const isCommand = (value: unknown): value is string => isText(value) && value.trim() !== "";

const checksIn = (dir: string): Checks | undefined => {
  const written = parseJson(readText(configFile(dir)), isObject);

  if (written === undefined) {
    return undefined;
  }
  const checks: Checks = {};

  for (const key of CHECKS) {
    if (has(written, key, isCommand)) {
      checks[key] = written[key];
    }
  }
  return checks;
};

const keepChecks = (config: Config, written: Checks | undefined) => {
  if (config.verify !== undefined) {
    return;
  }
  if (written === undefined) {
    say(`the agent left ${DIR}/config.json unreadable, so the checks it picked weren't kept`);

    return;
  }
  for (const key of CHECKS) {
    const command = written[key];

    if (config[key] === undefined && command !== undefined) {
      config[key] = command;
      config.picked = { ...config.picked, [key]: command };
    }
  }
};

const nothingLeftButDeletions = (config: Config, build: Build, healing: Healing) =>
  healing.left !== undefined &&
  healing.left.conflicted.length === 0 &&
  healing.left.rejected.length === 0 &&
  healing.left.missed.length === 0 &&
  !run(
    "git",
    ["diff", "--quiet", healing.step, healing.before, "--", ...sourcePaths(config)],
    build.dir,
  ).ok;

const keepHeal = (config: Config, build: Build, healing: Healing) => {
  const { id, step, left, rejects, before, fresh, wish } = healing;
  const doing = fresh ? "building" : "healing";

  git(build.dir, "reset", "--soft", "--quiet", step);
  const reason = readText(upstreamDoc(build.dir, id)).trim();
  const doc = patchDoc(build.dir, id);
  const why = fresh ? readText(doc) : "";
  const written = checksIn(build.dir);

  restoreControl(build.dir, step);

  if (reason) {
    keepChecks(config, written);
    reset(build.dir, step);
    build.upstreamHas.set(id, reason);

    return;
  }
  const marked = (left?.conflicted ?? []).filter((file) => {
    const conflicted = path.join(build.dir, file);

    return existsSync(conflicted) && CONFLICT_MARKER.test(readFileSync(conflicted, "utf8"));
  });

  if (marked.length > 0) {
    throw new AutoforkError(
      `the agent left conflict markers in ${marked.join(", ")} while ${doing} ${id}`,
    );
  }
  if (
    workingTree(build.dir, rejects) === before &&
    !nothingLeftButDeletions(config, build, healing)
  ) {
    throw new AutoforkError(`the agent changed nothing while ${doing} ${id}`);
  }
  if (why.startsWith(wish)) {
    writeFileSync(doc, why);
  }
  keepChecks(config, written);
  build.healed.set(id, fresh ? "built" : "healed");
};

export const heal = async (
  config: Fork,
  build: Build,
  id: string,
  broken: string,
  patch?: PatchToHeal,
) => {
  prepared(config, build);
  const left = patch === undefined ? undefined : merge(build.dir, patch.file, config);
  const rejects = left?.rejected.map((file) => `${file}.rej`) ?? [];
  const healing: Healing = {
    id,
    step: lastStep(build),
    left,
    rejects,
    before: workingTree(build.dir, rejects),
    fresh: unbuilt(build.dir, id),
    wish: readFileSync(patchDoc(build.dir, id), "utf8").trimEnd(),
  };
  const prompt = healPrompt(
    config,
    build,
    id,
    broken + (left === undefined ? "" : unfinished(left, build.source, patch?.from)),
  );
  const doing = healing.fresh ? "building" : "healing";

  say(`${doing} ${id}`);

  try {
    if (!(await runAgent(config, build.dir, id, prompt, bot))) {
      throw new AutoforkError(`the agent failed while ${doing} ${id}`);
    }
    keepHeal(config, build, healing);
  } finally {
    for (const file of rejects) {
      rmSync(path.join(build.dir, file), { force: true });
    }
  }
};
