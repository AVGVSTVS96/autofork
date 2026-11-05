import { existsSync } from "node:fs";
import path from "node:path";

import type { Config } from "../config/types.ts";
import { skipGenerated } from "../layout.ts";
import { git, reset } from "../platform/git.ts";
import { run } from "../platform/process.ts";

export interface Left {
  conflicted: string[];
  rejected: string[];
  missed: string[];
  gone: string[];
}

const touched = (dir: string, file: string, config: Config) =>
  run("git", ["apply", "--numstat", "-z", ...skipGenerated(config), file], dir)
    .out.toString()
    .split("\0")
    .filter(Boolean)
    .map((line) => line.split("\t")[2] ?? "");

export const apply = (dir: string, file: string, config: Config) => {
  if (
    run("git", ["apply", "--3way", "--whitespace=nowarn", ...skipGenerated(config), file], dir).ok
  ) {
    return true;
  }

  reset(dir);

  return false;
};

const alreadyDeleted = (dir: string, file: string, only: string[]) =>
  !existsSync(path.join(dir, file)) &&
  run("git", ["apply", "--reverse", "--check", ...only], dir).ok;

export const merge = (dir: string, patch: string, config: Config): Left => {
  const left: Left = { conflicted: [], rejected: [], missed: [], gone: [] };

  for (const file of touched(dir, patch, config)) {
    const only = [
      `--include=${file.replaceAll(/[*?[\\]/gu, "\\$&")}`,
      "--whitespace=nowarn",
      patch,
    ];

    if (run("git", ["apply", "--3way", ...only], dir).ok) {
      continue;
    }

    if (git(dir, "ls-files", "--unmerged", "--", `:(literal)${file}`)) {
      left.conflicted.push(file);
    } else if (run("git", ["apply", "--reject", ...only], dir).ok) {
      continue;
    } else if (existsSync(path.join(dir, `${file}.rej`))) {
      left.rejected.push(file);
    } else if (alreadyDeleted(dir, file, only)) {
      left.gone.push(file);
    } else {
      left.missed.push(file);
    }
  }

  git(dir, "reset", "--quiet");

  return left;
};

export const unfinished = (
  { conflicted, rejected, missed, gone }: Left,
  to: string,
  from?: string,
) => {
  const files = [...conflicted, ...rejected, ...missed, ...gone];

  if (files.length === 0) {
    return "";
  }

  const left = [
    conflicted.length > 0 ? `the conflict markers in ${conflicted.join(", ")}` : "",
    rejected.length > 0
      ? `the hunks that didn't fit, in ${rejected.map((file) => `${file}.rej`).join(", ")}`
      : "",
    missed.length > 0 ? `the changes to ${missed.join(", ")}, which didn't apply at all` : "",
    gone.length > 0 ? `the deletion of ${gone.join(", ")}, which upstream deleted too` : "",
  ].filter(Boolean);

  const changes =
    from !== undefined && from !== to
      ? ` To see what upstream changed under them: git diff ${from} ${to} -- ${files.join(" ")}`
      : "";

  return ` Git applied the rest of it. What's left: ${left.join("; ")}.${changes}`;
};
