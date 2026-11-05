import { createSign } from "node:crypto";

import { blake2b } from "@noble/hashes/blake2.js";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import nacl from "tweetnacl";

import { SignedOut } from "../shared/api.ts";
import { Env } from "./env.ts";
import { keep } from "./lru.ts";
import * as Session from "./session.ts";

export class GitHubError extends Data.TaggedError("GitHubError")<{
  readonly status: number;
  readonly path: string;
  readonly message: string;
}> {}

export type Token = string | undefined;

const API = "https://api.github.com";

const remembered = new Map<string, { etag: string; body: string }>();

const limited = (response: Response, message: string) =>
  response.status === 429 ||
  (response.status === 403 &&
    (response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/iu.test(message)));

const transient = (error: GitHubError) => error.status === 0 || error.status >= 500;

const decodeErrorMessage = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ message: Schema.String })),
);

const headersFor = (
  token: Token,
  body: Schema.JsonObject | undefined,
  etag: string | undefined,
) => {
  const headers = new Headers({
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "autofork",
  });

  if (token !== undefined && token !== "") {
    headers.set("authorization", `Bearer ${token}`);
  }

  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  if (etag !== undefined) {
    headers.set("if-none-match", etag);
  }

  return headers;
};

/* A GET GitHub answers with 304 Not Modified doesn't count against the rate limit:
   https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests-if-appropriate */
const call = (
  token: Token,
  method: string,
  path: string,
  body: Schema.JsonObject | undefined,
  conditional: boolean,
) => {
  const url = path.startsWith("https://") ? path : `${API}${path}`;
  const key = `${token?.slice(-12) ?? "anon"} ${url}`;

  return Effect.tryPromise({
    try: async () => {
      const cached = conditional ? remembered.get(key) : undefined;

      const response = await fetch(url, {
        method,
        headers: headersFor(token, body, cached?.etag),
        body: body === undefined ? null : JSON.stringify(body),
      });

      if (response.status === 304 && cached) {
        keep(remembered, key, cached, 1000);

        return cached.body;
      }

      const text = await response.text();

      if (!response.ok) {
        const message = Option.match(decodeErrorMessage(text), {
          onNone: () => text,
          onSome: (answer) => answer.message,
        });

        throw new GitHubError({
          status: limited(response, message) ? 429 : response.status,
          path,
          message,
        });
      }

      const etag = response.headers.get("etag");

      if (conditional && etag !== null) {
        keep(remembered, key, { etag, body: text }, 1000);
      }

      return text;
    },
    catch: (error) =>
      error instanceof GitHubError
        ? error
        : new GitHubError({ status: 0, path, message: String(error) }),
  }).pipe(
    Effect.retry({
      while: (error) => method === "GET" && transient(error),
      schedule: Schedule.exponential("300 millis"),
      times: 2,
    }),
  );
};

const answer =
  <A, I>(schema: Schema.Codec<A, I>, path: string) =>
  (text: string) =>
    Schema.decodeEffect(Schema.fromJsonString(schema))(text).pipe(
      Effect.mapError(
        (issue) =>
          new GitHubError({
            status: 502,
            path,
            message: `GitHub answered something unexpected: ${issue.message}`,
          }),
      ),
    );

export const get = <A, I>(token: Token, path: string, schema: Schema.Codec<A, I>) =>
  call(token, "GET", path, undefined, true).pipe(Effect.flatMap(answer(schema, path)));

export const post = <A, I>(
  token: Token,
  path: string,
  body: Schema.JsonObject,
  schema: Schema.Codec<A, I>,
) => call(token, "POST", path, body, false).pipe(Effect.flatMap(answer(schema, path)));

export const send = (
  token: Token,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: Schema.JsonObject,
) => call(token, method, path, body, false).pipe(Effect.asVoid);

export const text = (token: Token, path: string) => call(token, "GET", path, undefined, false);

const Contents = Schema.Struct({ content: Schema.String });

export const fileText = (token: Token, path: string) =>
  text(token, path).pipe(
    Effect.flatMap(answer(Contents, path)),
    Effect.map(({ content }) => Buffer.from(content, "base64").toString()),
  );

export const busy = (error: GitHubError) => error.status === 429;

export const missing = (error: GitHubError) => error.status === 404;

const base64urlJson = (value: Schema.JsonObject) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const appJwt = Effect.gen(function* appJwt() {
  const { clientId, privateKey } = yield* Env;
  const now = Math.floor(Date.now() / 1000);
  const body = `${base64urlJson({ alg: "RS256", typ: "JWT" })}.${base64urlJson({ iat: now - 60, exp: now + 540, iss: clientId })}`;

  return `${body}.${createSign("RSA-SHA256").update(body).sign(Redacted.value(privateKey), "base64url")}`;
});

const Installation = Schema.Struct({ id: Schema.Number });

const AccessToken = Schema.Struct({ token: Schema.String, expires_at: Schema.String });

const mintedTokens = new Map<string, { token: string; expires: number }>();

const minted = Effect.fn(function* minted(
  key: string,
  mint: Effect.Effect<typeof AccessToken.Type, GitHubError, Env>,
) {
  const hit = mintedTokens.get(key);

  if (hit && hit.expires > Date.now()) {
    return hit.token;
  }

  const { token, expires_at } = yield* mint;
  mintedTokens.set(key, { token, expires: Date.parse(expires_at) - 300_000 });

  return token;
});

export const appToken = minted(
  "app",
  Effect.gen(function* appToken() {
    const jwt = yield* appJwt;

    const [installation] = yield* get(
      jwt,
      "/app/installations?per_page=1",
      Schema.Array(Installation),
    );

    if (!installation) {
      return yield* new GitHubError({
        status: 404,
        path: "/app/installations",
        message: "autofork isn't installed anywhere",
      });
    }

    return yield* post(
      jwt,
      `/app/installations/${installation.id}/access_tokens`,
      { permissions: { metadata: "read" } },
      AccessToken,
    );
  }),
);

const installationToken = Effect.fn(function* installationToken(
  owner: string,
  name: string,
  permissions?: Readonly<Record<string, string>>,
) {
  const jwt = yield* appJwt;
  const installation = yield* get(jwt, `/repos/${owner}/${name}/installation`, Installation);

  return yield* post(
    jwt,
    `/app/installations/${installation.id}/access_tokens`,
    permissions === undefined ? { repositories: [name] } : { repositories: [name], permissions },
    AccessToken,
  );
});

export const repoToken = (owner: string, name: string) =>
  minted(`${owner}/${name}`.toLowerCase(), installationToken(owner, name));

export const workflowToken = (owner: string, name: string) =>
  installationToken(owner, name, { contents: "write", workflows: "write" });

export interface Tokens {
  readonly token: string;
  readonly refresh: string;
  readonly expires: number;
}

const OAuthAnswer = Schema.Struct({
  access_token: Schema.optionalKey(Schema.String),
  refresh_token: Schema.optionalKey(Schema.String),
  expires_in: Schema.optionalKey(Schema.Number),
  error: Schema.optionalKey(Schema.String),
  error_description: Schema.optionalKey(Schema.String),
});

const oauthFailed = (cause: unknown) =>
  new GitHubError({ status: 0, path: "oauth", message: String(cause) });

const oauth = Effect.fn(function* oauth(params: Readonly<Record<string, string>>) {
  const { clientId, clientSecret } = yield* Env;

  const json = yield* Effect.tryPromise({
    try: async () => {
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: Redacted.value(clientSecret),
          ...params,
        }),
      });

      return await response.text();
    },
    catch: oauthFailed,
  });

  const answered = yield* Schema.decodeEffect(Schema.fromJsonString(OAuthAnswer))(json).pipe(
    Effect.mapError(oauthFailed),
  );

  const token = answered.access_token ?? "";

  if (token === "") {
    return yield* new GitHubError({
      status: 401,
      path: "oauth",
      message: answered.error_description ?? answered.error ?? "GitHub sign-in failed",
    });
  }

  const lifetime = answered.expires_in ?? 0;

  return {
    token,
    refresh: answered.refresh_token ?? "",
    expires: lifetime === 0 ? Number.MAX_SAFE_INTEGER : Date.now() + lifetime * 1000,
  } satisfies Tokens;
});

const Viewer = Schema.Struct({
  login: Schema.String,
  id: Schema.Number,
  avatar_url: Schema.String,
});

const Installations = Schema.Struct({
  installations: Schema.Array(Schema.Struct({ account: Schema.Struct({ id: Schema.Number }) })),
});

export const identify = Effect.fn(function* identify(tokens: Tokens) {
  const user = yield* get(tokens.token, "/user", Viewer);
  const { installations } = yield* get(tokens.token, "/user/installations", Installations);

  return {
    user: {
      login: user.login,
      id: user.id,
      avatar: user.avatar_url,
      ...tokens,
    } satisfies Session.User,
    installed: installations.some((installation) => installation.account.id === user.id),
  };
});

export const exchange = (code: string) => Effect.flatMap(oauth({ code }), identify);

const expiryOf = (at: number | string | undefined) => {
  if (at === undefined) {
    return Number.NaN;
  }

  if (Predicate.isString(at)) {
    return Date.parse(at);
  }

  return at < 1e12 ? at * 1000 : at;
};

export const fromWorkOS = (github: {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_at?: number | string;
}): Tokens => {
  const at = expiryOf(github.expires_at);
  const refresh = github.refresh_token ?? "";

  if (Number.isFinite(at) && at !== 0) {
    return { token: github.access_token, refresh, expires: at };
  }

  return {
    token: github.access_token,
    refresh,
    expires: refresh === "" ? Number.MAX_SAFE_INTEGER : Date.now() + 8 * 3_600_000,
  };
};

const renewalPerRefreshToken = new Map<
  string,
  { at: number; renewed: Promise<Exit.Exit<Tokens, GitHubError>> }
>();

const renew = Effect.fn(function* renew(refresh: string) {
  const env = yield* Env;

  for (const [key, { at }] of renewalPerRefreshToken) {
    if (at < Date.now() - 600_000) {
      renewalPerRefreshToken.delete(key);
    }
  }

  const renewal = renewalPerRefreshToken.get(refresh) ?? {
    at: Date.now(),
    renewed: Effect.runPromiseExit(
      oauth({ grant_type: "refresh_token", refresh_token: refresh }).pipe(
        Effect.provideService(Env, env),
      ),
    ),
  };

  renewalPerRefreshToken.set(refresh, renewal);
  const renewed = yield* Effect.promise(async () => await renewal.renewed);

  if (Exit.isFailure(renewed)) {
    renewalPerRefreshToken.delete(refresh);
  }

  return yield* renewed;
});

export const signedIn = Effect.gen(function* signedIn() {
  const user = yield* Session.user;

  if (user.expires > Date.now() + 60_000) {
    return user;
  }

  const tokens = yield* renew(user.refresh).pipe(
    Effect.catchIf(
      (error) => error.status === 401,
      () =>
        Effect.andThen(
          Session.update((session) => Struct.omit(session, ["user"])),
          Effect.fail(new SignedOut()),
        ),
    ),
  );

  const fresh = { ...user, ...tokens };
  yield* Session.update((session) => ({ ...session, user: fresh }));

  return fresh;
});

const PublicKey = Schema.Struct({ key: Schema.String, key_id: Schema.String });

export const setSecret = Effect.fn(function* setSecret(
  token: string,
  owner: string,
  name: string,
  secret: string,
  value: string,
) {
  const { key, key_id } = yield* get(
    token,
    `/repos/${owner}/${name}/actions/secrets/public-key`,
    PublicKey,
  );

  const recipient = Buffer.from(key, "base64");
  const ephemeral = nacl.box.keyPair();
  const nonce = blake2b(Buffer.concat([ephemeral.publicKey, recipient]), { dkLen: 24 });
  const boxed = nacl.box(new TextEncoder().encode(value), nonce, recipient, ephemeral.secretKey);
  yield* send(token, "PUT", `/repos/${owner}/${name}/actions/secrets/${secret}`, {
    encrypted_value: Buffer.concat([ephemeral.publicKey, boxed]).toString("base64"),
    key_id,
  });
});

export const deleteSecret = (token: string, owner: string, name: string, secret: string) =>
  send(token, "DELETE", `/repos/${owner}/${name}/actions/secrets/${secret}`).pipe(
    Effect.catchIf(missing, () => Effect.void),
  );

export type File =
  | { readonly path: string; readonly content: string }
  | { readonly path: string; readonly deleted: true };

const Sha = Schema.Struct({ sha: Schema.String });

export const head = (token: string, owner: string, name: string, branch: string) =>
  Effect.map(
    get(token, `/repos/${owner}/${name}/git/ref/heads/${branch}`, Schema.Struct({ object: Sha })),
    (ref) => ref.object.sha,
  );

const treeEntry = (file: File) =>
  "deleted" in file
    ? { path: file.path, mode: "100644", type: "blob", sha: null }
    : { path: file.path, mode: "100644", type: "blob", content: file.content };

export const commit = Effect.fn(function* commit(
  token: string,
  owner: string,
  name: string,
  branch: string,
  message: string,
  files: readonly File[],
  expectedHead?: string,
) {
  const sha = expectedHead ?? (yield* head(token, owner, name, branch));

  const parent = yield* get(
    token,
    `/repos/${owner}/${name}/git/commits/${sha}`,
    Schema.Struct({ tree: Sha }),
  );

  const tree = yield* post(
    token,
    `/repos/${owner}/${name}/git/trees`,
    { base_tree: parent.tree.sha, tree: files.map(treeEntry) },
    Sha,
  );

  const created = yield* post(
    token,
    `/repos/${owner}/${name}/git/commits`,
    { message, tree: tree.sha, parents: [sha] },
    Sha,
  );

  yield* send(token, "PATCH", `/repos/${owner}/${name}/git/refs/heads/${branch}`, {
    sha: created.sha,
  }).pipe(
    Effect.mapError((error) =>
      error.status === 422 && /fast.forward/iu.test(error.message)
        ? new GitHubError({ status: 409, path: error.path, message: error.message })
        : error,
    ),
  );

  return created.sha;
});
