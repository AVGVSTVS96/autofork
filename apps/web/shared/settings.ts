import { LIMITS } from "@autofork/contract";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { Limits, Settings } from "./api.ts";

const CRON =
  /^(?<head>[ \t]*-[ \t]*cron:[ \t]*)(?<quote>["']?)(?<value>(?![|>])[^"'\s#](?:[^"'\n#]*[^"'\s#])?)\k<quote>(?<tail>[ \t]*(?:#.*)?)$/mu;

const LOOKS_LIKE_CRON = /^[ \t]*-?[ \t]*\{?[ \t]*["']?cron["']?[ \t]*:/gmu;

export const cronLines = (workflow: string) => workflow.match(LOOKS_LIKE_CRON)?.length ?? 0;

export const cronLine = (workflow: string | null) =>
  CRON.exec(workflow ?? "")?.groups?.value?.trim() ?? null;

export const withCron = (workflow: string, cron: string) => {
  const line = CRON.exec(workflow);

  if (line?.groups === undefined) {
    return workflow;
  }

  const { head = "", tail = "" } = line.groups;
  const after = line.index + line[0].length;

  return `${workflow.slice(0, line.index)}${head}"${cron}"${tail}${workflow.slice(after)}`;
};

export const Usd = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const JsonObject = Schema.Record(Schema.String, Schema.Unknown);

const decodeConfig = Schema.decodeUnknownOption(Schema.fromJsonString(JsonObject));
const asObject = Schema.decodeUnknownOption(JsonObject);
const asText = Schema.decodeUnknownOption(Schema.String);
const asUsd = Schema.decodeUnknownOption(Usd);
const asCount = Schema.decodeUnknownOption(Count);

const ConfigLimits = Schema.Struct({
  rebuilds: Schema.optionalKey(Count),
  month: Schema.optionalKey(Usd),
  rebuild: Schema.optionalKey(Usd),
});

const NO_FIELDS: typeof JsonObject.Type = {};

const fieldsOf = (config: string | null) =>
  Option.getOrElse(decodeConfig(config ?? ""), () => NO_FIELDS);

export const parses = (config: string) => Option.isSome(decodeConfig(config));

export const githubRepo = (upstream: string) =>
  /^(?:(?:(?:https?|ssh|git):\/\/)?(?:[^@/\s]+@)?(?:www\.)?github\.com[/:])?(?<repo>[\w-]+\/[\w.-]+?)(?:\.git)?(?:\/.*)?$/iu.exec(
    upstream.trim(),
  )?.groups?.repo ?? null;

export const upstreamOf = (config: string | null) =>
  Option.getOrNull(Option.flatMapNullishOr(asText(fieldsOf(config).upstream), githubRepo));

const ENGINE_DEFAULT_FOLLOW = "";

export const readSettings = (config: string | null, workflow: string | null): Settings => {
  const { follow, limits } = fieldsOf(config);
  const set = Option.getOrElse(asObject(limits), () => NO_FIELDS);

  return {
    cron: cronLine(workflow),
    follow: Option.getOrElse(asText(follow), () => ENGINE_DEFAULT_FOLLOW),
    limits: {
      rebuilds: Option.getOrElse(asCount(set.rebuilds), () => LIMITS.rebuilds),
      month: Option.getOrElse(asUsd(set.month), () => LIMITS.month),
      rebuild: Option.getOrElse(asUsd(set.rebuild), () => LIMITS.rebuild),
    },
  };
};

export const readableLimits = (config: string | null) => {
  const { limits } = fieldsOf(config);

  return limits === undefined || Schema.is(ConfigLimits)(limits);
};

export const readableFollow = (config: string | null) => {
  const { follow } = fieldsOf(config);

  return follow === undefined || Schema.is(Schema.String)(follow);
};

export const withSettings = (config: string | null, follow: string, limits?: Limits) => {
  const { follow: _, limits: before, ...rest } = fieldsOf(config);

  const merged = limits
    ? { ...Option.getOrElse(asObject(before), () => NO_FIELDS), ...limits }
    : before;

  return `${JSON.stringify({ ...rest, follow: follow.trim() || undefined, limits: merged }, null, 2)}\n`;
};
