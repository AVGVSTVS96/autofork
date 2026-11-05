import type { Fork } from "../config/types.ts";
import { NoRoomError, WaitError } from "../failure.ts";
import { patchFile } from "../layout.ts";
import { shortfall } from "../ledger/ledger.ts";
import { apply } from "../patches/apply.ts";
import { unbuilt } from "../patches/files.ts";
import { say } from "../platform/action.ts";
import { git, reset, short } from "../platform/git.ts";
import { heal } from "./heal.ts";
import type { Build } from "./types.ts";
import { verify } from "./verify.ts";
import { changed, commit, worktree } from "./worktree.ts";

export interface BuildOptions {
  healFrom?: string | undefined;
  wait?: boolean;
  fold?: { id: string; patch: string };
}

const fitsUpFront = async (config: Fork, build: Build) => {
  const broken = config.patches.filter((id) => {
    const fits = !unbuilt(build.dir, id) && apply(build.dir, patchFile(build.dir, id), config);

    if (fits) {
      commit(build.dir, id);
    }
    return !fits;
  });

  reset(build.dir, build.steps[0]);
  git(build.dir, "clean", "-fdxq");
  const short = broken.length > 0 ? await shortfall(config.limits, broken.length) : undefined;

  if (short !== undefined) {
    throw new NoRoomError(
      `${broken.join(", ")} wait${broken.length === 1 ? "s" : ""}: ${short.full}`,
    );
  }
};

const place = async (
  config: Fork,
  build: Build,
  id: string,
  options: BuildOptions,
  folded: string | undefined,
) => {
  const { dir } = build;
  const file = patchFile(dir, id);
  const { healFrom } = options;

  if (options.wait === true && healFrom === undefined && unbuilt(dir, id)) {
    throw new WaitError(`${id} isn't built yet`);
  }
  if (unbuilt(dir, id) ? healFrom !== undefined : !apply(dir, file, config)) {
    if (healFrom === undefined && folded === undefined) {
      throw new WaitError(`${id} doesn't apply to ${short(build.source)}`);
    }
    await verify(config, build, healFrom);
    await heal(
      config,
      build,
      id,
      folded === undefined
        ? `Upstream changed, and patch "${id}" no longer applies cleanly.`
        : `The fork's owner changed patch "${folded}", and patch "${id}" no longer applies cleanly on top of it.`,
      unbuilt(dir, id) ? undefined : { file, from: healFrom },
    );
  } else if (!unbuilt(dir, id) && !changed(dir)) {
    build.upstreamHas.set(id, "the same change, line for line");
  }
  if (options.fold?.id !== id || apply(dir, options.fold.patch, config)) {
    return folded;
  }
  say(
    `your changes to ${id} touch lines a later patch changes too, so an agent rebuilds ${id} with them from its PATCH.md`,
  );
  apply(dir, file, config);
  git(dir, "add", "-A");
  await heal(
    config,
    build,
    id,
    `The fork's owner changed patch "${id}", and their change was made with later patches applied, so git couldn't fit it on "${id}" alone.`,
    { file: options.fold.patch },
  );

  return id;
};

export const build = async (root: string, config: Fork, base: string, options: BuildOptions) => {
  const dir = worktree(root, base);
  const built: Build = {
    dir,
    source: base,
    steps: [commit(dir, `upstream ${short(base)}`)],
    healed: new Map(),
    upstreamHas: new Map(),
  };

  if (options.healFrom !== undefined) {
    await fitsUpFront(config, built);
  }
  let folded: string | undefined;

  for (const id of config.patches) {
    // oxlint-disable-next-line no-await-in-loop -- each patch goes on top of the one before it
    folded = await place(config, built, id, options, folded);
    built.steps.push(commit(dir, id));
  }

  return built;
};
