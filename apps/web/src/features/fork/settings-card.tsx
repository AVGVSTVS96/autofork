import { EVERY } from "@autofork/contract";
import { useAtomSet } from "@effect/atom-react";
import * as Exit from "effect/Exit";
import * as Record from "effect/Record";
import { useState } from "react";
import type { ChangeEvent, SubmitEvent } from "react";

import type { Fork, Settings } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { useEdited } from "./use-edited.ts";

const PRESETS = Record.toEntries(EVERY);

const LABEL: Record<keyof typeof EVERY, string> = {
  "5m": "5 min",
  "15m": "15 min",
  "1h": "hour",
  "1d": "day",
};

const shown = (value: number) => (Number.isNaN(value) ? "" : value);

interface Note {
  text: string;
  bad: boolean;
}

export const SettingsCard = ({
  fork,
  settings,
  onSaved,
}: {
  fork: Fork;
  settings: Settings;
  onSaved: (settings: Settings) => void;
}) => {
  const { owner, name } = fork;
  const save = useAtomSet(client.saveSettings, { mode: "promiseExit" });
  const [draft, setDraft] = useEdited(settings);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  const limit = (key: keyof Settings["limits"]) => (event: ChangeEvent<HTMLInputElement>) => {
    setDraft({
      ...draft,
      limits: {
        ...draft.limits,
        [key]: event.target.value === "" ? Number.NaN : Number(event.target.value),
      },
    });
  };

  const submit = async () => {
    if (Object.values(draft.limits).some(Number.isNaN)) {
      setNote({ text: "Fill in every limit.", bad: true });

      return;
    }

    setBusy(true);
    setNote(null);

    const exit = await save({
      params: { owner, name },
      payload: draft,
      reactivityKeys: [client.SETTINGS],
    });

    setBusy(false);

    Exit.match(exit, {
      onSuccess: (saved) => {
        onSaved(saved);
        setNote({ text: "Saved in a commit to your fork.", bad: false });
      },
      onFailure: (cause) => {
        setNote({ text: client.failure(cause), bad: true });
      },
    });
  };

  const custom = draft.cron !== null && !PRESETS.some(([, line]) => line === draft.cron);

  return (
    <form
      className="card settings"
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        void submit();
      }}
    >
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
        A rebuild starts only if its whole cap still fits under the month&apos;s, so none is cut off
        halfway. Costs are at API prices.
        {fork.agent === "claude"
          ? " On a Claude plan, runs count the same as using Claude Code yourself."
          : null}
      </p>
      <div className="save">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {note === null ? null : <p className={note.bad ? "bad" : "fine"}>{note.text}</p>}
      </div>
    </form>
  );
};
