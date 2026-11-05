import * as Effect from "effect/Effect";
import * as HttpEffect from "effect/http/HttpEffect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";

import { SignedOut } from "../shared/api.ts";
import { Env } from "./env.ts";

export const User = Schema.Struct({
  login: Schema.String,
  id: Schema.Number,
  avatar: Schema.String,
  token: Schema.String,
  refresh: Schema.String,
  expires: Schema.Number,
});

export type User = typeof User.Type;

export const Account = Schema.Struct({
  id: Schema.String,
  access: Schema.String,
  refresh: Schema.String,
});

export type Account = typeof Account.Type;

const SignIn = Schema.Struct({
  state: Schema.String,
  back: Schema.String,
  verify: Schema.optionalKey(Schema.String),
});

export type SignIn = typeof SignIn.Type;

const Session = Schema.Struct({
  user: Schema.optionalKey(User),
  account: Schema.optionalKey(Account),
  signIn: Schema.optionalKey(SignIn),
  claude: Schema.optionalKey(Schema.Struct({ verifier: Schema.String, state: Schema.String })),
  chatgpt: Schema.optionalKey(
    Schema.Struct({
      id: Schema.String,
      code: Schema.String,
      at: Schema.optionalKey(Schema.Number),
    }),
  ),
});

export type Session = typeof Session.Type;

const Saved = Schema.Struct({
  account: Schema.optionalKey(Account),
  user: Schema.optionalKey(Schema.Number),
});

type Saved = typeof Saved.Type;

const sameSession = Schema.toEquivalence(Session);
const sameSaved = Schema.toEquivalence(Saved);

const COOKIE = "autofork";
const ACCOUNT = "autofork-account";
const text = new TextEncoder();

const aes = Effect.gen(function* aes() {
  const { sessionKey } = yield* Env;

  return yield* Effect.promise(
    async () =>
      await crypto.subtle.importKey(
        "raw",
        await crypto.subtle.digest("SHA-256", text.encode(Redacted.value(sessionKey))),
        "AES-GCM",
        false,
        ["encrypt", "decrypt"],
      ),
  );
});

const encrypt = Effect.fn(function* encrypt(contents: Session | Saved) {
  const key = yield* aes;
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const sealed = yield* Effect.promise(
    async () =>
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        text.encode(JSON.stringify(contents)),
      ),
  );

  return Buffer.concat([iv, new Uint8Array(sealed)]).toString("base64url");
});

const opened = Effect.fn(function* opened<A, I>(schema: Schema.Codec<A, I>, cookie: string) {
  const key = yield* aes;
  const bytes = Buffer.from(cookie, "base64url");

  const plain = yield* Effect.tryPromise(
    async () =>
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.subarray(0, 12) },
        key,
        bytes.subarray(12),
      ),
  );

  return yield* Schema.decodeEffect(Schema.fromJsonString(schema))(new TextDecoder().decode(plain));
});

const decrypt = <A, I>(schema: Schema.Codec<A, I>, cookie: string | undefined, empty: A) =>
  cookie === undefined
    ? Effect.succeed(empty)
    : opened(schema, cookie).pipe(Effect.orElseSucceed(() => empty));

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: "30 days",
} as const;

const fromCookies = Effect.gen(function* fromCookies() {
  const { cookies } = yield* HttpServerRequest.HttpServerRequest;
  const main = yield* decrypt(Session, cookies[COOKIE], {});
  const saved = yield* decrypt(Saved, cookies[ACCOUNT], {});

  return { main, saved };
});

export const read = fromCookies.pipe(
  Effect.map(({ main, saved }): Session => {
    const rest = Struct.omit(main, ["account"]);

    return main.user && saved.user === main.user.id && saved.account
      ? { ...rest, account: saved.account }
      : rest;
  }),
);

const savedFor = (session: Session, saved: Saved): Saved => {
  if (!session.account) {
    return {};
  }

  const user = session.user?.id ?? saved.user;

  return user === undefined ? { account: session.account } : { account: session.account, user };
};

export const write = Effect.fn(function* write(session: Session) {
  const { main, saved } = yield* fromCookies;
  const next = Struct.omit(session, ["account"]);
  const changes: [string, string][] = [];

  if (!sameSession(next, Struct.omit(main, ["account"]))) {
    changes.push([COOKIE, yield* encrypt(next)]);
  }

  const nextSaved = savedFor(session, saved);

  if (!sameSaved(nextSaved, saved)) {
    changes.push([ACCOUNT, yield* encrypt(nextSaved)]);
  }

  yield* HttpEffect.appendPreResponseHandler((_request, response) => {
    let answer = response;

    for (const [name, value] of changes) {
      answer = HttpServerResponse.setCookieUnsafe(answer, name, value, COOKIE_OPTIONS);
    }

    return Effect.succeed(answer);
  });
});

export const update = (change: (session: Session) => Session) =>
  read.pipe(Effect.flatMap((session) => write(change(session))));

export const user = read.pipe(
  Effect.flatMap((session) =>
    session.user ? Effect.succeed(session.user) : Effect.fail(new SignedOut()),
  ),
);
