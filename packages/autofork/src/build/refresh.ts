import { existsSync, rmSync, writeFileSync } from "node:fs";

import type { Fork } from "../config/types.ts";
import { keepPatches } from "../config/write.ts";
import { DIR, patchFile, sourcePaths, upstreamDoc } from "../layout.ts";
import { gitBytes, short } from "../platform/git.ts";
import { stepPairs } from "./types.ts";
import type { Build } from "./types.ts";

export const refresh = (target: string, config: Fork, build: Build) => {
  keepPatches(target);
  const pairs = stepPairs(build.steps);

  for (const [index, id] of config.patches.entries()) {
    const pair = pairs[index];
    const diff =
      pair === undefined
        ? Buffer.alloc(0)
        : gitBytes(
            build.dir,
            "diff-tree",
            "-p",
            "--binary",
            "--full-index",
            pair.from,
            pair.to,
            "--",
            ...sourcePaths(config),
          );

    if (diff.length > 0 || existsSync(patchFile(target, id))) {
      writeFileSync(patchFile(target, id), diff);
    }
  }
  for (const [id, reason] of build.upstreamHas) {
    rmSync(patchFile(target, id), { force: true });
    writeFileSync(
      upstreamDoc(target, id),
      `${reason}

${config.upstream} does this on its own as of ${short(build.source)}, so autofork stopped applying this patch.
To keep upstream's version, delete ${DIR}/${id}/.
To keep yours, say in PATCH.md how it differs from upstream's, delete this file and push. The next sync rebuilds it.
`,
    );
  }
};
