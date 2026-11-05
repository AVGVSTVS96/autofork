import { EVERY } from "@autofork/contract";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useEffect, useMemo, useState } from "react";

import type { Fork, Settings } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";

const PRESETS = Object.entries(EVERY) as [keyof typeof EVERY, string][];

const LABEL: Record<keyof typeof EVERY, string> = {
  "5m": "5 min",
  "15m": "15 min",
  "1h": "hour",
  "1d": "day",
};

export const SettingsCard = ({
  fork,
  onSaved,
}: {
  fork: Fork;
  onSaved: (settings: Settings) => void;
}) => {
  const { owner, name } = fork;
  const atom = useMemo(() => client.settings(owner, name), [owner, name]);
  const loaded = useAtomValue(atom);
  const save = useAtomSet(client.saveSettings, { mode: "promiseExit" });
  const [draft, setDraft] = useState<Settings | null>(null);

  const [state, setState] = useState<{ busy: boolean; note: string | null; bad: boolean }>({
    busy: false,
    note: null,
    bad: false,
  });

  useEffect(() => {
    if (AsyncResult.isSuccess(loaded)) {
      setDraft(loaded.value);
      onSaved(loaded.value);
    }
  }, [loaded]);

  if (AsyncResult.isFailure(loaded)) {
    return <p className="fine bad">{client.failure(loaded.cause)}</p>;
  }

  if (!draft) {
    return null;
  }

  const limit = (key: keyof Settings["limits"]) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft({
      ...draft,
      limits: {
        ...draft.limits,
        [key]: event.target.value === "" ? Number.NaN : Number(event.target.value),
      },
    });
  };

  const shown = (value: number) => (Number.isNaN(value) ? "" : value);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (Object.values(draft.limits).some(Number.isNaN)) {
      setState({ busy: false, note: "Fill in every limit.", bad: true });

      return;
    }

    setState({ busy: true, note: null, bad: false });

    try {
      const saved = client.unwrap(
        await save({ params: { owner, name }, payload: draft, reactivityKeys: ["settings"] }),
      );

      setDraft(saved);
      onSaved(saved);
      setState({ busy: false, note: "Saved in a commit to your fork.", bad: false });
    } catch (error) {
      setState({ busy: false, note: (error as Error).message, bad: true });
    }
  };

  const custom = draft.cron !== null && !PRESETS.some(([, line]) => line === draft.cron);

  return (
    <form className="card settings" onSubmit={submit}>
      <div className="run-head">
        <b>Settings</b>
        <span>.autofork/config.json</span>
      </div>
      <label>
        <span>Follows</span>
        <input
          value={draft.follow}
          placeholder="releases"
          onChange={(event) => {
            setDraft({ ...draft, follow: event.target.value });
          }}
          spellCheck={false}
        />
        <small>
          releases for stable, a tag pattern like v*-nightly.* for a channel, or a branch
        </small>
      </label>
      {draft.cron === null ? null : (
        <fieldset>
          <legend>GitHub checks every</legend>
          <div className="seg">
            {PRESETS.map(([every, line]) => (
              <button
                key={every}
                type="button"
                className={draft.cron === line ? "on" : undefined}
                onClick={() => {
                  setDraft({ ...draft, cron: line });
                }}
              >
                {LABEL[every]}
              </button>
            ))}
            {custom ? <code>{draft.cron}</code> : null}
          </div>
        </fieldset>
      )}
      <div className="limits">
        <label>
          <span>Rebuilds a month</span>
          <input
            type="number"
            min={0}
            step={1}
            value={shown(draft.limits.rebuilds)}
            onChange={limit("rebuilds")}
          />
        </label>
        <label>
          <span>$ a month</span>
          <input
            type="number"
            min={0}
            step="any"
            value={shown(draft.limits.month)}
            onChange={limit("month")}
          />
        </label>
        <label>
          <span>$ a rebuild</span>
          <input
            type="number"
            min={0}
            step="any"
            value={shown(draft.limits.rebuild)}
            onChange={limit("rebuild")}
          />
        </label>
      </div>
      <p className="fine">
        A rebuild starts only if its whole cap still fits under the month's, so none is cut off
        halfway. Costs are at API prices.
        {fork.agent === "claude"
          ? " On a Claude plan, runs count the same as using Claude Code yourself."
          : null}
      </p>
      <div className="save">
        <button type="submit" className="btn primary" disabled={state.busy}>
          {state.busy ? "Saving…" : "Save"}
        </button>
        {state.note ? <p className={state.bad ? "bad" : "fine"}>{state.note}</p> : null}
      </div>
    </form>
  );
};
