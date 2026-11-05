import { useAtomRefresh, useAtomSubscribe, useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import type * as Atom from "effect/reactivity/Atom";
import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import * as client from "../../lib/api/client.ts";
import { OpenAIIcon } from "../../ui/icons.tsx";
import { Retry } from "../../ui/retry.tsx";
import { useStarted } from "./started.ts";
import type { Fork } from "./started.ts";

const signedIn = ({ owner, name }: Fork, change: Atom.Atom<string>) =>
  client.Client.runtime.atom((get) =>
    client.Client.use((api) =>
      Effect.suspend(() =>
        api.app.chatgptFinish({ params: { owner, name }, payload: { change: get.once(change) } }),
      ),
    ).pipe(
      Effect.catchTag(["HttpClientError", "SchemaError"], Effect.die),
      Effect.delay("5 seconds"),
      Effect.repeat({ until: (wait) => wait.status === "started" }),
    ),
  );

const Waiting = ({
  fork,
  change,
  onRetry,
  children,
}: {
  fork: Fork;
  change: Atom.Atom<string>;
  onRetry: () => void;
  children: ReactElement;
}) => {
  const atom = useMemo(() => signedIn(fork, change), [fork, change]);
  const result = useAtomValue(atom);
  const started = useStarted();

  useAtomSubscribe(
    atom,
    (done) => {
      if (AsyncResult.isSuccess(done) && done.value.status === "started") {
        started(done.value);
      }
    },
    { immediate: true },
  );

  return AsyncResult.isFailure(result) ? (
    <Retry message={client.failure(result.cause)} onRetry={onRetry} />
  ) : (
    children
  );
};

const Code = ({ code, url }: { code: string; url: string }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1400);
  };

  return (
    <div className="device">
      <p>Open ChatGPT&apos;s sign-in page and enter this code:</p>
      <button
        type="button"
        className="code"
        onClick={() => {
          void copy();
        }}
        title="Copy"
      >
        {code}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <a className="btn primary" href={url} target="_blank" rel="noreferrer">
        <OpenAIIcon /> Open ChatGPT sign-in
      </a>
      <p className="fine wait">This page moves on by itself once you&apos;ve signed in.</p>
    </div>
  );
};

export const ChatGPT = ({ fork, change }: { fork: Fork | null; change: Atom.Atom<string> }) => {
  const device = useAtomValue(client.chatgptDevice);
  const newCode = useAtomRefresh(client.chatgptDevice);

  if (AsyncResult.isFailure(device) && !device.waiting) {
    return <Retry message={client.failure(device.cause)} onRetry={newCode} />;
  }

  if (!AsyncResult.isSuccess(device) || device.waiting) {
    return <p className="wait">Getting a code from ChatGPT…</p>;
  }

  const code = <Code code={device.value.code} url={device.value.url} />;

  return fork === null ? (
    code
  ) : (
    <Waiting
      key={`${fork.owner}/${fork.name}/${device.value.code}`}
      fork={fork}
      change={change}
      onRetry={newCode}
    >
      {code}
    </Waiting>
  );
};
