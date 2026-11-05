import { LIMITS } from "@autofork/contract";
import type { Limits } from "@autofork/contract";

import { DIR } from "../layout.ts";
import { isObject } from "../platform/json.ts";

export const LIMITS_TAKE_NUMBERS = `"limits" in ${DIR}/config.json takes numbers, like ${JSON.stringify(LIMITS)}`;

const isLimit = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const isLimits = (value: unknown): value is Partial<Limits> | undefined =>
  value === undefined ||
  (isObject(value) &&
    !Array.isArray(value) &&
    Object.entries(value).every(([key, limit]) => Object.hasOwn(LIMITS, key) && isLimit(limit)) &&
    !("rebuild" in value && value.rebuild === 0));
