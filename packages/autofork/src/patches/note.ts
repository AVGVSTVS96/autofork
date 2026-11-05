import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DIR, patchDoc } from "../layout.ts";
import { git } from "../platform/git.ts";

export const NOTE = "fork-readme";

const readmeToNote = (root: string, base: string, drift: string[]) => {
  const readme = git(root, "ls-tree", "--name-only", base)
    .split("\n")
    .find((file) => /^readme\.md$/iu.test(file));

  const skipped =
    readme === undefined || drift.includes(readme) || existsSync(path.join(root, DIR, NOTE));

  const text = skipped ? "" : git(root, "show", `${base}:${readme}`);

  return text.trim() === "" || text.includes("autofork.com") ? undefined : readme;
};

export const addNote = (root: string, upstream: string, base: string, drift: string[]) => {
  const readme = readmeToNote(root, base, drift);

  if (readme !== undefined) {
    const name = path.basename(upstream).replace(/\.git$/u, "");

    mkdirSync(path.join(root, DIR, NOTE), { recursive: true });
    writeFileSync(
      patchDoc(root, NOTE),
      `One line under the README's title says this is a personal fork of ${name} that updates itself with autofork, linking ${name}, https://autofork.com and this fork's \`${DIR}/\` folder. The rest of the README stays as upstream wrote it.

To drop the line, delete it from the README and delete this folder, in the same commit.
`,
    );
  }

  return readme;
};
