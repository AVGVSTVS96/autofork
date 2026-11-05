import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { build } from "../build/build.ts";
import { compare } from "../build/compare.ts";
import { refresh } from "../build/refresh.ts";
import { cleanup } from "../build/worktree.ts";
import { readConfig } from "../config/read.ts";
import { AutoforkError } from "../failure.ts";
import { DIR, patchDoc, sourcePaths, upstreamDoc } from "../layout.ts";
import { PATCH_ID, requireIntent } from "../patches/files.ts";
import { say } from "../platform/action.ts";
import { gitBytes, gitDir, workingTree } from "../platform/git.ts";
import { fetchUpstream } from "../upstream/fetch.ts";

export const save = async (root: string, args: string[]) => {
  const [id] = args;

  if (id === undefined || !PATCH_ID.test(id)) {
    throw new AutoforkError("usage: autofork save <id>   (id like fix-login)");
  }

  if (!existsSync(patchDoc(root, id))) {
    throw new AutoforkError(`write ${DIR}/${id}/PATCH.md first: what the change does and why`);
  }

  requireIntent(root, id);
  rmSync(upstreamDoc(root, id), { force: true });
  const config = await readConfig(root);

  await fetchUpstream(root, config);
  const files = workingTree(root);
  const { base, rebuilt, drift } = await compare(root, config, files);

  if (drift.length === 0) {
    say(
      `nothing to save: your code matches what the patches build. Push ${DIR}/${id}/PATCH.md as it is and the next sync has an agent build it.`,
    );

    return;
  }

  const fold = path.join(gitDir(root), "autofork-fold.patch");

  writeFileSync(
    fold,
    gitBytes(
      root,
      "diff-tree",
      "-p",
      "--binary",
      "--full-index",
      rebuilt,
      files,
      "--",
      ...sourcePaths(config),
    ),
  );
  const result = await build(root, config, base, { fold: { id, patch: fold } });

  try {
    refresh(root, config, result);
    say(
      `saved ${drift.length} file${drift.length === 1 ? "" : "s"} to ${DIR}/${id}. Commit and push.`,
    );
  } finally {
    rmSync(fold, { force: true });
    cleanup(root, result.dir);
  }
};
