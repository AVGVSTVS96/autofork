import { createHash, randomBytes } from "node:crypto";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Problem } from "../shared/api.ts";

const parseJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

const post = <A, I>(
  url: string,
  body: Readonly<Record<string, string | number>>,
  schema: Schema.Codec<A, I>,
  form = false,
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": form ? "application/x-www-form-urlencoded" : "application/json",
          "user-agent": "autofork",
        },
        body: form
          ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]))
          : JSON.stringify(body),
      });

      const text = await response.text();

      return {
        status: response.status,
        json: Option.isSome(parseJson(text)),
        answer: Schema.decodeUnknownOption(Schema.fromJsonString(schema))(text),
      };
    },
    catch: () =>
      new Problem({ message: `Couldn't reach ${new URL(url).host}. Try again in a moment.` }),
  });

const CLAUDE_CODE_SETUP_TOKEN = {
  client: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  authorize: "https://claude.com/cai/oauth/authorize",
  token: "https://platform.claude.com/v1/oauth/token",
  redirect: "https://platform.claude.com/oauth/code/callback",
  scope: "user:inference",
  year: 31_536_000,
};

const base64url = (bytes: Buffer) => bytes.toString("base64url");

export const claudeStart = () => {
  const verifier = base64url(randomBytes(32));
  const state = base64url(randomBytes(32));
  const url = new URL(CLAUDE_CODE_SETUP_TOKEN.authorize);
  url.search = new URLSearchParams({
    code: "true",
    client_id: CLAUDE_CODE_SETUP_TOKEN.client,
    response_type: "code",
    redirect_uri: CLAUDE_CODE_SETUP_TOKEN.redirect,
    scope: CLAUDE_CODE_SETUP_TOKEN.scope,
    code_challenge: base64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    state,
  }).toString();

  return { url: url.toString(), verifier, state };
};

const ClaudeToken = Schema.Struct({ access_token: Schema.NonEmptyString });

export const claudeToken = Effect.fn(function* claudeToken(
  pasted: string,
  expected: { readonly verifier: string; readonly state: string },
) {
  const [code = "", state] = pasted.trim().split("#");

  if (code === "" || state !== expected.state) {
    return yield* new Problem({
      message:
        "That isn't the code from this sign-in. Copy the whole code from Claude's page and paste it again.",
    });
  }

  const { status, answer } = yield* post(
    CLAUDE_CODE_SETUP_TOKEN.token,
    {
      grant_type: "authorization_code",
      code,
      state,
      redirect_uri: CLAUDE_CODE_SETUP_TOKEN.redirect,
      client_id: CLAUDE_CODE_SETUP_TOKEN.client,
      code_verifier: expected.verifier,
      expires_in: CLAUDE_CODE_SETUP_TOKEN.year,
    },
    ClaudeToken,
  );

  if (status !== 200 && status !== 400 && status !== 401) {
    return yield* new Problem({
      message: `Claude's sign-in answered ${status}. Try again in a minute.`,
    });
  }

  if (status !== 200 || Option.isNone(answer)) {
    return yield* new Problem({
      message:
        "Claude didn't accept that code. Codes work once and expire quickly, so sign in again for a new one.",
    });
  }

  return answer.value.access_token;
});

const CODEX_DEVICE_LOGIN = {
  client: "app_EMoamEEZ73f0CkXaXp7hrann",
  issuer: "https://auth.openai.com",
  page: "https://auth.openai.com/codex/device",
};

const UserCode = Schema.Struct({
  device_auth_id: Schema.NonEmptyString,
  user_code: Schema.NonEmptyString,
});

export const chatgptStart = Effect.gen(function* chatgptStart() {
  const { status, answer } = yield* post(
    `${CODEX_DEVICE_LOGIN.issuer}/api/accounts/deviceauth/usercode`,
    { client_id: CODEX_DEVICE_LOGIN.client },
    UserCode,
  );

  if (Option.isNone(answer)) {
    return yield* new Problem({
      message: `ChatGPT sign-in isn't available right now (it answered ${status}). Try again in a moment.`,
    });
  }

  return {
    id: answer.value.device_auth_id,
    code: answer.value.user_code,
    url: CODEX_DEVICE_LOGIN.page,
    at: Date.now(),
  };
});

const DeviceGrant = Schema.Struct({
  authorization_code: Schema.NonEmptyString,
  code_verifier: Schema.NonEmptyString,
});

const DeviceTokens = Schema.Struct({
  id_token: Schema.NonEmptyString,
  access_token: Schema.NonEmptyString,
  refresh_token: Schema.NonEmptyString,
});

const decodeAccountId = Schema.decodeUnknownOption(
  Schema.StringFromBase64Url.pipe(
    Schema.decodeTo(
      Schema.fromJsonString(
        Schema.Struct({
          "https://api.openai.com/auth": Schema.Struct({ chatgpt_account_id: Schema.String }),
        }),
      ),
    ),
  ),
);

const accountId = (idToken: string) =>
  Option.match(decodeAccountId(idToken.split(".")[1] ?? ""), {
    onNone: () => null,
    onSome: (claims) => claims["https://api.openai.com/auth"].chatgpt_account_id,
  });

const CODEX_GIVES_UP_AFTER = 15 * 60_000;

/* Codex's own client treats 403 and 404 as "not signed in yet":
   https://github.com/openai/codex/blob/main/codex-rs/login/src/device_code_auth.rs */
export const chatgptAuth = Effect.fn(function* chatgptAuth(device: {
  readonly id: string;
  readonly code: string;
  readonly at?: number;
}) {
  if (device.at !== undefined && Date.now() - device.at > CODEX_GIVES_UP_AFTER) {
    return yield* new Problem({
      message: "That ChatGPT code expired. Pick ChatGPT again for a new one.",
    });
  }

  const poll = yield* post(
    `${CODEX_DEVICE_LOGIN.issuer}/api/accounts/deviceauth/token`,
    { device_auth_id: device.id, user_code: device.code },
    DeviceGrant,
  );

  if ((poll.status === 403 || poll.status === 404) && poll.json) {
    return null;
  }

  if (poll.status !== 200 || Option.isNone(poll.answer)) {
    return yield* new Problem({
      message: `ChatGPT's sign-in answered ${poll.status} instead of a sign-in. Pick ChatGPT again for a new code.`,
    });
  }

  const { status, answer } = yield* post(
    `${CODEX_DEVICE_LOGIN.issuer}/oauth/token`,
    {
      grant_type: "authorization_code",
      code: poll.answer.value.authorization_code,
      redirect_uri: `${CODEX_DEVICE_LOGIN.issuer}/deviceauth/callback`,
      client_id: CODEX_DEVICE_LOGIN.client,
      code_verifier: poll.answer.value.code_verifier,
    },
    DeviceTokens,
    true,
  );

  if (Option.isNone(answer)) {
    return yield* new Problem({
      message: `ChatGPT sign-in didn't finish (it answered ${status}). Start it again for a new code.`,
    });
  }

  const { id_token, access_token, refresh_token } = answer.value;

  return JSON.stringify({
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: { id_token, access_token, refresh_token, account_id: accountId(id_token) },
    last_refresh: new Date().toISOString(),
  });
});
