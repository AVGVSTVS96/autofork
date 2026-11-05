import type { Fork, Settings } from "../../../shared/api.ts";
import { money, rebuilding } from "../../lib/spend/live.tsx";
import type { Spend } from "../../lib/spend/live.tsx";
import { Item } from "../../ui/item.tsx";
import { Meter } from "../../ui/meter.tsx";

const day = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const shortModel = (model: string | null) =>
  model?.replace(/^claude-/u, "").replace(/-\d{8}$/u, "") ?? null;

type Rebuild = Spend["rebuilds"][number];

const rebuildState = (row: Rebuild) => {
  if (rebuilding(row)) {
    return "now";
  }

  return row.status === "done" ? "ok" : "bad";
};

const ending = (row: Rebuild) => {
  if (row.status === "stopped") {
    return ["stopped"];
  }

  return row.status === "running" && !rebuilding(row) ? ["never reported"] : [];
};

const Rebuilt = ({ row }: { row: Rebuild }) => (
  <Item
    state={rebuildState(row)}
    end={row.status === "running" ? `up to ${money(row.cap)}` : money(row.cost)}
    detail={
      <p className="why">
        {[shortModel(row.model) ?? row.agent, day(row.startedAt), ...ending(row)].join(" · ")} ·{" "}
        <a href={row.runUrl} target="_blank" rel="noreferrer">
          run
        </a>
      </p>
    }
  >
    {row.patch}
  </Item>
);

const Rebuilds = ({ spend }: { spend: Spend | undefined }) => {
  if (spend === undefined) {
    return <Item state="wait">Loading spend…</Item>;
  }

  return spend.rebuilds.length > 0 ? (
    spend.rebuilds.map((row) => <Rebuilt key={row.id} row={row} />)
  ) : (
    <Item state="wait">
      No rebuilds this month. Syncs that git finishes on its own cost nothing.
    </Item>
  );
};

const Timer = ({ spend, owner, name }: { spend: Spend | undefined; owner: string; name: string }) =>
  spend?.linked === true ? (
    <p className="fine timer">
      On time: autofork starts a run within a minute of upstream changing.
    </p>
  ) : (
    <p className="fine timer">
      Runs on GitHub&apos;s schedule, which can start hours late.{" "}
      <a href={`/link/${owner}/${name}`}>Run it on time</a>
    </p>
  );

export const SpendCard = ({
  spend,
  settings,
  fork,
}: {
  spend: Spend | undefined;
  settings: Settings | null;
  fork: Fork;
}) => {
  const limits = settings?.limits;

  return (
    <section className="card spend">
      <div className="run-head">
        <b>This month</b>
        {spend !== undefined && limits !== undefined ? (
          <span>
            {money(spend.spent)} of {money(limits.month)} · {spend.rebuilds.length} of{" "}
            {limits.rebuilds} rebuilds
          </span>
        ) : null}
      </div>
      {spend !== undefined && limits !== undefined ? (
        <Meter spent={spend.spent} cap={limits.month} />
      ) : null}
      <ul className="list">
        <Rebuilds spend={spend} />
      </ul>
      <Timer spend={spend} owner={fork.owner} name={fork.name} />
    </section>
  );
};
