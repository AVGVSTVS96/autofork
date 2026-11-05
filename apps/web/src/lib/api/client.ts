import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as AtomHttpApi from "effect/reactivity/AtomHttpApi";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { Api, NotFound, SignedOut } from "../../../shared/api.ts";
import type { Problem } from "../../../shared/api.ts";

type Detail = Readonly<Record<string, string | number | undefined>>;

export const report = (what: string, detail: Detail) => {
  const entry = {
    what,
    ...detail,
    page: location.pathname + location.search,
    online: navigator.onLine,
    visible: document.visibilityState,
    secondsOnPage: Math.round(performance.now() / 1000),
    browser: navigator.userAgent,
  };

  console.warn("autofork:", entry);
  Effect.runSync(
    Effect.ignore(Effect.try(() => navigator.sendBeacon("/api/log", JSON.stringify(entry)))),
  );
};

const unreachable = (error: HttpClientError.HttpClientError) =>
  Predicate.isTagged(error.reason, "TransportError") ? String(error.reason.cause) : undefined;

const unreachableDefect = <E>(cause: Cause.Cause<E>) => {
  const defect = Cause.findDefect(cause);

  return Result.isSuccess(defect) && HttpClientError.isHttpClientError(defect.success)
    ? unreachable(defect.success)
    : undefined;
};

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);

const startsARun = (request: HttpClientRequest.HttpClientRequest) =>
  request.method !== "GET" &&
  /^\/api\/forks\/[^/]+\/[^/]+\/./u.test(new URL(request.url, location.href).pathname);

const retryOnce = (client: HttpClient.HttpClient) =>
  HttpClient.transform(client, (response, request) =>
    startsARun(request)
      ? response
      : Effect.flatMap(Effect.exit(response), (first) => {
          const got = Exit.match(first, {
            onSuccess: ({ status }) => (TRANSIENT.has(status) ? status : undefined),
            onFailure: (cause) =>
              Option.getOrUndefined(Option.map(Cause.findErrorOption(cause), unreachable)),
          });

          if (got === undefined) {
            return first;
          }

          report("retrying", { request: `${request.method} ${request.url}`, got });

          return Effect.delay(response, "700 millis");
        }),
  );

export class Client extends AtomHttpApi.Service<Client>()("autofork/Client", {
  api: Api,
  httpClient: FetchHttpClient.layer,
  transformClient: retryOnce,
}) {}

export const SESSION = "session";
export const SETTINGS = "settings";

export const me = Client.query("app", "me", { reactivityKeys: [SESSION] });

export const mine = Client.query("app", "mine", {
  timeToLive: "5 minutes",
  reactivityKeys: [SETTINGS, SESSION],
});

export const fork = (owner: string, name: string) =>
  Client.query("app", "fork", { params: { owner, name } });

export const yours = (owner: string, name: string) =>
  Client.query("app", "yours", { params: { owner, name } });

export const resolve = (app: string) =>
  Client.query("app", "resolve", { query: { q: app }, timeToLive: "10 minutes" });

export const prepared = (payload: {
  owner: string;
  name: string;
  into: string | undefined;
  preview: boolean;
}) => Client.query("app", "prepare", { payload });

export const chatgptDevice = Client.query("app", "chatgptStart", {});
export const claudeSignIn = Client.query("app", "claudeStart", {});
export const addChange = Client.mutation("app", "addChange");
export const signOut = Client.mutation("app", "signOut");

export type ApiError = Problem | SignedOut | NotFound;

const reported = new WeakSet<Cause.Cause<ApiError>>();

const SIGNED_OUT = "Your GitHub sign-in ended. Sign in again.";

const unexpected = (cause: Cause.Cause<ApiError>) => {
  const network = unreachableDefect(cause);

  if (!reported.has(cause)) {
    reported.add(cause);
    report("failed", { cause: Cause.pretty(cause).slice(0, 2000), network });
  }

  return network === undefined
    ? "Something went wrong. Try again."
    : "Couldn't reach autofork. Check your connection and try again.";
};

export const failure = (cause: Cause.Cause<ApiError>) =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => unexpected(cause),
    onSome: Match.valueTags({
      SignedOut: () => SIGNED_OUT,
      Problem: ({ message }) => (message === "" ? unexpected(cause) : message),
      NotFound: () => unexpected(cause),
    }),
  });

export const isSignedOut = (cause: Cause.Cause<ApiError>) =>
  Option.exists(Cause.findErrorOption(cause), Schema.is(SignedOut));

export const notFound = (cause: Cause.Cause<ApiError>) =>
  Option.getOrUndefined(Option.filter(Cause.findErrorOption(cause), Schema.is(NotFound)));

export const settings = (owner: string, name: string) =>
  Client.query("app", "settings", { params: { owner, name } });

export const saveSettings = Client.mutation("app", "saveSettings");
