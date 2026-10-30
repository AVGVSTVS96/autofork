import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = join(import.meta.dir, "../dist/autofork.js");
const home = mkdtempSync(join(tmpdir(), "autofork-test-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));
const gitconfig = join(home, "gitconfig");
writeFileSync(
  gitconfig,
  "[user]\n\tname = test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n[diff]\n\tnoprefix = true\n",
);
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: gitconfig,
  GIT_CONFIG_NOSYSTEM: "1",
  RUNNER_TEMP: home,
};
const github = join(home, "github");
writeFileSync(gitconfig, `[url "${github}/"]\n\tinsteadOf = https://github.com/\n`, { flag: "a" });
const fakeApi = join(home, "fake-api.mjs");
writeFileSync(
  fakeApi,
  `globalThis.fetch = async (url) => {
  const latest = process.env.LATEST_RELEASE;
  if (latest && String(url).endsWith("/releases/latest")) return new Response(JSON.stringify({ tag_name: latest }));
  if (process.env.RELEASES && String(url).includes("/releases?")) return new Response(process.env.RELEASES);
  return new Response("{}", { status: 404 });
};
`,
);

function sh(cwd: string, command: string) {
  const result = spawnSync("sh", ["-c", command], { cwd, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command}\n${result.stderr}`);
  return result.stdout.trim();
}

function autofork(cwd: string, ...args: string[]) {
  return autoforkWith({}, cwd, ...args);
}

function autoforkWith(extra: NodeJS.ProcessEnv, cwd: string, ...args: string[]) {
  const outputs = join(home, "github-output");
  writeFileSync(outputs, "");
  const result = spawnSync("node", ["--import", fakeApi, cli, ...args], {
    cwd,
    env: { ...env, ...extra, GITHUB_OUTPUT: outputs },
    encoding: "utf8",
  });
  const output = Object.fromEntries(
    readFileSync(outputs, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("=")),
  );
  return { ok: result.status === 0, log: result.stderr, output };
}

const upstream = join(home, "upstream");
const fork = join(home, "fork");
const file = (dir: string, name: string) => readFileSync(join(dir, name), "utf8");
const write = (dir: string, name: string, text: string) => writeFileSync(join(dir, name), text);

function agent(script: string) {
  const path = join(home, "agent.sh");
  writeFileSync(path, `cat > /dev/null\n${script}\n`);
  const config = JSON.parse(file(fork, ".autofork/config.json"));
  write(
    fork,
    ".autofork/config.json",
    `${JSON.stringify({ ...config, agent: `sh ${path}` }, null, 2)}\n`,
  );
  sh(fork, "git diff --quiet || git commit -qam 'use test agent'");
}

function commitUpstream(text: string, message: string) {
  write(upstream, "app.js", text);
  sh(upstream, `git commit -qam '${message}'`);
}

function patch(id: string, text: string) {
  mkdirSync(join(fork, ".autofork", id), { recursive: true });
  write(fork, `.autofork/${id}/PATCH.md`, `${text}\n`);
}

test("init tracks upstream", () => {
  mkdirSync(upstream);
  sh(upstream, "git init -q");
  write(upstream, "app.js", 'export function greet(name) {\n  return "hello " + name;\n}\n');
  write(upstream, "notes.txt", "one\n");
  write(upstream, ".gitignore", "*.patch\n");
  sh(upstream, "git add -A && git commit -qm init");
  sh(home, `git clone -q ${upstream} fork`);
  const { ok, log } = autofork(
    fork,
    "init",
    upstream,
    "--verify",
    "node -e \"import('./app.js').then(m => process.exit(m.greet('x') === 'x' ? 1 : 0))\"",
  );
  expect(ok).toBe(true);
  expect(log).toContain(`autofork follows ${upstream}'s main branch, since it has no releases`);
  expect(file(fork, ".github/workflows/autofork.yml")).toContain(
    'push:\n    branches: [main]\n    paths: [".autofork/**"]',
  );
  sh(fork, "git add -A && git commit -qm 'track upstream'");
});

test("save turns your changes into the patch PATCH.md describes", () => {
  write(
    fork,
    "app.js",
    'export function greet(name) {\n  return "hello " + name.toUpperCase();\n}\n',
  );
  expect(autofork(fork, "save", "shout").log).toContain("write .autofork/shout/PATCH.md first");
  patch("shout", "greet() shouts the name in upper case.");
  const { ok, log } = autofork(fork, "save", "shout");
  expect(ok).toBe(true);
  expect(log).toContain("saved 1 file to .autofork/shout");
  expect(file(fork, ".autofork/shout/shout.patch")).toContain(
    '+  return "hello " + name.toUpperCase();',
  );
  sh(fork, "git add -A && git commit -qm 'shout'");
  expect(sh(fork, "git ls-files .autofork/shout")).toContain("shout.patch");
});

test("sync with nothing new is a no-op", () => {
  agent("exit 1");
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("already up to date");
});

test("a clean upstream change applies without the agent", () => {
  write(upstream, "notes.txt", "two\n");
  sh(upstream, "git commit -qam notes");
  const { ok, log } = autofork(fork, "sync", "--no-heal");
  expect(ok).toBe(true);
  expect(log).not.toContain("healing");
  expect(file(fork, "notes.txt")).toBe("two\n");
  expect(file(fork, "app.js")).toContain("toUpperCase");
  expect(sh(fork, "git log -1 --format=%P").split(" ")).toHaveLength(2);
});

test("a drifted patch waits for a run that heals", () => {
  commitUpstream('export function greet(name) {\n  return "hi " + name;\n}\n', "hi");
  const head = sh(fork, "git rev-parse HEAD");
  const { ok, log } = autofork(fork, "sync", "--no-heal");
  expect(ok).toBe(true);
  expect(log).toContain("shout doesn't apply");
  expect(log).toContain("The next run that heals rebuilds it");
  expect(sh(fork, "git rev-parse HEAD")).toBe(head);
});

test("an agent that leaves conflict markers fails the heal after one run", () => {
  agent(`echo run >> ${join(home, "runs")}`);
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("the agent left conflict markers in app.js while healing shout");
  expect(file(home, "runs")).toBe("run\n");
});

test("a drifted patch is healed from git's conflict markers and its PATCH.md", () => {
  agent(
    `grep -q '^<<<<<<< ours' app.js || exit 1\nprintf 'export function greet(name) {\\n  return "hi " + name.toUpperCase();\\n}\\n' > app.js`,
  );
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healing shout");
  expect(log).toContain("healed shout");
  expect(file(fork, "app.js")).toContain('"hi " + name.toUpperCase()');
  expect(file(fork, ".autofork/shout/shout.patch")).toContain(
    '+  return "hi " + name.toUpperCase();',
  );
  agent("exit 1");
  expect(autofork(fork, "sync").log).toContain("already up to date");
});

test("changes no patch holds wait quietly until upstream moves", () => {
  write(fork, "notes.txt", "mine\n");
  sh(fork, "git commit -qam 'stray change'");
  const head = sh(fork, "git rev-parse HEAD");
  const idle = autofork(fork, "sync");
  expect(idle.ok).toBe(true);
  expect(idle.output.result).toBe("current");
  expect(sh(fork, "git rev-parse HEAD")).toBe(head);
});

test("once upstream moves, sync refuses to drop changes no patch holds, and fails only once", () => {
  write(upstream, "license.txt", "MIT\n");
  sh(upstream, "git add -A && git commit -qm license");
  const { ok, log, output } = autofork(fork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("notes.txt");
  expect(output.key).toBeTruthy();
  const again = autofork(fork, "sync", "--skip", output.key);
  expect(again.ok).toBe(true);
  expect(again.output.result).toBe("skipped");
  sh(fork, "git reset -q --hard HEAD~1");
});

test("a patch upstream now does is paused, not applied, until you pick it up", () => {
  commitUpstream(
    'export function greet(name) {\n  return "hi " + name.toUpperCase() + "!";\n}\n',
    "shout upstream",
  );
  agent("echo 'upstream greet() upper-cases the name now' > .autofork/shout/UPSTREAM.md");
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("upstream has shout: upstream greet() upper-cases the name now");
  expect(sh(fork, "ls .autofork/shout")).toBe("PATCH.md\nUPSTREAM.md");
  expect(file(fork, ".autofork/shout/UPSTREAM.md")).toContain(
    "autofork stopped applying this patch",
  );
  expect(file(fork, "app.js")).toContain('"hi " + name.toUpperCase() + "!"');
  expect(autofork(fork, "status").log).toContain("shout  (upstream has it");
  agent("exit 1");
  write(upstream, "notes.txt", "two and a half\n");
  sh(upstream, "git commit -qam notes");
  expect(autofork(fork, "sync").ok).toBe(true);
  expect(file(fork, "notes.txt")).toBe("two and a half\n");
});

test("deleting UPSTREAM.md brings your version back", () => {
  write(
    fork,
    ".autofork/shout/PATCH.md",
    "greet() shouts the name and ends with three bangs, not upstream's one.\n",
  );
  sh(fork, "git rm -q .autofork/shout/UPSTREAM.md && git commit -qam 'keep mine'");
  agent(`sed -i 's/ + "!";/ + "!!!";/' app.js`);
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("built shout");
  expect(file(fork, "app.js")).toContain('"!!!"');
  sh(
    fork,
    "git rm -rq .autofork/shout && git checkout refs/autofork/upstream -- app.js && git commit -qm 'take upstream'",
  );
});

test("a patch that's only a PATCH.md is built by the agent", () => {
  patch("wave", "greet() waves at the end.");
  sh(fork, "git add -A && git commit -qm wave");
  expect(autofork(fork, "status").log).toContain("wave  (not built yet)");
  const head = sh(fork, "git rev-parse HEAD");
  const waiting = autofork(fork, "sync", "--no-heal");
  expect(waiting.ok).toBe(true);
  expect(waiting.log).toContain("wave isn't built yet. The next run that heals rebuilds it.");
  expect(waiting.output.result).toBe("waiting");
  expect(sh(fork, "git rev-parse HEAD")).toBe(head);
  write(upstream, "notes.txt", "wave pending\n");
  sh(upstream, "git commit -qam notes");
  expect(autofork(fork, "sync", "--no-heal").output.result).toBe("waiting");
  expect(sh(fork, "git rev-parse HEAD")).toBe(head);
  agent(
    `sed -i 's/ + "!";/ + "! o\\/";/' app.js\nprintf '\\nThe wave is text, so it works in any terminal.\\n' >> .autofork/wave/PATCH.md`,
  );
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("built wave");
  expect(file(fork, "app.js")).toContain('"! o/"');
  expect(file(fork, ".autofork/wave/wave.patch")).toContain('"! o/"');
  expect(file(fork, ".autofork/wave/PATCH.md")).toBe(
    "greet() waves at the end.\n\nThe wave is text, so it works in any terminal.\n",
  );
  agent("exit 1");
  expect(autofork(fork, "sync").log).toContain("already up to date");
});

test("a patch upstream merged as is is paused without the agent", () => {
  commitUpstream(file(fork, "app.js"), "merge the wave");
  agent("exit 1");
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("upstream has wave: the same change, line for line");
  expect(sh(fork, "ls .autofork/wave")).toBe("PATCH.md\nUPSTREAM.md");
});

test("files verify leaves behind stay out of the fork", () => {
  const config = JSON.parse(file(fork, ".autofork/config.json"));
  write(
    fork,
    ".autofork/config.json",
    `${JSON.stringify({ ...config, verify: "touch verify-output.log" }, null, 2)}\n`,
  );
  sh(fork, "git commit -qam 'noisy verify'");
  write(upstream, "notes.txt", "three\n");
  sh(upstream, "git commit -qam notes");
  const { ok } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(sh(fork, "git ls-files verify-output.log")).toBe("");
});

test("a fork can follow upstream's releases instead of a branch", () => {
  sh(upstream, "git tag v1.0.0");
  write(upstream, "notes.txt", "four\n");
  sh(upstream, "git commit -qam notes && git tag v1.1.0-beta.1");
  const config = JSON.parse(file(fork, ".autofork/config.json"));
  write(
    fork,
    ".autofork/config.json",
    `${JSON.stringify({ ...config, follow: "releases" }, null, 2)}\n`,
  );
  sh(fork, "git commit -qam 'follow releases'");
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("already up to date");
  expect(file(fork, "notes.txt")).toBe("three\n");
  sh(upstream, "git tag v1.1.0");
  expect(autofork(fork, "sync").ok).toBe(true);
  expect(file(fork, "notes.txt")).toBe("four\n");
});

test("a fork ahead of upstream's newest release stays where it is", () => {
  const follow = (to: string) => {
    const config = JSON.parse(file(fork, ".autofork/config.json"));
    write(fork, ".autofork/config.json", `${JSON.stringify({ ...config, follow: to }, null, 2)}\n`);
    sh(fork, `git commit -qam 'follow ${to}'`);
  };
  follow("main");
  write(upstream, "notes.txt", "five\n");
  sh(upstream, "git commit -qam notes");
  expect(autofork(fork, "sync").ok).toBe(true);
  follow("releases");
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("already up to date");
  expect(file(fork, "notes.txt")).toBe("five\n");
});

test("init leaves the README's note to the first sync's agent, and later syncs apply it without the agent", () => {
  const origin = join(home, "demo");
  const mine = join(home, "demo-fork");
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
    const config = JSON.parse(file(mine, ".autofork/config.json"));
    write(mine, ".autofork/config.json", `${JSON.stringify({ ...config, agent }, null, 2)}\n`);
    sh(mine, "git add -A && git commit -qm 'use test agent'");
  };
  const noted = readme.replace("\n\n", "\n\n> A personal fork of Demo.\n\n");
  write(home, "note-agent.sh", `cat > /dev/null\ncat > README.md <<'EOF'\n${noted}EOF\n`);
  useAgent(`sh ${join(home, "note-agent.sh")}`);
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

test("a fork on GitHub follows its latest release, not its highest tag", () => {
  const app = join(github, "acme/app.git");
  mkdirSync(app, { recursive: true });
  sh(
    app,
    "git init -q && echo one > notes.txt && git add -A && git commit -qm one && git tag v9.0.0",
  );
  sh(
    app,
    "echo two > notes.txt && git commit -qam two && git tag desktop-v1.0.0 && echo three > notes.txt && git commit -qam three",
  );
  sh(home, `git clone -q ${app} app && git -C app reset -q --hard v9.0.0`);
  const mine = join(home, "app");
  expect(autofork(mine, "init", "acme/app").log).toContain("autofork follows acme/app's releases.");
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  expect(autofork(mine, "sync").log).toContain("already up to date");
  const released = autoforkWith({ LATEST_RELEASE: "desktop-v1.0.0" }, mine, "sync");
  expect(released.ok).toBe(true);
  expect(released.output.result).toBe("synced");
  expect(file(mine, "notes.txt")).toBe("two\n");
});

test("init follows releases when every release is named with a dash", () => {
  const app = join(github, "acme/desktop.git");
  mkdirSync(app, { recursive: true });
  sh(
    app,
    "git init -q && echo one > notes.txt && git add -A && git commit -qm one && git tag desktop-v1.0.0",
  );
  sh(home, `git clone -q ${app} desktop`);
  const mine = join(home, "desktop");
  expect(
    autoforkWith({ LATEST_RELEASE: "desktop-v1.0.0" }, mine, "init", "acme/desktop").log,
  ).toContain("autofork follows acme/desktop's releases.");
  sh(mine, "rm -rf .autofork .github");
  expect(autofork(mine, "init", "acme/desktop").log).toContain(
    "acme/desktop's main branch, since it has no releases",
  );
});

test("a fork can follow one channel of upstream's releases, named by its tags", () => {
  const app = join(github, "acme/nightly.git");
  mkdirSync(app, { recursive: true });
  sh(
    app,
    "git init -q && echo one > notes.txt && git add -A && git commit -qm one && git tag v1.0.0",
  );
  sh(
    app,
    "echo two > notes.txt && git commit -qam two && git tag v1.1.0-nightly.1 && echo three > notes.txt && git commit -qam three && git tag v1.1.0-preview.1",
  );
  sh(home, `git clone -q ${app} nightly && git -C nightly reset -q --hard v1.0.0`);
  const mine = join(home, "nightly");
  const releases = JSON.stringify([
    { tag_name: "v1.1.0-nightly.2", draft: true, prerelease: true, published_at: null },
    {
      tag_name: "v1.1.0-preview.1",
      draft: false,
      prerelease: true,
      published_at: "2026-01-03T00:00:00Z",
    },
    {
      tag_name: "v1.1.0-nightly.1",
      draft: false,
      prerelease: true,
      published_at: "2026-01-02T00:00:00Z",
    },
    { tag_name: "v1.0.0", draft: false, prerelease: false, published_at: "2026-01-01T00:00:00Z" },
  ]);
  const init = autoforkWith(
    { RELEASES: releases, LATEST_RELEASE: "v1.0.0" },
    mine,
    "init",
    "acme/nightly",
  );
  expect(init.log).toContain("autofork follows acme/nightly's releases.");
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  write(
    mine,
    ".autofork/config.json",
    `${JSON.stringify({ ...config, follow: "v*-nightly.*" }, null, 2)}\n`,
  );
  sh(mine, "git add -A && git commit -qm 'track nightlies'");
  const synced = autoforkWith({ RELEASES: releases }, mine, "sync");
  expect(synced.output).toMatchObject({ result: "synced", tag: "v1.1.0-nightly.1" });
  expect(file(mine, "notes.txt")).toBe("two\n");
  expect(autofork(mine, "sync").output.result).toBe("current");
  expect(file(mine, "notes.txt")).toBe("two\n");
});

test("init turns on Actions and issues for the fork origin points to, not the upstream gh picks", () => {
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "gh"),
    `#!/bin/sh
echo "$*" >> ${home}/gh.log
case "$*" in
  "repo view"*) echo acme/app ;;
  "api repos/me/app") echo '{"fork":true,"owner":{"login":"me"},"parent":{"full_name":"acme/app","description":"An app"}}' ;;
  "api users/me") echo '{"type":"User","name":"Ada Lovelace"}' ;;
  *) echo '{}' ;;
esac
`,
    { mode: 0o755 },
  );
  sh(
    home,
    `git clone -q ${join(github, "acme/app.git")} mine && git -C mine remote set-url origin git@github.com:me/app.git`,
  );
  const { ok } = autoforkWith(
    { PATH: `${bin}:${process.env.PATH}` },
    join(home, "mine"),
    "init",
    "acme/app",
  );
  expect(ok).toBe(true);
  const calls = file(home, "gh.log");
  expect(calls).toContain("api -X PUT repos/me/app/actions/permissions -F enabled=true");
  expect(calls).toContain("repo edit me/app --enable-issues");
  expect(calls).toContain("api -X PATCH repos/me/app -f description=Ada's autofork · An app");
});

test("a sync brings upstream's .github/ in, but names upstream's changes to workflows the fork keeps when it can't update them", () => {
  const origin = join(home, "ci");
  const mine = join(home, "ci-fork");
  mkdirSync(join(origin, ".github/workflows"), { recursive: true });
  mkdirSync(join(origin, ".github/scripts"), { recursive: true });
  sh(origin, "git init -q -b trunk && echo one > app.js");
  write(origin, ".github/scripts/changes.cjs", "one\n");
  for (const name of ["release", "test", "lint"])
    write(origin, `.github/workflows/${name}.yml`, `name: ${name}\n`);
  sh(origin, "git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} ci-fork`);
  const base = sh(mine, "git rev-parse HEAD").slice(0, 12);
  expect(autofork(mine, "init", origin).log).toContain(
    "opens an issue when the workflow's token can't push workflow files",
  );
  write(mine, ".github/workflows/release.yml", "name: release from the fork\n");
  sh(
    mine,
    "git rm -q .github/workflows/lint.yml && git add -A && git commit -qm 'track upstream, release from the fork'",
  );
  sh(origin, "echo two > app.js && echo two > .github/scripts/changes.cjs");
  for (const name of ["release", "test", "lint", "deploy"])
    write(origin, `.github/workflows/${name}.yml`, `name: ${name} 2\n`);
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
  expect(log).not.toMatch(/upstream changed .*(test|lint|deploy)\.yml/);
  expect(file(mine, ".github/workflows/release.yml")).toBe("name: release from the fork\n");
  expect(sh(mine, "ls .github/workflows")).toBe("autofork.yml\nrelease.yml\ntest.yml");
});

test("the agent brings upstream's changes into the workflows the fork keeps, and only its workflow changes are kept, autofork.yml aside", () => {
  const origin = join(home, "ci");
  const mine = join(home, "ci-fork");
  const path = join(home, "workflow-agent.sh");
  writeFileSync(
    path,
    `cat > ${home}/workflow-prompt.txt\necho 'on: push' >> .github/workflows/release.yml\necho mine > app.js\necho mine >> .github/workflows/autofork.yml\necho 'name: build' > .github/workflows/build.yml\n`,
  );
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  write(mine, ".autofork/config.json", `${JSON.stringify({ ...config, agent: `sh ${path}` })}\n`);
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
  const origin = join(home, "ci");
  const mine = join(home, "ci-fork");
  const path = join(home, "workflow-agent.sh");
  writeFileSync(path, `cat > /dev/null\necho run >> ${home}/workflow-runs.log\n`);
  sh(
    origin,
    "echo 'name: release 4' > .github/workflows/release.yml && git commit -qam 'release 4'",
  );
  expect(autofork(mine, "sync").output.result).toBe("synced");
  expect(autofork(mine, "sync").output.result).toBe("current");
  expect(file(home, "workflow-runs.log")).toBe("run\n");
});

test("a run that doesn't heal leaves upstream's workflow changes for one that does", () => {
  const origin = join(home, "ci");
  const mine = join(home, "ci-fork");
  writeFileSync(join(home, "workflow-runs.log"), "");
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
  const mine = join(home, "ci-fork");
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  write(
    mine,
    ".autofork/config.json",
    `${JSON.stringify({ upstream: config.upstream }, null, 2)}\n`,
  );
  sh(mine, "git commit -qam 'no follow'");
  sh(join(home, "ci"), "echo four > app.js && git commit -qam four");
  expect(autofork(mine, "sync").output.result).toBe("synced");
  expect(file(mine, "app.js")).toBe("four\n");
  expect(JSON.parse(file(mine, ".autofork/config.json")).follow).toBe(config.follow);
});

const checked = join(home, "checked");
const checkedFork = join(home, "checked-fork");
const runs = join(home, "agent-runs.log");

function checkedAgent(heals: Record<string, string>, fork = checkedFork) {
  const path = join(home, "checked-agent.sh");
  const cases = Object.entries(heals).map(([key, script]) => {
    const fix = key.match(/^fix ?(.*)$/);
    const [name, pattern] = fix ? ["fix", `named by its id: ${fix[1]}`] : [key, `"${key}"`];
    return `  *'${pattern}'*) echo ${name} >> ${runs}; printf '%s' "$prompt" > ${home}/prompt-${name}.txt; ${script} ;;`;
  });
  writeFileSync(path, `prompt="$(cat)"\ncase "$prompt" in\n${cases.join("\n")}\nesac\n`);
  writeFileSync(runs, "");
  const config = JSON.parse(file(fork, ".autofork/config.json"));
  write(
    fork,
    ".autofork/config.json",
    `${JSON.stringify({ ...config, agent: `sh ${path}` }, null, 2)}\n`,
  );
  sh(fork, "git diff --quiet || git commit -qam 'use test agent'");
}

function fixup(fixes: Record<string, string>) {
  const commits = Object.entries(fixes).map(
    ([id, script]) =>
      `${script} && git add -A && git commit -q --fixup=$(git log -1 --format=%H --grep='^${id}$') && `,
  );
  return `${commits.join("")}GIT_SEQUENCE_EDITOR=true git rebase -qi --autosquash $(git log -1 --format=%H --grep='^upstream ')`;
}

function savePatch(id: string, intent: string, change: () => void, fork = checkedFork) {
  change();
  mkdirSync(join(fork, ".autofork", id), { recursive: true });
  write(fork, `.autofork/${id}/PATCH.md`, `${intent}\n`);
  expect(autofork(fork, "save", id).ok).toBe(true);
  sh(fork, `git add -A && git commit -qm ${id}`);
}

const loads = `for f in *.js; do node -e "import('./$f')" || exit 1; done > loaded.txt`;

test("a patch that still applies but fails verify waits for a run that heals", () => {
  mkdirSync(checked);
  sh(checked, "git init -q && echo one > notes.txt");
  write(checked, "name.js", 'export const name = () => "world";\n');
  write(
    checked,
    "app.js",
    'import { name } from "./name.js";\nexport const greet = () => "hello " + name();\n',
  );
  sh(checked, "git add -A && git commit -qm init");
  sh(home, `git clone -q ${checked} checked-fork`);
  expect(autofork(checkedFork, "init", checked, "--verify", loads).ok).toBe(true);
  sh(checkedFork, "git add -A && git commit -qm 'track upstream'");
  savePatch("a-notes", "notes.txt says the notes are mine.", () =>
    write(checkedFork, "notes.txt", "mine\n"),
  );
  savePatch("b-shout", "extra.js has shout(), the name in upper case.", () =>
    write(
      checkedFork,
      "extra.js",
      'import { name } from "./name.js";\nexport const shout = () => name().toUpperCase();\n',
    ),
  );
  write(checked, "name.js", 'export const who = () => "world";\n');
  write(
    checked,
    "app.js",
    'import { who } from "./name.js";\nexport const greet = () => "hello " + who();\n',
  );
  sh(checked, "git commit -qam 'name is who now'");
  checkedAgent({});
  const head = sh(checkedFork, "git rev-parse HEAD");
  const { ok, log, output } = autofork(checkedFork, "sync", "--no-heal");
  expect(ok).toBe(true);
  expect(output.result).toBe("waiting");
  expect(log).toContain(
    "verify fails, so a patch needs rebuilding. The next run that heals rebuilds it.",
  );
  expect(sh(checkedFork, "git rev-parse HEAD")).toBe(head);
});

test("verify that still fails after the agent's fix fails the sync instead of calling it again", () => {
  savePatch("c-wave", "greet() waves at the end.", () =>
    write(
      checkedFork,
      "app.js",
      'import { name } from "./name.js";\nexport const greet = () => "hello " + name() + " o/";\n',
    ),
  );
  checkedAgent({ fix: "true", "c-wave": "true" });
  const head = sh(checkedFork, "git rev-parse HEAD");
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain(`verify still fails after the agent's fix: ${loads}`);
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(sh(checkedFork, "git rev-parse HEAD")).toBe(head);
});

test("verify that fails on a patch the agent just rebuilt fails the sync instead of paying for a fix", () => {
  checkedAgent({
    fix: fixup({
      "b-shout": `printf 'import { who } from "./name.js";\\nexport const shout = () => who().toUpperCase();\\n' > extra.js`,
    }),
    "c-wave": `printf 'import { whom } from "./name.js";\\nexport const greet = () => "hello " + whom() + " o/";\\n' > app.js`,
  });
  const head = sh(checkedFork, "git rev-parse HEAD");
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("verify fails with c-wave, which the agent healed");
  expect(file(home, "agent-runs.log")).toBe("fix\nc-wave\n");
  expect(sh(checkedFork, "git rev-parse HEAD")).toBe(head);
});

test("patches that still apply but fail verify are fixed in their own commits by one agent run, before the agent builds a later patch on top of them", () => {
  checkedAgent({
    fix: fixup({
      "b-shout": `printf 'import { who } from "./name.js";\\nexport const shout = () => who().toUpperCase();\\n' > extra.js`,
    }),
    "c-wave": `printf 'import { who } from "./name.js";\\nexport const greet = () => "hello " + who() + " o/";\\n' > app.js`,
  });
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("verify fails, verify with upstream");
  expect(log).toContain("healed b-shout\nhealed c-wave");
  expect(file(home, "agent-runs.log")).toBe("fix\nc-wave\n");
  expect(file(home, "prompt-fix.txt")).toContain(
    `with the patches on top, one commit each, named by its id: a-notes, b-shout. They all apply, but \`${loads}\` fails with them. Its last lines:`,
  );
  expect(file(home, "prompt-fix.txt")).toContain("does not provide an export named 'name'");
  expect(file(home, "prompt-fix.txt")).toContain(
    "Patches after these aren't applied yet: c-wave. Each goes on top, so leave what its PATCH.md asks for to it.",
  );
  expect(file(checkedFork, "extra.js")).toContain("who().toUpperCase()");
  expect(file(checkedFork, "app.js")).toContain('who() + " o/"');
  expect(file(checkedFork, "notes.txt")).toBe("mine\n");
  expect(file(checkedFork, ".autofork/b-shout/b-shout.patch")).toContain(
    "+export const shout = () => who().toUpperCase();",
  );
});

test("verify that fails on upstream itself fails the sync without the agent", () => {
  write(checked, "name.js", 'export const whom = () => "world";\n');
  sh(checked, "git commit -qam 'break upstream'");
  checkedAgent({ "b-shout": "true", "c-wave": "true" });
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain(
    `verify fails on upstream ${sh(checked, "git rev-parse HEAD").slice(0, 12)} itself`,
  );
  expect(file(home, "agent-runs.log")).toBe("");
});

test("each new patch keeps the note its agent added to PATCH.md, when a later patch is built in the same sync", () => {
  write(checked, "name.js", 'export const who = () => "world";\n');
  sh(checked, "git commit -qam 'fix upstream'");
  for (const id of ["d-bang", "e-tilde"]) {
    mkdirSync(join(checkedFork, ".autofork", id), { recursive: true });
    write(checkedFork, `.autofork/${id}/PATCH.md`, `notes.txt ends with a ${id.slice(2)}.\n`);
  }
  sh(checkedFork, "git add -A && git commit -qm 'two new patches'");
  checkedAgent({
    "d-bang": `echo '!' >> notes.txt; printf '\\nA line of its own.\\n' >> .autofork/d-bang/PATCH.md`,
    "e-tilde": `echo '~' >> notes.txt; printf '\\nAfter the bang.\\n' >> .autofork/e-tilde/PATCH.md`,
  });
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("built d-bang\nbuilt e-tilde");
  expect(file(checkedFork, "notes.txt")).toBe("mine\n!\n~\n");
  expect(file(checkedFork, ".autofork/d-bang/PATCH.md")).toBe(
    "notes.txt ends with a bang.\n\nA line of its own.\n",
  );
  expect(file(checkedFork, ".autofork/e-tilde/PATCH.md")).toBe(
    "notes.txt ends with a tilde.\n\nAfter the bang.\n",
  );
});

test("patches that fail verify are fixed before the agent rebuilds a later one that no longer applies", () => {
  savePatch("f-wink", "wink.js has wink(), the name with a wink.", () =>
    write(
      checkedFork,
      "wink.js",
      'import { who } from "./name.js";\nexport const wink = () => who() + " ;)";\n',
    ),
  );
  savePatch("g-loud", "shout() ends with an exclamation mark.", () =>
    write(
      checkedFork,
      "extra.js",
      'import { who } from "./name.js";\nexport const shout = () => who().toUpperCase() + "!";\n',
    ),
  );
  write(checked, "name.js", 'export const whom = () => "world";\n');
  write(
    checked,
    "app.js",
    'import { whom } from "./name.js";\nexport const greet = () => "hello " + whom();\n',
  );
  sh(checked, "git commit -qam 'who is whom now'");
  checkedAgent({
    "fix a-notes, b-shout.": fixup({
      "b-shout": `printf 'import { whom } from "./name.js";\\nexport const shout = () => whom().toUpperCase();\\n' > extra.js`,
    }),
    "c-wave": `printf 'import { whom } from "./name.js";\\nexport const greet = () => "hello " + whom() + " o/";\\n' > app.js`,
    "fix a-notes, b-shout, c-wave, d-bang, e-tilde, f-wink.": fixup({
      "f-wink": `printf 'import { whom } from "./name.js";\\nexport const wink = () => whom() + " ;)";\\n' > wink.js`,
    }),
    "g-loud": `printf 'import { whom } from "./name.js";\\nexport const shout = () => whom().toUpperCase() + "!";\\n' > extra.js`,
  });
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed b-shout\nhealed c-wave\nhealed f-wink\nhealed g-loud");
  expect(file(home, "agent-runs.log")).toBe("fix\nc-wave\nfix\ng-loud\n");
  expect(file(home, "prompt-fix.txt")).toContain(
    `named by its id: a-notes, b-shout, c-wave, d-bang, e-tilde, f-wink. They all apply, but \`${loads}\` fails with them.`,
  );
  expect(file(checkedFork, "extra.js")).toContain('whom().toUpperCase() + "!"');
  expect(file(checkedFork, "wink.js")).toContain('whom() + " ;)"');
  expect(file(checkedFork, "app.js")).toContain('whom() + " o/"');
  expect(file(checkedFork, "notes.txt")).toBe("mine\n!\n~\n");
  expect(existsSync(join(checkedFork, "loaded.txt"))).toBe(false);
});

function checkWith(verify: string) {
  const config = JSON.parse(file(checkedFork, ".autofork/config.json"));
  write(
    checkedFork,
    ".autofork/config.json",
    `${JSON.stringify({ ...config, verify }, null, 2)}\n`,
  );
  checkedAgent({ fix: "true" });
}

test("verify that fails once and passes when run again lets the sync through after an agent run that changes nothing", () => {
  write(checked, "readme.txt", "hi\n");
  sh(checked, "git add -A && git commit -qm readme");
  checkWith(`test -e ${home}/verified || { touch ${home}/verified; exit 1; }`);
  const { ok, log, output } = autofork(checkedFork, "sync");
  expect(ok).toBe(true);
  expect(output.result).toBe("synced");
  expect(log).not.toContain("healed");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(file(checkedFork, "readme.txt")).toBe("hi\n");
  expect(file(checkedFork, "extra.js")).toContain('whom().toUpperCase() + "!"');
});

test("one agent run fixes every patch that fails verify, each in its own commit, and the patches are read back from them", () => {
  const origin = join(home, "stacked");
  const mine = join(home, "stacked-fork");
  mkdirSync(origin);
  write(origin, "name.js", 'export const who = () => "world";\n');
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} stacked-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-loud",
    "loud.js has loud(), the name in upper case.",
    () =>
      write(
        mine,
        "loud.js",
        'import { who } from "./name.js";\nexport const loud = () => who().toUpperCase();\n',
      ),
    mine,
  );
  savePatch(
    "b-wink",
    "wink.js has wink(), the name with a wink.",
    () =>
      write(
        mine,
        "wink.js",
        'import { who } from "./name.js";\nexport const wink = () => who() + " ;)";\n',
      ),
    mine,
  );
  savePatch(
    "c-louder",
    "loud() ends with an exclamation mark.",
    () =>
      write(
        mine,
        "loud.js",
        'import { who } from "./name.js";\nexport const loud = () => who().toUpperCase() + "!";\n',
      ),
    mine,
  );
  write(origin, "name.js", 'export const whom = () => "world";\n');
  sh(origin, "git commit -qam 'who is whom now'");
  checkedAgent(
    {
      fix: [
        "git reset -q --hard $(git log -1 --format=%H --grep='^upstream ')",
        `printf 'import { whom } from "./name.js";\\nexport const loud = () => whom().toUpperCase();\\n' > loud.js && git add -A && git commit -qm a-loud`,
        `printf 'import { whom } from "./name.js";\\nexport const wink = () => whom() + " ;)";\\n' > wink.js && git add -A && git commit -qm b-wink`,
        `printf 'import { whom } from "./name.js";\\nexport const loud = () => whom().toUpperCase() + "!";\\n' > loud.js && git commit -qam c-louder`,
      ].join(" && "),
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed a-loud\nhealed b-wink\nhealed c-louder");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(file(mine, "loud.js")).toBe(
    'import { whom } from "./name.js";\nexport const loud = () => whom().toUpperCase() + "!";\n',
  );
  expect(file(mine, "wink.js")).toContain('whom() + " ;)"');
  expect(file(mine, ".autofork/a-loud/a-loud.patch")).toContain(
    "+export const loud = () => whom().toUpperCase();",
  );
  expect(file(mine, ".autofork/c-louder/c-louder.patch")).toContain(
    '+export const loud = () => whom().toUpperCase() + "!";',
  );
  expect(existsSync(join(mine, "loaded.txt"))).toBe(false);
});

test("an agent fix that leaves a patch with nothing to add fails the sync instead of emptying it", () => {
  const origin = join(home, "overlap");
  const mine = join(home, "overlap-fork");
  mkdirSync(origin);
  write(origin, "name.js", 'export const who = () => "world";\n');
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} overlap-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-loud",
    "loud.js has loud(), the name in upper case.",
    () =>
      write(
        mine,
        "loud.js",
        'import { who } from "./name.js";\nexport const loud = () => who().toUpperCase();\n',
      ),
    mine,
  );
  savePatch(
    "b-notes",
    "notes.txt mentions loud().",
    () => write(mine, "notes.txt", "one\nloud\n"),
    mine,
  );
  write(origin, "name.js", 'export const whom = () => "world";\n');
  sh(origin, "git commit -qam 'who is whom now'");
  checkedAgent(
    {
      fix: [
        "git reset -q --hard $(git log -1 --format=%H --grep='^upstream ')",
        `printf 'import { whom } from "./name.js";\\nexport const loud = () => whom().toUpperCase();\\n' > loud.js && echo loud >> notes.txt && git add -A && git commit -qm a-loud`,
        "git commit -q --allow-empty -m b-notes",
      ].join(" && "),
    },
    mine,
  );
  const head = sh(mine, "git rev-parse HEAD");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("the agent's fix left b-notes with nothing to add");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);
});

test("a patch that no longer applies keeps what git could apply, and the agent gets only what's left", () => {
  const origin = join(home, "partial");
  const mine = join(home, "partial-fork");
  const lines = Array.from({ length: 20 }, (_, index) => `l${index + 1}`);
  mkdirSync(origin);
  write(origin, "one.txt", "1\n2\n3\n");
  write(origin, "two.txt", "a\nb\nc\n");
  write(origin, "three.txt", "x\n");
  write(origin, "four.txt", `${lines.join("\n")}\n`);
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} partial-fork`);
  expect(autofork(mine, "init", origin).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "edit",
    "Each file says it's mine.",
    () => {
      write(mine, "one.txt", "1\nTWO\n3\n");
      write(mine, "two.txt", "a\nB\nc\n");
      write(mine, "three.txt", "y\n");
      write(
        mine,
        "four.txt",
        `${lines.join("\n").replace("l2\n", "L2\n").replace("l19", "L19")}\n`,
      );
    },
    mine,
  );
  const saved = join(mine, ".autofork/edit/edit.patch");
  writeFileSync(
    saved,
    readFileSync(saved, "utf8").replace(/(?<=four\.txt\nindex )[0-9a-f]{40}/, "1111111"),
  );
  sh(mine, "git commit -qam 'four.txt from a commit this clone never had'");
  write(origin, "one.txt", "1\ndeux\n3\n");
  write(origin, "four.txt", `${lines.join("\n").replace("l2\n", "el2\n")}\n`);
  sh(origin, "git rm -q three.txt && git commit -qam 'upstream moves'");
  checkedAgent(
    {
      edit: `grep -q '^<<<<<<< ours' one.txt && test -f four.txt.rej || exit 1; printf '1\\nTWO\\n3\\n' > one.txt; sed -i 's/^el2$/L2/' four.txt`,
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed edit");
  const prompt = file(home, "prompt-edit.txt");
  expect(prompt).toContain(
    "What's left: the conflict markers in one.txt; the hunks that didn't fit, in four.txt.rej; the changes to three.txt, which didn't apply at all.",
  );
  expect(prompt).toMatch(/git diff \w+ \w+ -- one\.txt four\.txt three\.txt$/m);
  expect(prompt).not.toContain("two.txt");
  expect(file(mine, "one.txt")).toBe("1\nTWO\n3\n");
  expect(file(mine, "two.txt")).toBe("a\nB\nc\n");
  expect(file(mine, "four.txt")).toContain("L2\n");
  expect(file(mine, "four.txt")).toContain("L19\n");
  expect(existsSync(join(mine, "three.txt"))).toBe(false);
  expect(existsSync(join(mine, "four.txt.rej"))).toBe(false);
  expect(file(mine, ".autofork/edit/edit.patch")).toContain("+B");
  expect(file(mine, ".autofork/edit/edit.patch")).toContain("+L19");
});

test("setup installs before the agent and verify run, and generated files are rebuilt instead of patched", () => {
  const origin = join(home, "deps");
  const mine = join(home, "deps-fork");
  const setup =
    "mkdir -p deps && cp package.json deps/ && sed 's/^/locked /' package.json > lock.txt";
  mkdirSync(origin);
  write(origin, ".gitignore", "deps/\n");
  write(origin, "package.json", '{\n  "a": "1"\n}\n');
  sh(origin, `git init -q && ${setup} && git add -A && git commit -qm init`);
  sh(home, `git clone -q ${origin} deps-fork`);
  expect(autofork(mine, "init", origin, "--verify", "cmp package.json deps/package.json").ok).toBe(
    true,
  );
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "dep-b",
    "The app depends on b.",
    () => {
      write(mine, "package.json", '{\n  "a": "1",\n  "b": "1"\n}\n');
      sh(mine, setup);
    },
    mine,
  );
  expect(file(mine, ".autofork/dep-b/dep-b.patch")).toContain("lock.txt");
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  write(
    mine,
    ".autofork/config.json",
    `${JSON.stringify({ ...config, generated: ["lock.txt"] }, null, 2)}\n`,
  );
  expect(autofork(mine, "status").log).toContain('"generated" files are rebuilt by "setup"');
  write(
    mine,
    ".autofork/config.json",
    `${JSON.stringify({ ...config, setup, generated: ["lock.txt"] }, null, 2)}\n`,
  );
  sh(mine, "git commit -qam 'lock.txt is generated'");
  write(origin, "package.json", '{\n  "a": "1",\n  "c": "1"\n}\n');
  sh(origin, `${setup} && git commit -qam 'depend on c'`);
  checkedAgent(
    {
      "dep-b": `grep -q '^<<<<<<< ours' package.json && test -f deps/package.json || exit 1; printf '{\\n  "a": "1",\\n  "b": "1",\\n  "c": "1"\\n}\\n' > package.json`,
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed dep-b");
  const prompt = file(home, "prompt-dep-b.txt");
  expect(prompt).toContain(`Dependencies are installed: \`${setup}\` ran here`);
  expect(prompt).toContain("What's left: the conflict markers in package.json.");
  expect(prompt).toContain("that git would pick up, but leave lock.txt, which the sync rebuilds.");
  expect(prompt).toContain(" -- package.json\n");
  expect(file(mine, "lock.txt")).toBe(
    'locked {\nlocked   "a": "1",\nlocked   "b": "1",\nlocked   "c": "1"\nlocked }\n',
  );
  expect(file(mine, ".autofork/dep-b/dep-b.patch")).not.toContain("lock.txt");
  expect(sh(mine, "git status --porcelain")).toBe("");
  write(origin, "notes.txt", "one\n");
  sh(origin, "git add -A && git commit -qm notes");
  checkedAgent({}, mine);
  const again = autofork(mine, "sync");
  expect(again.output.result).toBe("synced");
  expect(file(home, "agent-runs.log")).toBe("");
  expect(file(mine, "lock.txt")).toContain('locked   "b": "1",');
});

test("a patch fixed for verify keeps a later patch upstream merged as is paused", () => {
  const origin = join(home, "merged-later");
  const mine = join(home, "merged-later-fork");
  mkdirSync(origin);
  write(origin, "name.js", 'export const who = () => "world";\n');
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} merged-later-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-loud",
    "loud.js has loud(), the name in upper case.",
    () =>
      write(
        mine,
        "loud.js",
        'import { who } from "./name.js";\nexport const loud = () => who().toUpperCase();\n',
      ),
    mine,
  );
  savePatch(
    "b-notes",
    "notes.txt has a second line.",
    () => write(mine, "notes.txt", "one\ntwo\n"),
    mine,
  );
  write(origin, "name.js", 'export const whom = () => "world";\n');
  write(origin, "notes.txt", "one\ntwo\n");
  sh(origin, "git commit -qam 'who is whom now, and notes has two lines'");
  const loud = `printf 'import { whom } from "./name.js";\\nexport const loud = () => whom().toUpperCase();\\n' > loud.js`;
  checkedAgent({ fix: fixup({ "b-notes": loud }) }, mine);
  const misplaced = autofork(mine, "sync");
  expect(misplaced.ok).toBe(false);
  expect(misplaced.log).toContain("the agent's fix changed b-notes, which upstream already has");
  checkedAgent(
    {
      fix: fixup({
        "a-loud": `printf 'import { whom } from "./name.js";\\nexport const loud = () => whom().toUpperCase();\\n' > loud.js`,
      }),
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed a-loud\nupstream has b-notes: the same change, line for line");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(file(home, "prompt-fix.txt")).toContain(
    "named by its id: a-loud, b-notes. Upstream already has b-notes: leave its commit empty.",
  );
  expect(sh(mine, "ls .autofork/b-notes")).toBe("PATCH.md\nUPSTREAM.md");
});

test("verify that fails on a rebuilt patch under one that applied cleanly fails the sync instead of paying for a fix", () => {
  const origin = join(home, "rebuilt-under");
  const mine = join(home, "rebuilt-under-fork");
  mkdirSync(origin);
  write(origin, "name.js", 'export const who = () => "world";\n');
  write(
    origin,
    "app.js",
    'import { who } from "./name.js";\nexport const greet = () => "hello " + who();\n',
  );
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} rebuilt-under-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-wave",
    "greet() waves at the end.",
    () =>
      write(
        mine,
        "app.js",
        'import { who } from "./name.js";\nexport const greet = () => "hello " + who() + " o/";\n',
      ),
    mine,
  );
  savePatch("b-notes", "notes.txt says hi.", () => write(mine, "notes.txt", "hi\n"), mine);
  write(origin, "name.js", 'export const whom = () => "world";\n');
  write(
    origin,
    "app.js",
    'import { whom } from "./name.js";\nexport const greet = () => "hello " + whom();\n',
  );
  sh(origin, "git commit -qam 'who is whom now'");
  checkedAgent(
    {
      "a-wave": `printf 'import { who } from "./name.js";\\nexport const greet = () => "hello " + who() + " o/";\\n' > app.js`,
      fix: "true",
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("verify fails with a-wave, which the agent healed");
  expect(file(home, "agent-runs.log")).toBe("a-wave\n");
});

test("a patch that still applies but fails verify because upstream now does it is paused by the fix", () => {
  const origin = join(home, "duplicated");
  const mine = join(home, "duplicated-fork");
  mkdirSync(origin);
  write(origin, "name.js", 'export const who = () => "world";\n');
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} duplicated-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-loud",
    "loud.js has loud(), the name in upper case.",
    () =>
      write(
        mine,
        "loud.js",
        'import { who } from "./name.js";\nexport const loud = () => who().toUpperCase();\n',
      ),
    mine,
  );
  write(
    origin,
    "name.js",
    'export const whom = () => "world";\nexport const loud = () => "WORLD";\n',
  );
  sh(origin, "git commit -qam 'name.js has loud() now'");
  checkedAgent(
    {
      fix: [
        "git reset -q --hard $(git log -1 --format=%H --grep='^upstream ')",
        "echo 'name.js exports loud()' > .autofork/a-loud/UPSTREAM.md",
        "git add -A && git commit -qm a-loud",
      ].join(" && "),
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("upstream has a-loud: name.js exports loud()");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(existsSync(join(mine, "loud.js"))).toBe(false);
  expect(sh(mine, "ls .autofork/a-loud")).toBe("PATCH.md\nUPSTREAM.md");
});

test("verify sees the generated files setup rebuilt for the patches under it", () => {
  const origin = join(home, "locked");
  const mine = join(home, "locked-fork");
  const setup = "sed 's/^/locked /' package.json > lock.txt";
  mkdirSync(origin);
  write(origin, "package.json", '{\n  "a": "1"\n}\n');
  sh(origin, `git init -q && ${setup} && git add -A && git commit -qm init`);
  sh(home, `git clone -q ${origin} locked-fork`);
  const verify = "sed 's/^/locked /' package.json | cmp - lock.txt";
  const unset = autofork(mine, "init", origin, "--generated", "lock.txt", "--verify", verify);
  expect(unset.log).toContain("--generated files are rebuilt by --setup, so set it too");
  expect(existsSync(join(mine, ".autofork"))).toBe(false);
  expect(
    autofork(
      mine,
      "init",
      origin,
      "--setup",
      setup,
      "--generated",
      "lock.txt,other.lock",
      "--verify",
      verify,
    ).ok,
  ).toBe(true);
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  expect(config).toMatchObject({ setup, generated: ["lock.txt", "other.lock"], verify });
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "dep-b",
    "The app depends on b.",
    () => {
      write(mine, "package.json", '{\n  "a": "1",\n  "b": "1"\n}\n');
      sh(mine, setup);
    },
    mine,
  );
  expect(file(mine, ".autofork/dep-b/dep-b.patch")).not.toContain("lock.txt");
  write(origin, "notes.txt", "one\n");
  sh(origin, "git add -A && git commit -qm notes");
  checkedAgent({}, mine);
  const { ok, output } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(output.result).toBe("synced");
  expect(file(home, "agent-runs.log")).toBe("");
  expect(file(mine, "lock.txt")).toContain('locked   "b": "1"');
});

function breaksSetup(name: string, verify?: string) {
  const origin = join(home, name);
  const mine = join(home, `${name}-fork`);
  const setup = `while read d; do test -f "pkgs/$d" || { echo "no package $d"; exit 1; }; done < deps.txt`;
  mkdirSync(join(origin, "pkgs"), { recursive: true });
  write(origin, "deps.txt", "a\n");
  write(origin, "pkgs/a", "");
  write(origin, "pkgs/b", "");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} ${name}-fork`);
  expect(autofork(mine, "init", origin, ...(verify ? ["--verify", verify] : [])).ok).toBe(true);
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  write(mine, ".autofork/config.json", `${JSON.stringify({ ...config, setup }, null, 2)}\n`);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch("dep-b", "The app depends on b.", () => write(mine, "deps.txt", "a\nb\n"), mine);
  sh(origin, "git mv pkgs/b pkgs/bee && git commit -qm 'b is bee now'");
  checkedAgent({ fix: fixup({ "dep-b": `printf 'a\\nbee\\n' > deps.txt` }) }, mine);
  const waiting = autofork(mine, "sync", "--no-heal");
  expect(waiting.output.result).toBe("waiting");
  expect(waiting.log).toContain("setup fails, so a patch needs rebuilding");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed dep-b");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  const prompt = file(home, "prompt-fix.txt");
  expect(prompt).toContain(`but \`${setup}\` fails with them. Its last lines:`);
  expect(prompt).not.toContain("Dependencies are installed");
  expect(prompt).toContain("no package b");
  expect(file(mine, "deps.txt")).toBe("a\nbee\n");
}

test("a patch that still applies but breaks setup is fixed like one that fails verify", () =>
  breaksSetup("installs", "test -f deps.txt"));

test("setup without verify is the check a sync has to pass", () => breaksSetup("installs-only"));

test("a patch the build needs is fixed when verify fails with it, even though upstream alone never passes verify", () => {
  const origin = join(home, "split");
  const mine = join(home, "split-fork");
  mkdirSync(origin);
  write(
    origin,
    "app.js",
    'import { who } from "./lib/name.js";\nexport const greet = () => "hello " + who();\n',
  );
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} split-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-standalone",
    "lib/name.js stands in for the monorepo's name package, so the app builds on its own.",
    () => {
      mkdirSync(join(mine, "lib"));
      write(mine, "lib/name.js", 'export const who = () => "world";\n');
      write(mine, "notes.txt", "one\nstandalone\n");
    },
    mine,
  );
  savePatch(
    "b-shout",
    "extra.js has shout(), the name in upper case.",
    () =>
      write(
        mine,
        "extra.js",
        'import { who } from "./lib/name.js";\nexport const shout = () => who().toUpperCase();\n',
      ),
    mine,
  );
  write(
    origin,
    "app.js",
    'import { whom } from "./lib/name.js";\nexport const greet = () => "hello " + whom();\n',
  );
  sh(origin, "git commit -qam 'greet whom'");
  checkedAgent(
    {
      fix: fixup({
        "a-standalone": `printf 'export const who = () => "world";\\nexport const whom = who;\\n' > lib/name.js`,
      }),
    },
    mine,
  );
  const failed = autofork(mine, "sync");
  expect(failed.ok).toBe(true);
  expect(failed.log).toContain(
    "verify fails on upstream alone where the fork was too, so the patches are what make it pass",
  );
  expect(failed.log).toContain("healed a-standalone");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(file(home, "prompt-fix.txt")).toContain("named by its id: a-standalone, b-shout.");
  expect(file(mine, "lib/name.js")).toContain("export const whom = who;");
  expect(file(mine, "extra.js")).toContain("who().toUpperCase()");

  write(origin, "notes.txt", "uno\n");
  sh(origin, "git commit -qam 'notes in spanish'");
  checkedAgent(
    {
      "a-standalone": `grep -q '^<<<<<<< ours' notes.txt || exit 1; printf 'uno\\nstandalone\\n' > notes.txt`,
    },
    mine,
  );
  const drifted = autofork(mine, "sync");
  expect(drifted.ok).toBe(true);
  expect(drifted.log).toContain("healed a-standalone");
  expect(file(home, "agent-runs.log")).toBe("a-standalone\n");
  expect(file(mine, "notes.txt")).toBe("uno\nstandalone\n");
  expect(file(mine, "lib/name.js")).toContain("export const whom = who;");
});

test("a rebuild under the patch that makes upstream build doesn't pay for a fix on the stack below it", () => {
  const origin = join(home, "split-later");
  const mine = join(home, "split-later-fork");
  mkdirSync(origin);
  write(
    origin,
    "app.js",
    'import { who } from "./lib/name.js";\nexport const greet = () => "hello " + who();\n',
  );
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} split-later-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-extra",
    "extra.js says hi.",
    () => write(mine, "extra.js", "export const hi = 1;\n"),
    mine,
  );
  savePatch(
    "b-notes",
    "notes.txt has a second line.",
    () => write(mine, "notes.txt", "one\ntwo\n"),
    mine,
  );
  savePatch(
    "c-standalone",
    "lib/name.js stands in for the monorepo's name package, so the app builds on its own.",
    () => {
      mkdirSync(join(mine, "lib"));
      write(mine, "lib/name.js", 'export const who = () => "world";\n');
    },
    mine,
  );
  write(origin, "notes.txt", "uno\n");
  sh(origin, "git commit -qam 'notes in spanish'");
  checkedAgent({ "b-notes": "printf 'uno\\ntwo\\n' > notes.txt", fix: "true" }, mine);
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed b-notes");
  expect(file(home, "agent-runs.log")).toBe("b-notes\n");
  expect(file(mine, "notes.txt")).toBe("uno\ntwo\n");
});

test("a fork without patches whose upstream never passes verify fails the sync instead of pushing", () => {
  const origin = join(home, "unpatched");
  const mine = join(home, "unpatched-fork");
  mkdirSync(origin);
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} unpatched-fork`);
  expect(autofork(mine, "init", origin, "--verify", "false").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  write(origin, "notes.txt", "two\n");
  sh(origin, "git commit -qam two");
  const head = sh(mine, "git rev-parse HEAD");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain(
    `verify fails on upstream ${sh(origin, "git rev-parse HEAD").slice(0, 12)} itself`,
  );
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);
});

test("a fork with only its upstream gets the setup and verify its first agent picks from upstream's CI", () => {
  const origin = join(home, "bare");
  const mine = join(home, "bare-fork");
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  write(origin, ".gitignore", "*.patch\nconfig.json\n*.md\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} bare-fork`);
  const script = join(home, "bare-agent.sh");
  write(
    home,
    "bare-agent.sh",
    `cat > ${join(home, "bare-prompt.txt")}
sed -i 's/+ name/+ name.toUpperCase()/' app.js
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, setup: "echo installed", verify: "node --check app.js && echo verified" }))'
`,
  );
  mkdirSync(join(mine, ".autofork/shout"), { recursive: true });
  write(mine, ".autofork/config.json", JSON.stringify({ upstream: origin, agent: `sh ${script}` }));
  write(mine, ".autofork/shout/PATCH.md", "greet() shouts the name.\n");
  sh(
    mine,
    "git add -A && git add -f .autofork && git commit -qm 'autofork: greet() shouts the name'",
  );

  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(file(home, "bare-prompt.txt")).toContain(
    'write those commands to .autofork/config.json as "setup" and "verify"',
  );
  expect(log).toContain("built shout");
  expect(log).toContain("setup: echo installed");
  expect(log).toContain("verified");
  expect(JSON.parse(file(mine, ".autofork/config.json"))).toEqual({
    upstream: origin,
    agent: `sh ${script}`,
    follow: "main",
    setup: "echo installed",
    verify: "node --check app.js && echo verified",
    provisional: { setup: "echo installed", verify: "node --check app.js && echo verified" },
  });
  expect(sh(mine, "git ls-files .autofork").split("\n")).toEqual(
    expect.arrayContaining([
      ".autofork/config.json",
      ".autofork/shout/PATCH.md",
      ".autofork/shout/shout.patch",
    ]),
  );

  write(origin, "notes.txt", "two\n");
  sh(origin, "git add -A && git commit -qm notes");
  const later = autofork(mine, "sync");
  expect(later.ok).toBe(true);
  expect(later.log).toContain("verified");
  expect(JSON.parse(file(mine, ".autofork/config.json")).provisional).toBeUndefined();
});

function handmade(name: string) {
  const origin = join(home, name);
  const mine = join(home, `${name}-fork`);
  const tool = join(home, `${name}-tool`);
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} ${name}-fork`);
  const script = join(home, `${name}-agent.sh`);
  const agent = (verify: string, edit = "sed -i 's/+ name/+ name.toUpperCase()/' app.js") =>
    write(
      home,
      `${name}-agent.sh`,
      `cat > ${join(home, `${name}-prompt.txt`)}
touch ${tool}
${edit}
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, verify: process.argv[1] }))' '${verify}'
`,
    );
  agent(`test -f ${tool}`);
  mkdirSync(join(mine, ".autofork/shout"), { recursive: true });
  write(mine, ".autofork/config.json", JSON.stringify({ upstream: origin, agent: `sh ${script}` }));
  write(mine, ".autofork/shout/PATCH.md", "greet() shouts the name.\n");
  sh(mine, "git add -A && git commit -qm 'autofork: greet() shouts the name'");
  expect(autofork(mine, "sync").ok).toBe(true);
  expect(JSON.parse(file(mine, ".autofork/config.json")).provisional).toEqual({
    verify: `test -f ${tool}`,
  });
  rmSync(tool);
  return { origin, mine, tool, script, agent };
}

test("the agent's checks failing on upstream alone in two later syncs are skipped, then dropped, and the syncs ship", () => {
  const { origin, mine, tool, script } = handmade("handmade");
  write(origin, "notes.txt", "two\n");
  sh(origin, "git add -A && git commit -qm notes");
  write(home, "handmade-agent.sh", "exit 1\n");
  const first = autofork(mine, "sync");
  expect(first.ok).toBe(true);
  expect(first.log).toContain(
    `\`test -f ${tool}\` fails on upstream alone, so this sync skips the checks an agent picked`,
  );
  expect(file(mine, "notes.txt")).toBe("two\n");
  expect(JSON.parse(file(mine, ".autofork/config.json")).provisional).toEqual({
    verify: `test -f ${tool}`,
    failed: sh(origin, "git rev-parse HEAD").slice(0, 12),
  });
  write(origin, "notes.txt", "three\n");
  sh(origin, "git commit -qam notes");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain(
    `\`test -f ${tool}\` fails on upstream alone in a second sync, so the checks an agent picked are dropped`,
  );
  expect(file(mine, "notes.txt")).toBe("three\n");
  expect(file(mine, "app.js")).toContain("name.toUpperCase()");
  expect(JSON.parse(file(mine, ".autofork/config.json"))).toEqual({
    upstream: origin,
    agent: `sh ${script}`,
    follow: "main",
  });
});

test("the agent's checks failing on upstream alone are skipped before it rebuilds a patch, and it picks new ones", () => {
  const { origin, mine, agent } = handmade("rehandmade");
  write(origin, "app.js", 'export const greet = (name) => "hi " + name;\n');
  sh(origin, "git commit -qam hi");
  agent(
    "node --check app.js",
    `printf 'export const greet = (name) => "hi " + name.toUpperCase();\\n' > app.js`,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("skips the checks an agent picked");
  expect(file(home, "rehandmade-prompt.txt")).toContain("This fork has no check yet");
  expect(file(mine, "app.js")).toContain('"hi " + name.toUpperCase()');
  expect(JSON.parse(file(mine, ".autofork/config.json")).provisional).toEqual({
    verify: "node --check app.js",
  });
});

test("an agent that picks no checks in a sync that skipped them doesn't get them back as its pick", () => {
  const { origin, mine, tool } = handmade("stale");
  write(origin, "app.js", 'export const greet = (name) => "hi " + name;\n');
  sh(origin, "git commit -qam hi");
  write(
    home,
    "stale-agent.sh",
    `cat > /dev/null\nprintf 'export const greet = (name) => "hi " + name.toUpperCase();\\n' > app.js\n`,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("skips the checks an agent picked");
  expect(log).not.toContain("aren't kept");
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  expect(config.verify).toBe(`test -f ${tool}`);
  expect(config.provisional.failed).toBe(sh(origin, "git rev-parse HEAD").slice(0, 12));
});

test("an agent's setup counts as the user's once they own verify, so it's never skipped", () => {
  const { origin, mine, tool } = handmade("leftover");
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  const setup = `test -f ${tool}`;
  write(
    mine,
    ".autofork/config.json",
    JSON.stringify({ ...config, setup, verify: "echo mine-ran", provisional: { setup } }),
  );
  sh(mine, "git commit -qam 'my verify'");
  write(origin, "notes.txt", "two\n");
  sh(origin, "git add -A && git commit -qm notes");
  write(home, "leftover-agent.sh", "exit 1\n");
  const head = sh(mine, "git rev-parse HEAD");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).not.toContain("skips the checks");
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);
});

test("a skipped pick is out of the way before the agent fixes the patches for the user's check", () => {
  const { origin, mine } = handmade("blame");
  write(origin, "check.sh", "! grep -qs mark mark.txt\n");
  sh(origin, "git add -A && git commit -qm check");
  mkdirSync(join(mine, ".autofork/zmark"));
  write(mine, ".autofork/zmark/PATCH.md", "Marks the fork.\n");
  write(mine, "mark.txt", "mark\n");
  expect(autofork(mine, "save", "zmark").ok).toBe(true);
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  write(mine, ".autofork/config.json", JSON.stringify({ ...config, setup: "sh check.sh" }));
  sh(mine, "git add -A && git commit -qm 'mark, and my setup'");
  write(home, "blame-agent.sh", "exit 1\n");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log.indexOf("skips the checks an agent picked")).toBeGreaterThan(-1);
  expect(log.indexOf("skips the checks an agent picked")).toBeLessThan(
    log.indexOf("fixing setup in the patches"),
  );
});

test("a pick that fails on upstream alone in one sync and passes in the next is kept and proven", () => {
  const { origin, mine } = handmade("flaky");
  const runs = join(home, "flaky-runs");
  const verify = `n=$(cat ${runs} 2>/dev/null || echo 0); echo $((n + 1)) > ${runs}; [ $n -ge 1 ]`;
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  write(
    mine,
    ".autofork/config.json",
    JSON.stringify({ ...config, verify, provisional: { verify } }),
  );
  sh(mine, "git commit -qam 'flaky verify'");
  write(origin, "notes.txt", "two\n");
  sh(origin, "git add -A && git commit -qm notes");
  expect(autofork(mine, "sync").log).toContain("skips the checks an agent picked");
  write(origin, "notes.txt", "three\n");
  sh(origin, "git commit -qam notes");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).not.toContain("are dropped");
  const saved = JSON.parse(file(mine, ".autofork/config.json"));
  expect(saved.verify).toBe(verify);
  expect(saved.provisional).toBeUndefined();
});

test("the agent's checks are proven by a later sync that passes them on upstream alone, even when an agent runs in it", () => {
  const { origin, mine, tool } = handmade("rerun");
  write(origin, "app.js", 'export const greet = (name) => "hi " + name;\n');
  sh(origin, "git commit -qam hi");
  write(
    home,
    "rerun-agent.sh",
    `cat > /dev/null\ntouch ${tool}\nprintf 'export const greet = (name) => "hi " + name.toUpperCase();\\n' > app.js\n`,
  );
  sh(home, `touch ${tool}`);
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed shout");
  const saved = JSON.parse(file(mine, ".autofork/config.json"));
  expect(saved.verify).toBe(`test -f ${tool}`);
  expect(saved.provisional).toBeUndefined();
});

test("a pick the user deletes stays deleted", () => {
  const { origin, mine } = handmade("deleted");
  const { verify, ...rest } = JSON.parse(file(mine, ".autofork/config.json"));
  expect(verify).toBeTruthy();
  write(mine, ".autofork/config.json", JSON.stringify(rest));
  sh(mine, "git commit -qam 'no verify'");
  write(origin, "notes.txt", "two\n");
  sh(origin, "git add -A && git commit -qm notes");
  expect(autofork(mine, "sync").ok).toBe(true);
  const saved = JSON.parse(file(mine, ".autofork/config.json"));
  expect(saved.verify).toBeUndefined();
  expect(saved.provisional).toBeUndefined();
});

test("a pick that fails once a later patch is in is dropped, and no patch is rebuilt for it", () => {
  const origin = join(home, "later");
  const mine = join(home, "later-fork");
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} later-fork`);
  const script = join(home, "later-agent.sh");
  write(
    home,
    "later-agent.sh",
    `echo ran >> ${join(home, "later-runs.log")}
cat > /dev/null
sed -i 's/+ name/+ name.toUpperCase()/' app.js
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, verify: "! grep -qs mark mark.txt" }))'
`,
  );
  mkdirSync(join(mine, ".autofork/a-shout"), { recursive: true });
  mkdirSync(join(mine, ".autofork/b-mark"), { recursive: true });
  write(mine, ".autofork/config.json", JSON.stringify({ upstream: origin, agent: `sh ${script}` }));
  write(mine, ".autofork/a-shout/PATCH.md", "greet() shouts the name.\n");
  write(mine, ".autofork/b-mark/PATCH.md", "Marks the fork.\n");
  write(mine, "mark.txt", "mark\n");
  expect(autofork(mine, "save", "b-mark").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'shout and mark'");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("`! grep -qs mark mark.txt` fails with the patches");
  expect(file(home, "later-runs.log")).toBe("ran\n");
  expect(file(mine, "app.js")).toContain("name.toUpperCase()");
  expect(JSON.parse(file(mine, ".autofork/config.json")).verify).toBeUndefined();
});

test("a pick the agent removes in a sync that skipped it stays removed", () => {
  const origin = join(home, "removed");
  const mine = join(home, "removed-fork");
  const tool = join(home, "removed-tool");
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} removed-fork`);
  const script = join(home, "removed-agent.sh");
  const agent = (edit: string, checks: string) =>
    write(
      home,
      "removed-agent.sh",
      `cat > /dev/null\ntouch ${tool}\n${edit}\nnode -e 'const fs = require("fs"); const { setup, verify, ...c } = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, ...${checks} }))'\n`,
    );
  agent(
    "sed -i 's/+ name/+ name.toUpperCase()/' app.js",
    `{ setup: "test -f ${tool}", verify: "true" }`,
  );
  mkdirSync(join(mine, ".autofork/shout"), { recursive: true });
  write(mine, ".autofork/config.json", JSON.stringify({ upstream: origin, agent: `sh ${script}` }));
  write(mine, ".autofork/shout/PATCH.md", "greet() shouts the name.\n");
  sh(mine, "git add -A && git commit -qm 'autofork: greet() shouts the name'");
  expect(autofork(mine, "sync").ok).toBe(true);
  rmSync(tool);
  write(origin, "app.js", 'export const greet = (name) => "hi " + name;\n');
  sh(origin, "git commit -qam hi");
  agent(
    `printf 'export const greet = (name) => "hi " + name.toUpperCase();\\n' > app.js`,
    `{ verify: "node --check app.js" }`,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("skips the checks an agent picked");
  const saved = JSON.parse(file(mine, ".autofork/config.json"));
  expect(saved.setup).toBeUndefined();
  expect(saved.verify).toBe("node --check app.js");
  expect(saved.provisional).toEqual({ verify: "node --check app.js" });
});

test("an unproven pick that still fails after the agent fixes the user's check is dropped, and the fix ships", () => {
  const origin = join(home, "afterfix");
  const mine = join(home, "afterfix-fork");
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  write(origin, "check.sh", "true\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} afterfix-fork`);
  const verify = "! grep -qs fixed mark.txt";
  write(
    home,
    "afterfix-agent.sh",
    "cat > /dev/null\nprintf 'fixed\\n' > mark.txt\ngit -c user.name=a -c user.email=a@a commit -qa --amend --no-edit\n",
  );
  mkdirSync(join(mine, ".autofork/mark"), { recursive: true });
  write(
    mine,
    ".autofork/config.json",
    JSON.stringify({
      upstream: origin,
      agent: `sh ${join(home, "afterfix-agent.sh")}`,
      setup: "sh check.sh",
      verify,
      provisional: { verify },
    }),
  );
  write(mine, ".autofork/mark/PATCH.md", "Marks the fork.\n");
  write(mine, "mark.txt", "mark\n");
  expect(autofork(mine, "save", "mark").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm mark");
  write(origin, "check.sh", "! grep -qs mark mark.txt\n");
  sh(origin, "git commit -qam check");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("fixing setup in the patches");
  expect(log).toContain(`\`${verify}\` fails with the patches`);
  expect(file(mine, "mark.txt")).toBe("fixed\n");
  expect(JSON.parse(file(mine, ".autofork/config.json")).verify).toBeUndefined();
});

test("a setup picked in one rebuild stays provisional when a later rebuild picks verify", () => {
  const origin = join(home, "picksplit");
  const mine = join(home, "picksplit-fork");
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} picksplit-fork`);
  const script = join(home, "picksplit-agent.sh");
  write(
    home,
    "picksplit-agent.sh",
    `cat > /dev/null
if grep -q toUpperCase app.js; then
  echo marked > mark.txt
  node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, verify: "node --check app.js" }))'
else
  sed -i 's/+ name/+ name.toUpperCase()/' app.js
  node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, setup: "echo installed" }))'
fi
`,
  );
  mkdirSync(join(mine, ".autofork/a-shout"), { recursive: true });
  mkdirSync(join(mine, ".autofork/b-mark"), { recursive: true });
  write(mine, ".autofork/config.json", JSON.stringify({ upstream: origin, agent: `sh ${script}` }));
  write(mine, ".autofork/a-shout/PATCH.md", "greet() shouts the name.\n");
  write(mine, ".autofork/b-mark/PATCH.md", "Marks the fork.\n");
  sh(mine, "git add -A && git commit -qm 'shout and mark'");
  expect(autofork(mine, "sync").ok).toBe(true);
  expect(JSON.parse(file(mine, ".autofork/config.json")).provisional).toEqual({
    setup: "echo installed",
    verify: "node --check app.js",
  });
});

test("a second failure on the same upstream commit skips the picks again instead of dropping them", () => {
  const { origin, mine } = handmade("samecommit");
  write(origin, "notes.txt", "two\n");
  sh(origin, "git add -A && git commit -qm notes");
  write(home, "samecommit-agent.sh", "exit 1\n");
  expect(autofork(mine, "sync").log).toContain("skips the checks an agent picked");
  mkdirSync(join(mine, ".autofork/wave"));
  write(mine, ".autofork/wave/PATCH.md", "greet() waves.\n");
  sh(mine, "git add -A && git commit -qm 'autofork: greet() waves'");
  const { log } = autofork(mine, "sync");
  expect(log).toContain("skips the checks an agent picked");
  expect(log).not.toContain("are dropped");
});

test("picks proven on upstream alone that fail with the patches are dropped, not fixed for", () => {
  const { origin, mine } = handmade("provenfail");
  const verify = "! grep -q toUpperCase app.js";
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  write(
    mine,
    ".autofork/config.json",
    JSON.stringify({ ...config, verify, provisional: { verify } }),
  );
  sh(mine, "git commit -qam 'a pick'");
  write(origin, "notes.txt", "two\n");
  sh(origin, "git add -A && git commit -qm notes");
  write(home, "provenfail-agent.sh", "exit 1\n");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain(`\`${verify}\` fails with the patches`);
  expect(log).not.toContain("fixing");
  expect(JSON.parse(file(mine, ".autofork/config.json")).verify).toBeUndefined();
});

test("a pick made after a proven one is dropped in the same sync stays unproven", () => {
  const origin = join(home, "replaced");
  const mine = join(home, "replaced-fork");
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  write(origin, "b.txt", "one\n");
  write(origin, "check.sh", "true\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} replaced-fork`);
  const script = join(home, "replaced-agent.sh");
  const runs = join(home, "replaced-runs");
  const pick = (verify: string) =>
    `node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, verify: "${verify}" }))'`;
  write(
    home,
    "replaced-agent.sh",
    `cat > /dev/null
if [ -f ${runs} ]; then
  printf 'two\\nmark\\n' > b.txt
  ${pick("node --check app.js")}
else
  touch ${runs}
  sed -i 's/+ name/+ name.toUpperCase()/' app.js
  ${pick("sh check.sh")}
fi
`,
  );
  mkdirSync(join(mine, ".autofork/a-shout"), { recursive: true });
  mkdirSync(join(mine, ".autofork/b-mark"), { recursive: true });
  write(mine, ".autofork/config.json", JSON.stringify({ upstream: origin, agent: `sh ${script}` }));
  write(mine, ".autofork/a-shout/PATCH.md", "greet() shouts the name.\n");
  write(mine, ".autofork/b-mark/PATCH.md", "Marks b.txt.\n");
  write(mine, "b.txt", "one\nmark\n");
  expect(autofork(mine, "save", "b-mark").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'shout and mark'");
  expect(autofork(mine, "sync").ok).toBe(true);
  expect(JSON.parse(file(mine, ".autofork/config.json")).provisional).toEqual({
    verify: "sh check.sh",
  });
  write(origin, "check.sh", "! grep -q toUpperCase app.js\n");
  write(origin, "b.txt", "two\n");
  sh(origin, "git commit -qam 'check and two'");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("`sh check.sh` fails with the patches");
  expect(JSON.parse(file(mine, ".autofork/config.json")).provisional).toEqual({
    verify: "node --check app.js",
  });
});

test("an unproven pick failing on a rebuilt patch doesn't get that patch blamed for the user's check", () => {
  const origin = join(home, "blamed");
  const mine = join(home, "blamed-fork");
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  write(origin, "check.sh", "true\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} blamed-fork`);
  const runs = join(home, "blamed-runs");
  write(
    home,
    "blamed-agent.sh",
    `cat > /dev/null
if [ -f ${runs} ]; then
  printf 'fixed\\n' > mark.txt
  git -c user.name=a -c user.email=a@a commit -qa --amend --no-edit
else
  touch ${runs}
  sed -i 's/+ name/+ name.toUpperCase()/' app.js
  node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, verify: "! grep -q toUpperCase app.js" }))'
fi
`,
  );
  mkdirSync(join(mine, ".autofork/a-shout"), { recursive: true });
  mkdirSync(join(mine, ".autofork/b-mark"), { recursive: true });
  write(
    mine,
    ".autofork/config.json",
    JSON.stringify({
      upstream: origin,
      agent: `sh ${join(home, "blamed-agent.sh")}`,
      setup: "sh check.sh",
    }),
  );
  write(mine, ".autofork/a-shout/PATCH.md", "greet() shouts the name.\n");
  write(mine, ".autofork/b-mark/PATCH.md", "Marks the fork.\n");
  write(mine, "mark.txt", "mark\n");
  expect(autofork(mine, "save", "b-mark").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'shout and mark'");
  write(origin, "check.sh", "! grep -qs mark mark.txt\n");
  sh(origin, "git commit -qam check");
  const { ok, log } = autofork(mine, "sync");
  expect(log).not.toContain("which the agent built");
  expect(log).toContain("fixing setup in the patches");
  expect(ok).toBe(true);
  expect(file(mine, "mark.txt")).toBe("fixed\n");
});

test("a check the user changed from the agent's pick is never dropped", () => {
  const { origin, mine, tool } = handmade("edited");
  const config = JSON.parse(file(mine, ".autofork/config.json"));
  write(mine, ".autofork/config.json", JSON.stringify({ ...config, verify: `test -e ${tool}` }));
  sh(mine, "git commit -qam 'my verify'");
  write(origin, "notes.txt", "two\n");
  sh(origin, "git add -A && git commit -qm notes");
  write(home, "edited-agent.sh", "exit 1\n");
  const head = sh(mine, "git rev-parse HEAD");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).not.toContain("dropped");
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);
});

function pickedChecksFail(name: string, verify: string, where: string) {
  const origin = join(home, name);
  const mine = join(home, `${name}-fork`);
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  write(origin, ".gitignore", "config.json\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} ${name}-fork`);
  const script = join(home, `${name}-agent.sh`);
  write(
    home,
    `${name}-agent.sh`,
    `cat > /dev/null
sed -i 's/+ name/+ name.toUpperCase()/' app.js
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, verify: process.argv[1] }))' '${verify}'
`,
  );
  mkdirSync(join(mine, ".autofork/shout"), { recursive: true });
  write(mine, ".autofork/config.json", JSON.stringify({ upstream: origin, agent: `sh ${script}` }));
  write(mine, ".autofork/shout/PATCH.md", "greet() shouts the name.\n");
  sh(
    mine,
    "git add -A && git add -f .autofork && git commit -qm 'autofork: greet() shouts the name'",
  );

  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("built shout");
  expect(log).toContain(
    `\`${verify}\` fails ${where}, so the unproven checks an agent picked aren't kept`,
  );
  expect(file(mine, "app.js")).toContain("name.toUpperCase()");
  expect(JSON.parse(file(mine, ".autofork/config.json")).verify).toBeUndefined();
}

test("checks the agent picks that fail on upstream alone aren't kept", () =>
  pickedChecksFail("picky", "grep -q toUpperCase app.js", "on upstream alone"));

test("checks the agent picks that fail with its patch aren't kept, and the patch ships", () =>
  pickedChecksFail("picky-patch", "! grep -q toUpperCase app.js", "with the patches"));
