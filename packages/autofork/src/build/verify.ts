import type { Check, Fork } from "../config/types.ts";
import { AutoforkError, WaitError } from "../failure.ts";
import { say } from "../platform/action.ts";
import { reset, short } from "../platform/git.ts";
import { failureAt } from "./checks.ts";
import { fix } from "./fix.ts";
import { lastStep } from "./types.ts";
import type { Build } from "./types.ts";

const guard = (config: Fork, build: Build, from: string, check: Check) => {
  let broke = config.patches.length === 0;

  if (!broke && from !== build.source) {
    say(`verify with upstream ${short(from)} alone, where the fork was`);
    broke = failureAt(config, build, from) === undefined;
  }
  if (broke) {
    throw new AutoforkError(
      `${check} fails on upstream ${short(build.source)} itself: ${config[check] ?? ""}`,
    );
  }
  say(
    `${check} fails on upstream alone where the fork was too, so the patches are what make it pass`,
  );
};

const dropPicked = (config: Fork, check: Check) => {
  say(
    `\`${config[check] ?? ""}\` fails on upstream alone, so the checks an agent picked are dropped and the next agent that builds or heals a patch picks new ones`,
  );

  for (const key of Object.keys(config.picked ?? {})) {
    if (key === "setup" || key === "verify") {
      config[key] = undefined;
    }
  }
  config.picked = undefined;
};

const settle = async (config: Fork, build: Build, from: string | undefined): Promise<void> => {
  const failed = failureAt(config, build, lastStep(build));

  if (failed === undefined) {
    return;
  }
  const patched = build.steps.length > 1 && (from !== undefined || config.picked !== undefined);

  if (patched) {
    say(`${failed.check} fails, verify with upstream ${short(build.source)} alone`);
  }
  const aloneFailed = patched ? failureAt(config, build, build.steps[0]) : failed;

  if (aloneFailed !== undefined) {
    const { check } = aloneFailed;
    const yours = config.verify !== undefined && config.picked?.verify === undefined;

    if (!yours && config.picked?.[check] !== undefined) {
      dropPicked(config, check);
      await settle(config, build, from);

      return;
    }
    if (from !== undefined) {
      guard(config, build, from, check);
    }
    if (build.steps.length <= config.patches.length) {
      return;
    }
  }
  if (from === undefined) {
    throw new WaitError(`${failed.check} fails, so a patch needs rebuilding`);
  }
  await fix(config, build, failed, from, aloneFailed === undefined);
};

export const verify = async (config: Fork, build: Build, from?: string) => {
  if (config.setup === undefined && config.verify === undefined) {
    return;
  }
  try {
    await settle(config, build, from);
  } finally {
    reset(build.dir, lastStep(build));
  }
};
