#!/usr/bin/env node

// src/autopatch.ts
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join } from "node:path";
var DIR = ".autopatch";
var CONTROL = [DIR, ".github"];
var SOURCE = [".", ...CONTROL.map((path) => `:(exclude)${path}`)];
var BOT = [
  "-c",
  "user.name=autopatch",
  "-c",
  "user.email=autopatch@users.noreply.github.com",
  "-c",
  "commit.gpgsign=false"
];
var RED = ["failure", "timed_out", "action_required", "startup_failure"];

class Failure extends Error {
}
function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, maxBuffer: 1 << 30 });
  return { ok: result.status === 0, out: result.stdout, err: result.stderr?.toString().trim() ?? "" };
}
function git(cwd, ...args) {
  return gitWith(cwd, undefined, ...args);
}
function gitWith(cwd, env, ...args) {
  const result = run("git", args, cwd, env);
  if (!result.ok)
    throw new Failure(`git ${args.join(" ")}
${result.err}`);
  return result.out.toString().trim();
}
function gitBytes(cwd, ...args) {
  const result = run("git", args, cwd);
  if (!result.ok)
    throw new Failure(`git ${args.join(" ")}
${result.err}`);
  return result.out;
}
function shell(command, cwd, input) {
  const stdin = input === undefined ? "inherit" : "pipe";
  return spawnSync("sh", ["-c", command], { cwd, input, stdio: [stdin, "inherit", "inherit"] }).status === 0;
}
var say = (line) => console.error(line);
var flag = (args, name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
var short = (sha) => sha.slice(0, 12);
var patchFile = (dir, id) => join(dir, DIR, id, `${id}.patch`);
var patchDoc = (dir, id) => join(dir, DIR, id, "PATCH.md");
var configFile = (dir) => join(dir, DIR, "config.json");
function output(values) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file)
    return;
  writeFileSync(file, Object.entries(values).map(([key, value]) => `${key}=${value}
`).join(""), { flag: "a" });
}
function readConfig(root) {
  if (!existsSync(configFile(root))) {
    throw new Failure("no .autopatch/config.json here. Start with: autopatch init <owner/repo>");
  }
  return { branch: "main", patches: [], ...JSON.parse(readFileSync(configFile(root), "utf8")) };
}
function writeConfig(dir, config) {
  mkdirSync(join(dir, DIR), { recursive: true });
  writeFileSync(configFile(dir), `${JSON.stringify(config, null, 2)}
`);
}
function githubRepo(upstream) {
  return upstream.match(/^(?:https:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1];
}
function upstreamUrl(upstream) {
  return /^[\w.-]+\/[\w.-]+$/.test(upstream) ? `https://github.com/${upstream}.git` : upstream;
}
function fetchUpstream(root, config) {
  git(root, "fetch", "--quiet", "--no-tags", upstreamUrl(config.upstream), `+refs/heads/${config.branch}:refs/autopatch/upstream`);
  return git(root, "rev-parse", "refs/autopatch/upstream");
}
function baseline(root) {
  const base = run("git", ["merge-base", "HEAD", "refs/autopatch/upstream"], root);
  if (!base.ok)
    throw new Failure("this branch shares no history with upstream");
  return base.out.toString().trim();
}
async function newestGreen(root, config, tip) {
  const repo = githubRepo(config.upstream);
  if (config.green === false || !repo)
    return tip;
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const headers = { accept: "application/vnd.github+json" };
  if (token)
    headers.authorization = `Bearer ${token}`;
  for (const sha of git(root, "rev-list", "--first-parent", "--max-count=30", tip).split(`
`)) {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100`, { headers });
    if (!response.ok) {
      say(`can't read upstream checks (${response.status}), using upstream's tip`);
      return tip;
    }
    const conclusions = (await response.json()).check_runs.map((check) => check.conclusion);
    if (conclusions.includes(null) || conclusions.some((conclusion) => RED.includes(conclusion)))
      continue;
    if (sha !== tip)
      say(`upstream's tip isn't green yet, using ${short(sha)}`);
    return sha;
  }
  throw new Failure(`none of upstream's last 30 commits passed its checks. Set "green": false to sync anyway`);
}
function intent(root, id) {
  const doc = existsSync(patchDoc(root, id)) ? readFileSync(patchDoc(root, id), "utf8") : "";
  const text = doc.match(/^## Intent\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1].trim();
  if (!text || text.startsWith("TODO"))
    throw new Failure(`${DIR}/${id}/PATCH.md needs an ## Intent: it's what the agent rebuilds the patch from`);
}
function frontmatterEnd(doc) {
  return doc.startsWith(`---
`) ? doc.indexOf(`
---`, 3) : -1;
}
function frontmatter(doc, key) {
  const end = frontmatterEnd(doc);
  return end < 0 ? undefined : doc.slice(0, end).match(new RegExp(`^${key}: *(.+)$`, "m"))?.[1].trim();
}
function setFrontmatter(doc, key, value) {
  const end = frontmatterEnd(doc);
  if (end < 0)
    return doc;
  const head = doc.slice(0, end);
  const line = new RegExp(`^${key}:.*$`, "m");
  const next = line.test(head) ? head.replace(line, `${key}: ${value}`) : `${head}
${key}: ${value}`;
  return next + doc.slice(end);
}
function touched(dir, file) {
  const stat = run("git", ["apply", "--numstat", file], dir);
  return stat.ok ? stat.out.toString().trim().split(`
`).filter(Boolean).map((line) => line.split("\t")[2]) : [];
}
function healPrompt(config, build, id, source) {
  const doc = readFileSync(patchDoc(build.dir, id), "utf8");
  const before = config.patches.slice(0, config.patches.indexOf(id));
  const old = frontmatter(doc, "baseline");
  const files = touched(build.dir, patchFile(build.dir, id));
  const changes = old && files.length ? `
To see what upstream changed under it: git diff ${old} ${source} -- ${files.join(" ")}` : "";
  return `You are keeping a patched fork of ${config.upstream} in sync. The fork is upstream plus a stack of patches, each one described in ${DIR}/<id>/PATCH.md.

This checkout is upstream at ${source}${before.length ? `, with ${before.join(", ")} already applied` : ""}. Upstream changed, and patch "${id}" no longer applies.

1. Read ${DIR}/${id}/PATCH.md. Its intent is the contract.
2. ${DIR}/${id}/${id}.patch is how it was done on the old source. Use it as a guide, not as text to force in.${changes}
3. Implement the intent on the current source: the smallest change that fully delivers it and keeps its invariants. Follow upstream's current code and conventions, and leave everything else alone.${config.verify ? `
4. Run \`${config.verify}\` and fix what your change breaks. Patches after this one aren't applied yet.` : ""}

Don't edit anything in ${DIR}/ or .github/, and don't commit. Leave only your source change: remove anything your checks generated that git would pick up.
If upstream now does what the intent asks on its own, change nothing and write one line saying how to ${DIR}/${id}/OBSOLETE.`;
}
function agentCommand(config) {
  if (config.agent)
    return config.agent;
  const claude = run("sh", ["-c", "command -v claude"], ".").ok ? "claude" : "npx -y @anthropic-ai/claude-code";
  return `${claude} -p --dangerously-skip-permissions`;
}
function restoreControl(dir, base) {
  const owned = git(dir, "ls-tree", "--name-only", base, "--", ...CONTROL).split(`
`).filter(Boolean);
  if (owned.length)
    git(dir, "checkout", base, "--", ...owned);
  git(dir, "clean", "-fdq", "--", ...CONTROL);
}
function changed(dir) {
  return git(dir, "status", "--porcelain").length > 0;
}
function heal(config, build, id, source) {
  const prompt = healPrompt(config, build, id, source);
  const obsolete = join(build.dir, DIR, id, "OBSOLETE");
  let nudge = "";
  for (let attempt = 1;attempt <= 2; attempt++) {
    say(`healing ${id}${attempt > 1 ? " (second try)" : ""}`);
    if (!shell(agentCommand(config), build.dir, prompt + nudge))
      throw new Failure(`the agent failed while healing ${id}`);
    git(build.dir, "reset", "--soft", "--quiet", build.steps.at(-1));
    const reason = existsSync(obsolete) ? readFileSync(obsolete, "utf8").trim() : "";
    restoreControl(build.dir, build.steps[0]);
    if (changed(build.dir)) {
      build.healed.push(id);
      return;
    }
    if (reason) {
      build.dropped.set(id, reason);
      return;
    }
    nudge = `

Your last attempt exited without changing any source file. Implement the intent, or write ${DIR}/${id}/OBSOLETE if upstream already covers it.`;
  }
  throw new Failure(`the agent changed nothing while healing ${id}`);
}
function commit(dir, message) {
  git(dir, "add", "-A");
  git(dir, ...BOT, "commit", "--quiet", "--no-verify", "--allow-empty", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}
function apply(dir, file) {
  if (!existsSync(file) || readFileSync(file).length === 0)
    return true;
  if (run("git", ["apply", "--3way", "--whitespace=nowarn", file], dir).ok)
    return true;
  git(dir, "reset", "--hard", "--quiet");
  git(dir, "clean", "-fdq");
  return false;
}
function scratch(root) {
  const parent = process.env.RUNNER_TEMP ?? join(homedir(), ".cache");
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 8);
  return join(parent, "autopatch", `${basename(root)}-${hash}`);
}
function worktree(root, base) {
  const dir = scratch(root);
  if (existsSync(dir))
    run("git", ["worktree", "remove", "--force", dir], root);
  rmSync(dir, { recursive: true, force: true });
  git(root, "worktree", "prune");
  git(root, "worktree", "add", "--detach", "--quiet", dir, base);
  for (const path of CONTROL) {
    rmSync(join(dir, path), { recursive: true, force: true });
    if (existsSync(join(root, path)))
      cpSync(join(root, path), join(dir, path), { recursive: true });
  }
  return dir;
}
function build(root, config, base, options) {
  const dir = worktree(root, base);
  const build = { dir, steps: [commit(dir, `upstream ${short(base)}`)], healed: [], dropped: new Map };
  for (const id of config.patches) {
    if (!apply(dir, patchFile(dir, id))) {
      if (!options.heal)
        throw new Failure(`${id} doesn't apply to ${short(base)}`);
      heal(config, build, id, base);
    }
    if (options.fold?.id === id && !apply(dir, options.fold.patch)) {
      throw new Failure(`your changes don't apply on top of ${id}`);
    }
    build.steps.push(commit(dir, id));
  }
  return build;
}
function refresh(target, config, build, base) {
  config.patches.forEach((id, index) => {
    const diff = gitBytes(build.dir, "diff", "--binary", "--full-index", build.steps[index], build.steps[index + 1], "--", ...SOURCE);
    writeFileSync(patchFile(target, id), diff);
    if (existsSync(patchDoc(target, id))) {
      const doc = readFileSync(patchDoc(target, id), "utf8");
      writeFileSync(patchDoc(target, id), setFrontmatter(doc, "baseline", base));
    }
  });
  for (const id of build.dropped.keys())
    rmSync(join(target, DIR, id), { recursive: true, force: true });
  writeConfig(target, { ...config, patches: config.patches.filter((id) => !build.dropped.has(id)) });
}
function cleanup(root, build) {
  if (build)
    run("git", ["worktree", "remove", "--force", build.dir], root);
}
function workingTree(root) {
  const gitDir = git(root, "rev-parse", "--path-format=absolute", "--git-dir");
  const index = join(gitDir, "autopatch-index");
  const env = { ...process.env, GIT_INDEX_FILE: index };
  cpSync(join(gitDir, "index"), index);
  gitWith(root, env, "add", "-A");
  const tree = gitWith(root, env, "write-tree");
  rmSync(index, { force: true });
  return tree;
}
function check(root, config, against) {
  const base = baseline(root);
  const rebuilt = build(root, config, base, { heal: false });
  try {
    const drift = git(root, "diff", "--name-only", rebuilt.steps.at(-1), against, "--", ...SOURCE);
    return { base, rebuilt: rebuilt.steps.at(-1), drift: drift.split(`
`).filter(Boolean) };
  } finally {
    cleanup(root, rebuilt);
  }
}
async function sync(root, args) {
  const config = readConfig(root);
  config.patches.forEach((id) => intent(root, id));
  if (git(root, "status", "--porcelain"))
    throw new Failure("commit or stash your changes first");
  const tip = fetchUpstream(root, config);
  const { base, drift } = check(root, config, "HEAD");
  if (drift.length) {
    throw new Failure(`these files differ from what your patches build, so a sync would drop them:
  ${drift.join(`
  `)}
Capture them first: autopatch add <id>`);
  }
  const source = await newestGreen(root, config, tip);
  const key = `${short(source)}-${short(git(root, "rev-parse", `HEAD:${DIR}`))}`;
  output({ key });
  if (flag(args, "--skip") === key) {
    say(`already failed on upstream ${short(source)} with these patches, skipping until either changes`);
    return output({ result: "skipped" });
  }
  say(`upstream ${short(base)} → ${short(source)}, ${config.patches.length} patch${config.patches.length === 1 ? "" : "es"}`);
  let result;
  try {
    result = build(root, config, source, { heal: true });
    if (config.verify && !shell(config.verify, result.dir))
      throw new Failure(`verify failed: ${config.verify}`);
    git(result.dir, "reset", "--hard", "--quiet");
    git(result.dir, "clean", "-fdq");
    refresh(result.dir, config, result, source);
    const tree = git(result.dir, "rev-parse", `${commit(result.dir, "refresh")}^{tree}`);
    if (tree === git(root, "rev-parse", "HEAD^{tree}")) {
      say("already up to date");
      return output({ result: "current" });
    }
    const head = git(root, "rev-parse", "HEAD");
    const parents = ["-p", head];
    if (!run("git", ["merge-base", "--is-ancestor", source, head], root).ok)
      parents.push("-p", source);
    const lines = [
      ...result.healed.map((id) => `healed ${id}`),
      ...[...result.dropped].map(([id, reason]) => `dropped ${id}: ${reason}`)
    ];
    const message = [`autopatch: sync ${config.upstream} to ${short(source)}`, lines.join(`
`)].filter(Boolean).join(`

`);
    git(root, "merge", "--ff-only", "--quiet", git(root, "commit-tree", tree, ...parents, "-m", message));
    say(message);
    output({ result: "synced" });
  } finally {
    cleanup(root, result);
  }
}
async function add(root, args) {
  const id = args[0];
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    throw new Failure("usage: autopatch add <id> [summary]   (id like fix-login)");
  const config = readConfig(root);
  fetchUpstream(root, config);
  const files = workingTree(root);
  const { base, rebuilt, drift } = check(root, config, files);
  if (!drift.length)
    throw new Failure("nothing to capture: your files match what the patches already build");
  const captured = gitBytes(root, "diff", "--binary", "--full-index", rebuilt, files, "--", ...SOURCE);
  if (!config.patches.includes(id)) {
    mkdirSync(join(root, DIR, id), { recursive: true });
    writeFileSync(patchFile(root, id), captured);
    writeFileSync(patchDoc(root, id), `---
summary: ${args.slice(1).join(" ") || id}
baseline: ${base}
---

## Intent

TODO: what this patch does and why, in plain words. An agent rebuilds the patch from this when upstream changes.
`);
    writeConfig(root, { ...config, patches: [...config.patches, id] });
    return say(`captured ${drift.length} file${drift.length === 1 ? "" : "s"} in ${DIR}/${id}. Write its ## Intent, then commit.`);
  }
  const fold = join(git(root, "rev-parse", "--path-format=absolute", "--git-dir"), "autopatch-fold.patch");
  writeFileSync(fold, captured);
  const result = build(root, config, base, { heal: false, fold: { id, patch: fold } });
  try {
    refresh(root, config, result, base);
    say(`folded ${drift.length} file${drift.length === 1 ? "" : "s"} into ${id}. Commit when ready.`);
  } finally {
    rmSync(fold, { force: true });
    cleanup(root, result);
  }
}
var WORKFLOW = `name: autopatch

on:
  schedule:
    - cron: "17 6 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency: autopatch

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: false
      # Set up whatever your verify command needs here (node, bun, rust, ...).
      - uses: AVGVSTVS96/autopatch@v1
        env:
          CLAUDE_CODE_OAUTH_TOKEN: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
`;
async function init(root, args) {
  const upstream = args[0];
  if (!upstream)
    throw new Failure("usage: autopatch init <owner/repo | git url> [--verify <command>]");
  if (existsSync(configFile(root)))
    throw new Failure(`${DIR}/config.json already exists`);
  const head = run("git", ["ls-remote", "--symref", upstreamUrl(upstream), "HEAD"], root).out.toString();
  const branch = head.match(/^ref: refs\/heads\/(\S+)\s+HEAD/m)?.[1] ?? "main";
  const verify = flag(args, "--verify");
  const config = { upstream, branch, ...verify && { verify }, patches: [] };
  writeConfig(root, config);
  const workflow = join(root, ".github/workflows/autopatch.yml");
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  if (!existsSync(workflow))
    writeFileSync(workflow, WORKFLOW);
  fetchUpstream(root, config);
  const { drift } = check(root, config, workingTree(root));
  const inherited = git(root, "ls-files", ".github/workflows").split(`
`).filter((file) => file && !file.endsWith("/autopatch.yml"));
  say(`autopatch tracks ${upstream} (${branch}).`);
  if (inherited.length)
    say(`Your fork has ${inherited.length} workflow${inherited.length === 1 ? "" : "s"} copied from upstream, and they run here too. Delete the ones you don't want; upstream's new ones never get copied in.`);
  if (drift.length)
    say(`Your branch already changes ${drift.length} file${drift.length === 1 ? "" : "s"}. Capture them: autopatch add <id>`);
  say("Add a CLAUDE_CODE_OAUTH_TOKEN secret (claude setup-token), commit, and push.");
}
async function status(root) {
  const config = readConfig(root);
  fetchUpstream(root, config);
  const { base, drift } = check(root, config, workingTree(root));
  const behind = git(root, "rev-list", "--count", "--first-parent", `${base}..refs/autopatch/upstream`);
  say(`${config.upstream} at ${short(base)}, ${behind} commit${behind === "1" ? "" : "s"} behind upstream`);
  for (const id of config.patches)
    say(`  ${id}`);
  if (drift.length)
    say(`not in any patch yet:
  ${drift.join(`
  `)}`);
}
var USAGE = `autopatch: keep your changes on top of someone else's repo

  autopatch init <owner/repo>   track an upstream repo from this fork
  autopatch add <id> [summary]  turn your changes into a patch (or fold them into one)
  autopatch status              what's patched, and what isn't yet
  autopatch sync                rebuild on the latest upstream; an agent heals what drifts
`;
var commands = { init, add, status, sync };
async function main([name, ...args]) {
  const command = commands[name];
  if (!command)
    return void process.stdout.write(USAGE);
  const top = run("git", ["rev-parse", "--show-toplevel"], process.cwd());
  if (!top.ok)
    throw new Failure("run autopatch inside your fork's git checkout");
  await command(top.out.toString().trim(), args);
}
main(process.argv.slice(2)).catch((error) => {
  if (!(error instanceof Failure))
    throw error;
  say(`autopatch: ${error.message}`);
  process.exitCode = 1;
});
