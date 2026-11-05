import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { Check, Config } from "../config/types.ts";
import { AutoforkError } from "../failure.ts";
import { say } from "../platform/action.ts";
import { git, gitBytes, gitDir, reset, short } from "../platform/git.ts";
import { MAX_OUTPUT, run } from "../platform/process.ts";
import type { Build, Failed } from "./types.ts";
import { commit } from "./worktree.ts";

const runCheck = (build: Build, check: Check, command: string): Failed | undefined => {
  const result = spawnSync("sh", ["-c", `exec 2>&1\n${command}`], {
    cwd: build.dir,
    stdio: ["inherit", "pipe", "inherit"],
    maxBuffer: MAX_OUTPUT,
  });

  process.stderr.write(result.stdout);

  if (result.status === 0) {
    return undefined;
  }
  return { check, lines: result.stdout.toString().trimEnd().split("\n").slice(-100).join("\n") };
};

const generatedChanges = (config: Config, dir: string) => {
  const generated = config.generated ?? [];

  if (generated.length === 0) {
    return undefined;
  }
  for (const file of generated) {
    run("git", ["add", "-A", "--", file], dir);
  }
  const diff = gitBytes(
    dir,
    "diff-index",
    "--cached",
    "-p",
    "--binary",
    "HEAD",
    "--",
    ...generated,
  );

  if (diff.length === 0) {
    return undefined;
  }
  const file = path.join(gitDir(dir), "autofork-generated.patch");

  writeFileSync(file, diff);

  return file;
};

export const prepare = (config: Config, build: Build): Failed | undefined => {
  if (config.setup === undefined) {
    return undefined;
  }
  const ready = `${git(build.dir, "rev-parse", "HEAD")} ${config.setup}`;

  if (build.ready !== ready) {
    say(`setup: ${config.setup}`);
    const failed = runCheck(build, "setup", config.setup);

    if (failed !== undefined) {
      return failed;
    }
    build.ready = ready;
    build.rebuilt = generatedChanges(config, build.dir);
    reset(build.dir);
  }
  if (
    build.rebuilt !== undefined &&
    !git(build.dir, "status", "--porcelain", "--", ...(config.generated ?? []))
  ) {
    git(build.dir, "apply", "--whitespace=nowarn", build.rebuilt);
  }
  return undefined;
};

export const prepared = (config: Config, build: Build) => {
  if (prepare(config, build) !== undefined) {
    throw new AutoforkError(
      `setup fails on ${short(git(build.dir, "rev-parse", "HEAD"))}: ${config.setup ?? ""}`,
    );
  }
};

export const regenerate = (config: Config, build: Build) => {
  if ((config.generated ?? []).length === 0) {
    return;
  }
  prepared(config, build);
  commit(build.dir, "generated");
};

export const failureAt = (config: Config, build: Build, step: string) => {
  reset(build.dir, step);

  return (
    prepare(config, build) ??
    (config.verify === undefined ? undefined : runCheck(build, "verify", config.verify))
  );
};
