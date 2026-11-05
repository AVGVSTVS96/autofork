import type { LedgerClose, LedgerOpen, LinkAsk } from "@autofork/contract";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Count, Usd } from "./settings.ts";

const RepoPart = Schema.String.check(Schema.isPattern(/^(?!\.\.?$)[\w.-]+$/u));

const Open: Schema.Codec<LedgerOpen, LedgerOpen> = Schema.Struct({
  patch: Schema.String,
  agent: Schema.Literals(["claude", "codex", "custom"]),
  cap: Usd,
});

const Close: Schema.Codec<LedgerClose, LedgerClose> = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["done", "stopped"]),
  cost: Schema.optionalKey(Usd),
  model: Schema.optionalKey(Schema.String),
  inputTokens: Schema.optionalKey(Count),
  outputTokens: Schema.optionalKey(Count),
});

const Link: Schema.Codec<LinkAsk, LinkAsk> = Schema.Struct({ owner: RepoPart, name: RepoPart });

const decode =
  <A>(schema: Schema.Codec<A, A>) =>
  async (request: Request) =>
    Option.getOrUndefined(Schema.decodeUnknownOption(schema)(await request.json()));

export const readLedgerOpen = decode(Open);

export const readLedgerClose = decode(Close);

export const readLinkAsk = decode(Link);
