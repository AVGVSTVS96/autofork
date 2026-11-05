import { readdirSync } from "node:fs";
import path from "node:path";

import { say } from "../platform/action.ts";
import { readText } from "../platform/files.ts";
import { has, isFilled, isNumber, isObject, isText, readBody } from "../platform/json.ts";
import { codexDir } from "./command.ts";

export interface Spend {
  cost?: number;
  model?: string;
}

interface ModelCost {
  costUSD?: number;
}

type Rate = number | null | undefined;

interface Price {
  input_cost_per_token?: Rate;
  cache_read_input_token_cost?: Rate;
  cache_creation_input_token_cost?: Rate;
  output_cost_per_token?: Rate;
}

interface Usage {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens?: number;
}

const spendOf = (cost: number | undefined, model: string | undefined) => {
  const spend: Spend = {};

  if (cost !== undefined) {
    spend.cost = cost;
  }

  if (model !== undefined) {
    spend.model = model;
  }

  return spend;
};

const CODEX_MODEL = /"model":"(?<model>[^"]+)"/u;

const PRICES_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const isList = (value: unknown): value is unknown[] => Array.isArray(value);

const isResult = (value: unknown): value is object =>
  has(value, "type", (type) => type === "result");

const isCount = (value: unknown): value is number | undefined =>
  value === undefined || isNumber(value);

const isModelCost = (value: unknown): value is ModelCost => has(value, "costUSD", isCount);

const isModelUsage = (value: unknown): value is Record<string, ModelCost> =>
  isObject(value) && Object.values(value).every((cost) => isModelCost(cost));

const isRate = (value: unknown): value is Rate =>
  value === undefined || value === null || isNumber(value);

const isPrice = (value: unknown): value is Price =>
  has(value, "input_cost_per_token", isRate) &&
  has(value, "cache_read_input_token_cost", isRate) &&
  has(value, "cache_creation_input_token_cost", isRate) &&
  has(value, "output_cost_per_token", isRate);

const isUsage = (value: unknown): value is Usage =>
  has(value, "input_tokens", isCount) &&
  has(value, "cached_input_tokens", isCount) &&
  has(value, "cache_write_input_tokens", isCount) &&
  has(value, "output_tokens", isCount);

const isEvent = <Type extends string>(value: unknown, type: Type): value is Record<"type", Type> =>
  has(value, "type", (found: unknown): found is Type => found === type);

export const claudeSpend = (out: Buffer): Spend => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(out.toString().trim().split("\n").at(-1) ?? "");
  } catch {
    process.stderr.write(out);

    return {};
  }

  const report: unknown = isList(parsed) ? parsed.findLast((message) => isResult(message)) : parsed;

  if (!isObject(report)) {
    return {};
  }

  const said = [
    has(report, "result", isText) ? report.result : undefined,
    ...(has(report, "errors", isList) ? report.errors : []),
  ];

  for (const line of said) {
    if (isText(line)) {
      say(line);
    }
  }

  const models = has(report, "modelUsage", isModelUsage) ? Object.entries(report.modelUsage) : [];

  return spendOf(
    has(report, "total_cost_usd", isNumber) ? report.total_cost_usd : undefined,
    models.toSorted(([, a], [, b]) => (b.costUSD ?? 0) - (a.costUSD ?? 0))[0]?.[0],
  );
};

const readCodexEvents = (out: Buffer) => {
  let thread: string | undefined;
  let usage: Usage | undefined;

  for (const line of out.toString().split("\n")) {
    let event: unknown;

    try {
      event = JSON.parse(line);
    } catch {
      if (line.trim()) {
        say(line);
      }

      continue;
    }

    if (isEvent(event, "thread.started") && has(event, "thread_id", isText)) {
      thread = event.thread_id;
    }

    const said = isEvent(event, "item.completed")
      ? has(event, "item", (item) => has(item, "text", isText)) && event.item.text
      : has(event, "message", isText) && event.message;

    if (isText(said)) {
      say(said);
    }

    if (
      isEvent(event, "turn.failed") &&
      has(event, "error", (failure) => has(failure, "message", isFilled))
    ) {
      say(event.error.message);
    }

    if (isEvent(event, "turn.completed")) {
      usage = has(event, "usage", isUsage) ? event.usage : undefined;
    }
  }

  return { thread, usage };
};

const sessionFiles = (sessions: string) => {
  try {
    return readdirSync(sessions, { recursive: true, encoding: "utf-8" });
  } catch {
    return [];
  }
};

const modelFromCodexSession = (thread: string) => {
  const sessions = path.join(codexDir, "sessions");
  const rollout = sessionFiles(sessions).find((name) => name.endsWith(`${thread}.jsonl`));

  return rollout === undefined
    ? undefined
    : CODEX_MODEL.exec(readText(path.join(sessions, rollout)))?.groups?.model;
};

let table: Promise<object | undefined> | undefined;

const fetchPrices = async () => {
  const response = await fetch(PRICES_URL, { signal: AbortSignal.timeout(30_000) });

  return response.ok ? await readBody(response, isObject) : undefined;
};

const prices = async (model: string) => {
  table ??= fetchPrices();
  let rates: object | undefined;

  try {
    rates = await table;
  } catch {
    table = undefined;
  }

  if (has(rates, model, isPrice)) {
    return rates[model];
  }

  return has(rates, `openai/${model}`, isPrice) ? rates[`openai/${model}`] : undefined;
};

const costOf = (usage: Usage, price: Price) => {
  const input = usage.input_tokens ?? 0;
  const cached = usage.cached_input_tokens ?? 0;
  const written = usage.cache_write_input_tokens ?? 0;
  const inputRate = Number(price.input_cost_per_token);

  return (
    (input - cached - written) * inputRate +
    cached * (price.cache_read_input_token_cost ?? inputRate) +
    written * (price.cache_creation_input_token_cost ?? inputRate) +
    (usage.output_tokens ?? 0) * Number(price.output_cost_per_token)
  );
};

export const codexSpend = async (out: Buffer): Promise<Spend> => {
  const { thread, usage } = readCodexEvents(out);

  if (usage === undefined || !Object.values(usage).some((count) => isNumber(count) && count > 0)) {
    return {};
  }

  const model = thread === undefined ? undefined : modelFromCodexSession(thread);
  const price = model === undefined ? undefined : await prices(model);

  if (price === undefined || !((price.input_cost_per_token ?? 0) > 0)) {
    say(`couldn't price ${model ?? "Codex's model"}, so this rebuild counts at its cap`);

    return spendOf(undefined, model);
  }

  const cost = costOf(usage, price);

  return spendOf(Number.isFinite(cost) ? cost : undefined, model);
};
