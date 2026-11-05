import type { Fork } from "../config/types.ts";
import { sourcePaths } from "../layout.ts";
import { git } from "../platform/git.ts";
import { baseline } from "../upstream/fetch.ts";
import { build } from "./build.ts";
import { lastStep } from "./types.ts";
import { cleanup } from "./worktree.ts";

export const compare = async (
  root: string,
  config: Fork,
  against: string,
  base = baseline(root),
) => {
  const rebuilt = await build(root, config, base, {});

  try {
    const top = lastStep(rebuilt);
    const drift = git(
      root,
      "diff-tree",
      "-r",
      "--name-only",
      top,
      against,
      "--",
      ...sourcePaths(config),
    );

    return { base, rebuilt: top, drift: drift.split("\n").filter(Boolean) };
  } finally {
    cleanup(root, rebuilt.dir);
  }
};
