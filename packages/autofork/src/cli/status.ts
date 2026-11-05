import { existsSync } from "node:fs";

import { compare } from "../build/compare.ts";
import { discover, readConfig } from "../config/read.ts";
import { upstreamDoc } from "../layout.ts";
import { unbuilt } from "../patches/files.ts";
import { say } from "../platform/action.ts";
import { git, short, workingTree } from "../platform/git.ts";
import { fetchUpstream } from "../upstream/fetch.ts";

const noteOn = (root: string, id: string) => {
  if (existsSync(upstreamDoc(root, id))) {
    return "  (upstream has it: see UPSTREAM.md)";
  }

  return unbuilt(root, id) ? "  (not built yet)" : "";
};

export const status = async (root: string) => {
  const config = await readConfig(root);

  await fetchUpstream(root, config);
  const { base, drift } = await compare(root, config, workingTree(root));

  const behind = git(
    root,
    "rev-list",
    "--count",
    "--first-parent",
    `${base}..refs/autofork/upstream`,
  );

  say(
    `${config.upstream} at ${short(base)}, ${behind} commit${behind === "1" ? "" : "s"} behind upstream`,
  );

  for (const id of discover(root)) {
    say(`  ${id}${noteOn(root, id)}`);
  }

  if (drift.length > 0) {
    say(`not in any patch yet:\n  ${drift.join("\n  ")}`);
  }
};
