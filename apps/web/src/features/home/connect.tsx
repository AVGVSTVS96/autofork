import { useAtomSet } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState } from "react";
import type { FormEvent } from "react";

import type { Agent } from "../../../shared/api.ts";
import * as client from "../../lib/api/client.ts";
import { ClaudeIcon, OpenAIIcon } from "../../ui/icons.tsx";
import { Retry } from "../../ui/retry.tsx";

export interface Fork {
  owner: string;
  name: string;
}

export const Connect = ({
  fork,
  pick,
  onPick,
  change,
}: {
  fork: Fork | null;
  pick: Agent | undefined;
  onPick: (agent: Agent) => void;
  change: string;
}) => (
  <li className="now">
    <span className="n">3</span>
    <div>
      <p>Pick the plan the agent runs on. It works in your fork's GitHub Actions.</p>
      <div className="choices">
        <button
          type="button"
          className={pick === "chatgpt" ? "btn on" : "btn"}
          aria-pressed={pick === "chatgpt"}
          onClick={() => {
            onPick("chatgpt");
          }}
        >
          <OpenAIIcon /> ChatGPT
        </button>
        <button
          type="button"
          className={pick === "claude" ? "btn on" : "btn"}
          aria-pressed={pick === "claude"}
          onClick={() => {
            onPick("claude");
          }}
        >
          <ClaudeIcon /> Claude
        </button>
      </div>
      {pick === "chatgpt" ? <ChatGPT fork={fork} change={change} /> : null}
      {pick === "claude" ? <Claude fork={fork} change={change} /> : null}
    </div>
  </li>
);

const useStarted = () => {
  const navigate = useNavigate();

  return ({ owner, name }: Fork) =>
    void navigate({
      to: "/$owner/$name",
      params: { owner, name },
      search: { since: new Date(Date.now() - 5000).toISOString() },
    });
};

const ChatGPT = ({ fork, change }: { fork: Fork | null; change: string }) => {
  const start = useAtomSet(client.chatgptStart, { mode: "promiseExit" });
  const finish = useAtomSet(client.chatgptFinish, { mode: "promiseExit" });
  const started = useStarted();
  const [device, setDevice] = useState<{ code: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);

  const signedIn = useEffectEvent(async (into: Fork) =>
    finish({ params: into, payload: { change } }),
  );

  useEffect(() => {
    let live = true;
    void start({}).then((exit) => {
      if (!live) {
        return;
      }

      try {
        setDevice(client.unwrap(exit));
      } catch (error_) {
        setError((error_ as Error).message);
      }
    });

    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!device || !fork || error) {
      return;
    }

    let live = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const exit = await signedIn({ owner: fork.owner, name: fork.name });

      if (!live) {
        return;
      }

      try {
        const result = client.unwrap(exit);

        if (result.status === "started") {
          started(result);

          return;
        }

        timer = setTimeout(poll, 5000);
      } catch (error_) {
        setError((error_ as Error).message);
      }
    };

    timer = setTimeout(poll, 5000);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [device, fork?.owner, fork?.name, error]);

  const retry = () => {
    setError(null);
    setDevice(null);
    setAttempt((n) => n + 1);
  };

  if (error) {
    return <Retry message={error} onRetry={retry} />;
  }

  if (!device) {
    return <p className="wait">Getting a code from ChatGPT…</p>;
  }

  return (
    <div className="device">
      <p>Open ChatGPT's sign-in page and enter this code:</p>
      <button
        type="button"
        className="code"
        onClick={() =>
          void navigator.clipboard.writeText(device.code).then(() => {
            setCopied(true);
            setTimeout(() => {
              setCopied(false);
            }, 1400);
          })
        }
        title="Copy"
      >
        {device.code}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <a className="btn primary" href={device.url} target="_blank" rel="noreferrer">
        <OpenAIIcon /> Open ChatGPT sign-in
      </a>
      <p className="fine wait">This page moves on by itself once you've signed in.</p>
    </div>
  );
};

const Claude = ({ fork, change }: { fork: Fork | null; change: string }) => {
  const start = useAtomSet(client.claudeStart, { mode: "promiseExit" });
  const finish = useAtomSet(client.claudeFinish, { mode: "promiseExit" });
  const started = useStarted();
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const connect = useEffectEvent(async (into: Fork, pasted: string) =>
    finish({ params: into, payload: { code: pasted, change } }),
  );

  useEffect(() => {
    let live = true;
    void start({}).then((exit) => {
      if (!live) {
        return;
      }

      try {
        setUrl(client.unwrap(exit).url);
      } catch (error_) {
        setError((error_ as Error).message);
      }
    });

    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!sent || !fork) {
      return;
    }

    let live = true;
    void connect({ owner: fork.owner, name: fork.name }, sent).then((exit) => {
      if (!live) {
        return;
      }

      try {
        started(client.unwrap(exit));
      } catch (error_) {
        setError((error_ as Error).message);
        setSent(null);
      }
    });

    return () => {
      live = false;
    };
  }, [sent, fork?.owner, fork?.name]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSent(code.trim());
  };

  if (!url) {
    return error ? (
      <Retry
        message={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    ) : (
      <p className="wait">Getting Claude's sign-in ready…</p>
    );
  }

  return (
    <form className="device" onSubmit={submit}>
      <p>Authorize on Claude's page, then copy the code it shows and paste it here.</p>
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
        <button type="submit" disabled={!code.trim() || !!sent}>
          {sent ? "Starting…" : error ? "Try again" : "Start"}
        </button>
      </div>
      {error ? (
        <p className="bad" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
};
