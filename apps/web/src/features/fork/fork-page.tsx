import { useAtomMount, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { getRouteApi, Link } from "@tanstack/react-router";
import * as Option from "effect/Option";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { Component, lazy, Suspense, useMemo } from "react";
import type { ReactElement } from "react";

import type { Fork } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { refreshing } from "../../lib/api/polling.ts";
import { repoIcon } from "../../lib/repos/known.ts";
import { ClaudeIcon, ForkIcon, GitHubIcon, OpenAIIcon } from "../../ui/icons.tsx";
import { Item } from "../../ui/item.tsx";
import { Nav } from "../../ui/nav.tsx";
import { Retry } from "../../ui/retry.tsx";
import { More } from "./more.tsx";
import { Progress } from "./progress.tsx";

const route = getRouteApi("/$owner/$name");

const WHILE_RUNNING = 5000;
const WHILE_IDLE = 60_000;

const UNAVAILABLE = (
  <p className="fine bad">Couldn&apos;t load your spend and settings. Reload the page.</p>
);

const Unavailable = () => UNAVAILABLE;

class Contained extends Component<{ children: ReactElement }, { failed: boolean }> {
  static getDerivedStateFromError = () => ({ failed: true });

  constructor(props: { children: ReactElement }) {
    super(props);
    this.state = { failed: false };
  }

  render = () => (this.state.failed ? UNAVAILABLE : this.props.children);
}

const Yours = lazy(async () => {
  try {
    const { Yours: Cards } = await import("./yours.tsx");

    return { default: Cards };
  } catch {
    return { default: Unavailable };
  }
});

const Missing = ({
  owner,
  name,
  from,
  viewer,
}: {
  owner: string;
  name: string;
  from: string | null;
  viewer: string | null;
}) => {
  const [fromOwner, fromName] = from === null ? [] : from.split("/");
  const ownsUpstream = fromOwner?.toLowerCase() === viewer?.toLowerCase();

  return (
    <>
      <header className="fork-head">
        <h1>{from === null ? "Nothing here" : "Not an autofork"}</h1>
        <p className="facts">
          <span>
            <ForkIcon />{" "}
            {from === null ? `github.com/${owner}/${name} isn't a public repo` : `${owner}/${name}`}
          </span>
        </p>
      </header>
      <p>
        {from === null || ownsUpstream ? (
          <Link className="btn primary" to="/" search={{}}>
            Back home
          </Link>
        ) : (
          <Link className="btn primary" to="/" search={{ q: from }}>
            Fork {fromName} with autofork
          </Link>
        )}
      </p>
    </>
  );
};

const Ticks = ({ text }: { text: string }) =>
  text.split("`").map((part, i) => (i % 2 === 1 ? <code key={part}>{part}</code> : part));

const ChangeItem = ({
  change,
  app,
  yours,
}: {
  change: Fork["changes"][number];
  app: string;
  yours: boolean;
}) =>
  change.state === "paused" ? (
    <Item
      state="paused"
      end="paused"
      detail={
        <p className="why">
          {change.upstream ?? `${app} does this now.`} autofork stopped applying it.
          {yours ? " Keep theirs, or ask for a different change." : null}
          {change.issue === null ? null : (
            <>
              {" "}
              <a href={change.issue} target="_blank" rel="noreferrer">
                Details
              </a>
            </>
          )}
        </p>
      }
    >
      <Ticks text={change.text} />
    </Item>
  ) : (
    <Item state={change.state === "built" ? "ok" : "now"} end={change.state}>
      <Ticks text={change.text} />
    </Item>
  );

const ReadmeNote = ({ fork }: { fork: Fork }) => (
  <p className="fine aside">
    {
      "Your README gets a line saying this fork updates itself with autofork. To drop it, delete the line, once it's there, and "
    }
    <a
      href={`https://github.com/${fork.owner}/${fork.name}/tree/HEAD/.autofork/fork-readme`}
      target="_blank"
      rel="noreferrer"
    >
      .autofork/fork-readme
    </a>{" "}
    in the same commit.
  </p>
);

const Body = ({
  fork,
  run,
  waiting,
  yours,
}: {
  fork: Fork;
  run: Fork["run"];
  waiting: boolean;
  yours: boolean;
}) => {
  const app = fork.upstream?.split("/")[1] ?? fork.name;
  const plan = fork.agent === "claude" ? "Claude" : "ChatGPT";

  return (
    <>
      <header className="fork-head">
        <h1>
          {yours ? "Your" : `${fork.owner}'s`} <span className="you">{fork.name}</span>
        </h1>
        <p className="facts">
          <span>
            <ForkIcon /> {fork.owner}/{fork.name}
          </span>
          {fork.upstream === null ? null : (
            <span>
              <img src={repoIcon(fork.upstream)} alt="" /> Keeps up with{" "}
              <a href={`https://github.com/${fork.upstream}`} target="_blank" rel="noreferrer">
                {fork.upstream}
              </a>
            </span>
          )}
          {fork.agent === null ? null : (
            <span>
              {fork.agent === "claude" ? <ClaudeIcon /> : <OpenAIIcon />} Runs on{" "}
              {yours ? `your ${plan} plan` : plan}
            </span>
          )}
        </p>
      </header>

      <ul className="card list changes">
        {fork.changes.length > 0 ? (
          fork.changes.map((change) => (
            <ChangeItem key={change.id} change={change} app={app} yours={yours} />
          ))
        ) : (
          <Item state="wait">No changes yet.</Item>
        )}
      </ul>
      {fork.note && yours ? <ReadmeNote fork={fork} /> : null}

      <Progress run={run} waiting={waiting} fork={fork} yours={yours} />
      {yours ? (
        <>
          <More owner={fork.owner} name={fork.name} />
          <Contained>
            <Suspense>
              <Yours fork={fork} />
            </Suspense>
          </Contained>
        </>
      ) : null}
    </>
  );
};

const forkView = (
  result: AsyncResult.AsyncResult<Fork, client.ApiError>,
  since: string | undefined,
) => {
  const missing = AsyncResult.isFailure(result) ? client.notFound(result.cause) : undefined;
  const fork = missing ? null : Option.getOrNull(AsyncResult.value(result));
  const latest = fork?.run ?? null;
  const run = latest !== null && (since === undefined || latest.latestAt >= since) ? latest : null;
  const waiting = since !== undefined && run === null;
  const live = missing === undefined && (waiting || (run !== null && run.status !== "completed"));

  return { missing, fork, waiting, live };
};

const ForkPage = ({
  owner,
  name,
  since,
}: {
  owner: string;
  name: string;
  since: string | undefined;
}) => {
  const atom = client.fork(owner, name);
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const mine = useAtomValue(client.yours(owner, name));
  const me = useAtomValue(client.me);
  const { missing, fork, waiting, live } = forkView(result, since);

  useAtomMount(useMemo(() => refreshing(atom, live ? WHILE_RUNNING : WHILE_IDLE), [atom, live]));

  if (fork !== null && !AsyncResult.isInitial(mine)) {
    return (
      <Body
        fork={fork}
        run={waiting ? null : fork.run}
        waiting={waiting}
        yours={AsyncResult.isSuccess(mine) && mine.value}
      />
    );
  }

  if (missing !== undefined && !AsyncResult.isInitial(me)) {
    return (
      <Missing
        owner={owner}
        name={name}
        from={missing.from}
        viewer={AsyncResult.isSuccess(me) ? (me.value?.login ?? null) : null}
      />
    );
  }

  if (AsyncResult.isFailure(result) && missing === undefined) {
    return <Retry className="note" message={client.failure(result.cause)} onRetry={refresh} />;
  }

  return (
    <p className="note wait">
      Loading {owner}/{name}…
    </p>
  );
};

export const ForkRoute = () => {
  const { owner, name } = route.useParams();
  const { since, error } = route.useSearch();

  return (
    <div className="page bare">
      <Nav>
        <a
          className="ghost"
          href={`https://github.com/${owner}/${name}`}
          target="_blank"
          rel="noreferrer"
        >
          <GitHubIcon />
          <span>
            {owner}/{name}
          </span>
        </a>
      </Nav>
      <main className="fork">
        {error === undefined ? null : <p className="bad">{error}</p>}
        <ForkPage owner={owner} name={name} since={since} />
      </main>
    </div>
  );
};
