import type { Fork, Settings } from "../../../shared/api.ts";
import { money, rebuilding } from "../../lib/spend/live.tsx";
import type { Spend } from "../../lib/spend/live.tsx";
import { Item } from "../../ui/Item.tsx";
import { Meter } from "../../ui/Meter.tsx";

const day = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const shortModel = (model: string | null) =>
  model?.replace(/^claude-/, "").replace(/-\d{8}$/, "") ?? null;

const Timer = ({ spend, owner, name }: { spend: Spend | undefined; owner: string; name: string }) =>
  spend?.linked ? (
    <p className="fine timer">
      On time: autofork starts a run within a minute of upstream changing.
    </p>
  ) : (
    <p className="fine timer">
      Runs on GitHub's schedule, which can start hours late.{" "}
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
        {spend && limits ? (
          <span>
            {money(spend.spent)} of {money(limits.month)} · {spend.rebuilds.length} of{" "}
            {limits.rebuilds} rebuilds
          </span>
        ) : null}
      </div>
      {spend && limits ? <Meter spent={spend.spent} cap={limits.month} /> : null}
      <ul className="list">
        {spend === undefined ? (
          <Item state="wait">Loading spend…</Item>
        ) : spend.rebuilds.length ? (
          spend.rebuilds.map((row) => (
            <Item
              key={row.id}
              state={rebuilding(row) ? "now" : row.status === "done" ? "ok" : "bad"}
              end={row.status === "running" ? `up to ${money(row.cap)}` : money(row.cost)}
              detail={
                <p className="why">
                  {[
                    shortModel(row.model) ?? row.agent,
                    day(row.startedAt),
                    row.status === "stopped"
                      ? "stopped"
                      : row.status === "running" && !rebuilding(row)
                        ? "never reported"
                        : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  ·{" "}
                  <a href={row.runUrl} target="_blank" rel="noreferrer">
                    run
                  </a>
                </p>
              }
            >
              {row.patch}
            </Item>
          ))
        ) : (
          <Item state="wait">
            No rebuilds this month. Syncs that git finishes on its own cost nothing.
          </Item>
        )}
      </ul>
      <Timer spend={spend} owner={fork.owner} name={fork.name} />
    </section>
  );
};
