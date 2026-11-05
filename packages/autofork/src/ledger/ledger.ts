import { renameSync, writeFileSync } from "node:fs";

import type { Agent, Limits } from "@autofork/contract";

import { messageOf } from "../failure.ts";
import { DIR } from "../layout.ts";
import { output, say } from "../platform/action.ts";
import { readText } from "../platform/files.ts";
import { has, isNumber, isObject, parseJson, readBody } from "../platform/json.ts";
import { callSite, reportsToSite } from "./site.ts";

interface Tallied {
  cost: number;
}

export interface Row extends Tallied {
  patch: string;
  agent: Agent;
  cap: number;
  status: "running" | "done" | "stopped";
  at: string;
}

interface Ledger {
  file: string;
  month: string;
  rebuilds: Tallied[];
}

export interface Shortfall {
  why: string;
  full: string;
}

const isTallied = (value: unknown): value is Tallied => has(value, "cost", isNumber);

const isRows = (value: unknown): value is unknown[] => Array.isArray(value);

const thisMonth = () => new Date().toISOString().slice(0, 7);

let ledger: Ledger = {
  file: "",
  month: "",
  rebuilds: [],
};

export const usd = (amount: number) => `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;

export const openLedger = (file: string) => {
  const month = thisMonth();
  const saved = parseJson(readText(file), isObject);

  const rows =
    has(saved, "month", (value: unknown): value is string => value === month) &&
    has(saved, "rebuilds", isRows)
      ? saved.rebuilds
      : [];

  ledger = { file, month, rebuilds: rows.filter((row) => isTallied(row)) };
};

export const saveLedger = () => {
  const { file, ...kept } = ledger;

  if (file === "") {
    return;
  }

  try {
    writeFileSync(`${file}.tmp`, `${JSON.stringify(kept, null, 2)}\n`);
    renameSync(`${file}.tmp`, file);
  } catch (error) {
    say(`couldn't write the spend tally to ${file}: ${messageOf(error)}`);
  }
};

export const startRebuild = (row: Row) => {
  ledger.rebuilds.push(row);
  saveLedger();
  output({ ledger: "changed" });
};

export const finishRebuild = (row: Row, status: Row["status"], cost: number | undefined) => {
  row.status = status;

  if (cost !== undefined) {
    row.cost = cost;
  }

  saveLedger();
};

const siteTotals = async () => {
  const answer = await callSite("ledger");
  const remote = answer?.status === 200 ? await readBody(answer, isObject) : undefined;

  if (reportsToSite && remote === undefined) {
    say(
      "couldn't read this month's spend from autofork.com, so only this fork's own count is used",
    );
  }

  return {
    rebuilds: has(remote, "rebuilds", isNumber) ? remote.rebuilds : 0,
    spent: has(remote, "spent", isNumber) ? remote.spent : 0,
  };
};

const nextMonth = () => {
  const next = new Date();

  next.setUTCMonth(next.getUTCMonth() + 1, 1);

  return next.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
};

export const shortfall = async (limits: Limits, count = 1): Promise<Shortfall | undefined> => {
  if (ledger.month !== thisMonth()) {
    openLedger(ledger.file);
  }

  const remote = await siteTotals();
  const rebuilds = Math.max(ledger.rebuilds.length, remote.rebuilds);

  const spent = Math.max(
    ledger.rebuilds.reduce((sum, row) => sum + row.cost, 0),
    remote.spent,
  );

  const cost = count * limits.rebuild;

  if (rebuilds + count <= limits.rebuilds && spent + cost <= limits.month) {
    return undefined;
  }

  const some = count === 1 ? "a rebuild" : `${count} rebuilds`;

  const over = (used: number, paid: number) =>
    [
      used + count > limits.rebuilds ? "rebuilds" : undefined,
      paid + cost > limits.month ? "month" : undefined,
    ].filter((key) => key !== undefined);

  const never = over(0, 0);
  const keys = never.length > 0 ? never : over(rebuilds, spent);

  const why = keys
    .map((key) =>
      key === "rebuilds"
        ? `${some} won't fit in this month's ${limits.rebuilds} (${rebuilds} used)`
        : `${some} may cost ${usd(cost)} and ${usd(Math.max(0, limits.month - spent))} of this month's ${usd(limits.month)} is left`,
    )
    .join(", and ");

  const raise = `raise ${keys.map((key) => `"${key}"`).join(" and ")} in "limits" in ${DIR}/config.json`;

  const when =
    never.length > 0 ? `It needs you to ${raise}.` : `It runs ${nextMonth()} 1 (UTC), or ${raise}.`;

  return { why, full: `${why}. ${when}` };
};
