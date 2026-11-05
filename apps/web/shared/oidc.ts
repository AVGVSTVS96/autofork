import { OIDC_AUDIENCE, WORKFLOW_FILE } from "@autofork/contract";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const ISSUER = "https://token.actions.githubusercontent.com";

export class Refused extends Data.TaggedError("Refused")<{ readonly message: string }> {}

const refuse = (message: string) => new Refused({ message });

const Jwk = Schema.Struct({
  kid: Schema.String,
  kty: Schema.String,
  n: Schema.String,
  e: Schema.String,
  alg: Schema.optionalKey(Schema.String),
  use: Schema.optionalKey(Schema.String),
});

type Jwk = typeof Jwk.Type;

const decodeJwks = Schema.decodeUnknownOption(Schema.Struct({ keys: Schema.Array(Jwk) }));

const segment = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  Schema.StringFromBase64Url.pipe(Schema.decodeTo(Schema.fromJsonString(schema)));

const decodeToken = Schema.decodeUnknownOption(
  Schema.Struct({
    header: segment(Schema.Struct({ kid: Schema.optionalKey(Schema.String) })),
    payload: segment(Schema.Unknown),
    signature: Schema.Uint8ArrayFromBase64Url,
  }),
);

const text = Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed("")));

const GitHubClaims = Schema.Struct({
  iss: Schema.Literal(ISSUER),
  aud: Schema.Literal(OIDC_AUDIENCE),
  exp: Schema.Number,
  nbf: Schema.optionalKey(Schema.Number),
  event_name: text,
  workflow_ref: text,
  repository: text,
  repository_id: text,
  run_id: text,
  run_attempt: text,
});

const decodeClaims = Schema.decodeUnknownOption(GitHubClaims);

export interface Claims {
  repository: string;
  repository_id: string;
  run_id: string;
  run_attempt: string;
}

const load = async () => {
  const response = await fetch(`${ISSUER}/.well-known/jwks`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`GitHub's signing keys answered ${response.status}`);
  }

  const jwks = decodeJwks(await response.json());

  if (Option.isNone(jwks)) {
    throw new Error("GitHub's signing keys came back without keys");
  }

  return jwks.value.keys;
};

let keys: Promise<readonly Jwk[]> | undefined;
let fetched = 0;

const jwks = async (fresh: boolean) => {
  const age = Date.now() - fetched;

  if (keys && age < 3_600_000 && !(fresh && age > 60_000)) {
    return await keys;
  }

  fetched = Date.now();
  const lastGood = keys;
  const next = load();
  keys = lastGood ? next.catch(async () => await lastGood) : next;
  next.catch(() => {
    if (!lastGood) {
      keys = undefined;
    }
  });

  return await next;
};

const signingKey = async (kid: string | undefined) => {
  const find = async (fresh: boolean) => {
    const known = await jwks(fresh);

    return known.find((key) => key.kid === kid);
  };

  const cached = await find(false);

  return cached ?? (await find(true).catch(() => null));
};

const accepted = ({
  exp,
  nbf,
  event_name,
  workflow_ref,
  repository,
  repository_id,
  run_id,
  run_attempt,
}: typeof GitHubClaims.Type): Claims => {
  if (exp * 1000 < Date.now() || (nbf !== undefined && nbf * 1000 > Date.now() + 60_000)) {
    throw refuse("expired");
  }

  if (event_name.startsWith("pull_request")) {
    throw refuse("not from pull requests");
  }

  if (repository === "" || !workflow_ref.startsWith(`${repository}/${WORKFLOW_FILE}@`)) {
    throw refuse("only the autofork workflow can ask");
  }

  return { repository, repository_id, run_id, run_attempt };
};

export const verifyOidc = async (authorization: string | null | undefined): Promise<Claims> => {
  const jwt = authorization?.replace(/^Bearer\s+/iu, "") ?? "";
  const [header = "", payload = "", signature = ""] = jwt.split(".");
  const token = decodeToken({ header, payload, signature });

  if (Option.isNone(token)) {
    throw refuse("not a token");
  }

  const jwk = await signingKey(token.value.header.kid);

  if (!jwk) {
    throw refuse("unknown signing key");
  }

  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  const key = await crypto.subtle.importKey("jwk", jwk, algorithm, false, ["verify"]);

  const signed = await crypto.subtle.verify(
    algorithm,
    key,
    new Uint8Array(token.value.signature),
    new TextEncoder().encode(`${header}.${payload}`),
  );

  if (!signed) {
    throw refuse("bad signature");
  }

  const claims = decodeClaims(token.value.payload);

  if (Option.isNone(claims)) {
    throw refuse("bad claims");
  }

  return accepted(claims.value);
};
