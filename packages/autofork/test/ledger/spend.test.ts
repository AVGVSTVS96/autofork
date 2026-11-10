import { expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  configOf,
  configure,
  file,
  harness,
  isJsonObject,
  parse,
  readJson,
  stub,
  write,
} from "../harness.ts";
import type { JsonObject } from "../harness.ts";

const h = harness();
const { home, sh, autofork, autoforkWith } = h;

const spendFork = (name: string, limits?: JsonObject) => {
  const origin = path.join(home, name);
  const mine = path.join(home, `${name}-fork`);
  mkdirSync(origin);
  sh(
    origin,
    "git init -q && echo 'export const app = 1;' > app.js && git add -A && git commit -qm init",
  );
  sh(home, `git clone -q ${origin} ${name}-fork`);
  expect(autofork(mine, "init", origin, "--verify", "true").ok).toBe(true);

  if (limits) {
    configure(mine, { limits }, 0);
  }

  sh(mine, "git add -A && git commit -qm 'track upstream'");

  return mine;
};

const wish = (mine: string, id: string, agent?: string) => {
  mkdirSync(path.join(mine, ".autofork", id), { recursive: true });
  write(mine, `.autofork/${id}/PATCH.md`, `app.js says ${id}.\n`);
  configure(mine, { agent }, 0);
  sh(mine, `git add -A && git commit -qm ${id}`);
};

test("a sync waits before paying for any rebuild when the month has no room for all it needs", () => {
  const mine = spendFork("capped", { rebuilds: 2 });
  const ledger = path.join(home, "capped-ledger.json");
  const runs = path.join(home, "capped-runs");
  const month = new Date().toISOString().slice(0, 7);
  const old = { patch: "old", agent: "claude", cap: 20, cost: 3, status: "done", at: "" };
  writeFileSync(ledger, JSON.stringify({ month, rebuilds: [old] }));
  const build = `id=$(grep -o 'Patch "[a-z]*"' | cut -d'"' -f2)\necho $id >> ${runs}\necho "// $id" >> app.js`;
  wish(mine, "one", build);
  wish(mine, "two", build);
  const head = sh(mine, "git rev-parse HEAD");

  const sync = (limits: JsonObject) => {
    configure(mine, { limits }, 0);
    sh(mine, "git diff --quiet || git commit -qam limits");

    return autoforkWith({ AUTOFORK_LEDGER: ledger }, mine, "sync");
  };

  const waiting = autoforkWith({ AUTOFORK_LEDGER: ledger }, mine, "sync");
  expect(waiting.ok).toBe(true);
  expect(waiting.output.result).toBe("waiting");
  expect(waiting.output.limits).toMatch(/^one, two wait: 2 rebuilds won't fit/u);
  expect(waiting.log).toMatch(
    /autofork: one, two wait: 2 rebuilds won't fit in this month's 2 \(1 used\)\. It runs \w{3} 1 \(UTC\), or raise "rebuilds" in "limits" in \.autofork\/config\.json\.\n$/u,
  );
  expect(existsSync(runs)).toBe(false);
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);

  const never = sync({ rebuilds: 1 });
  expect(never.log).toContain(
    'one, two wait: 2 rebuilds won\'t fit in this month\'s 1 (1 used). It needs you to raise "rebuilds" in "limits" in .autofork/config.json.',
  );
  expect(existsSync(runs)).toBe(false);

  writeFileSync(ledger, JSON.stringify({ month: "2000-01", rebuilds: [old] }));
  const built = sync({ rebuilds: 2 });
  expect(built.output).toMatchObject({ result: "synced", ledger: "changed" });
  expect(built.log).toContain("one cost up to $20");
  expect(file(home, "capped-runs")).toBe("one\ntwo\n");
  expect(readJson(home, "capped-ledger.json").rebuilds).toMatchObject([
    { patch: "one", agent: "custom", cap: 20, cost: 20, status: "done" },
    { patch: "two", agent: "custom", cap: 20, cost: 20, status: "done" },
  ]);
});

test("a rebuild waits when a whole rebuild's cap no longer fits under the month's, and names every limit that's short", () => {
  const mine = spendFork("broke", { month: 30 });
  const ledger = path.join(home, "broke-ledger.json");
  const month = new Date().toISOString().slice(0, 7);
  const row = { patch: "old", agent: "claude", cap: 20, status: "done", at: "" };
  writeFileSync(ledger, JSON.stringify({ month, rebuilds: [{ ...row, cost: 9.5 }] }));
  wish(mine, "three", "echo '// three' >> app.js");
  const fits = autoforkWith({ AUTOFORK_LEDGER: ledger }, mine, "sync");
  expect(fits.output.result).toBe("synced");
  wish(mine, "four", "echo '// four' >> app.js");
  writeFileSync(ledger, JSON.stringify({ month, rebuilds: [{ ...row, cost: 15 }] }));
  const { log, output } = autoforkWith({ AUTOFORK_LEDGER: ledger }, mine, "sync");
  expect(output.result).toBe("waiting");
  expect(log).toContain(
    "autofork: four waits: a rebuild may cost $20 and $15 of this month's $30 is left. It runs",
  );
  write(
    mine,
    ".autofork/config.json",
    JSON.stringify({
      ...configOf(mine),
      limits: { month: 30, rebuilds: 1 },
    }),
  );
  sh(mine, "git commit -qam 'one rebuild a month'");
  expect(autoforkWith({ AUTOFORK_LEDGER: ledger }, mine, "sync").log).toMatch(
    /four waits: a rebuild won't fit in this month's 1 \(1 used\), and a rebuild may cost \$20 and \$15 of this month's \$30 is left\. It runs \w{3} 1 \(UTC\), or raise "rebuilds" and "month" in "limits"/u,
  );
  write(
    mine,
    ".autofork/config.json",
    JSON.stringify({
      ...configOf(mine),
      limits: { month: "lots" },
    }),
  );
  sh(mine, "git commit -qam 'bad limits'");
  expect(autoforkWith({ AUTOFORK_LEDGER: ledger }, mine, "sync").log).toContain(
    '"limits" in .autofork/config.json takes numbers',
  );
});

test("Claude runs with this rebuild's cap, its own cost goes to the site, and the site's totals hold the limits", () => {
  const mine = spendFork("billed");
  const bin = path.join(home, "billed-bin");
  stub(
    bin,
    "claude",
    `cat > /dev/null
echo "$*" > ${home}/claude-args
env > ${home}/claude-env
echo '// built' >> app.js
echo '{"type":"result","subtype":"success","is_error":false,"result":"built it","total_cost_usd":1.25,"modelUsage":{"claude-opus-5-5":{"inputTokens":10,"outputTokens":20,"cacheReadInputTokens":100,"cacheCreationInputTokens":5,"costUSD":1.2},"claude-haiku-5-5":{"inputTokens":1,"outputTokens":2,"cacheReadInputTokens":0,"cacheCreationInputTokens":0,"costUSD":0.05}}}'`,
  );
  const siteLog = path.join(home, "billed-site.log");

  const site = {
    PATH: `${bin}:${process.env.PATH}`,
    CLAUDE_CODE_OAUTH_TOKEN: "token",
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.test/?run=1",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request",
    AUTOFORK_URL: "https://site.test",
    SITE_LOG: siteLog,
  };

  wish(mine, "five");

  const { ok, log } = autoforkWith(
    {
      ...site,
      SITE_TOTALS: '{"rebuilds":3,"spent":40}',
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "sdk-cli",
    },
    mine,
    "sync",
  );

  expect(ok).toBe(true);
  expect(log).toContain("built it\nfive cost $1.25\n");
  expect(file(home, "claude-args")).toContain(
    "-p --dangerously-skip-permissions --output-format json --max-budget-usd 20 --tools Bash,Read,Edit,Write,Glob,Grep --strict-mcp-config\n",
  );
  expect(file(home, "claude-env")).not.toContain("ACTIONS_ID_TOKEN_REQUEST");
  expect(file(home, "claude-env")).toContain("CLAUDE_CODE_ENTRYPOINT=autofork\n");

  const calls = file(home, "billed-site.log")
    .trim()
    .split("\n")
    .map((line) => parse(line));

  expect(calls).toEqual([
    { method: "GET", path: "/api/ledger", auth: "Bearer oidc-autofork" },
    { method: "GET", path: "/api/ledger", auth: "Bearer oidc-autofork" },
    {
      method: "POST",
      path: "/api/ledger",
      auth: "Bearer oidc-autofork",
      body: { patch: "five", agent: "claude", cap: 20 },
    },
    {
      method: "POST",
      path: "/api/ledger/close",
      auth: "Bearer oidc-autofork",
      body: {
        id: "row-1",
        status: "done",
        cost: 1.25,
        model: "claude-opus-5-5",
      },
    },
  ]);

  wish(mine, "retried");

  const retried = autoforkWith(
    {
      ...site,
      SITE_TOTALS: '{"rebuilds":4,"spent":41.25}',
      SITE_FAIL_ONCE: "/api/ledger/close",
      CLAUDECODE: "",
      CLAUDE_CODE_ENTRYPOINT: "mine",
    },
    mine,
    "sync",
  );

  expect(retried.log).not.toContain("couldn't report");
  expect(file(home, "claude-env")).toContain("CLAUDE_CODE_ENTRYPOINT=mine\n");
  expect(file(home, "billed-site.log")).toContain(
    '"path":"/api/ledger/close","auth":"Bearer oidc-autofork","body":{"id":"row-1","status":"done"',
  );

  wish(mine, "six");
  const capped = autoforkWith({ ...site, SITE_TOTALS: '{"rebuilds":3,"spent":190}' }, mine, "sync");
  expect(capped.output.result).toBe("waiting");
  expect(capped.log).toContain(
    "six waits: a rebuild may cost $20 and $10 of this month's $200 is left",
  );
});

test("a private fork's rebuild stays in its own tally when autofork.com records public forks only", () => {
  const mine = spendFork("private");
  const bin = path.join(home, "private-bin");
  const ledger = path.join(home, "private-ledger.json");
  const siteLog = path.join(home, "private-site.log");
  stub(
    bin,
    "claude",
    `cat > /dev/null
echo '// built' >> app.js
echo '{"type":"result","subtype":"success","is_error":false,"result":"built it","total_cost_usd":0.5}'`,
  );
  wish(mine, "hidden");

  const { ok, log } = autoforkWith(
    {
      PATH: `${bin}:${process.env.PATH}`,
      CLAUDE_CODE_OAUTH_TOKEN: "token",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.test/?run=1",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request",
      AUTOFORK_URL: "https://site.test",
      AUTOFORK_LEDGER: ledger,
      SITE_LOG: siteLog,
      SITE_TOTALS: '{"rebuilds":0,"spent":0}',
      SITE_PRIVATE: "1",
    },
    mine,
    "sync",
  );

  expect(ok).toBe(true);
  expect(log).toContain(
    "autofork.com didn't record this rebuild: autofork.com tracks spend on public forks only",
  );
  expect(log).not.toContain("couldn't report");
  expect(file(home, "private-site.log")).not.toContain("/api/ledger/close");
  expect(readJson(home, "private-ledger.json")).toMatchObject({
    rebuilds: [{ patch: "hidden", cost: 0.5, status: "done" }],
  });
});

test("on GitHub's runners with no agent signed in, a sync follows upstream without a patch that was never built, and stops at one upstream broke, saying what to add", () => {
  const mine = spendFork("signed-out");
  const origin = path.join(home, "signed-out");
  const bin = path.join(home, "signed-out-bin");
  stub(
    bin,
    "claude",
    `[ "$1 $2" = "auth status" ] && { printf '{\\n  "loggedIn": false,\\n  "authMethod": "none"\\n}\\n'; exit 1; }
cat > /dev/null
echo run >> ${home}/signed-out-runs
echo 'export const app = "ten";' > app.js`,
  );
  const ledger = path.join(home, "signed-out-ledger.json");

  const runner = (environment: string) =>
    autoforkWith(
      {
        PATH: `${bin}:${process.env.PATH}`,
        CLAUDE_CODE_OAUTH_TOKEN: "",
        CODEX_HOME: path.join(home, "signed-out-codex"),
        RUNNER_ENVIRONMENT: environment,
        AUTOFORK_LEDGER: ledger,
      },
      mine,
      "sync",
    );

  wish(mine, "ten");
  sh(origin, "echo 'export const other = 2;' > other.js && git add -A && git commit -qm other");

  const unbuilt = runner("github-hosted");

  expect(unbuilt.ok).toBe(true);
  expect(unbuilt.log).toContain(
    "autofork: the fork follows upstream without ten until a sync with an agent builds it",
  );
  expect(unbuilt.output.result).toBe("synced");
  expect(file(mine, "other.js")).toBe("export const other = 2;\n");
  expect(existsSync(path.join(home, "signed-out-runs"))).toBe(false);
  expect(runner("github-hosted").output.result).toBe("current");

  const local = runner("self-hosted");

  expect(local.log).toContain("built ten");
  expect(file(mine, "app.js")).toBe('export const app = "ten";\n');
  expect(file(home, "signed-out-runs")).toBe("run\n");

  sh(origin, "echo 'export const app = 3;' > app.js && git commit -qam three");
  const broken = runner("github-hosted");

  expect(broken.ok).toBe(false);
  expect(broken.output.error).toBe(
    "Claude Code isn't signed in, so no agent can run: give the autofork step CLAUDE_CODE_OAUTH_TOKEN (claude setup-token prints one), or CODEX_AUTH for ChatGPT, from the fork's secrets",
  );
  expect(file(home, "signed-out-runs")).toBe("run\n");
  expect(readJson(home, "signed-out-ledger.json").rebuilds).toHaveLength(1);
});

test("Codex's tokens are priced from LiteLLM's table for the model its session used", () => {
  const mine = spendFork("priced");
  const bin = path.join(home, "priced-bin");
  const codexHome = path.join(home, "priced-codex");
  mkdirSync(codexHome);
  write(codexHome, "auth.json", "{}");
  stub(
    bin,
    "codex",
    `cat > /dev/null
echo "$*" > ${home}/codex-args
mkdir -p "$CODEX_HOME/sessions/2026/11/01"
echo '{"type":"turn_context","payload":{"model":"gpt-test"}}' > "$CODEX_HOME/sessions/2026/11/01/rollout-2026-11-01-thread-9.jsonl"
echo '// built' >> app.js
echo '{"type":"thread.started","thread_id":"thread-9"}'
echo '{"type":"item.completed","item":{"type":"agent_message","text":"built it"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":1000,"cached_input_tokens":400,"cache_write_input_tokens":100,"output_tokens":50}}'`,
  );
  const ledger = path.join(home, "priced-ledger.json");
  wish(mine, "seven");

  const { ok, log } = autoforkWith(
    {
      PATH: `${bin}:${process.env.PATH}`,
      CLAUDE_CODE_OAUTH_TOKEN: "",
      CODEX_HOME: codexHome,
      AUTOFORK_LEDGER: ledger,
      PRICES: JSON.stringify({
        "gpt-test": {
          input_cost_per_token: 0.001,
          cache_read_input_token_cost: 0.0001,
          cache_creation_input_token_cost: 0.002,
          output_cost_per_token: 0.01,
        },
      }),
    },
    mine,
    "sync",
  );

  expect(ok).toBe(true);
  expect(file(home, "codex-args")).toContain("exec --json");
  expect(log).toContain("built it\nseven cost $1.24\n");
  const rows = readJson(home, "priced-ledger.json").rebuilds;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  expect(row).toMatchObject({ patch: "seven", agent: "codex", status: "done" });
  expect(isJsonObject(row) ? row.cost : undefined).toBeCloseTo(1.24);
});

test("after the up-front count, each rebuild still needs room of its own", () => {
  const mine = spendFork("reserved", { month: 60 });
  const bin = path.join(home, "reserved-bin");
  stub(
    bin,
    "claude",
    `id=$(grep -o 'Patch "[a-z]*"' | cut -d'"' -f2)
echo "// $id" >> app.js
echo '{"type":"result","result":"built","total_cost_usd":25,"modelUsage":{}}'`,
  );
  const ledger = path.join(home, "reserved-ledger.json");
  const month = new Date().toISOString().slice(0, 7);
  const old = { patch: "old", agent: "claude", cap: 20, cost: 20, status: "done", at: "" };
  writeFileSync(ledger, JSON.stringify({ month, rebuilds: [old] }));
  wish(mine, "eight");
  wish(mine, "nine");

  const { log, output } = autoforkWith(
    {
      PATH: `${bin}:${process.env.PATH}`,
      CLAUDE_CODE_OAUTH_TOKEN: "token",
      AUTOFORK_LEDGER: ledger,
    },
    mine,
    "sync",
  );

  expect(output.result).toBe("waiting");
  expect(log).toContain("eight cost $25\n");
  expect(log).toContain("nine waits: a rebuild may cost $20 and $15 of this month's $60 is left");
  expect(readJson(home, "reserved-ledger.json").rebuilds).toHaveLength(2);
});
