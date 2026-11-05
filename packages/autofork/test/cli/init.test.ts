import { expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { configOf, configure, file, harness, write } from "../harness.ts";

const h = harness();
const { home, github, sh, autofork, autoforkWith } = h;

test("init leaves the README's note to the first sync's agent, and later syncs apply it without the agent", () => {
  const origin = path.join(home, "demo");
  const mine = path.join(home, "demo-fork");
  mkdirSync(origin);
  sh(origin, "git init -q");
  const readme = "# Demo\n\nDemo does things.\n\n## Install\n\nRun it.\n";
  write(origin, "README.md", readme);
  sh(origin, "git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} demo-fork`);
  const { ok, log } = autofork(mine, "init", origin);
  expect(ok).toBe(true);
  expect(log).toContain("The first sync adds a line to README.md");
  expect(file(mine, "README.md")).toBe(readme);
  expect(sh(mine, "ls .autofork/fork-readme")).toBe("PATCH.md");
  expect(file(mine, ".autofork/fork-readme/PATCH.md")).toContain("personal fork of demo");

  const useAgent = (agent: string) => {
    configure(mine, { agent });
    sh(mine, "git add -A && git commit -qm 'use test agent'");
  };

  const noted = readme.replace("\n\n", "\n\n> A personal fork of Demo.\n\n");
  write(home, "note-agent.sh", `cat > /dev/null\ncat > README.md <<'EOF'\n${noted}EOF\n`);
  useAgent(`sh ${path.join(home, "note-agent.sh")}`);
  const built = autofork(mine, "sync");
  expect(built.ok).toBe(true);
  expect(built.log).toContain("built fork-readme");
  expect(file(mine, "README.md")).toContain("# Demo\n\n> A personal fork of Demo.\n");
  useAgent("exit 1");
  write(origin, "README.md", readme.replace("Run it.", "Run it with care."));
  sh(origin, "git commit -qam install");
  const synced = autofork(mine, "sync");
  expect(synced.ok).toBe(true);
  expect(synced.log).not.toContain("building");
  expect(file(mine, "README.md")).toContain("> A personal fork of Demo.");
  expect(file(mine, "README.md")).toContain("Run it with care.");
});

test("init leaves out the README line when upstream's README already mentions autofork", () => {
  const origin = path.join(home, "noted");
  mkdirSync(origin);
  sh(origin, "git init -q");
  write(
    origin,
    "README.md",
    "# Noted\n\n> A personal fork that updates itself with [autofork](https://autofork.com).\n",
  );
  sh(origin, "git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} noted-fork`);
  const mine = path.join(home, "noted-fork");
  expect(autofork(mine, "init", origin).ok).toBe(true);
  expect(existsSync(path.join(mine, ".autofork/fork-readme"))).toBe(false);
});

test("init turns on Actions and issues for the fork origin points to, not the upstream gh picks, checks a private fork hourly, and starts the fork's own description with its owner's autofork once", () => {
  const bin = path.join(home, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    path.join(bin, "gh"),
    `#!/bin/sh
echo "$*" >> ${home}/gh.log
case "$*" in
  "repo view"*) echo acme/app ;;
  "api repos/me/app --jq .private") echo true ;;
  "api repos/me/app") cat ${home}/fork.json ;;
  "api users/me") echo '{"type":"User","name":"Ada Lovelace"}' ;;
  *) echo '{}' ;;
esac
`,
    { mode: 0o755 },
  );

  const repo = (description: string) => {
    write(
      home,
      "fork.json",
      JSON.stringify({
        fork: true,
        description,
        owner: { login: "me" },
        parent: { full_name: "acme/app", description: "An app" },
      }),
    );
  };

  repo("My app, my way");
  const app = path.join(github, "acme/app.git");

  mkdirSync(app, { recursive: true });
  sh(
    app,
    "git init -q && echo one > notes.txt && git add -A && git commit -qm one && git tag v9.0.0 && echo two > notes.txt && git commit -qam two && git tag desktop-v1.0.0 && echo three > notes.txt && git commit -qam three",
  );
  sh(
    home,
    `git clone -q ${app} mine && git -C mine remote set-url origin git@github.com:me/app.git`,
  );

  const { ok, log } = autoforkWith(
    { PATH: `${bin}:${process.env.PATH}` },
    path.join(home, "mine"),
    "init",
    "acme/app",
  );

  expect(ok).toBe(true);
  expect(log).toContain("This repo is private");
  expect(log).toContain(
    String.raw`sh -c 'd=$(mktemp -d) && trap "rm -rf \"\$d\"" EXIT && CODEX_HOME="$d" codex login --device-auth && gh secret set CODEX_AUTH --repo me/app < "$d/auth.json"', then start its first sync: gh workflow run autofork.yml --repo me/app.`,
  );
  expect(log).toContain("start the first sync by hand: gh workflow run autofork.yml --repo me/app");
  expect(file(path.join(home, "mine"), ".github/workflows/autofork.yml")).toContain("17 * * * *");
  const calls = file(home, "gh.log");
  expect(calls).toContain("api -X PUT repos/me/app/actions/permissions -F enabled=true");
  expect(calls).toContain("repo edit me/app --enable-issues");
  expect(calls).toContain(
    "api -X PATCH repos/me/app -f description=Ada's autofork · My app, my way",
  );
  repo("Ada's autofork · My app, my way");
  sh(path.join(home, "mine"), "rm -rf .autofork .github/workflows/autofork.yml && : > ../gh.log");
  expect(
    autoforkWith(
      { PATH: `${bin}:${process.env.PATH}` },
      path.join(home, "mine"),
      "init",
      "acme/app",
    ).ok,
  ).toBe(true);
  expect(file(home, "gh.log")).not.toContain("description=");
});

test("init counts only the workflows the fork has from upstream as copied from it", () => {
  const origin = path.join(home, "flows");
  const mine = path.join(home, "flows-fork");
  mkdirSync(path.join(origin, ".github/workflows"), { recursive: true });
  sh(origin, "git init -q && echo one > app.js");
  write(origin, ".github/workflows/test.yml", "name: test\n");
  sh(origin, "git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} flows-fork`);
  write(mine, ".github/workflows/desktop.yml", "name: desktop\n");
  sh(mine, "git add -A && git commit -qm 'build the desktop app'");
  expect(autofork(mine, "init", origin).log).toContain(
    "Your fork has 1 workflow copied from upstream",
  );
  sh(
    mine,
    "git rm -q .github/workflows/test.yml && rm -rf .autofork .github/workflows/autofork.yml",
  );
  expect(autofork(mine, "init", origin).log).not.toContain("copied from upstream");
});

test("init and fork write the limits, the schedule --every picks, id-token: write and the line about linking", () => {
  const origin = path.join(home, "timed");
  mkdirSync(origin);
  sh(origin, "git init -q && echo one > app.js && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} timed-fork`);
  const mine = path.join(home, "timed-fork");
  expect(autofork(mine, "init", origin, "--every", "2h").log).toContain(
    "--every takes 5m, 15m, 1h, 1d, not 2h",
  );
  const { ok, log } = autofork(mine, "init", origin, "--every", "1h");
  expect(ok).toBe(true);
  expect(log).toContain(
    "GitHub's timer can run hours late. Run it on time and track spend: npx autofork link",
  );
  expect(configOf(mine).limits).toEqual({
    rebuilds: 10,
    month: 200,
    rebuild: 20,
  });
  const workflow = file(mine, ".github/workflows/autofork.yml");
  expect(workflow).toContain('- cron: "17 * * * *"');
  expect(workflow).toContain("  id-token: write\n");
  expect(workflow).toContain(
    `        with:\n          codex-auth-url: https://autofork.com/api/chatgpt/auth\n        env:\n          CLAUDE_CODE_OAUTH_TOKEN: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\n          CODEX_AUTH: \${{ secrets.CODEX_AUTH }}\n`,
  );
  sh(mine, "rm -rf .autofork .github");
  autofork(mine, "init", origin);
  expect(file(mine, ".github/workflows/autofork.yml")).toContain('- cron: "7-59/15 * * * *"');
});

test("an init that can't reach the branch it follows writes nothing, so it can run again, and a config that isn't JSON says so", () => {
  const origin = path.join(home, "retry");
  mkdirSync(origin);
  sh(origin, "git init -q && echo one > notes.txt && git add -A && git commit -qm one");
  sh(home, `git clone -q ${origin} retry-fork`);
  const mine = path.join(home, "retry-fork");
  const failed = autofork(mine, "init", origin, "--follow", "nope");
  expect(failed.ok).toBe(false);
  expect(sh(mine, "git status --porcelain")).toBe("");
  expect(autofork(mine, "init", origin).ok).toBe(true);
  write(mine, ".autofork/config.json", '{\n  "upstream": "x",\n}\n');
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  const { ok, log, output } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("autofork: .autofork/config.json isn't valid JSON: ");
  expect(output.error).toContain(".autofork/config.json isn't valid JSON");
});
