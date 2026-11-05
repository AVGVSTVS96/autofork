export const OIDC_AUDIENCE = "autofork";

export type Agent = "claude" | "codex" | "custom";

export interface LedgerOpen {
  readonly patch: string;
  readonly agent: Agent;
  readonly cap: number;
}

export interface LedgerOpened {
  readonly id: string;
}

export interface LedgerClose {
  readonly id: string;
  readonly status: "done" | "stopped";
  readonly cost?: number;
  readonly model?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface LinkAsk {
  readonly owner: string;
  readonly name: string;
}
