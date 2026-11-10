import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { configOf, configure, file, harness, write } from "../harness.ts";

const h = harness();
const { home, sh, autofork } = h;

test("a sync brings upstream's .github/ in, but names upstream's changes to workflows the fork keeps when it can't update them", () => {
  const origin = path.join(home, "ci");
  const mine = path.join(home, "ci-fork");
  mkdirSync(path.join(origin, ".github/workflows"), { recursive: true });
  mkdirSync(path.join(origin, ".github/scripts"), { recursive: true });
  sh(origin, "git init -q -b trunk && echo one > app.js");
  write(origin, ".github/scripts/changes.cjs", "one\n");

  for (const name of ["release", "test", "lint"]) {
    write(origin, `.github/workflows/${name}.yml`, `name: ${name}\n`);
  }

  sh(origin, "git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} ci-fork`);
  const base = sh(mine, "git rev-parse HEAD").slice(0, 12);
  expect(autofork(mine, "init", origin).log).toContain(
    "Removed the 3 workflows the fork copied from upstream and never changed",
  );
  write(mine, ".github/workflows/release.yml", "name: release from the fork\n");
  sh(
    mine,
    "git checkout -q .github/workflows/test.yml && git add -A && git commit -qm 'track upstream, release from the fork'",
  );
  sh(origin, "echo two > app.js && echo two > .github/scripts/changes.cjs");

  for (const name of ["release", "test", "lint", "deploy"]) {
    write(origin, `.github/workflows/${name}.yml`, `name: ${name} 2\n`);
  }

  sh(origin, "git add -A && git commit -qm two");
  write(mine, ".github/workflows/test.yml", "name: test 2\n");
  sh(mine, "git commit -qam 'bring test.yml over'");
  const { ok, log } = autofork(mine, "sync", "--no-workflows");
  expect(ok).toBe(true);
  expect(file(mine, "app.js")).toBe("two\n");
  expect(file(mine, ".github/scripts/changes.cjs")).toBe("two\n");
  expect(log).toContain(
    `upstream changed .github/workflows/release.yml in ${base}..${sh(origin, "git rev-parse HEAD").slice(0, 12)}`,
  );
  expect(log).not.toMatch(/upstream changed .*(?:test|lint|deploy)\.yml/u);
  expect(file(mine, ".github/workflows/release.yml")).toBe("name: release from the fork\n");
  expect(sh(mine, "ls .github/workflows")).toBe("autofork.yml\nrelease.yml\ntest.yml");
});

test("the agent brings upstream's changes into the workflows the fork keeps, and only its workflow changes are kept, autofork.yml aside", () => {
  const origin = path.join(home, "ci");
  const mine = path.join(home, "ci-fork");
  const script = path.join(home, "workflow-agent.sh");
  writeFileSync(
    script,
    `cat > ${home}/workflow-prompt.txt\necho 'on: push' >> .github/workflows/release.yml\necho mine > app.js\necho mine >> .github/workflows/autofork.yml\necho 'name: build' > .github/workflows/build.yml\n`,
  );
  configure(mine, { agent: `sh ${script}` }, 0);
  sh(mine, "git commit -qam 'use test agent'");
  const from = sh(origin, "git rev-parse HEAD").slice(0, 12);
  sh(origin, "echo three > app.js && echo 'name: release 3' > .github/workflows/release.yml");
  sh(origin, "git commit -qam three");
  const to = sh(origin, "git rev-parse HEAD").slice(0, 12);
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(file(home, "workflow-prompt.txt")).toContain(
    `upstream changed .github/workflows/release.yml: git diff ${from}..${to} -- .github/workflows`,
  );
  expect(log).toContain(
    `brought upstream's changes to .github/workflows/release.yml in ${from}..${to}`,
  );
  expect(log).not.toContain("upstream changed");
  expect(file(mine, ".github/workflows/release.yml")).toBe(
    "name: release from the fork\non: push\n",
  );
  expect(file(mine, "app.js")).toBe("three\n");
  expect(file(mine, ".github/workflows/build.yml")).toBe("name: build\n");
  expect(log).toContain(
    `brought upstream's changes to .github/workflows/build.yml in ${from}..${to}`,
  );
  expect(file(mine, ".github/workflows/autofork.yml")).not.toContain("mine");
});

test("an upstream change to workflows alone moves the fork on, so the agent isn't paid again for it", () => {
  const origin = path.join(home, "ci");
  const mine = path.join(home, "ci-fork");
  const script = path.join(home, "workflow-agent.sh");
  writeFileSync(script, `cat > /dev/null\necho run >> ${home}/workflow-runs.log\n`);
  sh(
    origin,
    "echo 'name: release 4' > .github/workflows/release.yml && git commit -qam 'release 4'",
  );
  expect(autofork(mine, "sync").output.result).toBe("synced");
  expect(autofork(mine, "sync").output.result).toBe("current");
  expect(file(home, "workflow-runs.log")).toBe("run\n");
});

test("a run that doesn't heal leaves upstream's workflow changes for one that does", () => {
  const origin = path.join(home, "ci");
  const mine = path.join(home, "ci-fork");
  writeFileSync(path.join(home, "workflow-runs.log"), "");
  sh(
    origin,
    "echo 'name: release 5' > .github/workflows/release.yml && git commit -qam 'release 5'",
  );
  expect(autofork(mine, "sync", "--no-heal").output.result).toBe("waiting");
  expect(file(home, "workflow-runs.log")).toBe("");
  expect(autofork(mine, "sync").output.result).toBe("synced");
  expect(file(home, "workflow-runs.log")).toBe("run\n");
});

test("a config without follow follows what init would pick", () => {
  const mine = path.join(home, "ci-fork");
  const config = configOf(mine);
  write(
    mine,
    ".autofork/config.json",
    `${JSON.stringify({ upstream: config.upstream }, null, 2)}\n`,
  );
  sh(mine, "git commit -qam 'no follow'");
  sh(path.join(home, "ci"), "echo four > app.js && git commit -qam four");
  expect(autofork(mine, "sync").output.result).toBe("synced");
  expect(file(mine, "app.js")).toBe("four\n");
  expect(configOf(mine).follow).toBe(config.follow);
});
