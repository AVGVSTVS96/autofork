import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { LIMITS } from "@autofork/contract";

import { AutoforkError, messageOf } from "../failure.ts";
import { configFile, DIR, patchDoc, upstreamDoc } from "../layout.ts";
import { has, isBoolean, isFilled, isObject, isText, isTextList } from "../platform/json.ts";
import { defaultFollow } from "../upstream/follow.ts";
import { isLimits, LIMITS_TAKE_NUMBERS } from "./limits.ts";
import { CHECKS } from "./types.ts";
import type { Check, Checks, Fork } from "./types.ts";

interface Written {
  readonly upstream: string;
}

export const discover = (root: string) =>
  readdirSync(path.join(root, DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(patchDoc(root, entry.name)))
    .map((entry) => entry.name)
    .toSorted();

const readWritten = (root: string): Written => {
  let raw: unknown;

  try {
    raw = JSON.parse(readFileSync(configFile(root), "utf-8"));
  } catch (error) {
    throw new AutoforkError(`${DIR}/config.json isn't valid JSON: ${messageOf(error)}`);
  }

  if (!has(raw, "upstream", isFilled)) {
    throw new AutoforkError(`${DIR}/config.json needs "upstream", like "owner/repo"`);
  }

  return raw;
};

const commandAt = (written: Written, key: string) =>
  has(written, key, isFilled) ? written[key] : undefined;

const pickedChecks = (written: Written, own: Record<Check, string | undefined>) => {
  const saved = has(written, "picked", isObject) ? written.picked : undefined;
  const picked: Checks = {};

  for (const key of CHECKS) {
    const pick = has(saved, key, isFilled) ? saved[key] : undefined;

    if (own[key] === undefined && pick !== undefined) {
      picked[key] = pick;
    }
  }

  return Object.keys(picked).length > 0 ? picked : undefined;
};

export const readConfig = async (root: string): Promise<Fork> => {
  if (!existsSync(configFile(root))) {
    throw new AutoforkError(
      "no .autofork/config.json here. Start with: autofork init <owner/repo>",
    );
  }

  const written = readWritten(root);
  const setup = commandAt(written, "setup");
  const verify = commandAt(written, "verify");
  const generated = has(written, "generated", isTextList) ? written.generated : undefined;

  if (generated !== undefined && generated.length > 0 && setup === undefined) {
    throw new AutoforkError(
      `"generated" files are rebuilt by "setup", so set your own in ${DIR}/config.json`,
    );
  }

  if (!has(written, "limits", isLimits)) {
    throw new AutoforkError(LIMITS_TAKE_NUMBERS);
  }

  const follow = has(written, "follow", isText)
    ? written.follow
    : await defaultFollow(root, written.upstream);

  const picked = pickedChecks(written, { setup, verify });

  return {
    upstream: written.upstream,
    follow,
    setup: setup ?? picked?.setup,
    generated,
    verify: verify ?? picked?.verify,
    agent: commandAt(written, "agent"),
    green: has(written, "green", isBoolean) ? written.green : undefined,
    limits: { ...LIMITS, ...written.limits },
    picked,
    patches: discover(root).filter((id) => !existsSync(upstreamDoc(root, id))),
  };
};
