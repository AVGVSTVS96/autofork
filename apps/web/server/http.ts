import { randomBytes } from "node:crypto";

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServer from "effect/http/HttpServer";
import type * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import type * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";

import { Api, Problem } from "../shared/api.ts";
import * as Agents from "./agents.ts";
import * as Env from "./env.ts";
import * as Forks from "./forks.ts";
import * as GitHub from "./github.ts";
import * as Icon from "./icon.ts";
import { saveCodexAuth, workflowToken } from "./oidc.ts";
import * as Session from "./session.ts";

const friendly = (error: GitHub.GitHubError) => {
  if (GitHub.busy(error)) {
    return new Problem({
      message: "GitHub is rate-limiting autofork right now. Try again in a minute.",
    });
  }

  return new Problem({
    message:
      error.status === 403 || error.status === 404
        ? `GitHub said no: ${error.message}. autofork may not have access to that repo yet.`
        : `GitHub had a problem: ${error.message}`,
  });
};

const isGitHubError = (error: unknown): error is GitHub.GitHubError =>
  error instanceof GitHub.GitHubError;

const github = <A, E, R>(
  effect: Effect.Effect<A, E | GitHub.GitHubError, R>,
): Effect.Effect<A, E | Problem, R> =>
  Effect.mapError(effect, (failure) => (isGitHubError(failure) ? friendly(failure) : failure));

const viewer = Effect.option(GitHub.signedIn).pipe(Effect.map(Option.getOrUndefined));

const convex = Effect.fn(
  function* convex(path: string, body: Schema.JsonObject, secret: Redacted.Redacted) {
    const { convexSite } = yield* Env.Env;

    yield* Effect.tryPromise(async () => {
      const response = await fetch(`${convexSite}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${Redacted.value(secret)}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`${path} answered ${response.status}`);
      }
    }).pipe(Effect.tapError((failure) => Effect.logWarning(`convex ${path}: ${failure.message}`)));
  },
  (effect) => Effect.ignore(effect),
);

const AppLive = HttpApiBuilder.group(Api, "app", (handlers) =>
  handlers
    .handle("resolve", ({ query }) =>
      github(
        viewer.pipe(
          Effect.flatMap((user) =>
            user
              ? Effect.succeed(user.token)
              : GitHub.appToken.pipe(Effect.option, Effect.map(Option.getOrUndefined)),
          ),
          Effect.flatMap((token) => Forks.resolve(query.q, token)),
        ),
      ),
    )
    .handle("me", () =>
      viewer.pipe(Effect.map((user) => (user ? { login: user.login, avatar: user.avatar } : null))),
    )
    .handle("signOut", () => Session.write({}))
    .handle("mine", () => github(GitHub.signedIn.pipe(Effect.flatMap((user) => Forks.mine(user)))))
    .handle("settings", ({ params }) =>
      github(
        GitHub.signedIn.pipe(
          Effect.flatMap((user) => Forks.settings(user, params.owner, params.name)),
        ),
      ),
    )
    .handle("saveSettings", ({ params, payload }) =>
      github(
        Effect.gen(function* saveSettings() {
          const saved = yield* Forks.saveSettings(
            yield* GitHub.signedIn,
            params.owner,
            params.name,
            payload,
          );

          const { serverSecret } = yield* Env.Env;
          yield* convex("/refresh", { name: `${params.owner}/${params.name}` }, serverSecret);

          return saved;
        }),
      ),
    )
    .handle("prepare", ({ payload }) =>
      github(
        GitHub.signedIn.pipe(
          Effect.flatMap((user) =>
            Forks.prepare(
              user,
              payload.owner,
              payload.name,
              payload.into,
              payload.preview ?? false,
            ),
          ),
        ),
      ),
    )
    .handle("claudeStart", () =>
      Effect.gen(function* claudeStart() {
        const { url, verifier, state } = Agents.claudeStart();
        yield* Session.update((session) => ({ ...session, claude: { verifier, state } }));

        return { url };
      }),
    )
    .handle("claudeFinish", ({ params, payload }) =>
      github(
        Effect.gen(function* claudeFinish() {
          const user = yield* GitHub.signedIn;
          const { claude } = yield* Session.read;

          if (!claude) {
            return yield* new Problem({ message: "Start the Claude sign-in again." });
          }

          const token = yield* Agents.claudeToken(payload.code, claude);

          const started = yield* Forks.start(
            user,
            params.owner,
            params.name,
            payload.change,
            "claude",
            token,
          );

          yield* Session.update((session) => ({ ...Struct.omit(session, ["claude"]), user }));

          return started;
        }),
      ),
    )
    .handle("chatgptStart", () =>
      Effect.gen(function* chatgptStart() {
        const device = yield* Agents.chatgptStart;
        yield* Session.update((session) => ({
          ...session,
          chatgpt: { id: device.id, code: device.code, at: device.at },
        }));

        return { code: device.code, url: device.url };
      }),
    )
    .handle("chatgptFinish", ({ params, payload }) =>
      github(
        Effect.gen(function* chatgptFinish() {
          const user = yield* GitHub.signedIn;
          const { chatgpt } = yield* Session.read;

          if (!chatgpt) {
            return yield* new Problem({ message: "Start the ChatGPT sign-in again." });
          }

          const auth = yield* Agents.chatgptAuth(chatgpt);

          if (auth === null) {
            return { status: "waiting" as const };
          }

          const started = yield* Forks.start(
            user,
            params.owner,
            params.name,
            payload.change,
            "chatgpt",
            auth,
          );

          yield* Session.update((session) => ({ ...Struct.omit(session, ["chatgpt"]), user }));

          return { status: "started" as const, ...started };
        }),
      ),
    )
    .handle("fork", ({ params }) => github(Forks.status(params.owner, params.name)))
    .handle("yours", ({ params }) =>
      viewer.pipe(
        Effect.flatMap((user) =>
          user ? Forks.yours(user, params.owner, params.name) : Effect.succeed(false),
        ),
      ),
    )
    .handle("addChange", ({ params, payload }) =>
      github(
        GitHub.signedIn.pipe(
          Effect.flatMap((user) =>
            Forks.addChange(user, params.owner, params.name, payload.change),
          ),
        ),
      ),
    ),
);

const origin = (request: HttpServerRequest.HttpServerRequest) => {
  const host = request.headers["x-forwarded-host"] ?? request.headers.host ?? "autofork.com";

  const proto =
    request.headers["x-forwarded-proto"] ?? (host.startsWith("localhost") ? "http" : "https");

  return `${proto}://${host}`;
};

const params = (request: HttpServerRequest.HttpServerRequest) =>
  new URL(request.url, "http://x").searchParams;

const REPO_PART = /^(?!\.\.?$)[\w.-]+$/u;
const SAFE_BACK = /^\/(?![/\\])[^\\\s\p{Cc}]*$/u;

const safeBack = (back: string | null) => (back !== null && SAFE_BACK.test(back) ? back : "/");

const signInRoute = HttpRouter.add(
  "GET",
  "/api/github/start",
  Effect.fn(function* signInRoute(request: HttpServerRequest.HttpServerRequest) {
    const { clientId } = yield* Env.Env;
    const state = randomBytes(16).toString("base64url");
    const back = safeBack(params(request).get("back"));
    yield* Session.update((session) => ({ ...session, signIn: { state, back } }));
    const url = new URL("https://github.com/login/oauth/authorize");

    url.search = new URLSearchParams({
      client_id: clientId,
      state,
      redirect_uri: `${origin(request)}/api/github/callback`,
    }).toString();

    return HttpServerResponse.redirect(url);
  }),
);

const callbackRoute = HttpRouter.add(
  "GET",
  "/api/github/callback",
  Effect.fn(function* callbackRoute(request: HttpServerRequest.HttpServerRequest) {
    const { appSlug } = yield* Env.Env;
    const query = params(request);
    const session = yield* Session.read;
    const { signIn } = session;

    const failed = (error: string) =>
      HttpServerResponse.redirect(
        signIn
          ? `${signIn.back}${signIn.back.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`
          : `/?error=${encodeURIComponent(error)}`,
      );

    if (!signIn || query.get("state") !== signIn.state) {
      return failed("GitHub sign-in expired. Try again.");
    }

    const code = query.get("code") ?? "";

    if (code === "") {
      return HttpServerResponse.redirect(signIn.back);
    }

    const exchanged = yield* GitHub.exchange(code).pipe(Effect.option);

    if (Option.isNone(exchanged)) {
      return failed("GitHub didn't finish signing you in. Try again.");
    }

    const { user, installed } = exchanged.value;

    if (!installed && !query.has("setup_action")) {
      yield* Session.write({ ...session, user });
      const install = new URL(`https://github.com/apps/${appSlug}/installations/new/permissions`);
      install.search = new URLSearchParams({
        target_id: String(user.id),
        state: signIn.state,
      }).toString();

      return HttpServerResponse.redirect(install);
    }

    yield* Session.write({ user });

    return HttpServerResponse.redirect(signIn.back);
  }),
);

const installRoute = HttpRouter.add(
  "GET",
  "/api/github/install",
  Effect.fn(function* installRoute(request: HttpServerRequest.HttpServerRequest) {
    const { appSlug } = yield* Env.Env;
    const owner = params(request).get("owner") ?? "";
    const name = params(request).get("name") ?? "";

    if (!REPO_PART.test(owner) || !REPO_PART.test(name)) {
      return HttpServerResponse.redirect("/");
    }

    const back = `/link/${owner}/${name}`;
    const user = yield* Effect.option(GitHub.signedIn);

    if (Option.isNone(user)) {
      return HttpServerResponse.redirect(`/api/github/start?back=${encodeURIComponent(back)}`);
    }

    const url = yield* Forks.installLink(user.value, owner, name, appSlug).pipe(Effect.option);

    if (Option.isNone(url)) {
      return HttpServerResponse.redirect(
        `${back}?error=${encodeURIComponent(`Can't find github.com/${owner}/${name}.`)}`,
      );
    }

    const state = randomBytes(16).toString("base64url");
    url.value.searchParams.set("state", state);
    yield* Session.update((session) => ({ ...session, user: user.value, signIn: { state, back } }));

    return HttpServerResponse.redirect(url.value);
  }),
);

const refused = Effect.catchCause((cause) => {
  const error = Cause.squash(cause);

  const answer = HttpServerResponse.jsonUnsafe(
    { error: error instanceof Problem ? error.message : "not allowed" },
    { status: 403 },
  );

  return error instanceof Problem
    ? Effect.succeed(answer)
    : Effect.logWarning(cause).pipe(Effect.as(answer));
});

const codexAuthRoute = HttpRouter.add(
  "POST",
  "/api/chatgpt/auth",
  Effect.fn(
    function* codexAuthRoute(request: HttpServerRequest.HttpServerRequest) {
      const body = yield* request.text;
      yield* saveCodexAuth(request.headers.authorization, body);

      return HttpServerResponse.empty({ status: 204 });
    },
    (effect) => refused(effect),
  ),
);

const workflowTokenRoute = HttpRouter.add("POST", "/api/github/token", (request) =>
  workflowToken(request.headers.authorization).pipe(
    Effect.map((token) =>
      HttpServerResponse.jsonUnsafe({ token }, { headers: { "cache-control": "no-store" } }),
    ),
    refused,
  ),
);

const browserFailureLogRoute = HttpRouter.add(
  "POST",
  "/api/log",
  Effect.fn(
    function* browserFailureLogRoute(request: HttpServerRequest.HttpServerRequest) {
      const body = yield* request.text;
      const { user } = yield* Session.read;
      console.warn(`client ${user?.login ?? "anonymous"} ${body.slice(0, 4000)}`);

      return HttpServerResponse.empty({ status: 204 });
    },
    (effect) => Effect.orElseSucceed(effect, () => HttpServerResponse.empty({ status: 204 })),
  ),
);

const DAY = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
const MINUTE = "public, max-age=60, s-maxage=60";
const SANDBOXED_SVG = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";

const iconRoute = HttpRouter.add(
  "GET",
  "/api/icon/:owner/:name",
  Effect.fn(function* iconRoute(request: HttpServerRequest.HttpServerRequest) {
    const { owner = "", name = "" } = yield* HttpRouter.params;
    const avatarWhenNone = params(request).get("fallback") !== "none";
    const found = yield* Icon.lookup(owner, name).pipe(Effect.orElseSucceed(() => null));
    const cache = found ? DAY : MINUTE;

    if (found?.icon) {
      return HttpServerResponse.uint8Array(found.icon.bytes, {
        contentType: found.icon.type,
        headers: {
          "cache-control": cache,
          "content-security-policy": SANDBOXED_SVG,
          "x-content-type-options": "nosniff",
        },
      });
    }

    if (!avatarWhenNone) {
      return HttpServerResponse.empty({ status: 404, headers: { "cache-control": cache } });
    }

    const fallback = found?.avatar ?? `https://github.com/${encodeURIComponent(owner)}.png?size=96`;

    return HttpServerResponse.redirect(fallback, { headers: { "cache-control": cache } });
  }),
);

const Routes = Layer.mergeAll(
  signInRoute,
  callbackRoute,
  installRoute,
  codexAuthRoute,
  workflowTokenRoute,
  iconRoute,
  browserFailureLogRoute,
);

export const app = HttpRouter.toWebHandler(
  Layer.mergeAll(HttpApiBuilder.layer(Api).pipe(Layer.provide(AppLive)), Routes).pipe(
    HttpRouter.provideRequest(Env.layer),
    Layer.provide(HttpServer.layerServices),
  ),
  { disableLogger: true },
);
