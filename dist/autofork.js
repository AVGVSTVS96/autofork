#!/usr/bin/env node

// src/autofork.ts
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
var DIR = ".autofork";
var WORKFLOWS = ".github/workflows";
var CONTROL = [DIR, WORKFLOWS];
var SOURCE = [".", ...CONTROL.map((path) => `:(exclude)${path}`)];
var configs = Number(process.env.GIT_CONFIG_COUNT ?? 0);
var settings = [
  ["commit.gpgsign", "false"],
  ["rebase.autoStash", "true"]
];
var BOT = {
  ...process.env,
  GIT_AUTHOR_NAME: "autofork",
  GIT_AUTHOR_EMAIL: "autofork@users.noreply.github.com",
  GIT_COMMITTER_NAME: "autofork",
  GIT_COMMITTER_EMAIL: "autofork@users.noreply.github.com",
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true",
  GIT_CONFIG_COUNT: String(configs + settings.length),
  ...Object.fromEntries(settings.flatMap(([key, value], index) => [
    [`GIT_CONFIG_KEY_${configs + index}`, key],
    [`GIT_CONFIG_VALUE_${configs + index}`, value]
  ]))
};
var RED = ["failure", "timed_out", "action_required", "startup_failure"];
var MARKER = /^(<{7} ours|>{7} theirs)\r?$/m;

class Failure extends Error {
}

class Drifted extends Failure {
}
function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, maxBuffer: 1 << 30 });
  return {
    ok: result.status === 0,
    out: result.stdout,
    err: result.stderr?.toString().trim() ?? ""
  };
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
function shell(command, cwd, input, env) {
  const stdin = input === undefined ? "inherit" : "pipe";
  return spawnSync("sh", ["-c", command], { cwd, env, input, stdio: [stdin, "inherit", "inherit"] }).status === 0;
}
var say = (line) => console.error(line);
var flag = (args, name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
var short = (sha) => sha.slice(0, 12);
var patchFile = (dir, id) => join(dir, DIR, id, `${id}.patch`);
var patchDoc = (dir, id) => join(dir, DIR, id, "PATCH.md");
var upstreamDoc = (dir, id) => join(dir, DIR, id, "UPSTREAM.md");
var configFile = (dir) => join(dir, DIR, "config.json");
function output(values) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file)
    return;
  writeFileSync(file, Object.entries(values).map(([key, value]) => `${key}=${value}
`).join(""), { flag: "a" });
}
async function readConfig(root) {
  if (!existsSync(configFile(root))) {
    throw new Failure("no .autofork/config.json here. Start with: autofork init <owner/repo>");
  }
  const config = JSON.parse(readFileSync(configFile(root), "utf8"));
  if (config.generated?.length && !config.setup)
    throw new Failure(`"generated" files are rebuilt by "setup", so set it too in ${DIR}/config.json`);
  const follow = config.follow ?? await defaultFollow(root, config.upstream);
  return {
    ...config,
    follow,
    patches: discover(root).filter((id) => !existsSync(upstreamDoc(root, id)))
  };
}
function discover(root) {
  return readdirSync(join(root, DIR), { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(patchDoc(root, entry.name))).map((entry) => entry.name).sort();
}
function writeConfig(dir, { upstream, follow, setup, generated, verify, agent, green }) {
  mkdirSync(join(dir, DIR), { recursive: true });
  writeFileSync(configFile(dir), `${JSON.stringify({ upstream, follow, setup, generated, verify, agent, green }, null, 2)}
`);
  keepPatches(dir);
}
function keepPatches(dir) {
  const file = join(dir, DIR, ".gitignore");
  if (!existsSync(file))
    writeFileSync(file, `!*.patch
!*.md
!*.json
`);
}
function githubRepo(upstream) {
  return upstream.match(/^(?:https:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1];
}
function upstreamUrl(upstream) {
  return /^[\w.-]+\/[\w.-]+$/.test(upstream) ? `https://github.com/${upstream}.git` : upstream;
}
function github(path) {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const headers = { accept: "application/vnd.github+json" };
  if (token)
    headers.authorization = `Bearer ${token}`;
  return fetch(`https://api.github.com/${path}`, { headers });
}
function parseFollow(follow) {
  if (follow === "releases")
    return {};
  if (!follow.includes("*"))
    return { branch: follow };
  const escaped = follow.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return { channel: new RegExp(`^${escaped.join(".*")}$`) };
}
async function fetchUpstream(root, config) {
  const url = upstreamUrl(config.upstream);
  const follow = parseFollow(config.follow);
  const tag = "branch" in follow ? undefined : await latestRelease(root, config.upstream, follow.channel);
  if (!("branch" in follow) && !tag)
    throw new Failure(`${url} has no releases${follow.channel ? ` matching ${config.follow}` : ""}. Follow a branch or another channel instead: set "follow" in ${DIR}/config.json`);
  const ref = "branch" in follow ? `refs/heads/${follow.branch}` : `refs/tags/${tag}`;
  git(root, "fetch", "--quiet", "--no-tags", url, `+${ref}:refs/autofork/upstream`, "+HEAD:refs/autofork/branch");
  return { tip: git(root, "rev-parse", "refs/autofork/upstream^{commit}"), tag };
}
async function releases(upstream, path) {
  const repo = githubRepo(upstream);
  if (!repo)
    return;
  try {
    const response = await github(`repos/${repo}/${path}`);
    if (response.ok)
      return response.json();
    if (response.status !== 404)
      say(`can't read ${repo}'s releases (${response.status}), using its newest version tag`);
  } catch {
    say(`can't reach GitHub for ${repo}'s releases, using its newest version tag`);
  }
}
async function latestRelease(root, upstream, channel) {
  const published = channel ? (await releases(upstream, "releases?per_page=100"))?.filter((release) => !release.draft && channel.test(release.tag_name)).sort((a, b) => b.published_at.localeCompare(a.published_at))[0]?.tag_name : (await releases(upstream, "releases/latest"))?.tag_name;
  if (published)
    return published;
  const tags = git(root, "ls-remote", "--tags", "--refs", "--sort=-v:refname", upstreamUrl(upstream)).split(`
`);
  return tags.map((line) => line.split("\t")[1]?.replace("refs/tags/", "")).find((tag) => tag && (channel ? channel.test(tag) : !tag.includes("-")));
}
function defaultBranch(root, upstream) {
  const head = run("git", ["ls-remote", "--symref", upstreamUrl(upstream), "HEAD"], root).out.toString();
  return head.match(/^ref: refs\/heads\/(\S+)\s+HEAD/m)?.[1] ?? "main";
}
async function defaultFollow(root, upstream) {
  return await latestRelease(root, upstream) ? "releases" : defaultBranch(root, upstream);
}
var channelOf = (tag) => tag.replace(/\d+/g, "*").replace(/\*(?:\.\*)+/g, "*");
async function channels(upstream) {
  const published = await releases(upstream, "releases?per_page=100") ?? [];
  return [
    ...new Set(published.filter((release) => release.prerelease && !release.draft).map((release) => channelOf(release.tag_name)))
  ];
}
function baseline(root) {
  const synced = git(root, "log", "--first-parent", "-1", "--format=%s", "-E", "--grep=^auto(fork|patch): sync ", "HEAD").split(" ").at(-1);
  const last = synced && run("git", ["rev-parse", "--verify", "--quiet", `${synced}^{commit}`], root);
  const base = last && last.ok ? last : run("git", ["merge-base", "HEAD", "refs/autofork/branch"], root);
  if (!base.ok)
    throw new Failure("this branch shares no history with upstream");
  return base.out.toString().trim();
}
function newer(root, base, candidate) {
  return candidate !== base && run("git", ["merge-base", "--is-ancestor", candidate, base], root).ok ? base : candidate;
}
async function newestGreen(root, config, base, tip) {
  const repo = githubRepo(config.upstream);
  if (config.green === false || !("branch" in parseFollow(config.follow)) || !repo)
    return tip;
  for (const sha of git(root, "rev-list", "--first-parent", "--max-count=30", `${base}..${tip}`).split(`
`).filter(Boolean)) {
    const response = await github(`repos/${repo}/commits/${sha}/check-runs?per_page=100`);
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
  if (base !== tip)
    say(`no newer upstream commit has passed its checks yet, staying on ${short(base)}`);
  return base;
}
function intent(root, id) {
  const doc = existsSync(patchDoc(root, id)) ? readFileSync(patchDoc(root, id), "utf8") : "";
  if (!doc.trim())
    throw new Failure(`${DIR}/${id}/PATCH.md is empty: say what the patch does and why. It's what the agent rebuilds it from.`);
}
var isEmpty = (file) => !existsSync(file) || readFileSync(file).length === 0;
var sourcePaths = (config) => [
  ...SOURCE,
  ...(config.generated ?? []).map((path) => `:(exclude)${path}`)
];
var skipGenerated = (config) => (config.generated ?? []).map((path) => `--exclude=${path}`);
function touched(dir, file, config) {
  return run("git", ["apply", "--numstat", "-z", ...skipGenerated(config), file], dir).out.toString().split("\x00").filter(Boolean).map((line) => line.split("\t")[2]);
}
function unfinished({ conflicted, rejected, missed }, to, from) {
  const files = [...conflicted, ...rejected, ...missed];
  if (!files.length)
    return "";
  const left = [
    conflicted.length ? `the conflict markers in ${conflicted.join(", ")}` : "",
    rejected.length ? `the hunks that didn't fit, in ${rejected.map((path) => `${path}.rej`).join(", ")}` : "",
    missed.length ? `the changes to ${missed.join(", ")}, which didn't apply at all` : ""
  ].filter(Boolean);
  const changes = from && from !== to ? ` To see what upstream changed under them: git diff ${from} ${to} -- ${files.join(" ")}` : "";
  return ` Git applied the rest of it. What's left: ${left.join("; ")}.${changes}`;
}
function healPrompt(config, build, id, broken) {
  const index = config.patches.indexOf(id);
  const before = config.patches.slice(0, index);
  const after = config.patches.slice(index + 1).filter((later) => !build.upstreamHas.has(later));
  const fresh = isEmpty(patchFile(build.dir, id));
  const steps = [
    `Read ${DIR}/${id}/PATCH.md. It says what the patch does and why, and that's the contract.`,
    ...fresh ? [] : [
      `${DIR}/${id}/${id}.patch is how it was done before. Use it as a guide, not as text to force in.`
    ],
    "Build it on the current source, the smallest change that fully does what PATCH.md says. Build on what upstream has now: where upstream has its own version of what the patch touches, change that rather than bringing the old one back. Follow upstream's code and conventions, and leave everything else alone.",
    ...config.verify ? [] : [
      `This fork has no check yet. Find how upstream's CI installs dependencies and checks a build (its workflows are in \`git show ${build.source}:.github/workflows\`; this checkout's are the fork's own), and write ${config.setup ? `the check to ${DIR}/config.json as "verify"` : `those commands to ${DIR}/config.json as "setup" and "verify"`}. Every sync runs ${config.setup ? "it" : "them"} on a fresh machine like this one, each as one string in its own \`sh -c\` (join steps with \`&&\`), so ${config.setup ? `\`verify\` can use only what \`${config.setup}\` installs` : "`setup` installs any tool they need, including what you installed by hand, outside this checkout or where git ignores it"}: after \`setup\` the sync puts the checkout back as git has it. It runs \`verify\` on upstream alone to tell when upstream broke itself, so it has to pass there too.`
    ],
    `Run upstream's own checks for the code you touched, and ${config.verify ? `\`${config.verify}\`` : "your `verify`"}, which the sync has to pass.${config.setup ? ` Dependencies are installed: \`${config.setup}\` ran here, so run it again if you change them.` : ""} Fix what your change breaks.${after.length ? ` Patches after this one aren't applied yet: ${after.join(", ")}. Each goes on top of yours, so leave what its PATCH.md asks for to it.` : ""}`,
    ...fresh ? [
      `Add a short paragraph to the end of ${DIR}/${id}/PATCH.md on why it's built the way it is, for whoever rebuilds it after upstream moves. Keep what's there as it is.`
    ] : []
  ];
  return `You are keeping a patched fork of ${config.upstream} in sync. The fork is upstream plus a stack of patches, each one described in ${DIR}/<id>/PATCH.md.

This checkout is upstream at ${build.source}${before.length ? `, with ${before.join(", ")} already applied` : ""}. ${fresh ? `Patch "${id}" is new and hasn't been built yet.` : broken}

${steps.map((step, index) => `${index + 1}. ${step}`).join(`
`)}

Don't edit anything ${fresh || !config.verify ? "else " : ""}in ${DIR}/ or ${WORKFLOWS}/, and don't commit. Leave only your source change: remove anything your checks generated that git would pick up${config.generated?.length ? `, but leave ${config.generated.join(", ")}, which the sync rebuilds` : ""}.
If upstream already does what PATCH.md asks, or something close enough that building it would duplicate upstream's own version, write one line saying what upstream does to ${DIR}/${id}/UPSTREAM.md, and the sync leaves the patch out.`;
}
var installed = (bin) => run("sh", ["-c", `command -v ${bin}`], ".").ok;
function agentCommand(config) {
  if (config.agent)
    return config.agent;
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && existsSync(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"))) {
    const codex = installed("codex") ? "codex" : "npx -y @openai/codex";
    return `${codex} exec --dangerously-bypass-approvals-and-sandbox -`;
  }
  const claude = installed("claude") ? "claude" : "npx -y @anthropic-ai/claude-code";
  return `${claude} -p --dangerously-skip-permissions`;
}
function checksIn(dir) {
  try {
    const written = JSON.parse(readFileSync(configFile(dir), "utf8"));
    if (written && typeof written === "object")
      return written;
  } catch {}
}
function keepChecks(config, build, written) {
  if (!written)
    return say(`the agent left ${DIR}/config.json unreadable, so the checks it picked weren't kept`);
  const before = JSON.parse(git(build.dir, "show", `${build.steps[0]}:${DIR}/config.json`));
  if (["setup", "verify"].every((key) => written[key] === before[key]))
    return;
  for (const key of ["setup", "verify"]) {
    const command = written[key];
    if (config[key] || typeof command !== "string" || !command.trim())
      continue;
    config[key] = command;
    build.picked = { ...build.picked, [key]: command };
  }
}
function addStep(config, build, id) {
  build.steps.push(commit(build.dir, id));
  if (build.picked)
    checkPicked(config, build);
}
function checkPicked(config, build) {
  config.provisional = { ...config.provisional, ...build.picked };
  config.provisional = inForce(config);
  build.picked = undefined;
  const tip = git(build.dir, "rev-parse", "HEAD");
  reset(build.dir, build.steps[0]);
  build.ready = undefined;
  const alone = passes(config, build);
  reset(build.dir, tip);
  build.ready = undefined;
  if (!alone && provisional(config, build.failed.check))
    unpick(config, build.failed.check, "on upstream alone");
}
function unpick(config, check, where) {
  say(`\`${config[check]}\` fails ${where}, so the unproven checks an agent picked aren't kept`);
  for (const key of ["setup", "verify"])
    if (provisional(config, key))
      delete config[key];
  delete config.provisional;
}
function restoreControl(dir, base) {
  git(dir, "rm", "-rq", "--cached", "--ignore-unmatch", "--", ...CONTROL);
  const owned = git(dir, "ls-tree", "--name-only", base, "--", ...CONTROL).split(`
`).filter(Boolean);
  if (owned.length)
    git(dir, "checkout", base, "--", ...owned);
  git(dir, "clean", "-fdxq", "--", ...CONTROL);
}
function workflowsBehind(root, base, source) {
  const files = (...args) => git(root, "diff", "--name-only", "--no-renames", ...args, "--", WORKFLOWS).split(`
`);
  const upstreamChanged = new Set(files(base, source));
  return files("--diff-filter=MD", "HEAD", source).filter((file) => file && upstreamChanged.has(file));
}
function updateWorkflows(config, build, files, range) {
  const head = git(build.dir, "rev-parse", "HEAD");
  const own = `${WORKFLOWS}/autofork.yml`;
  const rest = [".", `:(exclude)${WORKFLOWS}`];
  say(`bringing upstream's changes into ${files.join(", ")}`);
  const ran = shell(agentCommand(config), build.dir, `You are keeping a patched fork of ${config.upstream} in sync. The workflows in ${WORKFLOWS}/ are the fork's own copies, and upstream changed ${files.join(", ")}: git diff ${range} -- ${WORKFLOWS}

Bring into this fork's copies what it needs from those changes, and keep what the fork does differently. Add a workflow only where upstream split or renamed one the fork keeps. Only what you change in ${WORKFLOWS}/ is kept, except autofork.yml, and the sync commits it.`);
  git(build.dir, "reset", "--quiet", head);
  if (!ran) {
    say("the agent failed while updating workflows, so they stay as they were");
    reset(build.dir);
    return;
  }
  git(build.dir, "checkout", "--", ...rest);
  git(build.dir, "clean", "-fdq", "--", ...rest);
  run("git", ["checkout", "--", own], build.dir);
  git(build.dir, "clean", "-fq", "--", own);
  git(build.dir, "add", "-A", "--", WORKFLOWS);
  const updated = git(build.dir, "diff", "--cached", "--name-only", "--no-renames", head, "--", WORKFLOWS);
  return updated.split(`
`).filter(Boolean);
}
function heal(config, build, id, broken, patch) {
  prepared(config, build);
  const step = build.steps.at(-1);
  const left = patch ? merge(build.dir, patch.file, config) : undefined;
  const rejects = left?.rejected.map((path) => `${path}.rej`) ?? [];
  const before = workingTree(build.dir, rejects);
  const prompt = healPrompt(config, build, id, broken + (left ? unfinished(left, build.source, patch?.from) : ""));
  const fresh = isEmpty(patchFile(build.dir, id));
  const [doing, done] = fresh ? ["building", "built"] : ["healing", "healed"];
  const doc = patchDoc(build.dir, id);
  const wish = readFileSync(doc, "utf8").trimEnd();
  let nudge = "";
  let marked = [];
  try {
    for (let attempt = 1;attempt <= 2; attempt++) {
      say(`${doing} ${id}${attempt > 1 ? " (second try)" : ""}`);
      if (!shell(agentCommand(config), build.dir, prompt + nudge, BOT))
        throw new Failure(`the agent failed while ${doing} ${id}`);
      git(build.dir, "reset", "--soft", "--quiet", step);
      const reason = existsSync(upstreamDoc(build.dir, id)) ? readFileSync(upstreamDoc(build.dir, id), "utf8").trim() : "";
      const why = fresh && existsSync(doc) ? readFileSync(doc, "utf8") : "";
      const written = config.verify ? {} : checksIn(build.dir);
      restoreControl(build.dir, step);
      if (reason) {
        keepChecks(config, build, written);
        reset(build.dir, step);
        build.upstreamHas.set(id, reason);
        return;
      }
      marked = (left?.conflicted ?? []).filter((path) => {
        const file = join(build.dir, path);
        return existsSync(file) && MARKER.test(readFileSync(file, "utf8"));
      });
      if (!marked.length && workingTree(build.dir, rejects) !== before) {
        if (why.startsWith(wish))
          writeFileSync(doc, why);
        keepChecks(config, build, written);
        build.healed.set(id, done);
        return;
      }
      nudge = marked.length ? `

Your last attempt left conflict markers in ${marked.join(", ")}. Resolve them into what PATCH.md asks for.` : `

Your last attempt exited without changing any source file. Build what PATCH.md asks for, or write ${DIR}/${id}/UPSTREAM.md if upstream already covers it.`;
    }
  } finally {
    for (const file of rejects)
      rmSync(join(build.dir, file), { force: true });
  }
  throw new Failure(marked.length ? `the agent left conflict markers in ${marked.join(", ")} while ${doing} ${id}` : `the agent changed nothing while ${doing} ${id}`);
}
function changed(dir) {
  return git(dir, "status", "--porcelain").length > 0;
}
function commit(dir, message) {
  git(dir, "add", "-A");
  const hidden = git(dir, "ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--", DIR).split("\x00").filter((path) => /\.(patch|md|json)$|\/\.gitignore$/.test(path));
  if (hidden.length)
    git(dir, "add", "-f", "--", ...hidden);
  gitWith(dir, BOT, "commit", "--quiet", "--no-verify", "--allow-empty", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}
function reset(dir, to = "HEAD") {
  git(dir, "reset", "--hard", "--quiet", to);
  git(dir, "clean", "-fdq");
}
function apply(dir, file, config) {
  if (run("git", ["apply", "--3way", "--whitespace=nowarn", ...skipGenerated(config), file], dir).ok)
    return true;
  reset(dir);
  return false;
}
function merge(dir, file, config) {
  const left = { conflicted: [], rejected: [], missed: [] };
  for (const path of touched(dir, file, config)) {
    const only = [`--include=${path.replace(/[*?[\\]/g, "\\$&")}`, "--whitespace=nowarn", file];
    if (run("git", ["apply", "--3way", ...only], dir).ok)
      continue;
    if (git(dir, "ls-files", "--unmerged", "--", `:(literal)${path}`))
      left.conflicted.push(path);
    else if (run("git", ["apply", "--reject", ...only], dir).ok)
      continue;
    else if (existsSync(join(dir, `${path}.rej`)))
      left.rejected.push(path);
    else
      left.missed.push(path);
  }
  git(dir, "reset", "--quiet");
  return left;
}
function prepare(config, build) {
  if (!config.setup)
    return true;
  const head = git(build.dir, "rev-parse", "HEAD");
  if (build.ready !== head) {
    say(`setup: ${config.setup}`);
    if (!succeeds(build, "setup", config.setup))
      return false;
    build.ready = head;
    build.rebuilt = generatedChanges(config, build.dir);
    reset(build.dir);
  }
  if (build.rebuilt && !git(build.dir, "status", "--porcelain", "--", ...config.generated ?? []))
    git(build.dir, "apply", "--whitespace=nowarn", build.rebuilt);
  return true;
}
function prepared(config, build) {
  if (!prepare(config, build))
    throw new Failure(`setup fails on ${short(git(build.dir, "rev-parse", "HEAD"))}: ${config.setup}`);
}
function generatedChanges(config, dir) {
  if (!config.generated?.length)
    return;
  for (const path of config.generated)
    run("git", ["add", "-A", "--", path], dir);
  const diff = gitBytes(dir, "diff-index", "--cached", "-p", "--binary", "HEAD", "--", ...config.generated);
  if (!diff.length)
    return;
  const file = join(git(dir, "rev-parse", "--path-format=absolute", "--git-dir"), "autofork-generated.patch");
  writeFileSync(file, diff);
  return file;
}
function regenerate(config, build) {
  if (!config.generated?.length)
    return;
  prepared(config, build);
  commit(build.dir, "generated");
}
function succeeds(build, check, command) {
  const result = spawnSync("sh", ["-c", `exec 2>&1
${command}`], {
    cwd: build.dir,
    stdio: ["inherit", "pipe", "inherit"],
    maxBuffer: 1 << 30
  });
  process.stderr.write(result.stdout);
  if (result.status === 0)
    return true;
  const lines = result.stdout.toString().trimEnd().split(`
`).slice(-100).join(`
`);
  build.failed = { check, lines };
  return false;
}
var passes = (config, build) => prepare(config, build) && (!config.verify || succeeds(build, "verify", config.verify));
function scratch(root) {
  const parent = process.env.RUNNER_TEMP ?? join(homedir(), ".cache");
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 8);
  return join(parent, "autofork", `${basename(root)}-${hash}`);
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
  const build = {
    dir,
    source: base,
    steps: [commit(dir, `upstream ${short(base)}`)],
    healed: new Map,
    upstreamHas: new Map
  };
  if (options.wait)
    settle(config, build);
  for (const id of config.patches) {
    const file = patchFile(dir, id);
    if (options.wait && !options.healFrom && isEmpty(file))
      throw new Drifted(`${id} isn't built yet`);
    if (isEmpty(file) ? options.healFrom : !apply(dir, file, config)) {
      if (!options.healFrom)
        throw new Drifted(`${id} doesn't apply to ${short(base)}`);
      verify(config, build, options.healFrom);
      heal(config, build, id, `Upstream changed, and patch "${id}" no longer applies cleanly.`, isEmpty(file) ? undefined : { file, from: options.healFrom });
    } else if (!isEmpty(file) && !changed(dir)) {
      build.upstreamHas.set(id, "the same change, line for line");
    }
    if (options.fold?.id === id && !apply(dir, options.fold.patch, config)) {
      throw new Failure(`your changes don't apply on top of ${id}`);
    }
    addStep(config, build, id);
  }
  return build;
}
function passesAt(config, build, commit) {
  reset(build.dir, commit);
  return passes(config, build);
}
function verify(config, build, from) {
  if (!config.setup && !config.verify)
    return;
  try {
    if (passesAt(config, build, build.steps.at(-1)))
      return;
    if (Object.keys(inForce(config)).length) {
      unpick(config, build.failed.check, "with the patches");
      return verify(config, build, from);
    }
    if (!from)
      throw new Drifted(`${build.failed.check} fails, so a patch needs rebuilding`);
    const failed = build.failed;
    const patched = build.steps.length > 1;
    if (patched)
      say(`${failed.check} fails, verify with upstream ${short(build.source)} alone`);
    if (!patched || !passesAt(config, build, build.steps[0])) {
      guard(config, build, from);
      if (build.steps.length <= config.patches.length)
        return;
    }
    fix(config, build, failed, from);
  } finally {
    reset(build.dir, build.steps.at(-1));
  }
}
function guard(config, build, from) {
  const { check } = build.failed;
  let broke = !config.patches.length;
  if (!broke && from !== build.source) {
    say(`verify with upstream ${short(from)} alone, where the fork was`);
    broke = passesAt(config, build, from);
  }
  if (broke)
    throw new Failure(`${check} fails on upstream ${short(build.source)} itself: ${config[check]}`);
  say(`${check} fails on upstream alone where the fork was too, so the patches are what make it pass`);
}
function fixPrompt(config, build, ids, failed, from) {
  const paused = ids.filter((id) => build.upstreamHas.has(id));
  const later = config.patches.slice(ids.length);
  const changes = from !== build.source ? `

To see what upstream changed: git diff --stat ${from} ${build.source}` : "";
  return `You are keeping a patched fork of ${config.upstream} in sync. The fork is upstream plus a stack of patches, each one described in ${DIR}/<id>/PATCH.md.

This checkout is upstream at ${build.source} with the patches on top, one commit each, named by its id: ${ids.join(", ")}.${paused.length ? ` Upstream already has ${paused.join(", ")}: leave ${paused.length === 1 ? "its commit" : "their commits"} empty.` : ""} They all apply, but \`${config[failed.check]}\` fails with them. Its last lines:

\`\`\`
${failed.lines}
\`\`\`${changes}

Make it pass. Fold each fix into the commit of the patch it belongs to (git commit --fixup, then an autosquash rebase onto ${build.steps[0]}), built on what upstream has now and in upstream's code and conventions, so each patch still does what its PATCH.md says. When you're done, the commits on ${build.steps[0]} are these patches, one each, named by its id, in this order.${config.setup && failed.check === "verify" ? ` Dependencies are installed: \`${config.setup}\` ran here, so run it again if you change them.` : ""}${later.length ? ` Patches after these aren't applied yet: ${later.join(", ")}. Each goes on top, so leave what its PATCH.md asks for to it.` : ""}

Don't edit anything in ${DIR}/ or ${WORKFLOWS}/. Leave out of your commits anything your checks generated${config.generated?.length ? `, and the changes setup made to ${config.generated.join(", ")}, which the sync rebuilds` : ""}.
If upstream now does what a patch's PATCH.md asks, or something close enough that the patch would duplicate upstream's own version, edit that patch's commit so it's empty, keeping the commit, and write one line saying what upstream does to ${DIR}/<id>/UPSTREAM.md. The sync leaves the patch out.`;
}
var patchId = (config, dir, from, to) => spawnSync("git", ["patch-id", "--stable"], {
  cwd: dir,
  input: gitBytes(dir, "diff-tree", "-p", "-U0", "--binary", from, to, "--", ...sourcePaths(config))
}).stdout.toString().split(" ")[0];
function fix(config, build, failed, from) {
  const [base, ...before] = build.steps;
  const ids = config.patches.slice(0, before.length);
  const command = config[failed.check];
  if (ids.every((id) => build.upstreamHas.has(id))) {
    if (ids.length < config.patches.length)
      return;
    throw new Failure(`${failed.check} fails on upstream ${short(build.source)}, which has every patch: ${command}`);
  }
  const last = ids.findLastIndex((id) => build.healed.has(id));
  if (last >= 0 && (last === ids.length - 1 || !passesAt(config, build, build.steps[last + 1]))) {
    say(`${failed.check} fails with ${ids[last]}, which an agent just built, so run it again`);
    if (passesAt(config, build, before.at(-1)))
      return;
    throw new Failure(`${failed.check} fails with ${ids[last]}, which the agent ${build.healed.get(ids[last])}: ${command}`);
  }
  reset(build.dir, before.at(-1));
  if (failed.check === "verify")
    prepared(config, build);
  say(`fixing ${failed.check} in the patches`);
  if (!shell(agentCommand(config), build.dir, fixPrompt(config, build, ids, failed, from), BOT))
    throw new Failure(`the agent failed while fixing ${failed.check}`);
  const pausing = new Set;
  for (const id of ids) {
    const doc = upstreamDoc(build.dir, id);
    const reason = existsSync(doc) ? readFileSync(doc, "utf8").trim() : "";
    if (reason && !build.upstreamHas.has(id)) {
      build.upstreamHas.set(id, reason);
      build.healed.delete(id);
      pausing.add(id);
    }
  }
  if (["rebase-merge", "rebase-apply"].some((path) => existsSync(resolve(build.dir, git(build.dir, "rev-parse", "--git-path", path)))))
    throw new Failure(`the agent left a rebase unfinished while fixing ${failed.check}`);
  const onUpstream = run("git", ["merge-base", "--is-ancestor", base, "HEAD"], build.dir).ok;
  if (!onUpstream || git(build.dir, "log", "--reverse", "--format=%s", `${base}..HEAD`) !== ids.join(`
`))
    throw new Failure(`the agent's commits on upstream aren't ${ids.join(", ")}, one per patch in that order, so nothing was pushed`);
  git(build.dir, "reset", "--quiet");
  restoreControl(build.dir, before.at(-1));
  if (!run("git", ["diff", "--cached", "--quiet"], build.dir).ok)
    gitWith(build.dir, BOT, "commit", "--amend", "--quiet", "--no-verify", "--allow-empty", "--no-edit");
  const old = build.steps;
  build.steps = [base, ...git(build.dir, "rev-list", "--reverse", `${base}..HEAD`).split(`
`)];
  ids.forEach((id, index) => {
    const was = patchId(config, build.dir, old[index], old[index + 1]);
    const now = patchId(config, build.dir, build.steps[index], build.steps[index + 1]);
    if (build.upstreamHas.has(id)) {
      if (now)
        throw new Failure(pausing.has(id) ? `the agent wrote UPSTREAM.md for ${id} but left its change in, so nothing was pushed` : `the agent's fix changed ${id}, which upstream already has, so nothing was pushed`);
    } else if (was && !now) {
      throw new Failure(`the agent's fix left ${id} with nothing to add, so nothing was pushed: say in the PATCH.md files which patch makes which change, or merge them into one`);
    } else if (now !== was)
      build.healed.set(id, build.healed.get(id) ?? "healed");
  });
  build.ready = undefined;
  if (!passesAt(config, build, build.steps.at(-1))) {
    const { check } = build.failed;
    throw new Failure(`${check} still fails after the agent's fix: ${config[check]}`);
  }
}
var provisional = (config, check) => !!config[check] && config.provisional?.[check] === config[check] && (check === "verify" || !config.generated?.length && (!config.verify || provisional(config, "verify")));
var inForce = (config) => Object.fromEntries(["setup", "verify"].filter((key) => provisional(config, key)).map((key) => [key, config[key]]));
function settle(config, build) {
  const picked = inForce(config);
  const failed = config.provisional?.failed;
  config.provisional = Object.keys(picked).length ? { ...picked, failed } : undefined;
  if (!config.provisional)
    return;
  const passed = passes(config, build);
  reset(build.dir);
  if (passed) {
    config.provisional = build.proven = picked;
    return;
  }
  const { check } = build.failed;
  build.failed = undefined;
  if (!(check in picked))
    return;
  if (failed && failed !== short(build.source)) {
    say(`\`${config[check]}\` fails on upstream alone in a second sync, so the checks an agent picked are dropped and the next agent run picks new ones`);
    delete config.provisional;
  } else {
    say(`\`${config[check]}\` fails on upstream alone, so this sync skips the checks an agent picked, and the next one drops them if they fail there again`);
    config.provisional.failed ??= short(build.source);
  }
  for (const key of Object.keys(picked))
    delete config[key];
}
function saveConfig(target, { follow, setup, verify, provisional }) {
  const saved = JSON.parse(readFileSync(configFile(target), "utf8"));
  const config = {
    ...saved,
    follow,
    setup: setup ?? provisional?.setup,
    verify: verify ?? provisional?.verify,
    provisional
  };
  if (JSON.stringify(config) !== JSON.stringify(saved))
    writeFileSync(configFile(target), `${JSON.stringify(config, null, 2)}
`);
}
function refresh(target, config, build) {
  keepPatches(target);
  config.patches.forEach((id, index) => {
    const diff = gitBytes(build.dir, "diff-tree", "-p", "--binary", "--full-index", build.steps[index], build.steps[index + 1], "--", ...sourcePaths(config));
    if (diff.length || existsSync(patchFile(target, id)))
      writeFileSync(patchFile(target, id), diff);
  });
  for (const [id, reason] of build.upstreamHas) {
    rmSync(patchFile(target, id), { force: true });
    writeFileSync(upstreamDoc(target, id), `${reason}

${config.upstream} does this on its own as of ${short(build.source)}, so autofork stopped applying this patch.
To keep upstream's version, delete ${DIR}/${id}/.
To keep yours, say in PATCH.md how it differs from upstream's, delete this file and push. The next sync rebuilds it.
`);
  }
}
function cleanup(root, build) {
  if (build)
    run("git", ["worktree", "remove", "--force", build.dir], root);
}
function workingTree(root, skip = []) {
  const gitDir = git(root, "rev-parse", "--path-format=absolute", "--git-dir");
  const index = join(gitDir, "autofork-index");
  const env = { ...process.env, GIT_INDEX_FILE: index };
  cpSync(join(gitDir, "index"), index, { preserveTimestamps: true });
  gitWith(root, env, "add", "-A", "--", ".", ...skip.map((path) => `:(exclude,literal)${path}`));
  const tree = gitWith(root, env, "write-tree");
  rmSync(index, { force: true });
  return tree;
}
function check(root, config, against, base = baseline(root)) {
  const rebuilt = build(root, config, base, {});
  try {
    const drift = git(root, "diff-tree", "-r", "--name-only", rebuilt.steps.at(-1), against, "--", ...sourcePaths(config));
    return { base, rebuilt: rebuilt.steps.at(-1), drift: drift.split(`
`).filter(Boolean) };
  } finally {
    cleanup(root, rebuilt);
  }
}
async function sync(root, args) {
  const config = await readConfig(root);
  config.patches.forEach((id) => intent(root, id));
  if (git(root, "status", "--porcelain"))
    throw new Failure("commit or stash your changes first");
  const { tip, tag } = await fetchUpstream(root, config);
  const base = baseline(root);
  const source = newer(root, base, await newestGreen(root, config, base, tip));
  const key = `${short(source)}-${short(git(root, "rev-parse", "HEAD"))}`;
  output({ key });
  if (flag(args, "--skip") === key) {
    say(`autofork: already failed on upstream ${short(source)} with this fork, skipping until either changes`);
    return output({ result: "skipped" });
  }
  if (base === source && config.patches.every((id) => !isEmpty(patchFile(root, id)))) {
    say(`autofork: already up to date with ${config.upstream} at ${short(source)}`);
    return output({ result: "current" });
  }
  const { drift } = check(root, config, "HEAD", base);
  if (drift.length) {
    throw new Failure(`these files differ from what your patches build, so a sync would drop them:
  ${drift.join(`
  `)}
Where one is just an old copy of upstream's, take upstream's first: git checkout ${short(base)} -- <file>, or git rm <file> if upstream had it and deleted it. Then save the fork's own changes, on top of upstream's copies, as a patch: write ${DIR}/<id>/PATCH.md, then run autofork save <id>`);
  }
  const moved = base === source ? short(source) : `${short(base)} → ${short(source)}`;
  say(`upstream ${moved}, ${config.patches.length} patch${config.patches.length === 1 ? "" : "es"}`);
  const healFrom = args.includes("--no-heal") ? undefined : base;
  const behind = workflowsBehind(root, base, source);
  const range = `${short(base)}..${short(source)}`;
  let result;
  let updated;
  try {
    try {
      result = build(root, config, source, { healFrom, wait: true });
      verify(config, result, healFrom);
      regenerate(config, result);
      if (behind.length && !args.includes("--no-workflows")) {
        if (!healFrom)
          throw new Drifted("upstream changed workflows this fork keeps");
        updated = updateWorkflows(config, result, behind, range);
      }
    } catch (error) {
      if (!(error instanceof Drifted))
        throw error;
      say(`autofork: ${error.message}. The next run that heals rebuilds it.`);
      return output({ result: "waiting" });
    }
    if (result.proven) {
      const left = Object.entries(inForce(config)).filter(([key]) => !(key in result.proven));
      config.provisional = left.length ? Object.fromEntries(left) : undefined;
    }
    saveConfig(result.dir, config);
    refresh(result.dir, config, result);
    const tree = git(result.dir, "rev-parse", `${commit(result.dir, "refresh")}^{tree}`);
    if (tree === git(root, "rev-parse", "HEAD^{tree}") && !behind.length) {
      say("autofork: already up to date");
      return output({ result: "current" });
    }
    const head = git(root, "rev-parse", "HEAD");
    const parents = ["-p", head];
    if (!run("git", ["merge-base", "--is-ancestor", source, head], root).ok)
      parents.push("-p", source);
    const lines = [
      ...[...result.healed].map(([id, done]) => `${done} ${id}`),
      ...[...result.upstreamHas].map(([id, reason]) => `upstream has ${id}: ${reason}`),
      ...updated ? updated.map((file) => `brought upstream's changes to ${file} in ${range}`) : behind.map((file) => `upstream changed ${file} in ${range}`)
    ];
    const message = [`autofork: sync ${config.upstream} to ${short(source)}`, lines.join(`
`)].filter(Boolean).join(`

`);
    git(root, "merge", "--ff-only", "--quiet", git(root, "commit-tree", tree, ...parents, "-m", message));
    say(message);
    output({ result: "synced", ...tag && source === tip ? { tag } : {} });
  } finally {
    cleanup(root, result);
  }
}
async function save(root, args) {
  const id = args[0];
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    throw new Failure("usage: autofork save <id>   (id like fix-login)");
  if (!existsSync(patchDoc(root, id)))
    throw new Failure(`write ${DIR}/${id}/PATCH.md first: what the change does and why`);
  intent(root, id);
  rmSync(upstreamDoc(root, id), { force: true });
  const config = await readConfig(root);
  await fetchUpstream(root, config);
  const files = workingTree(root);
  const { base, rebuilt, drift } = check(root, config, files);
  if (!drift.length)
    return say(`nothing to save: your code matches what the patches build. Push ${DIR}/${id}/PATCH.md as it is and the next sync has an agent build it.`);
  const fold = join(git(root, "rev-parse", "--path-format=absolute", "--git-dir"), "autofork-fold.patch");
  writeFileSync(fold, gitBytes(root, "diff-tree", "-p", "--binary", "--full-index", rebuilt, files, "--", ...sourcePaths(config)));
  const result = build(root, config, base, { fold: { id, patch: fold } });
  try {
    refresh(root, config, result);
    say(`saved ${drift.length} file${drift.length === 1 ? "" : "s"} to ${DIR}/${id}. Commit and push.`);
  } finally {
    rmSync(fold, { force: true });
    cleanup(root, result);
  }
}
var workflow = (branch) => `name: autofork

on:
  schedule:
    - cron: "17 * * * *"
  workflow_dispatch:
  push:
    branches: [${branch}]
    paths: [".autofork/**"]

permissions:
  contents: write
  issues: write

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
        env:
          CLAUDE_CODE_OAUTH_TOKEN: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
`;
function options(args) {
  const setup = flag(args, "--setup");
  const generated = flag(args, "--generated")?.split(",");
  if (generated && !setup)
    throw new Failure("--generated files are rebuilt by --setup, so set it too");
  return { follow: flag(args, "--follow"), setup, generated, verify: flag(args, "--verify") };
}
async function setup(root, upstream, chosen) {
  if (existsSync(configFile(root)))
    throw new Failure(`${DIR}/config.json already exists`);
  const follow = chosen.follow ?? await defaultFollow(root, upstream);
  const config = { ...chosen, upstream, follow };
  writeConfig(root, config);
  const path = join(root, ".github/workflows/autofork.yml");
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  if (!existsSync(path))
    writeFileSync(path, workflow(git(root, "branch", "--show-current") || defaultBranch(root, upstream)));
  await fetchUpstream(root, config);
  const { base, drift } = check(root, { ...config, patches: [] }, workingTree(root));
  const readme = addNote(root, upstream, base, drift);
  const inherited = git(root, "ls-files", ".github/workflows").split(`
`).filter((file) => file && !file.endsWith("/autofork.yml"));
  if ("branch" in parseFollow(follow)) {
    say(`autofork follows ${upstream}'s ${follow} branch${chosen.follow ? "" : ", since it has no releases"}.`);
  } else {
    const others = (await channels(upstream)).filter((channel) => channel !== follow);
    say(`autofork follows ${upstream}'s ${follow === "releases" ? "" : `${follow} `}releases.`);
    if (others.length)
      say(`It also publishes ${others.join(", ")}. To follow one, put it in "follow" in ${DIR}/config.json.`);
  }
  if (inherited.length)
    say(`Your fork has ${inherited.length} workflow${inherited.length === 1 ? "" : "s"} copied from upstream, and they run here too. Delete the ones you don't want. autofork leaves workflows to you: it never copies upstream's new ones in, and when upstream changes one you keep, the sync's agent brings that into your copy, or opens an issue when the workflow's token can't push workflow files.`);
  if (readme)
    say(`${readme} now says this is a personal fork kept current by autofork. To drop that line, delete it and ${DIR}/${NOTE}/.`);
  if (drift.length)
    say(`Your branch already changes ${drift.length} file${drift.length === 1 ? "" : "s"}. Save them as a patch: write ${DIR}/<id>/PATCH.md, then autofork save <id>`);
  return readme;
}
var NOTE = "fork-readme";
var appName = (upstream) => basename(upstream).replace(/\.git$/, "");
function withNote(readme, upstream) {
  if (!readme.trim() || readme.includes("autofork.com"))
    return;
  const repo = githubRepo(upstream);
  const link = repo ? `https://github.com/${repo}` : /^https?:\/\//.test(upstream) ? upstream.replace(/\.git$/, "") : undefined;
  const eol = readme.includes(`\r
`) ? `\r
` : `
`;
  const lines = readme.split(eol);
  const titled = /^\uFEFF?#\s/.test(lines[0]);
  const name = titled && lines[0].match(/^\uFEFF?#\s+([^[\]<>`*_!]+?)[\s#]*$/)?.[1] || appName(upstream);
  const note = `> A personal fork of ${link ? `[${name}](${link})` : name} that updates itself with [autofork](https://autofork.com). Its changes, each described in plain words, are in [\`${DIR}/\`](${DIR}).`;
  const at = titled ? 1 : 0;
  const block = titled ? ["", note, ...lines[1]?.trim() ? [""] : []] : [note, ""];
  return [...lines.slice(0, at), ...block, ...lines.slice(at)].join(eol);
}
var noteDoc = (name) => `One line under the README's title says this is a personal fork of ${name} that updates itself with autofork, linking ${name}, https://autofork.com and this fork's \`${DIR}/\` folder. The rest of the README stays as upstream wrote it.

To drop the line, delete it from the README and delete this folder, in the same commit.
`;
function addNote(root, upstream, base, drift) {
  const readme = git(root, "ls-tree", "--name-only", base).split(`
`).find((file) => /^readme\.md$/i.test(file));
  if (!readme || drift.includes(readme) || existsSync(join(root, DIR, NOTE)))
    return;
  const text = withNote(readFileSync(join(root, readme), "utf8"), upstream);
  if (!text)
    return;
  writeFileSync(join(root, readme), text);
  mkdirSync(join(root, DIR, NOTE), { recursive: true });
  writeFileSync(patchFile(root, NOTE), gitBytes(root, "diff", "--no-ext-diff", "--no-color", "--binary", "--full-index", "--src-prefix=a/", "--dst-prefix=b/", base, "--", readme));
  writeFileSync(patchDoc(root, NOTE), noteDoc(appName(upstream)));
  return readme;
}
function origin(root) {
  const url = run("git", ["remote", "get-url", "origin"], root).out.toString().trim();
  return url.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1] ?? "";
}
function claim(root, upstream) {
  const api = (...args) => {
    const result = run("gh", ["api", ...args], root);
    return result.ok ? JSON.parse(result.out.toString()) : undefined;
  };
  const repo = origin(root);
  const fork = repo ? api(`repos/${repo}`) : undefined;
  if (!fork?.fork)
    return;
  run("gh", ["api", "-X", "PUT", `repos/${repo}/actions/permissions`, "-F", "enabled=true"], root);
  run("gh", ["repo", "edit", repo, "--enable-issues"], root);
  if (fork.parent?.full_name.toLowerCase() !== githubRepo(upstream)?.toLowerCase())
    return;
  const owner = api(`users/${fork.owner.login}`);
  const who = (owner?.type === "User" ? owner.name?.trim().split(/\s+/)[0] : owner?.name?.trim()) || fork.owner.login;
  api("-X", "PATCH", `repos/${repo}`, "-f", `description=${[`${who}'s autofork`, fork.parent.description].filter(Boolean).join(" · ")}`);
}
async function init(root, args) {
  if (!args[0])
    throw new Failure("usage: autofork init <owner/repo | git url> [--follow <releases | channel | branch>] [--setup <command>] [--generated <files>] [--verify <command>]");
  await setup(root, args[0], options(args));
  claim(root, args[0]);
  say("Add a CLAUDE_CODE_OAUTH_TOKEN secret (claude setup-token), commit, and push.");
}
async function fork(cwd, args) {
  const upstream = args[0];
  if (!/^[\w.-]+\/[\w.-]+$/.test(upstream ?? ""))
    throw new Failure("usage: autofork fork <owner/repo> [--follow <releases | channel | branch>] [--setup <command>] [--generated <files>] [--verify <command>]");
  const chosen = options(args);
  if (!run("gh", ["repo", "fork", upstream, "--clone", "--default-branch-only"], cwd).ok)
    throw new Failure("gh couldn't fork it. Is the GitHub CLI installed and logged in?");
  const root = join(cwd, upstream.split("/")[1]);
  const readme = await setup(root, upstream, chosen);
  claim(root, upstream);
  const repo = origin(root);
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (token)
    run("gh", ["secret", "set", "CLAUDE_CODE_OAUTH_TOKEN", "--repo", repo, "--body", token], root);
  git(root, "add", DIR, ".github/workflows/autofork.yml", ...readme ? [readme] : []);
  git(root, "commit", "--quiet", "-m", `autofork: follow ${upstream}`);
  git(root, "push", "--quiet");
  say(`${repo} now keeps itself current with ${upstream}. It's cloned in ./${basename(root)}.`);
  if (!token)
    say(`Last step: run claude setup-token, then gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo ${repo}`);
}
async function status(root) {
  const config = await readConfig(root);
  await fetchUpstream(root, config);
  const { base, drift } = check(root, config, workingTree(root));
  const behind = git(root, "rev-list", "--count", "--first-parent", `${base}..refs/autofork/upstream`);
  say(`${config.upstream} at ${short(base)}, ${behind} commit${behind === "1" ? "" : "s"} behind upstream`);
  for (const id of discover(root)) {
    const note = existsSync(upstreamDoc(root, id)) ? "  (upstream has it: see UPSTREAM.md)" : isEmpty(patchFile(root, id)) ? "  (not built yet)" : "";
    say(`  ${id}${note}`);
  }
  if (drift.length)
    say(`not in any patch yet:
  ${drift.join(`
  `)}`);
}
var USAGE = `autofork: Customized forks that maintain themselves.
Personal forks of open-source apps that auto-track upstream.

Usage:
  autofork fork <owner/repo>    fork it on GitHub, set it up and push
  autofork init <owner/repo>    set up a fork you already have, from inside it
  autofork save <id>            save your changes as the patch in .autofork/<id>
  autofork status               your patches, and changes no patch holds yet
  autofork sync                 rebuild on upstream; an agent heals what breaks

Options for fork and init:
  --follow <what>               releases (upstream's Latest), a channel of them
                                by tag, like 'v*-nightly.*', or a branch.
                                Default: releases, or the default branch if
                                upstream has none
  --setup <command>             the command that installs dependencies
  --generated <files>           files setup writes, like lockfiles, comma
                                separated: rebuilt by setup, never patched
  --verify <command>            the command that checks a build

A patch is .autofork/<id>/PATCH.md, saying what the change does and why, next
to <id>.patch, the diff. https://github.com/AVGVSTVS96/autofork
`;
var commands = {
  init,
  save,
  status,
  sync
};
async function main([name, ...args]) {
  if (name === "fork")
    return fork(process.cwd(), args);
  const command = commands[name];
  if (!command)
    return void process.stdout.write(USAGE);
  const top = run("git", ["rev-parse", "--show-toplevel"], process.cwd());
  if (!top.ok)
    throw new Failure("run autofork inside your fork's git checkout");
  await command(top.out.toString().trim(), args);
}
main(process.argv.slice(2)).catch((error) => {
  if (!(error instanceof Failure))
    throw error;
  say(`autofork: ${error.message}`);
  process.exitCode = 1;
});
