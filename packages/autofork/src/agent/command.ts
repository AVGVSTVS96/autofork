import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { Config } from "../config/types.ts";
import { AutoforkError } from "../failure.ts";
import {
  anthropicKey,
  claudeEntrypoint,
  claudeToken,
  codexHome,
  insideClaudeCode,
  onGithubRunner,
} from "../platform/env.ts";
import { installed, run } from "../platform/process.ts";

// Labeled autofork, a run is billed like interactive Claude Code, not sdk-cli: https://github.com/anthropics/claude-code/issues/97074
export const runLabel = insideClaudeCode ? "autofork" : (claudeEntrypoint ?? "autofork");

export const codexDir = codexHome ?? path.join(homedir(), ".codex");

const REBUILD_TOOLS = "Bash,Read,Edit,Write,Glob,Grep";

const NO_UPSTREAM_MCP_SERVERS = "--strict-mcp-config";

const NO_CODEX_CONNECTORS = "--ignore-user-config --disable apps";

const CLAUDE_SIGNED_OUT =
  "Claude Code isn't signed in, so no agent can run: give the autofork step CLAUDE_CODE_OAUTH_TOKEN (claude setup-token prints one), or CODEX_AUTH for ChatGPT, from the fork's secrets";

const claudeSignedIn = (dir: string) =>
  claudeToken !== undefined ||
  anthropicKey !== undefined ||
  !onGithubRunner ||
  (installed("claude") &&
    !/"loggedIn":\s*false/u.test(run("claude", ["auth", "status", "--json"], dir).out.toString()));

const codexSignedIn = () =>
  claudeToken === undefined && existsSync(path.join(codexDir, "auth.json"));

export const signedIn = (config: Config, dir: string) =>
  config.agent !== undefined || codexSignedIn() || claudeSignedIn(dir);

export const agentCommand = (config: Config, cap: number, dir: string) => {
  if (config.agent !== undefined) {
    return { agent: "custom", command: config.agent } as const;
  }

  if (codexSignedIn()) {
    const codex = installed("codex") ? "codex" : "npx -y @openai/codex";

    return {
      agent: "codex",
      command: `${codex} exec --json --dangerously-bypass-approvals-and-sandbox ${NO_CODEX_CONNECTORS} -`,
    } as const;
  }

  if (!claudeSignedIn(dir)) {
    throw new AutoforkError(CLAUDE_SIGNED_OUT);
  }

  const claude = installed("claude") ? "claude" : "npx -y @anthropic-ai/claude-code";

  return {
    agent: "claude",
    command: `${claude} -p --dangerously-skip-permissions --output-format json --max-budget-usd ${cap} --tools ${REBUILD_TOOLS} ${NO_UPSTREAM_MCP_SERVERS}`,
  } as const;
};
