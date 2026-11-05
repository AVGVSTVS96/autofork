import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { Env } from "./env.ts";
import { GitHubError } from "./github.ts";

const API = "https://api.workos.com/user_management";

const Signed = Schema.Struct({
  user: Schema.Struct({ id: Schema.String }),
  access_token: Schema.String,
  refresh_token: Schema.String,
  oauth_tokens: Schema.optionalKey(
    Schema.Struct({
      access_token: Schema.String,
      refresh_token: Schema.optionalKey(Schema.String),
      expires_at: Schema.optionalKey(Schema.Union([Schema.Number, Schema.String])),
    }),
  ),
});

export type Signed = typeof Signed.Type;

const Refusal = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  error_description: Schema.optionalKey(Schema.String),
  pending_authentication_token: Schema.optionalKey(Schema.String),
  email: Schema.optionalKey(Schema.String),
});

const decodeRefusal = Schema.decodeUnknownOption(Refusal);
const NO_REFUSAL: typeof Refusal.Type = {};
const decodeSigned = Schema.decodeUnknownOption(Signed);

export const authorizeUrlViaGitHub = Effect.fn(function* authorizeUrlViaGitHub(
  redirect: string,
  state: string,
) {
  const { workosClientId } = yield* Env;
  const url = new URL(`${API}/authorize`);
  url.search = new URLSearchParams({
    client_id: workosClientId,
    redirect_uri: redirect,
    response_type: "code",
    provider: "GitHubOAuth",
    state,
  }).toString();

  return url;
});

export interface EmailCheck {
  readonly verify: { readonly token: string; readonly email: string };
}

const failure = (status: number, message: string) =>
  new GitHubError({ status, path: "workos", message });

const authenticate = Effect.fn(function* authenticate(grant: Readonly<Record<string, string>>) {
  const { workosClientId, workosApiKey } = yield* Env;

  return yield* Effect.tryPromise({
    try: async (): Promise<Signed | EmailCheck> => {
      const response = await fetch(`${API}/authenticate`, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_id: workosClientId,
          client_secret: Redacted.value(workosApiKey),
          ...grant,
        }),
      });

      const body: unknown = await response.json().catch(() => null);
      const refusal = Option.getOrElse(decodeRefusal(body), () => NO_REFUSAL);

      if (
        refusal.code === "email_verification_required" &&
        refusal.pending_authentication_token !== undefined &&
        refusal.pending_authentication_token !== ""
      ) {
        return {
          verify: { token: refusal.pending_authentication_token, email: refusal.email ?? "" },
        };
      }

      if (!response.ok) {
        throw failure(
          response.status,
          refusal.error_description ?? refusal.message ?? "WorkOS sign-in failed",
        );
      }

      const signed = decodeSigned(body);

      if (Option.isNone(signed)) {
        throw failure(502, "WorkOS answered something unexpected");
      }

      return signed.value;
    },
    catch: (cause) => (cause instanceof GitHubError ? cause : failure(0, String(cause))),
  });
});

export const withCode = (code: string) => authenticate({ grant_type: "authorization_code", code });

export const withEmailCode = (code: string, token: string) =>
  authenticate({
    grant_type: "urn:workos:oauth:grant-type:email-verification:code",
    code,
    pending_authentication_token: token,
  });

export const refreshed = (refresh: string) =>
  Effect.flatMap(authenticate({ grant_type: "refresh_token", refresh_token: refresh }), (result) =>
    "verify" in result ? Effect.fail(failure(401, "sign in again")) : Effect.succeed(result),
  );

const decodeExpiry = Schema.decodeUnknownOption(
  Schema.StringFromBase64Url.pipe(
    Schema.decodeTo(Schema.fromJsonString(Schema.Struct({ exp: Schema.Number }))),
  ),
);

export const expiry = (jwt: string) =>
  Option.match(decodeExpiry(jwt.split(".")[1] ?? ""), {
    onNone: () => 0,
    onSome: ({ exp }) => exp * 1000,
  });
