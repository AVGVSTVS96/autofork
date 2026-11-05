// src/schedule.ts
var EVERY = {
  "5m": "2-59/5 * * * *",
  "15m": "7-59/15 * * * *",
  "1h": "17 * * * *",
  "1d": "17 6 * * *"
};
var isEvery = (value) => Object.hasOwn(EVERY, value);
var LIMITS = { rebuilds: 10, month: 200, rebuild: 20 };
// src/workflow.ts
var WORKFLOW_FILE = ".github/workflows/autofork.yml";
var workflow = ({ branch, cron, site, workflowTokens }) => `name: autofork

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
${workflowTokens ? `          workflow-token-url: ${site}/api/github/token
` : ""}          codex-auth-url: ${site}/api/chatgpt/auth
        env:
          CLAUDE_CODE_OAUTH_TOKEN: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          CODEX_AUTH: \${{ secrets.CODEX_AUTH }}
`;
// src/ledger.ts
var OIDC_AUDIENCE = "autofork";
export {
  EVERY,
  LIMITS,
  OIDC_AUDIENCE,
  WORKFLOW_FILE,
  isEvery,
  workflow
};
