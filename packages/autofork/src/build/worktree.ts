import { createHash } from "node:crypto";
import { cpSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { CONTROL, DIR } from "../layout.ts";
import { scratchParent } from "../platform/env.ts";
import { bot, git, gitWith } from "../platform/git.ts";
import { run } from "../platform/process.ts";

const KEPT_IN_DIR = /\.(?:patch|md|json)$|\/\.gitignore$/u;

export const scratch = (root: string) => {
  const parent = scratchParent ?? path.join(homedir(), ".cache");
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 8);

  return path.join(parent, "autofork", `${path.basename(root)}-${hash}`);
};

export const worktree = (root: string, base: string) => {
  const dir = scratch(root);

  run("git", ["worktree", "remove", "--force", "--force", dir], root);
  rmSync(dir, { recursive: true, force: true });
  git(root, "worktree", "prune");
  git(root, "worktree", "add", "--detach", "--quiet", dir, base);

  for (const control of CONTROL) {
    rmSync(path.join(dir, control), { recursive: true, force: true });

    if (existsSync(path.join(root, control))) {
      cpSync(path.join(root, control), path.join(dir, control), { recursive: true });
    }
  }

  return dir;
};

export const cleanup = (root: string, dir: string) => {
  run("git", ["worktree", "remove", "--force", dir], root);
};

export const changed = (dir: string) => git(dir, "status", "--porcelain").length > 0;

export const commit = (dir: string, message: string) => {
  git(dir, "add", "-A");
  const hidden = git(
    dir,
    "ls-files",
    "-z",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--",
    DIR,
  )
    .split("\0")
    .filter((file) => KEPT_IN_DIR.test(file));

  if (hidden.length > 0) {
    git(dir, "add", "-f", "--", ...hidden);
  }
  gitWith(dir, bot, "commit", "--quiet", "--no-verify", "--allow-empty", "-m", message);

  return git(dir, "rev-parse", "HEAD");
};

export const restoreControl = (dir: string, base: string) => {
  git(dir, "rm", "-rq", "--cached", "--ignore-unmatch", "--", ...CONTROL);
  const owned = git(dir, "ls-tree", "--name-only", base, "--", ...CONTROL)
    .split("\n")
    .filter(Boolean);

  if (owned.length > 0) {
    git(dir, "checkout", base, "--", ...owned);
  }
  git(dir, "clean", "-fdxq", "--", ...CONTROL);
};
