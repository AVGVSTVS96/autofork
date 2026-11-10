import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";

import type { Fork, Settings } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { Live, useSpend } from "../../lib/spend/live.tsx";
import { SettingsCard } from "./settings-card.tsx";
import { SpendCard } from "./spend-card.tsx";
import { useEdited } from "./use-edited.ts";

const Spending = ({ fork, settings }: { fork: Fork; settings: Settings | null }) => {
  const spend = useSpend([`${fork.owner}/${fork.name}`])?.[0];

  return <SpendCard spend={spend} settings={settings} fork={fork} />;
};

const Cards = ({ fork }: { fork: Fork }) => {
  const loaded = useAtomValue(client.settings(fork.owner, fork.name));
  const [settings, setSettings] = useEdited(AsyncResult.isSuccess(loaded) ? loaded.value : null);

  return (
    <>
      <Spending fork={fork} settings={settings} />
      {AsyncResult.isFailure(loaded) ? (
        <p className="fine bad">{client.failure(loaded.cause)}</p>
      ) : null}
      {settings === null ? null : (
        <SettingsCard fork={fork} settings={settings} onSaved={setSettings} />
      )}
    </>
  );
};

export const Yours = ({ fork }: { fork: Fork }) => (
  <Live>
    <Cards fork={fork} />
  </Live>
);
