import { existsSync, readFileSync } from "node:fs";

import { AutoforkError } from "../failure.ts";
import { DIR, patchDoc, patchFile } from "../layout.ts";
import { readText } from "../platform/files.ts";

export const PATCH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const unbuilt = (dir: string, id: string) => {
  const file = patchFile(dir, id);

  return !existsSync(file) || readFileSync(file).length === 0;
};

export const requireIntent = (root: string, id: string) => {
  if (readText(patchDoc(root, id)).trim() === "") {
    throw new AutoforkError(
      `${DIR}/${id}/PATCH.md is empty: say what the patch does and why. It's what the agent rebuilds it from.`,
    );
  }
};
