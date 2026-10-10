import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = join(import.meta.dir, "../dist/autopatch.js");
const home = mkdtempSync(join(tmpdir(), "autopatch-test-"));
const gitconfig = join(home, "gitconfig");
writeFileSync(gitconfig, "[user]\n\tname = test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n[diff]\n\tnoprefix = true\n");
const env = { ...process.env, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: "1", RUNNER_TEMP: home };

function sh(cwd: string, command: string) {
  const result = spawnSync("sh", ["-c", command], { cwd, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command}\n${result.stderr}`);
  return result.stdout.trim();
}

function autopatch(cwd: string, ...args: string[]) {
  const result = spawnSync("node", [cli, ...args], { cwd, env, encoding: "utf8" });
  return { ok: result.status === 0, log: result.stderr };
}

const upstream = join(home, "upstream");
const fork = join(home, "fork");
const file = (dir: string, name: string) => readFileSync(join(dir, name), "utf8");
const write = (dir: string, name: string, text: string) => writeFileSync(join(dir, name), text);

function agent(script: string) {
  const path = join(home, "agent.sh");
  writeFileSync(path, `cat > /dev/null\n${script}\n`);
  const config = JSON.parse(file(fork, ".autopatch/config.json"));
  write(fork, ".autopatch/config.json", `${JSON.stringify({ ...config, agent: `sh ${path}` }, null, 2)}\n`);
  sh(fork, "git diff --quiet || git commit -qam 'use test agent'");
}

function commitUpstream(text: string, message: string) {
  write(upstream, "app.js", text);
  sh(upstream, `git commit -qam '${message}'`);
}

test("init tracks upstream", () => {
  mkdirSync(upstream);
  sh(upstream, "git init -q");
  write(upstream, "app.js", 'export function greet(name) {\n  return "hello " + name;\n}\n');
  write(upstream, "notes.txt", "one\n");
  write(upstream, ".gitignore", "*.patch\n");
  sh(upstream, "git add -A && git commit -qm init");
  sh(home, `git clone -q ${upstream} fork`);
  const { ok, log } = autopatch(fork, "init", upstream, "--verify", "node -e \"import('./app.js').then(m => process.exit(m.greet('x') === 'x' ? 1 : 0))\"");
  expect(ok).toBe(true);
  expect(log).toContain(`autopatch tracks ${upstream} (main)`);
  sh(fork, "git add -A && git commit -qm 'track upstream'");
});

test("add captures uncommitted changes as a patch", () => {
  write(fork, "app.js", 'export function greet(name) {\n  return "hello " + name.toUpperCase();\n}\n');
  const { ok, log } = autopatch(fork, "add", "shout", "Shout the name");
  expect(ok).toBe(true);
  expect(log).toContain("captured 1 file in .autopatch/shout");
  expect(file(fork, ".autopatch/shout/shout.patch")).toContain("+  return \"hello \" + name.toUpperCase();");
  expect(autopatch(fork, "sync").log).toContain("needs an ## Intent");
  const doc = file(fork, ".autopatch/shout/PATCH.md").replace(/TODO.*/, "greet() shouts the name in upper case.");
  write(fork, ".autopatch/shout/PATCH.md", doc);
  sh(fork, "git add -A && git commit -qm 'shout'");
  expect(sh(fork, "git ls-files .autopatch/shout")).toContain("shout.patch");
});

test("sync with nothing new is a no-op", () => {
  agent("exit 1");
  const { ok, log } = autopatch(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("already up to date");
});

test("a clean upstream change applies without the agent", () => {
  write(upstream, "notes.txt", "two\n");
  sh(upstream, "git commit -qam notes");
  const { ok, log } = autopatch(fork, "sync");
  expect(ok).toBe(true);
  expect(log).not.toContain("healing");
  expect(file(fork, "notes.txt")).toBe("two\n");
  expect(file(fork, "app.js")).toContain("toUpperCase");
  expect(sh(fork, "git log -1 --format=%P").split(" ")).toHaveLength(2);
});

test("a drifted patch is healed from its intent", () => {
  commitUpstream('export function greet(name) {\n  return "hi " + name;\n}\n', "hi");
  agent(`sed -i 's/"hi " + name;/"hi " + name.toUpperCase();/' app.js`);
  const { ok, log } = autopatch(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healing shout");
  expect(log).toContain("healed shout");
  expect(file(fork, "app.js")).toContain('"hi " + name.toUpperCase()');
  expect(file(fork, ".autopatch/shout/shout.patch")).toContain('+  return "hi " + name.toUpperCase();');
  expect(file(fork, ".autopatch/shout/PATCH.md")).toContain(`baseline: ${sh(upstream, "git rev-parse HEAD")}`);
  agent("exit 1");
  expect(autopatch(fork, "sync").log).toContain("already up to date");
});

test("sync refuses to drop changes no patch holds", () => {
  write(fork, "notes.txt", "mine\n");
  sh(fork, "git commit -qam 'stray change'");
  const { ok, log } = autopatch(fork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("notes.txt");
  sh(fork, "git reset -q --hard HEAD~1");
});

test("a patch upstream absorbed is dropped with the agent's reason", () => {
  commitUpstream('export function greet(name) {\n  return "hi " + name.toUpperCase() + "!";\n}\n', "shout upstream");
  agent("echo 'upstream greet() upper-cases the name now' > .autopatch/shout/OBSOLETE");
  const { ok, log } = autopatch(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("dropped shout: upstream greet() upper-cases the name now");
  expect(JSON.parse(file(fork, ".autopatch/config.json")).patches).toEqual([]);
  expect(sh(fork, "ls .autopatch")).toBe("config.json");
});

test("files verify leaves behind stay out of the fork", () => {
  const config = JSON.parse(file(fork, ".autopatch/config.json"));
  write(fork, ".autopatch/config.json", `${JSON.stringify({ ...config, verify: "touch verify-output.log" }, null, 2)}\n`);
  sh(fork, "git commit -qam 'noisy verify'");
  write(upstream, "notes.txt", "three\n");
  sh(upstream, "git commit -qam notes");
  const { ok } = autopatch(fork, "sync");
  expect(ok).toBe(true);
  expect(sh(fork, "git ls-files verify-output.log")).toBe("");
});
