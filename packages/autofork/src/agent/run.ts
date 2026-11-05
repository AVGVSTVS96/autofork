import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync } from "node:fs";

import type { Agent, LedgerClose, LedgerOpen } from "@autofork/contract";

import type { Config } from "../config/types.ts";
import { NoRoomError } from "../failure.ts";
import { finishRebuild, shortfall, startRebuild, usd } from "../ledger/ledger.ts";
import type { Row } from "../ledger/ledger.ts";
import { callSite, reportsToSite } from "../ledger/site.ts";
import { say } from "../platform/action.ts";
import { has, isText, readBody } from "../platform/json.ts";
import { agentCommand, runLabel } from "./command.ts";
import { claudeSpend, codexSpend } from "./spend.ts";
import type { Spend } from "./spend.ts";

const spenders = {
  claude: claudeSpend,
  codex: codexSpend,
  custom: (): Spend => ({}),
} satisfies Record<Agent, (out: Buffer) => Spend | Promise<Spend>>;

const openRow = async (row: Row) => {
  startRebuild(row);

  const opened = await callSite("ledger", {
    patch: row.patch,
    agent: row.agent,
    cap: row.cap,
  } satisfies LedgerOpen);

  const answer =
    opened?.status === 201
      ? await readBody(opened, (value) => has(value, "id", isText))
      : undefined;

  return answer?.id;
};

const printedBy = (
  dir: string,
  agent: Agent,
  command: string,
  prompt: string,
  env: NodeJS.ProcessEnv,
) => {
  const printed = `${dir}-agent.out`;
  const out = openSync(printed, "w");

  const result = spawnSync("sh", ["-c", command], {
    cwd: dir,
    env: { ...env, CLAUDE_CODE_ENTRYPOINT: runLabel },
    input: prompt,
    stdio: ["pipe", agent === "custom" ? "inherit" : out, "inherit"],
  });

  closeSync(out);
  const stdout = readFileSync(printed);

  rmSync(printed);

  return { ok: result.status === 0, stdout };
};

export const runAgent = async (
  config: Config,
  dir: string,
  what: string,
  prompt: string,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const { limits } = config;
  const short = await shortfall(limits);

  if (short !== undefined) {
    throw new NoRoomError(`${what} waits: ${short.full}`, short.why);
  }

  const { agent, command } = agentCommand(config, limits.rebuild, dir);

  const row: Row = {
    patch: what,
    agent,
    cap: limits.rebuild,
    cost: limits.rebuild,
    status: "running",
    at: new Date().toISOString(),
  };

  const id = await openRow(row);
  const { ok, stdout } = printedBy(dir, agent, command, prompt, env);
  const spend = await spenders[agent](stdout);
  const status = ok ? "done" : "stopped";

  finishRebuild(row, status, spend.cost);

  const answer =
    id === undefined
      ? undefined
      : await callSite("ledger/close", { id, status, ...spend } satisfies LedgerClose);

  const closed = answer?.ok === true;

  if (reportsToSite && !closed) {
    say("couldn't report this rebuild's cost to autofork.com");
  }

  say(`${what} cost ${spend.cost === undefined ? `up to ${usd(row.cap)}` : usd(spend.cost)}`);

  return ok;
};
