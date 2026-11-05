import { useAtomSet } from "@effect/atom-react";
import * as Exit from "effect/Exit";
import { useState } from "react";

import * as client from "../../lib/api/client.ts";
import { Composer } from "./composer.tsx";

const RUN_STARTED_LEEWAY = 5000;

export const More = ({ owner, name }: { owner: string; name: string }) => {
  const add = useAtomSet(client.addChange, { mode: "promiseExit" });
  const [change, setChange] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (text: string) => {
    setBusy(true);
    setError(null);
    const exit = await add({ params: { owner, name }, payload: { change: text } });
    setBusy(false);

    Exit.match(exit, {
      onSuccess: () => {
        setChange("");
        const since = new Date(Date.now() - RUN_STARTED_LEEWAY).toISOString();
        location.search = `?since=${encodeURIComponent(since)}`;
      },
      onFailure: (cause) => {
        setError(client.failure(cause));
      },
    });
  };

  return (
    <div className="more">
      <Composer
        value={change}
        onChange={setChange}
        onSubmit={(text) => {
          void submit(text);
        }}
        placeholder="Ask for another change"
        label="Another change"
        action={busy ? "Adding…" : "Add it"}
        disabled={change.trim() === "" || busy}
      />
      {error === null ? null : <p className="bad">{error}</p>}
    </div>
  );
};
