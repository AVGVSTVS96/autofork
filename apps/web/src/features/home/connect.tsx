import type * as Atom from "effect/reactivity/Atom";

import type { Agent } from "../../../shared/api.ts";
import { ClaudeIcon, OpenAIIcon } from "../../ui/icons.tsx";
import { ChatGPT } from "./chatgpt.tsx";
import { Claude } from "./claude.tsx";
import type { Fork } from "./started.ts";

export const Connect = ({
  fork,
  pick,
  onPick,
  change,
}: {
  fork: Fork | null;
  pick: Agent | undefined;
  onPick: (agent: Agent) => void;
  change: Atom.Atom<string>;
}) => (
  <li className="now">
    <span className="n">3</span>
    <div>
      <p>Pick the plan the agent runs on. It works in your fork&apos;s GitHub Actions.</p>
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
