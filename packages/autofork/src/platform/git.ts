import { cpSync, rmSync } from "node:fs";
import path from "node:path";

import { AutoforkError } from "../failure.ts";
import { gitConfigCount } from "./env.ts";
import { run } from "./process.ts";

const botSettings = [
  ["commit.gpgsign", "false"],
  ["rebase.autoStash", "true"],
] as const;

export const bot: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "autofork",
  GIT_AUTHOR_EMAIL: "autofork@users.noreply.github.com",
  GIT_COMMITTER_NAME: "autofork",
  GIT_COMMITTER_EMAIL: "autofork@users.noreply.github.com",
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true",
  GIT_CONFIG_COUNT: String(gitConfigCount + botSettings.length),
  ...Object.fromEntries(
    botSettings.flatMap(([key, value], index) => [
      [`GIT_CONFIG_KEY_${gitConfigCount + index}`, key],
      [`GIT_CONFIG_VALUE_${gitConfigCount + index}`, value],
    ]),
  ),
};

export const gitBytes = (cwd: string, ...args: string[]) => {
  const result = run("git", args, cwd);

  if (!result.ok) {
    throw new AutoforkError(`git ${args.join(" ")}\n${result.err}`);
  }

  return result.out;
};

export const gitWith = (cwd: string, env: NodeJS.ProcessEnv | undefined, ...args: string[]) => {
  const result = run("git", args, cwd, env);

  if (!result.ok) {
    throw new AutoforkError(`git ${args.join(" ")}\n${result.err}`);
  }

  return result.out.toString().trim();
};

export const git = (cwd: string, ...args: string[]) => gitWith(cwd, undefined, ...args);

export const short = (sha: string) => sha.slice(0, 12);

export const reset = (dir: string, to = "HEAD") => {
  git(dir, "reset", "--hard", "--quiet", to);
  git(dir, "clean", "-fdq");
};

export const gitDir = (dir: string) => git(dir, "rev-parse", "--path-format=absolute", "--git-dir");

export const workingTree = (root: string, skip: string[] = []) => {
  const dir = gitDir(root);
  const index = path.join(dir, "autofork-index");
  const env = { ...process.env, GIT_INDEX_FILE: index };

  cpSync(path.join(dir, "index"), index, { preserveTimestamps: true });
  gitWith(root, env, "add", "-A", "--", ".", ...skip.map((file) => `:(exclude,literal)${file}`));
  const tree = gitWith(root, env, "write-tree");

  rmSync(index, { force: true });

  return tree;
};
