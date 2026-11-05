import { useAtomRefresh, useAtomSubscribe, useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import type * as Atom from "effect/reactivity/Atom";
import { useMemo, useState } from "react";
import type { SubmitEvent } from "react";

import * as client from "../../lib/api/client.ts";
import { ClaudeIcon } from "../../ui/icons.tsx";
import { Retry } from "../../ui/retry.tsx";
import { useStarted } from "./started.ts";
import type { Fork } from "./started.ts";

const connecting = ({ owner, name }: Fork, code: string, change: Atom.Atom<string>) =>
  client.Client.runtime.atom((get) =>
    client.Client.use((api) =>
      api.app.claudeFinish({
        params: { owner, name },
        payload: { code, change: get.once(change) },
      }),
    ).pipe(Effect.catchTag(["HttpClientError", "SchemaError"], Effect.die)),
  );

const Connecting = ({
  fork,
  code,
  change,
  onFailed,
}: {
  fork: Fork;
  code: string;
  change: Atom.Atom<string>;
  onFailed: (message: string) => void;
}) => {
  const atom = useMemo(() => connecting(fork, code, change), [fork, code, change]);
  const started = useStarted();

  useAtomSubscribe(
    atom,
    (result) => {
      if (AsyncResult.isSuccess(result)) {
        started(result.value);
      } else if (AsyncResult.isFailure(result)) {
        onFailed(client.failure(result.cause));
      }
    },
    { immediate: true },
  );

  return null;
};

const startLabel = (sent: string | null, error: string | null) => {
  if (sent !== null) {
    return "Starting…";
  }

  return error === null ? "Start" : "Try again";
};

const Paste = ({
  url,
  fork,
  change,
}: {
  url: string;
  fork: Fork | null;
  change: Atom.Atom<string>;
}) => {
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSent(code.trim());
  };

  return (
    <form className="device" onSubmit={submit}>
      <p>Authorize on Claude&apos;s page, then copy the code it shows and paste it here.</p>
      <a className="btn primary" href={url} target="_blank" rel="noreferrer">
        <ClaudeIcon /> Open Claude sign-in
      </a>
      <div className="paste">
        <input
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
          placeholder="Paste the code"
          aria-label="Code from Claude"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={code.trim() === "" || sent !== null}>
          {startLabel(sent, error)}
        </button>
      </div>
      {error === null ? null : (
        <p className="bad" role="alert">
          {error}
        </p>
      )}
      {sent !== null && fork !== null ? (
        <Connecting
          key={sent}
          fork={fork}
          code={sent}
          change={change}
          onFailed={(message) => {
            setError(message);
            setSent(null);
          }}
        />
      ) : null}
    </form>
  );
};

export const Claude = ({ fork, change }: { fork: Fork | null; change: Atom.Atom<string> }) => {
  const signIn = useAtomValue(client.claudeSignIn);
  const retry = useAtomRefresh(client.claudeSignIn);

  if (AsyncResult.isFailure(signIn) && !signIn.waiting) {
    return <Retry message={client.failure(signIn.cause)} onRetry={retry} />;
  }

  return AsyncResult.isSuccess(signIn) ? (
    <Paste url={signIn.value.url} fork={fork} change={change} />
  ) : (
    <p className="wait">Getting Claude&apos;s sign-in ready…</p>
  );
};
