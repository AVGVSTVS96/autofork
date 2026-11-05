const { env } = process;

const filled = (value: string | undefined) => (value === "" ? undefined : value);

const withheld = (name: string) => {
  const value = filled(env[name]);

  Reflect.deleteProperty(env, name);

  return value;
};

const oidcUrl = withheld("ACTIONS_ID_TOKEN_REQUEST_URL");
const oidcToken = withheld("ACTIONS_ID_TOKEN_REQUEST_TOKEN");

export const oidc =
  oidcUrl === undefined || oidcToken === undefined ? undefined : { url: oidcUrl, token: oidcToken };

export const ledgerPath = env.AUTOFORK_LEDGER;

Reflect.deleteProperty(env, "AUTOFORK_LEDGER");

export const site = env.AUTOFORK_URL ?? "https://autofork.com";
export const githubOutput = filled(env.GITHUB_OUTPUT);
export const githubToken = filled(env.GH_TOKEN ?? env.GITHUB_TOKEN);
export const gitConfigCount = Number(env.GIT_CONFIG_COUNT ?? 0);
export const scratchParent = env.RUNNER_TEMP;
export const onGithubRunner = env.RUNNER_ENVIRONMENT === "github-hosted";
export const claudeToken = filled(env.CLAUDE_CODE_OAUTH_TOKEN);
export const codexHome = env.CODEX_HOME;
export const insideClaudeCode = filled(env.CLAUDECODE) !== undefined;
export const claudeEntrypoint = filled(env.CLAUDE_CODE_ENTRYPOINT);
