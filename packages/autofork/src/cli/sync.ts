import { build } from "../build/build.ts";
import { regenerate } from "../build/checks.ts";
import { compare } from "../build/compare.ts";
import { refresh } from "../build/refresh.ts";
import type { Build } from "../build/types.ts";
import { verify } from "../build/verify.ts";
import { cleanup, commit, scratch } from "../build/worktree.ts";
import { readConfig } from "../config/read.ts";
import type { Fork } from "../config/types.ts";
import { saveConfig } from "../config/write.ts";
import { AutoforkError, NoRoomError, WaitError } from "../failure.ts";
import { DIR } from "../layout.ts";
import { openLedger, saveLedger } from "../ledger/ledger.ts";
import { requireIntent, unbuilt } from "../patches/files.ts";
import { output, say } from "../platform/action.ts";
import { ledgerPath } from "../platform/env.ts";
import { git, short } from "../platform/git.ts";
import { run } from "../platform/process.ts";
import { baseline, fetchUpstream, syncTarget } from "../upstream/fetch.ts";
import { newestGreen } from "../upstream/green.ts";
import { updateWorkflows, workflowsBehind } from "../workflows/update.ts";
import { flag } from "./args.ts";

interface Sync {
  root: string;
  config: Fork;
  args: string[];
  source: string;
  tip: string;
  tag: string | undefined;
  healFrom: string | undefined;
  behind: string[];
  range: string;
}

interface Built {
  result: Build;
  updated: string[] | undefined;
}

const keepsUntracked = (base: string, drift: string[]) =>
  `these files differ from what your patches build, so a sync would drop them:\n  ${drift.join("\n  ")}\nWhere one is just an old copy of upstream's, take upstream's first: git checkout ${short(base)} -- <file>, or git rm <file> if upstream had it and deleted it. Then save the fork's own changes, on top of upstream's copies, as a patch: write ${DIR}/<id>/PATCH.md, then run autofork save <id>`;

const rebuild = async (sync: Sync): Promise<Built | undefined> => {
  const { root, config, args, source, healFrom, behind, range } = sync;

  try {
    const result = await build(root, config, source, { healFrom, wait: true });

    await verify(config, result, healFrom);
    regenerate(config, result);

    if (behind.length === 0 || args.includes("--no-workflows")) {
      return { result, updated: undefined };
    }

    if (healFrom === undefined) {
      throw new WaitError("upstream changed workflows this fork keeps");
    }

    return { result, updated: await updateWorkflows(config, result, behind, range) };
  } catch (error) {
    if (!(error instanceof WaitError)) {
      throw error;
    }

    say(
      `autofork: ${error.message}${error instanceof NoRoomError ? "" : ". The next run that heals rebuilds it."}`,
    );
    output({ result: "waiting" });

    return undefined;
  }
};

const syncMessage = ({ config, source, behind, range }: Sync, { result, updated }: Built) => {
  const lines = [
    ...[...result.healed].map(([id, done]) => `${done} ${id}`),
    ...[...result.upstreamHas].map(([id, reason]) => `upstream has ${id}: ${reason}`),
    ...(updated === undefined
      ? behind.map((file) => `upstream changed ${file} in ${range}`)
      : updated.map((file) => `brought upstream's changes to ${file} in ${range}`)),
  ];

  return [`autofork: sync ${config.upstream} to ${short(source)}`, lines.join("\n")]
    .filter(Boolean)
    .join("\n\n");
};

const land = (sync: Sync, built: Built) => {
  const { root, config, source, tip, tag, behind } = sync;
  const { result } = built;

  saveConfig(result.dir, config);
  refresh(result.dir, config, result);
  const tree = git(result.dir, "rev-parse", `${commit(result.dir, "refresh")}^{tree}`);

  if (tree === git(root, "rev-parse", "HEAD^{tree}") && behind.length === 0) {
    say("autofork: already up to date");
    output({ result: "current" });

    return;
  }

  const head = git(root, "rev-parse", "HEAD");
  const parents = ["-p", head];

  if (!run("git", ["merge-base", "--is-ancestor", source, head], root).ok) {
    parents.push("-p", source);
  }

  const message = syncMessage(sync, built);

  git(
    root,
    "merge",
    "--ff-only",
    "--quiet",
    git(root, "commit-tree", tree, ...parents, "-m", message),
  );
  say(message);
  output(tag !== undefined && source === tip ? { result: "synced", tag } : { result: "synced" });
};

export const sync = async (root: string, args: string[]) => {
  const config = await readConfig(root);

  for (const id of config.patches) {
    requireIntent(root, id);
  }

  if (git(root, "status", "--porcelain")) {
    throw new AutoforkError("commit or stash your changes first");
  }

  const { tip, tag } = await fetchUpstream(root, config);
  const base = baseline(root);
  const source = syncTarget(root, config, base, await newestGreen(root, config, base, tip));
  const key = `${short(source)}-${short(git(root, "rev-parse", "HEAD"))}`;

  output({ key });

  if (flag(args, "--skip") === key) {
    say(
      `autofork: already failed on upstream ${short(source)} with this fork, skipping until either changes`,
    );
    output({ result: "skipped" });

    return;
  }

  if (base === source && config.patches.every((id) => !unbuilt(root, id))) {
    say(`autofork: already up to date with ${config.upstream} at ${short(source)}`);
    output({ result: "current" });

    return;
  }

  const { drift } = await compare(root, config, "HEAD", base);

  if (drift.length > 0) {
    throw new AutoforkError(keepsUntracked(base, drift));
  }

  const moved = base === source ? short(source) : `${short(base)} → ${short(source)}`;

  say(
    `upstream ${moved}, ${config.patches.length} patch${config.patches.length === 1 ? "" : "es"}`,
  );
  const healFrom = args.includes("--no-heal") ? undefined : base;

  openLedger(ledgerPath ?? `${scratch(root)}-ledger.json`);
  const since = run("git", ["merge-base", "HEAD", source], root).out.toString().trim() || base;

  const plan: Sync = {
    root,
    config,
    args,
    source,
    tip,
    tag,
    healFrom,
    behind: workflowsBehind(root, since, source),
    range: `${short(since)}..${short(source)}`,
  };

  try {
    const built = await rebuild(plan);

    if (built !== undefined) {
      land(plan, built);
    }
  } finally {
    cleanup(root, scratch(root));
    saveLedger();
  }
};
