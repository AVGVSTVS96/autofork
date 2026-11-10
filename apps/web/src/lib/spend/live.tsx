import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { ReactElement } from "react";

import { api } from "../../../convex/_generated/api";

const convex = Option.map(
  Schema.decodeUnknownOption(Schema.NonEmptyString)(import.meta.env.VITE_CONVEX_URL),
  (url) => new ConvexReactClient(url),
);

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

const useLiveSpend = (names: string[]) =>
  useQuery(api.dashboard.forks, { names, since: monthStart() });

const useNoSpend = (_names: string[]): ReturnType<typeof useLiveSpend> => undefined;

export const useSpend = Option.isSome(convex) ? useLiveSpend : useNoSpend;

export type Spend = NonNullable<ReturnType<typeof useSpend>>[number];

const GITHUB_JOB_TIME_LIMIT = 6 * 3_600_000;

export const rebuilding = (row: { status: string; startedAt: number }) =>
  row.status === "running" && Date.now() - row.startedAt < GITHUB_JOB_TIME_LIMIT;

export const money = (usd: number) =>
  `$${usd < 10 && usd % 1 !== 0 ? usd.toFixed(2) : Math.round(usd).toLocaleString()}`;
