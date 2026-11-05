import { expect, test } from "bun:test";

import { EVERY, workflow } from "../src/index.ts";

const site = "https://autofork.com";

test("a fork made on autofork.com gets workflow tokens, one made from the CLI doesn't", () => {
  const app = workflow({ branch: "main", cron: EVERY["15m"], site, workflowTokens: true });
  const cli = workflow({ branch: "dev", cron: EVERY["1h"], site, workflowTokens: false });
  expect(app).toContain("workflow-token-url: https://autofork.com/api/github/token\n");
  expect(app).toContain(`- cron: "${EVERY["15m"]}"`);
  expect(cli).not.toContain("workflow-token-url");
  expect(cli).toContain("branches: [dev]");
  expect(cli).toContain("codex-auth-url: https://autofork.com/api/chatgpt/auth\n");
  expect(cli).toContain("id-token: write");
});
