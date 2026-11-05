export const WORKFLOW_FILE = ".github/workflows/autofork.yml";

export interface WorkflowOptions {
  readonly branch: string;
  readonly cron: string;
  readonly site: string;
  readonly workflowTokens: boolean;
}

export const workflow = ({ branch, cron, site, workflowTokens }: WorkflowOptions) => `name: autofork

on:
  schedule:
    - cron: "${cron}"
  workflow_dispatch:
  push:
    branches: [${branch}]
    paths: [".autofork/**"]

permissions:
  contents: write
  issues: write
  id-token: write

concurrency: autofork

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: false
      # Set up the tools your setup and verify commands need here (node, bun, rust, ...).
      - id: autofork
        uses: AVGVSTVS96/autofork@v1
        with:
${workflowTokens ? `          workflow-token-url: ${site}/api/github/token\n` : ""}          codex-auth-url: ${site}/api/chatgpt/auth
        env:
          CLAUDE_CODE_OAUTH_TOKEN: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          CODEX_AUTH: \${{ secrets.CODEX_AUTH }}
`;
