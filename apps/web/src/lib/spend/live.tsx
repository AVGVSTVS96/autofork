import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import type { ReactElement } from "react";

import { api } from "../../../convex/_generated/api";

const convex = Option.map(
  Schema.decodeUnknownOption(Schema.NonEmptyString)(import.meta.env.VITE_CONVEX_URL),
  (url) => new ConvexReactClient(url),
);

class Unauthorized extends Data.TaggedError("Unauthorized") {}

class Unavailable extends Data.TaggedError("Unavailable") {}

const TokenBody = Schema.Struct({ token: Schema.String });

const readToken = (response: Response): Effect.Effect<string, Unauthorized | Unavailable> => {
  if (response.status === 401) {
    return Effect.fail(new Unauthorized());
  }

  if (!response.ok) {
    return Effect.fail(new Unavailable());
  }

  return Effect.tryPromise({
    try: async () => Schema.decodeUnknownSync(TokenBody)(await response.json()).token,
    catch: () => new Unavailable(),
  });
};

const fetchToken = (fresh: boolean) =>
  Effect.tryPromise({
    try: async () => await fetch(`/api/auth/token${fresh ? "?fresh=1" : ""}`),
    catch: () => new Unavailable(),
  }).pipe(Effect.flatMap(readToken));

const backoff = Schedule.exponential("1 second").pipe(
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.seconds(30))),
  ),
  Schedule.jittered,
);

const tokenOrSignedOut = async ({ forceRefreshToken }: { forceRefreshToken: boolean }) =>
  await Effect.runPromise(
    fetchToken(forceRefreshToken).pipe(
      Effect.retry({ schedule: backoff, while: Predicate.isTagged("Unavailable") }),
      Effect.retry({ schedule: backoff, times: 3 }),
      Effect.catchTag("Unauthorized", () => Effect.succeed(null)),
    ),
  );

if (Option.isSome(convex)) {
  convex.value.setAuth(tokenOrSignedOut);
}

export const Live = ({ children }: { children: ReactElement }) =>
  Option.isSome(convex) ? (
    <ConvexProvider client={convex.value}>{children}</ConvexProvider>
  ) : (
    children
  );

const monthStart = () => {
  const now = new Date();

  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
};

const useLiveSpend = () => useQuery(api.dashboard.forks, { since: monthStart() });

const useNoSpend = (): ReturnType<typeof useLiveSpend> => undefined;

export const useSpend = Option.isSome(convex) ? useLiveSpend : useNoSpend;

export type Spend = NonNullable<ReturnType<typeof useSpend>>[number];

const GITHUB_JOB_TIME_LIMIT = 6 * 3_600_000;

export const rebuilding = (row: { status: string; startedAt: number }) =>
  row.status === "running" && Date.now() - row.startedAt < GITHUB_JOB_TIME_LIMIT;

export const money = (usd: number) =>
  `$${usd < 10 && usd % 1 !== 0 ? usd.toFixed(2) : Math.round(usd).toLocaleString()}`;
