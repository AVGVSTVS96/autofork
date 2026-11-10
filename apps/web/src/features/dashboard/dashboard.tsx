import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { getRouteApi, Link } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";

import type { MyFork } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { repoIcon } from "../../lib/repos/known.ts";
import { Live, money, rebuilding, useSpend } from "../../lib/spend/live.tsx";
import type { Spend } from "../../lib/spend/live.tsx";
import { Gauge, Meter } from "../../ui/meter.tsx";
import { Nav } from "../../ui/nav.tsx";
import { Retry } from "../../ui/retry.tsx";

const route = getRouteApi("/forks");

const schedule = (fork: MyFork, spend: Spend | undefined) => {
  if (fork.private) {
    return "private: autofork.com shows spend for public forks";
  }

  if (spend === undefined) {
    return "";
  }

  return spend.linked ? "on time" : "GitHub's schedule";
};

const Row = ({ fork, spend }: { fork: MyFork; spend: Spend | undefined }) => {
  const { limits } = fork.settings;
  const running = spend?.rebuilds.some(rebuilding);

  return (
    <li className="dash-row">
      <Link
        to="/$owner/$name"
        params={{ owner: fork.owner, name: fork.name }}
        search={{}}
        className="dash-name"
      >
        <img
          src={
            fork.upstream === null
              ? `https://github.com/${fork.owner}.png?size=40`
              : repoIcon(fork.upstream)
          }
          alt=""
        />
        <span>
          <b>
            {fork.owner}/{fork.name}
          </b>
          <small>
            {schedule(fork, spend)}
            {running === true ? " · rebuilding now" : ""}
          </small>
        </span>
      </Link>
      <span className="gauges dash-spend">
        <Gauge
          value={spend ? money(spend.spent) : "–"}
          of={`of ${money(limits.month)}`}
          spent={spend?.spent ?? 0}
          cap={limits.month}
        />
        <Gauge
          value={spend ? spend.rebuilds.length : "–"}
          of={`of ${limits.rebuilds} rebuilds`}
          spent={spend?.rebuilds.length ?? 0}
          cap={limits.rebuilds}
        />
      </span>
    </li>
  );
};

const Forks = () => {
  const mine = useAtomValue(client.mine);
  const retry = useAtomRefresh(client.mine);

  const spend = useSpend(
    AsyncResult.isSuccess(mine)
      ? mine.value.filter((fork) => !fork.private).map((fork) => `${fork.owner}/${fork.name}`)
      : [],
  );

  if (AsyncResult.isFailure(mine)) {
    return <Retry className="note" message={client.failure(mine.cause)} onRetry={retry} />;
  }

  if (!AsyncResult.isSuccess(mine)) {
    return <p className="note wait">Loading your forks…</p>;
  }

  if (mine.value.length === 0) {
    return (
      <p className="note">
        Forks you make on autofork show up here, with what each one&apos;s rebuilds cost.
      </p>
    );
  }

  const spendOf = (fork: MyFork) =>
    spend?.find((row) => row.name === `${fork.owner}/${fork.name}`.toLowerCase());

  const counted = mine.value.some((fork) => spendOf(fork) !== undefined);
  const total = mine.value.reduce((sum, fork) => sum + (spendOf(fork)?.spent ?? 0), 0);

  return (
    <>
      <p className="facts">
        <span>
          {counted ? money(total) : "–"} this month across {mine.value.length} fork
          {mine.value.length === 1 ? "" : "s"}, at API prices
        </span>
      </p>
      <ul className="card list dash">
        {mine.value.map((fork) => (
          <Row key={fork.repoId} fork={fork} spend={spendOf(fork)} />
        ))}
      </ul>
    </>
  );
};

const PREVIEW = [
  { name: 62, spent: 34, rebuilds: 45 },
  { name: 48, spent: 12, rebuilds: 20 },
  { name: 55, spent: 58, rebuilds: 70 },
];

const SignedOut = () => (
  <section className="card gate">
    <ul className="list dash" aria-hidden="true">
      {PREVIEW.map((row) => (
        <li key={row.name} className="dash-row">
          <span className="dash-name">
            <i className="sk face" />
            <i className="sk" style={{ width: `${row.name}%` }} />
          </span>
          <span className="gauges dash-spend">
            <Meter spent={row.spent} cap={100} />
            <Meter spent={row.rebuilds} cap={100} />
          </span>
        </li>
      ))}
    </ul>
    <div className="gate-cta">
      <p>Every fork you make, and what its rebuilds cost.</p>
      <a className="btn primary" href="/api/github/start?back=/forks">
        Sign in with GitHub
      </a>
    </div>
  </section>
);

export const Dashboard = () => {
  const me = useAtomValue(client.me);
  const signedOut = AsyncResult.isSuccess(me) && me.value === null;
  const { error } = route.useSearch();

  return (
    <div className="page bare">
      <Nav />
      <main className="fork">
        <header className="fork-head">
          <h1>Your forks</h1>
        </header>
        {error === undefined ? null : <p className="bad">{error}</p>}
        {signedOut ? (
          <SignedOut />
        ) : (
          <Live>
            <Forks />
          </Live>
        )}
      </main>
    </div>
  );
};
