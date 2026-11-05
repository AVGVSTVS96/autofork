import { spawnSync } from "node:child_process";

import type { Config } from "../config/types.ts";
import { sourcePaths } from "../layout.ts";
import { gitBytes } from "../platform/git.ts";

export const patchId = (config: Config, dir: string, from: string, to: string) =>
  spawnSync("git", ["patch-id", "--stable"], {
    cwd: dir,
    input: gitBytes(
      dir,
      "diff-tree",
      "-p",
      "-U0",
      "--binary",
      from,
      to,
      "--",
      ...sourcePaths(config),
    ),
  })
    .stdout.toString()
    .split(" ")[0] ?? "";
