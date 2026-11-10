import { useAtomValue } from "@effect/atom-react";
import { getRouteApi } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { useMemo } from "react";

import * as client from "../../lib/api/client.ts";
import { Nav } from "../../ui/nav.tsx";

const route = getRouteApi("/link/$owner/$name");

const WHY = {
  "not installed": null,
  "no config":
    "autofork is installed, but the default branch has no .autofork/config.json with an upstream. Push it and this page picks it up.",
  "no workflow":
    "autofork is installed, but the default branch has no .github/workflows/autofork.yml. Push it and this page picks it up.",
  "not on GitHub":
    "This fork's upstream isn't on GitHub, so autofork can't watch it. It keeps running on GitHub's schedule.",
};

const LinkReply = Schema.Struct({
  linked: Schema.Boolean,
  cron: Schema.NullOr(Schema.String),
  why: Schema.optionalKey(
    Schema.Literals(["not installed", "no config", "no workflow", "not on GitHub"]),
  ),
  checked: Schema.optionalKey(Schema.Boolean),
});

type LinkReply = typeof LinkReply.Type;

interface Problem {
  error: string;
  final: boolean;
}

type Linked = LinkReply | Problem;

const NOT_A_REPO: Problem = { error: "That isn't a GitHub repository name.", final: true };
const UNREACHABLE: Problem = { error: "Couldn't reach autofork. Trying again…", final: false };

const check = (owner: string, name: string) =>
  Effect.tryPromise(
    async () =>
      await fetch("/api/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner, name }),
      }),
  ).pipe(
    Effect.flatMap((response) => {
      if (response.status === 400) {
        return Effect.succeed<Linked>(NOT_A_REPO);
      }

      return response.ok
        ? Effect.tryPromise(async () => Schema.decodeUnknownSync(LinkReply)(await response.json()))
        : Effect.succeed<Linked>(UNREACHABLE);
    }),
    Effect.orElseSucceed((): Linked => UNREACHABLE),
  );

const stillWaiting = (linked: Linked) =>
  "linked" in linked ? !linked.linked && linked.why !== "not on GitHub" : !linked.final;

interface View {
  shown: Linked;
  stopped: boolean;
}

interface Polling {
  first: boolean;
  delay: number;
  wait: number;
  shown: Linked | null;
}

const FIRST_WAIT = 3000;
const LONGEST_WAIT = 30_000;
const GIVE_UP_AFTER = 600_000;

const linking = (owner: string, name: string) => {
  const until = Date.now() + GIVE_UP_AFTER;

  const step = (polling: Polling) =>
    Effect.gen(function* poll() {
      if (!polling.first) {
        yield* Effect.sleep(polling.delay);
      }

      if (document.hidden) {
        return [[], Option.some({ ...polling, first: false, delay: FIRST_WAIT })] as const;
      }

      const next = yield* check(owner, name);
      const shown = "checked" in next && !next.checked ? (polling.shown ?? next) : next;
      const wait = Math.min(polling.wait * 1.5, LONGEST_WAIT);
      const waiting = stillWaiting(next);
      const stopped = waiting && Date.now() >= until;
      const view: View = { shown, stopped };

      return [
        [view],
        waiting && !stopped
          ? Option.some({ first: false, delay: wait, wait, shown })
          : Option.none<Polling>(),
      ] as const;
    });

  return Atom.make(
    Stream.paginate<Polling, View>({ first: true, delay: 0, wait: FIRST_WAIT, shown: null }, step),
  );
};

const Why = ({ shown }: { shown: Linked }) => {
  if ("error" in shown) {
    return <p className="bad">{shown.error}</p>;
  }

  const why = shown.why === undefined ? null : WHY[shown.why];

  return why === null ? null : <p className="bad">{why}</p>;
};

export const LinkRoute = () => {
  const { owner, name } = route.useParams();
  const { error } = route.useSearch();
  const me = useAtomValue(client.me);
  const result = useAtomValue(useMemo(() => linking(owner, name), [owner, name]));
  const view = Option.getOrNull(AsyncResult.value(result));
  const signedIn = AsyncResult.isSuccess(me) && me.value !== null;

  return (
    <div className="page bare">
      <Nav />
      <main className="fork">
        <header className="fork-head">
          <h1>Run it on time</h1>
          <p className="facts">
            <span>
              {owner}/{name}
            </span>
          </p>
        </header>
        {view !== null && "linked" in view.shown && view.shown.linked ? (
          <p className="line">
            Linked. autofork starts a run within a minute of upstream changing, and a public
            fork&apos;s rebuild costs show up under your forks.
          </p>
        ) : (
          <>
            <p className="line">
              GitHub&apos;s own schedule can start a run hours late. Link this fork and autofork
              checks upstream every minute and starts the run as soon as it changes. The run still
              happens in your fork&apos;s GitHub Actions.
            </p>
            <p>
              <a
                className="btn primary"
                href={`/api/github/install?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`}
              >
                {signedIn ? `Install autofork on ${name}` : "Sign in with GitHub"}
              </a>
            </p>
            {view === null ? null : <Why shown={view.shown} />}
            {error === undefined ? null : <p className="bad">{error}</p>}
            {view?.stopped === true ? (
              <p className="fine">
                Stopped checking after 10 minutes. Reload the page to check again.
              </p>
            ) : null}
            <p className="fine">To unlink, remove the app from the repo on GitHub.</p>
          </>
        )}
      </main>
    </div>
  );
};
