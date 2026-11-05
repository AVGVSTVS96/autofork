import { OIDC_AUDIENCE } from "@autofork/contract";
import type { LedgerClose, LedgerOpen } from "@autofork/contract";

import { oidc, site } from "../platform/env.ts";
import { has, isText, readBody } from "../platform/json.ts";

interface Oidc {
  url: string;
  token: string;
}

type Body = LedgerOpen | LedgerClose;

const STALE_CONNECTION = Symbol("a connection the server closed while an agent ran");

const TIMEOUT = 10_000;

const isMinted = (value: unknown): value is { value: string } => has(value, "value", isText);

const send = async ({ url, token }: Oidc, route: string, body?: Body) => {
  const minted = await fetch(`${url}&audience=${OIDC_AUDIENCE}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT),
  });

  const answer = await readBody(minted, isMinted);

  return minted.ok && answer !== undefined
    ? await fetch(`${site}/api/${route}`, {
        method: body ? "POST" : "GET",
        headers: { authorization: `Bearer ${answer.value}`, "content-type": "application/json" },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT),
      })
    : undefined;
};

const attempt = async (credentials: Oidc, route: string, body?: Body) => {
  try {
    return await send(credentials, route, body);
  } catch (error) {
    return error instanceof Error && error.name === "TimeoutError" ? undefined : STALE_CONNECTION;
  }
};

export const reportsToSite = oidc !== undefined;

export const callSite = async (route: string, body?: Body) => {
  const first = oidc === undefined ? undefined : await attempt(oidc, route, body);

  const answer =
    first === STALE_CONNECTION && oidc !== undefined ? await attempt(oidc, route, body) : first;

  return answer === STALE_CONNECTION ? undefined : answer;
};
