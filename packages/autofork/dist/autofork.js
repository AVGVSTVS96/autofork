#!/usr/bin/env node

// src/cli/fork.ts
import path13 from "node:path";

// src/failure.ts
class AutoforkError extends Error {
  name = "AutoforkError";
}

class WaitError extends AutoforkError {
  name = "WaitError";
}

class NoRoomError extends WaitError {
  name = "NoRoomError";
  why;
  constructor(message, why = message) {
    super(message);
    this.why = why;
  }
}
var messageOf = (cause) => cause instanceof Error ? cause.message : String(cause);

// src/layout.ts
import path from "node:path";
var DIR = ".autofork";
var WORKFLOWS = ".github/workflows";
var OWN_WORKFLOW = `${WORKFLOWS}/autofork.yml`;
var CONTROL = [DIR, WORKFLOWS];
var sourcePaths = ({ generated }) => [
  ".",
  ...CONTROL.map((control) => `:(exclude)${control}`),
  ...(generated ?? []).map((file) => `:(exclude)${file}`)
];
var skipGenerated = ({ generated }) => (generated ?? []).map((file) => `--exclude=${file}`);
var configFile = (dir) => path.join(dir, DIR, "config.json");
var patchFile = (dir, id) => path.join(dir, DIR, id, `${id}.patch`);
var patchDoc = (dir, id) => path.join(dir, DIR, id, "PATCH.md");
var upstreamDoc = (dir, id) => path.join(dir, DIR, id, "UPSTREAM.md");

// src/platform/action.ts
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

// src/platform/env.ts
var { env } = process;
var filled = (value) => value === "" ? undefined : value;
var withheld = (name) => {
  const value = env[name];
  Reflect.deleteProperty(env, name);
  return value;
};
var oidcUrl = filled(withheld("ACTIONS_ID_TOKEN_REQUEST_URL"));
var oidcToken = filled(withheld("ACTIONS_ID_TOKEN_REQUEST_TOKEN"));
var oidc = oidcUrl === undefined || oidcToken === undefined ? undefined : { url: oidcUrl, token: oidcToken };
var ledgerPath = withheld("AUTOFORK_LEDGER");
var site = env.AUTOFORK_URL ?? "https://autofork.com";
var githubOutput = filled(env.GITHUB_OUTPUT);
var githubToken = filled(env.GH_TOKEN ?? env.GITHUB_TOKEN);
var gitConfigCount = Number(env.GIT_CONFIG_COUNT ?? 0);
var scratchParent = env.RUNNER_TEMP;
var onGithubRunner = env.RUNNER_ENVIRONMENT === "github-hosted";
var claudeToken = filled(env.CLAUDE_CODE_OAUTH_TOKEN);
var anthropicKey = filled(env.ANTHROPIC_API_KEY);
var codexHome = env.CODEX_HOME;
var insideClaudeCode = filled(env.CLAUDECODE) !== undefined;
var claudeEntrypoint = filled(env.CLAUDE_CODE_ENTRYPOINT);

// src/platform/action.ts
var say = (line) => {
  console.error(line);
};
var output = (values) => {
  if (githubOutput === undefined) {
    return;
  }
  const end = `autofork-${randomUUID()}`;
  writeFileSync(githubOutput, Object.entries(values).map(([key, value]) => value.includes(`
`) ? `${key}<<${end}
${value}
${end}
` : `${key}=${value}
`).join(""), { flag: "a" });
};

// src/platform/git.ts
import { cpSync, rmSync } from "node:fs";
import path2 from "node:path";

// src/platform/process.ts
import { spawnSync } from "node:child_process";
var MAX_OUTPUT = 2 ** 30;
var run = (command, args, cwd, env) => {
  const result = spawnSync(command, args, { cwd, env, maxBuffer: MAX_OUTPUT });
  const stderr = result.stderr;
  return {
    ok: result.status === 0,
    out: result.stdout,
    err: stderr?.toString().trim() ?? ""
  };
};
var installed = (bin) => run("sh", ["-c", `command -v ${bin}`], ".").ok;

// src/platform/git.ts
var botSettings = [
  ["commit.gpgsign", "false"],
  ["rebase.autoStash", "true"]
];
var bot = {
  ...process.env,
  GIT_AUTHOR_NAME: "autofork",
  GIT_AUTHOR_EMAIL: "autofork@users.noreply.github.com",
  GIT_COMMITTER_NAME: "autofork",
  GIT_COMMITTER_EMAIL: "autofork@users.noreply.github.com",
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true",
  GIT_CONFIG_COUNT: String(gitConfigCount + botSettings.length),
  ...Object.fromEntries(botSettings.flatMap(([key, value], index) => [
    [`GIT_CONFIG_KEY_${gitConfigCount + index}`, key],
    [`GIT_CONFIG_VALUE_${gitConfigCount + index}`, value]
  ]))
};
var gitBytes = (cwd, ...args) => {
  const result = run("git", args, cwd);
  if (!result.ok) {
    throw new AutoforkError(`git ${args.join(" ")}
${result.err}`);
  }
  return result.out;
};
var gitWith = (cwd, env, ...args) => {
  const result = run("git", args, cwd, env);
  if (!result.ok) {
    throw new AutoforkError(`git ${args.join(" ")}
${result.err}`);
  }
  return result.out.toString().trim();
};
var git = (cwd, ...args) => gitWith(cwd, undefined, ...args);
var short = (sha) => sha.slice(0, 12);
var reset = (dir, to = "HEAD") => {
  git(dir, "reset", "--hard", "--quiet", to);
  git(dir, "clean", "-fdq");
};
var gitDir = (dir) => git(dir, "rev-parse", "--path-format=absolute", "--git-dir");
var workingTree = (root, skip = []) => {
  const dir = gitDir(root);
  const index = path2.join(dir, "autofork-index");
  const env = { ...process.env, GIT_INDEX_FILE: index };
  cpSync(path2.join(dir, "index"), index, { preserveTimestamps: true });
  gitWith(root, env, "add", "-A", "--", ".", ...skip.map((file) => `:(exclude,literal)${file}`));
  const tree = gitWith(root, env, "write-tree");
  rmSync(index, { force: true });
  return tree;
};

// src/platform/github.ts
var githubApi = async (route) => await fetch(`https://api.github.com/${route}`, {
  headers: {
    accept: "application/vnd.github+json",
    ...githubToken === undefined ? undefined : { authorization: `Bearer ${githubToken}` }
  }
});
var githubRepo = (upstream) => /^(?:https:\/\/github\.com\/)?(?<repo>[\w.-]+\/[\w.-]+?)(?:\.git)?$/u.exec(upstream)?.groups?.repo;
var ORIGIN = /(?:^|[@/.])github\.com(?::\d+)?[/:](?<repo>[\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/u;
var origin = (root) => {
  for (const args of [
    ["remote", "get-url", "origin"],
    ["config", "--get", "remote.origin.url"]
  ]) {
    const repo = ORIGIN.exec(run("git", args, root).out.toString().trim())?.groups?.repo;
    if (repo !== undefined) {
      return repo;
    }
  }
  return "";
};

// src/cli/messages.ts
var firstSync = (repo) => `  gh workflow run autofork.yml${repo}`;
var claudeSteps = (repo) => `  claude setup-token
  gh secret set CLAUDE_CODE_OAUTH_TOKEN${repo}`;
var codexHint = (repo) => `For ChatGPT instead, give the fork a Codex sign-in of its own, since each refresh retires the last one. Turn on device code login in ChatGPT's security settings, then:
  sh -c 'd=$(mktemp -d) && trap "rm -rf \\"\\$d\\"" EXIT && CODEX_HOME="$d" codex login --device-auth && gh secret set CODEX_AUTH${repo} < "$d/auth.json"'
${firstSync(repo)}
Link it too (below): only a linked fork saves Codex's refreshed sign-ins, and without them it stops working within about a week.`;
var LINK_HINT = "GitHub's timer can run hours late. Run it on time and track spend: npx autofork link";
var FORK_OPTIONS = "[--follow <releases | channel | branch>] [--setup <command>] [--generated <files>] [--verify <command>] [--every <5m | 15m | 1h | 1d>]";
var USAGE = `autofork: Customized forks that maintain themselves.
Personal forks of open-source apps that auto-track upstream.

Usage:
  autofork fork <owner/repo>    fork it on GitHub, set it up and push
  autofork init <owner/repo>    set up a fork you already have, from inside it
  autofork save <id>            save your changes as the patch in .autofork/<id>
  autofork status               your patches, and changes no patch holds yet
  autofork sync                 rebuild on upstream; an agent heals what breaks
  autofork link                 have autofork.com start its syncs on time

Options for fork and init:
  --follow <what>               releases (upstream's Latest), a channel of them
                                by tag, like 'v*-nightly.*', or a branch.
                                Default: releases, or the default branch if
                                upstream has none
  --setup <command>             the command that installs dependencies
  --generated <files>           files setup writes, like lockfiles, comma
                                separated: rebuilt by setup, never patched
  --verify <command>            the command that checks a build
  --every <5m|15m|1h|1d>        how often GitHub's timer checks upstream.
                                Default: 15m, or 1h when the repo is private

A patch is .autofork/<id>/PATCH.md, saying what the change does and why, next
to <id>.patch, the diff. https://github.com/AVGVSTVS96/autofork
`;

// src/cli/setup.ts
import { existsSync as existsSync9, mkdirSync as mkdirSync3, readFileSync as readFileSync6, writeFileSync as writeFileSync7 } from "node:fs";
import path12 from "node:path";

// ../contract/src/schedule.ts
var EVERY = {
  "5m": "2-59/5 * * * *",
  "15m": "7-59/15 * * * *",
  "1h": "17 * * * *",
  "1d": "17 6 * * *"
};
var isEvery = (value) => Object.hasOwn(EVERY, value);
var LIMITS = { rebuilds: 10, month: 200, rebuild: 20 };
// ../contract/src/workflow.ts
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
// ../contract/src/ledger.ts
var OIDC_AUDIENCE = "autofork";
// src/platform/json.ts
var isObject = (value) => typeof value === "object" && value !== null;
var isText = (value) => typeof value === "string";
var isFilled = (value) => isText(value) && value !== "";
var isNumber = (value) => typeof value === "number";
var isBoolean = (value) => typeof value === "boolean";
var isTextList = (value) => Array.isArray(value) && value.every(isText);
var has = (value, key, is) => isObject(value) && is(Object.getOwnPropertyDescriptor(value, key)?.value);
var parseJson = (text, is) => {
  try {
    const value = JSON.parse(text);
    return is(value) ? value : undefined;
  } catch {
    return;
  }
};
var readBody = async (response, is) => parseJson(await response.text(), is);

// src/upstream/follow.ts
var isRelease = (value) => has(value, "tag_name", isText) && has(value, "draft", isBoolean) && has(value, "published_at", isText);
var isReleases = (value) => Array.isArray(value);
var isTagged = (value) => has(value, "tag_name", isText);
var NO_FOLLOW_HINT = `Follow a branch or another channel instead: set "follow" in ${DIR}/config.json`;
var upstreamUrl = (upstream) => /^[\w.-]+\/[\w.-]+$/u.test(upstream) ? `https://github.com/${upstream}.git` : upstream;
var parseFollow = (follow) => {
  if (follow === "releases") {
    return {};
  }
  if (!follow.includes("*")) {
    return { branch: follow };
  }
  const escaped = follow.split("*").map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/gu, "\\$&"));
  return { channel: new RegExp(`^${escaped.join(".*")}$`, "u") };
};
var readReleases = async (repo, route) => {
  let body;
  try {
    const response = await githubApi(`repos/${repo}/${route}`);
    body = response.ok ? await readBody(response, isObject) : undefined;
    if (!response.ok && response.status !== 404) {
      say(`can't read ${repo}'s releases (${response.status}), using its newest version tag`);
    }
  } catch {
    say(`can't reach GitHub for ${repo}'s releases, using its newest version tag`);
  }
  return body;
};
var releases = async (upstream, route) => {
  const repo = githubRepo(upstream);
  return repo === undefined ? undefined : await readReleases(repo, route);
};
var publishedOn = async (upstream, channel) => {
  const listed = await releases(upstream, "releases?per_page=100");
  return (isReleases(listed) ? listed : []).filter((release) => isRelease(release)).filter((release) => !release.draft && channel.test(release.tag_name)).toSorted((a, b) => b.published_at.localeCompare(a.published_at))[0]?.tag_name;
};
var newestTag = (root, upstream, channel) => git(root, "ls-remote", "--tags", "--refs", "--sort=-v:refname", upstreamUrl(upstream)).split(`
`).map((line) => line.split("\t")[1]?.replace("refs/tags/", "")).find((tag) => tag !== undefined && tag !== "" && (channel ? channel.test(tag) : !tag.includes("-")));
var latestPublished = async (upstream) => {
  const latest = await releases(upstream, "releases/latest");
  return isTagged(latest) ? latest.tag_name : undefined;
};
var latestRelease = async (root, upstream, channel) => {
  const published = channel ? await publishedOn(upstream, channel) : await latestPublished(upstream);
  return published !== undefined && published !== "" ? published : newestTag(root, upstream, channel);
};
var defaultBranch = (root, upstream) => {
  const head = run("git", ["ls-remote", "--symref", upstreamUrl(upstream), "HEAD"], root).out.toString();
  return /^ref: refs\/heads\/(?<branch>\S+)\s+HEAD/mu.exec(head)?.groups?.branch ?? "main";
};
var defaultFollow = async (root, upstream) => await latestRelease(root, upstream) === undefined ? defaultBranch(root, upstream) : "releases";

// src/upstream/fetch.ts
var SYNC_SUBJECT = /^auto(?:fork|patch): sync .+ to (?<sha>[0-9a-f]{7,40})$/u;
var fetchUpstream = async (root, { upstream, follow }) => {
  const url = upstreamUrl(upstream);
  const followed = parseFollow(follow);
  const tag = "branch" in followed ? undefined : await latestRelease(root, upstream, followed.channel);
  if (!("branch" in followed) && tag === undefined) {
    throw new AutoforkError(`${url} has no releases${followed.channel ? ` matching ${follow}` : ""}. ${NO_FOLLOW_HINT}`);
  }
  const ref = "branch" in followed ? `refs/heads/${followed.branch}` : `refs/tags/${tag}`;
  git(root, "fetch", "--quiet", "--no-tags", url, `+${ref}:refs/autofork/upstream`, "+HEAD:refs/autofork/branch");
  return { tip: git(root, "rev-parse", "refs/autofork/upstream^{commit}"), tag };
};
var lastSync = (root) => {
  const subjects = git(root, "log", "--first-parent", "--format=%s", "-E", "--grep=^auto(fork|patch): sync ", "HEAD").split(`
`);
  let last;
  for (const subject of subjects) {
    const synced = SYNC_SUBJECT.exec(subject)?.groups?.sha;
    last = synced === undefined ? undefined : run("git", ["rev-parse", "--verify", "--quiet", `${synced}^{commit}`], root);
    if (last?.ok === true) {
      break;
    }
  }
  return last?.ok === true ? last : undefined;
};
var baseline = (root) => {
  const base = lastSync(root) ?? run("git", ["merge-base", "HEAD", "refs/autofork/branch"], root);
  if (!base.ok) {
    throw new AutoforkError("this branch shares no history with upstream");
  }
  return base.out.toString().trim();
};
var syncTarget = (root, config, base, candidate) => {
  const candidateIsBehind = candidate !== base && run("git", ["merge-base", "--is-ancestor", candidate, base], root).ok;
  const forkHasHistory = lastSync(root) !== undefined || !run("git", ["diff", "--quiet", base, "HEAD", "--", ...sourcePaths(config)], root).ok;
  return candidateIsBehind && forkHasHistory ? base : candidate;
};

// src/ledger/ledger.ts
import { renameSync, writeFileSync as writeFileSync2 } from "node:fs";

// src/platform/files.ts
import { readFileSync } from "node:fs";
var readText = (file) => {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return "";
  }
};

// src/ledger/site.ts
var STALE_CONNECTION = Symbol("a connection the server closed while an agent ran");
var TIMEOUT = 1e4;
var isMinted = (value) => has(value, "value", isText);
var send = async ({ url, token }, route, body) => {
  const minted = await fetch(`${url}&audience=${OIDC_AUDIENCE}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const answer = await readBody(minted, isMinted);
  return minted.ok && answer !== undefined ? await fetch(`${site}/api/${route}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${answer.value}`, "content-type": "application/json" },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT)
  }) : undefined;
};
var attempt = async (credentials, route, body) => {
  try {
    return await send(credentials, route, body);
  } catch (error) {
    return error instanceof Error && error.name === "TimeoutError" ? undefined : STALE_CONNECTION;
  }
};
var reportsToSite = oidc !== undefined;
var callSite = async (route, body) => {
  const first = oidc === undefined ? undefined : await attempt(oidc, route, body);
  const answer = first === STALE_CONNECTION && oidc !== undefined ? await attempt(oidc, route, body) : first;
  return answer === STALE_CONNECTION ? undefined : answer;
};

// src/ledger/ledger.ts
var isTallied = (value) => has(value, "cost", isNumber);
var isRows = (value) => Array.isArray(value);
var thisMonth = () => new Date().toISOString().slice(0, 7);
var ledger = {
  file: "",
  month: "",
  rebuilds: []
};
var usd = (amount) => `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
var openLedger = (file) => {
  const month = thisMonth();
  const saved = parseJson(readText(file), isObject);
  const rows = has(saved, "month", (value) => value === month) && has(saved, "rebuilds", isRows) ? saved.rebuilds : [];
  ledger = { file, month, rebuilds: rows.filter((row) => isTallied(row)) };
};
var saveLedger = () => {
  const { file, ...kept } = ledger;
  if (file === "") {
    return;
  }
  try {
    writeFileSync2(`${file}.tmp`, `${JSON.stringify(kept, null, 2)}
`);
    renameSync(`${file}.tmp`, file);
  } catch (error) {
    say(`couldn't write the spend tally to ${file}: ${messageOf(error)}`);
  }
};
var startRebuild = (row) => {
  ledger.rebuilds.push(row);
  saveLedger();
  output({ ledger: "changed" });
};
var finishRebuild = (row, status, cost) => {
  row.status = status;
  if (cost !== undefined) {
    row.cost = cost;
  }
  saveLedger();
};
var siteTotals = async () => {
  const answer = await callSite("ledger");
  const remote = answer?.status === 200 ? await readBody(answer, isObject) : undefined;
  if (reportsToSite && remote === undefined) {
    say("couldn't read this month's spend from autofork.com, so only this fork's own count is used");
  }
  return {
    rebuilds: has(remote, "rebuilds", isNumber) ? remote.rebuilds : 0,
    spent: has(remote, "spent", isNumber) ? remote.spent : 0
  };
};
var nextMonth = () => {
  const next = new Date;
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  return next.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
};
var shortfall = async (limits, count = 1) => {
  if (ledger.month !== thisMonth()) {
    openLedger(ledger.file);
  }
  const remote = await siteTotals();
  const rebuilds = Math.max(ledger.rebuilds.length, remote.rebuilds);
  const spent = Math.max(ledger.rebuilds.reduce((sum, row) => sum + row.cost, 0), remote.spent);
  const cost = count * limits.rebuild;
  if (rebuilds + count <= limits.rebuilds && spent + cost <= limits.month) {
    return;
  }
  const some = count === 1 ? "a rebuild" : `${count} rebuilds`;
  const over = (used, paid) => [
    used + count > limits.rebuilds ? "rebuilds" : undefined,
    paid + cost > limits.month ? "month" : undefined
  ].filter((key) => key !== undefined);
  const never = over(0, 0);
  const keys = never.length > 0 ? never : over(rebuilds, spent);
  const why = keys.map((key) => key === "rebuilds" ? `${some} won't fit in this month's ${limits.rebuilds} (${rebuilds} used)` : `${some} may cost ${usd(cost)} and ${usd(Math.max(0, limits.month - spent))} of this month's ${usd(limits.month)} is left`).join(", and ");
  const raise = `raise ${keys.map((key) => `"${key}"`).join(" and ")} in "limits" in ${DIR}/config.json`;
  const when = never.length > 0 ? `It needs you to ${raise}.` : `It runs ${nextMonth()} 1 (UTC), or ${raise}.`;
  return { why, full: `${why}. ${when}` };
};

// src/patches/apply.ts
import { existsSync } from "node:fs";
import path3 from "node:path";
var touched = (dir, file, config) => run("git", ["apply", "--numstat", "-z", ...skipGenerated(config), file], dir).out.toString().split("\x00").filter(Boolean).map((line) => line.split("\t")[2] ?? "");
var apply = (dir, file, config) => {
  if (run("git", ["apply", "--3way", "--whitespace=nowarn", ...skipGenerated(config), file], dir).ok) {
    return true;
  }
  reset(dir);
  return false;
};
var alreadyDeleted = (dir, file, only) => !existsSync(path3.join(dir, file)) && run("git", ["apply", "--reverse", "--check", ...only], dir).ok;
var merge = (dir, patch, config) => {
  const left = { conflicted: [], rejected: [], missed: [], gone: [] };
  for (const file of touched(dir, patch, config)) {
    const only = [
      `--include=${file.replaceAll(/[*?[\\]/gu, "\\$&")}`,
      "--whitespace=nowarn",
      patch
    ];
    if (run("git", ["apply", "--3way", ...only], dir).ok) {
      continue;
    }
    if (git(dir, "ls-files", "--unmerged", "--", `:(literal)${file}`)) {
      left.conflicted.push(file);
    } else if (run("git", ["apply", "--reject", ...only], dir).ok) {
      continue;
    } else if (existsSync(path3.join(dir, `${file}.rej`))) {
      left.rejected.push(file);
    } else if (alreadyDeleted(dir, file, only)) {
      left.gone.push(file);
    } else {
      left.missed.push(file);
    }
  }
  git(dir, "reset", "--quiet");
  return left;
};
var unfinished = ({ conflicted, rejected, missed, gone }, to, from) => {
  const files = [...conflicted, ...rejected, ...missed, ...gone];
  if (files.length === 0) {
    return "";
  }
  const left = [
    conflicted.length > 0 ? `the conflict markers in ${conflicted.join(", ")}` : "",
    rejected.length > 0 ? `the hunks that didn't fit, in ${rejected.map((file) => `${file}.rej`).join(", ")}` : "",
    missed.length > 0 ? `the changes to ${missed.join(", ")}, which didn't apply at all` : "",
    gone.length > 0 ? `the deletion of ${gone.join(", ")}, which upstream deleted too` : ""
  ].filter(Boolean);
  const changes = from !== undefined && from !== to ? ` To see what upstream changed under them: git diff ${from} ${to} -- ${files.join(" ")}` : "";
  return ` Git applied the rest of it. What's left: ${left.join("; ")}.${changes}`;
};

// src/patches/files.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
var PATCH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
var unbuilt = (dir, id) => {
  const file = patchFile(dir, id);
  return !existsSync2(file) || readFileSync2(file).length === 0;
};
var requireIntent = (root, id) => {
  if (readText(patchDoc(root, id)).trim() === "") {
    throw new AutoforkError(`${DIR}/${id}/PATCH.md is empty: say what the patch does and why. It's what the agent rebuilds it from.`);
  }
};

// src/build/heal.ts
import { existsSync as existsSync5, readFileSync as readFileSync4, rmSync as rmSync4, writeFileSync as writeFileSync4 } from "node:fs";
import path8 from "node:path";

// src/agent/run.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { closeSync, openSync, readFileSync as readFileSync3, rmSync as rmSync2 } from "node:fs";

// src/agent/command.ts
import { existsSync as existsSync3 } from "node:fs";
import { homedir } from "node:os";
import path4 from "node:path";
var runLabel = insideClaudeCode ? "autofork" : claudeEntrypoint ?? "autofork";
var codexDir = codexHome ?? path4.join(homedir(), ".codex");
var REBUILD_TOOLS = "Bash,Read,Edit,Write,Glob,Grep";
var NO_UPSTREAM_MCP_SERVERS = "--strict-mcp-config";
var NO_CODEX_CONNECTORS = "--ignore-user-config --disable apps";
var CLAUDE_SIGNED_OUT = "Claude Code isn't signed in, so no agent can run: give the autofork step CLAUDE_CODE_OAUTH_TOKEN (claude setup-token prints one), or CODEX_AUTH for ChatGPT, from the fork's secrets";
var claudeSignedIn = (dir) => claudeToken !== undefined || anthropicKey !== undefined || !onGithubRunner || installed("claude") && !/"loggedIn":\s*false/u.test(run("claude", ["auth", "status", "--json"], dir).out.toString());
var codexSignedIn = () => claudeToken === undefined && existsSync3(path4.join(codexDir, "auth.json"));
var signedIn = (config, dir) => config.agent !== undefined || codexSignedIn() || claudeSignedIn(dir);
var agentCommand = (config, cap, dir) => {
  if (config.agent !== undefined) {
    return { agent: "custom", command: config.agent };
  }
  if (codexSignedIn()) {
    const codex = installed("codex") ? "codex" : "npx -y @openai/codex";
    return {
      agent: "codex",
      command: `${codex} exec --json --dangerously-bypass-approvals-and-sandbox ${NO_CODEX_CONNECTORS} -`
    };
  }
  if (!claudeSignedIn(dir)) {
    throw new AutoforkError(CLAUDE_SIGNED_OUT);
  }
  const claude = installed("claude") ? "claude" : "npx -y @anthropic-ai/claude-code";
  return {
    agent: "claude",
    command: `${claude} -p --dangerously-skip-permissions --output-format json --max-budget-usd ${cap} --tools ${REBUILD_TOOLS} ${NO_UPSTREAM_MCP_SERVERS}`
  };
};

// src/agent/spend.ts
import { readdirSync } from "node:fs";
import path5 from "node:path";
var spendOf = (cost, model) => {
  const spend = {};
  if (cost !== undefined) {
    spend.cost = cost;
  }
  if (model !== undefined) {
    spend.model = model;
  }
  return spend;
};
var CODEX_MODEL = /"model":"(?<model>[^"]+)"/u;
var PRICES_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
var isList = (value) => Array.isArray(value);
var isResult = (value) => has(value, "type", (type) => type === "result");
var isCount = (value) => value === undefined || isNumber(value);
var isModelCost = (value) => has(value, "costUSD", isCount);
var isModelUsage = (value) => isObject(value) && Object.values(value).every((cost) => isModelCost(cost));
var isRate = (value) => value === undefined || value === null || isNumber(value);
var isPrice = (value) => has(value, "input_cost_per_token", isRate) && has(value, "cache_read_input_token_cost", isRate) && has(value, "cache_creation_input_token_cost", isRate) && has(value, "output_cost_per_token", isRate);
var isUsage = (value) => has(value, "input_tokens", isCount) && has(value, "cached_input_tokens", isCount) && has(value, "cache_write_input_tokens", isCount) && has(value, "output_tokens", isCount);
var isEvent = (value, type) => has(value, "type", (found) => found === type);
var claudeSpend = (out) => {
  let parsed;
  try {
    parsed = JSON.parse(out.toString().trim().split(`
`).at(-1) ?? "");
  } catch {
    process.stderr.write(out);
    return {};
  }
  const report = isList(parsed) ? parsed.findLast((message) => isResult(message)) : parsed;
  if (!isObject(report)) {
    return {};
  }
  const said = [
    has(report, "result", isText) ? report.result : undefined,
    ...has(report, "errors", isList) ? report.errors : []
  ];
  for (const line of said) {
    if (isText(line)) {
      say(line);
    }
  }
  const models = has(report, "modelUsage", isModelUsage) ? Object.entries(report.modelUsage) : [];
  return spendOf(has(report, "total_cost_usd", isNumber) ? report.total_cost_usd : undefined, models.toSorted(([, a], [, b]) => (b.costUSD ?? 0) - (a.costUSD ?? 0))[0]?.[0]);
};
var readCodexEvents = (out) => {
  let thread;
  let usage;
  for (const line of out.toString().split(`
`)) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      if (line.trim()) {
        say(line);
      }
      continue;
    }
    if (isEvent(event, "thread.started") && has(event, "thread_id", isText)) {
      thread = event.thread_id;
    }
    const said = isEvent(event, "item.completed") ? has(event, "item", (item) => has(item, "text", isText)) && event.item.text : has(event, "message", isText) && event.message;
    if (isText(said)) {
      say(said);
    }
    if (isEvent(event, "turn.failed") && has(event, "error", (failure) => has(failure, "message", isFilled))) {
      say(event.error.message);
    }
    if (isEvent(event, "turn.completed")) {
      usage = has(event, "usage", isUsage) ? event.usage : undefined;
    }
  }
  return { thread, usage };
};
var sessionFiles = (sessions) => {
  try {
    return readdirSync(sessions, { recursive: true, encoding: "utf-8" });
  } catch {
    return [];
  }
};
var modelFromCodexSession = (thread) => {
  const sessions = path5.join(codexDir, "sessions");
  const rollout = sessionFiles(sessions).find((name) => name.endsWith(`${thread}.jsonl`));
  return rollout === undefined ? undefined : CODEX_MODEL.exec(readText(path5.join(sessions, rollout)))?.groups?.model;
};
var table;
var fetchPrices = async () => {
  const response = await fetch(PRICES_URL, { signal: AbortSignal.timeout(30000) });
  return response.ok ? await readBody(response, isObject) : undefined;
};
var prices = async (model) => {
  table ??= fetchPrices();
  let rates;
  try {
    rates = await table;
  } catch {
    table = undefined;
  }
  if (has(rates, model, isPrice)) {
    return rates[model];
  }
  return has(rates, `openai/${model}`, isPrice) ? rates[`openai/${model}`] : undefined;
};
var costOf = (usage, price) => {
  const input = usage.input_tokens ?? 0;
  const cached = usage.cached_input_tokens ?? 0;
  const written = usage.cache_write_input_tokens ?? 0;
  const inputRate = Number(price.input_cost_per_token);
  return (input - cached - written) * inputRate + cached * (price.cache_read_input_token_cost ?? inputRate) + written * (price.cache_creation_input_token_cost ?? inputRate) + (usage.output_tokens ?? 0) * Number(price.output_cost_per_token);
};
var codexSpend = async (out) => {
  const { thread, usage } = readCodexEvents(out);
  if (usage === undefined || !Object.values(usage).some((count) => isNumber(count) && count > 0)) {
    return {};
  }
  const model = thread === undefined ? undefined : modelFromCodexSession(thread);
  const price = model === undefined ? undefined : await prices(model);
  if (price === undefined || !((price.input_cost_per_token ?? 0) > 0)) {
    say(`couldn't price ${model ?? "Codex's model"}, so this rebuild counts at its cap`);
    return spendOf(undefined, model);
  }
  const cost = costOf(usage, price);
  return spendOf(Number.isFinite(cost) ? cost : undefined, model);
};

// src/agent/run.ts
var spenders = {
  claude: claudeSpend,
  codex: codexSpend,
  custom: () => ({})
};
var openRow = async (row) => {
  startRebuild(row);
  const opened = await callSite("ledger", {
    patch: row.patch,
    agent: row.agent,
    cap: row.cap
  });
  if (opened?.status === 403) {
    const refused = await readBody(opened, (value) => has(value, "error", isText));
    say(`autofork.com didn't record this rebuild: ${refused?.error ?? "refused"}`);
    return { id: undefined, refused: true };
  }
  const answer = opened?.status === 201 ? await readBody(opened, (value) => has(value, "id", isText)) : undefined;
  return { id: answer?.id, refused: false };
};
var printedBy = (dir, agent, command, prompt, env) => {
  const printed = `${dir}-agent.out`;
  const out = openSync(printed, "w");
  const result = spawnSync2("sh", ["-c", command], {
    cwd: dir,
    env: { ...env, CLAUDE_CODE_ENTRYPOINT: runLabel },
    input: prompt,
    stdio: ["pipe", agent === "custom" ? "inherit" : out, "inherit"]
  });
  closeSync(out);
  const stdout = readFileSync3(printed);
  rmSync2(printed);
  return { ok: result.status === 0, stdout };
};
var runAgent = async (config, dir, what, prompt, env = process.env) => {
  const { limits } = config;
  const short = await shortfall(limits);
  if (short !== undefined) {
    throw new NoRoomError(`${what} waits: ${short.full}`, short.why);
  }
  const { agent, command } = agentCommand(config, limits.rebuild, dir);
  const row = {
    patch: what,
    agent,
    cap: limits.rebuild,
    cost: limits.rebuild,
    status: "running",
    at: new Date().toISOString()
  };
  const { id, refused } = await openRow(row);
  const { ok, stdout } = printedBy(dir, agent, command, prompt, env);
  const spend = await spenders[agent](stdout);
  const status = ok ? "done" : "stopped";
  finishRebuild(row, status, spend.cost);
  const answer = id === undefined ? undefined : await callSite("ledger/close", { id, status, ...spend });
  const closed = answer?.ok === true;
  if (reportsToSite && !refused && !closed) {
    say("couldn't report this rebuild's cost to autofork.com");
  }
  say(`${what} cost ${spend.cost === undefined ? `up to ${usd(row.cap)}` : usd(spend.cost)}`);
  return ok;
};

// src/config/types.ts
var CHECKS = ["setup", "verify"];

// src/build/checks.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import { writeFileSync as writeFileSync3 } from "node:fs";
import path7 from "node:path";

// src/build/worktree.ts
import { createHash } from "node:crypto";
import { cpSync as cpSync2, existsSync as existsSync4, rmSync as rmSync3 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import path6 from "node:path";
var KEPT_IN_DIR = /\.(?:patch|md|json)$|\/\.gitignore$/u;
var scratch = (root) => {
  const parent = scratchParent ?? path6.join(homedir2(), ".cache");
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 8);
  return path6.join(parent, "autofork", `${path6.basename(root)}-${hash}`);
};
var worktree = (root, base) => {
  const dir = scratch(root);
  run("git", ["worktree", "remove", "--force", "--force", dir], root);
  rmSync3(dir, { recursive: true, force: true });
  git(root, "worktree", "prune");
  git(root, "worktree", "add", "--detach", "--quiet", dir, base);
  for (const control of CONTROL) {
    rmSync3(path6.join(dir, control), { recursive: true, force: true });
    if (existsSync4(path6.join(root, control))) {
      cpSync2(path6.join(root, control), path6.join(dir, control), { recursive: true });
    }
  }
  return dir;
};
var cleanup = (root, dir) => {
  run("git", ["worktree", "remove", "--force", dir], root);
};
var changed = (dir) => git(dir, "status", "--porcelain").length > 0;
var commit = (dir, message) => {
  git(dir, "add", "-A");
  const hidden = git(dir, "ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--", DIR).split("\x00").filter((file) => KEPT_IN_DIR.test(file));
  if (hidden.length > 0) {
    git(dir, "add", "-f", "--", ...hidden);
  }
  gitWith(dir, bot, "commit", "--quiet", "--no-verify", "--allow-empty", "-m", message);
  return git(dir, "rev-parse", "HEAD");
};
var restoreControl = (dir, base) => {
  git(dir, "rm", "-rq", "--cached", "--ignore-unmatch", "--", ...CONTROL);
  const owned = git(dir, "ls-tree", "--name-only", base, "--", ...CONTROL).split(`
`).filter(Boolean);
  if (owned.length > 0) {
    git(dir, "checkout", base, "--", ...owned);
  }
  git(dir, "clean", "-fdxq", "--", ...CONTROL);
};

// src/build/checks.ts
var runCheck = (build, check, command) => {
  const result = spawnSync3("sh", ["-c", `exec 2>&1
${command}`], {
    cwd: build.dir,
    stdio: ["inherit", "pipe", "inherit"],
    maxBuffer: MAX_OUTPUT
  });
  process.stderr.write(result.stdout);
  if (result.status === 0) {
    return;
  }
  return { check, lines: result.stdout.toString().trimEnd().split(`
`).slice(-100).join(`
`) };
};
var generatedChanges = (config, dir) => {
  const generated = config.generated ?? [];
  if (generated.length === 0) {
    return;
  }
  for (const file of generated) {
    run("git", ["add", "-A", "--", file], dir);
  }
  const diff = gitBytes(dir, "diff-index", "--cached", "-p", "--binary", "HEAD", "--", ...generated);
  if (diff.length === 0) {
    return;
  }
  const file = path7.join(gitDir(dir), "autofork-generated.patch");
  writeFileSync3(file, diff);
  return file;
};
var prepare = (config, build) => {
  if (config.setup === undefined) {
    return;
  }
  const ready = `${git(build.dir, "rev-parse", "HEAD")} ${config.setup}`;
  if (build.ready !== ready) {
    say(`setup: ${config.setup}`);
    const failed = runCheck(build, "setup", config.setup);
    if (failed !== undefined) {
      return failed;
    }
    build.ready = ready;
    build.rebuilt = generatedChanges(config, build.dir);
    reset(build.dir);
  }
  if (build.rebuilt !== undefined && !git(build.dir, "status", "--porcelain", "--", ...config.generated ?? [])) {
    git(build.dir, "apply", "--whitespace=nowarn", build.rebuilt);
  }
  return;
};
var prepared = (config, build) => {
  if (prepare(config, build) !== undefined) {
    throw new AutoforkError(`setup fails on ${short(git(build.dir, "rev-parse", "HEAD"))}: ${config.setup ?? ""}`);
  }
};
var regenerate = (config, build) => {
  if ((config.generated ?? []).length === 0) {
    return;
  }
  prepared(config, build);
  commit(build.dir, "generated");
};
var failureAt = (config, build, step) => {
  reset(build.dir, step);
  return prepare(config, build) ?? (config.verify === undefined ? undefined : runCheck(build, "verify", config.verify));
};

// src/build/prompts.ts
var SYNCING = (upstream) => `You are keeping a patched fork of ${upstream} in sync. The fork is upstream plus a stack of patches, each one described in ${DIR}/<id>/PATCH.md.`;
var pickChecks = ({ setup }, source) => `This fork has no check yet. From upstream's CI (\`git show ${source}:.github/workflows\`), write ${DIR}/config.json's ${setup === undefined ? `"setup", which installs dependencies, and "verify", which checks a build, each one \`sh -c\` command. A sync runs them on a fresh machine and puts the checkout back as git has it after \`setup\`, so \`setup\` installs all \`verify\` needs, outside the checkout or where git ignores it. Both have to pass on upstream alone too, or the sync drops them.` : `"verify", which checks a build, as one \`sh -c\` command. A sync runs it on a fresh machine after \`${setup}\`, so it can use only what that installs. It has to pass on upstream alone too, or the sync drops it.`}`;
var runChecks = ({ setup, verify }, after) => `Run upstream's own checks for the code you touched, and ${verify === undefined ? "your `verify`" : `\`${verify}\``}, which the sync has to pass.${setup === undefined ? "" : ` Dependencies are installed: \`${setup}\` ran here, so run it again if you change them.`} Fix what your change breaks.${after.length > 0 ? ` Patches after this one aren't applied yet: ${after.join(", ")}. Each goes on top of yours, so leave what its PATCH.md asks for to it.` : ""}`;
var healPrompt = (config, build, id, broken) => {
  const index = config.patches.indexOf(id);
  const before = config.patches.slice(0, index);
  const after = config.patches.slice(index + 1).filter((later) => !build.upstreamHas.has(later));
  const fresh = unbuilt(build.dir, id);
  const generated = config.generated ?? [];
  const steps = [
    `Read ${DIR}/${id}/PATCH.md. It says what the patch does and why, and that's the contract.`,
    ...fresh ? [] : [
      `${DIR}/${id}/${id}.patch is how it was done before. Use it as a guide, not as text to force in.`
    ],
    "Build it on what upstream has now, the smallest change that fully does what PATCH.md says: where upstream has its own version of what the patch touches, change that rather than bringing the old one back. Follow upstream's code and conventions, and leave everything else alone.",
    ...config.verify === undefined ? [pickChecks(config, build.source)] : [],
    runChecks(config, after),
    ...fresh ? [
      `Add a short paragraph to the end of ${DIR}/${id}/PATCH.md on why it's built the way it is, for whoever rebuilds it after upstream moves. Keep what's there as it is.`
    ] : []
  ];
  return `${SYNCING(config.upstream)}

This checkout is upstream at ${build.source}${before.length > 0 ? `, with ${before.join(", ")} already applied` : ""}. ${fresh ? `Patch "${id}" is new and hasn't been built yet.` : broken}

${steps.map((step, number) => `${number + 1}. ${step}`).join(`
`)}

The sync keeps your source change and puts ${DIR}/ and ${WORKFLOWS}/ back after you, except what this asks you to write there. Remove anything your checks generated that git would pick up${generated.length > 0 ? `, but leave ${generated.join(", ")}, which the sync rebuilds` : ""}.
If upstream already does what PATCH.md asks, or something close enough that building it would duplicate upstream's own version, write one line saying what upstream does to ${DIR}/${id}/UPSTREAM.md, and the sync leaves the patch out.`;
};
var fixPrompt = (config, build, ids, failed, from) => {
  const paused = ids.filter((id) => build.upstreamHas.has(id));
  const later = config.patches.slice(ids.length);
  const generated = config.generated ?? [];
  const changes = from === build.source ? "" : `

To see what upstream changed: git diff --stat ${from} ${build.source}`;
  const base = build.steps[0];
  return `${SYNCING(config.upstream)}

This checkout is upstream at ${build.source} with the patches on top, one commit each, named by its id: ${ids.join(", ")}.${paused.length > 0 ? ` Upstream already has ${paused.join(", ")}: leave ${paused.length === 1 ? "its commit" : "their commits"} empty.` : ""} They all apply, but \`${config[failed.check] ?? ""}\` fails with them. Its last lines:

\`\`\`
${failed.lines}
\`\`\`${changes}

Make it pass. Fold each fix into the commit of the patch it belongs to (git commit --fixup, then an autosquash rebase onto ${base}), built on what upstream has now and in upstream's code and conventions, so each patch still does what its PATCH.md says. When you're done, the commits on ${base} are these patches, one each, named by its id, in this order.${config.setup !== undefined && failed.check === "verify" ? ` Dependencies are installed: \`${config.setup}\` ran here, so run it again if you change them.` : ""}${later.length > 0 ? ` Patches after these aren't applied yet: ${later.join(", ")}. Each goes on top, so leave what its PATCH.md asks for to it.` : ""}

The sync keeps your commits and puts ${DIR}/ and ${WORKFLOWS}/ back after you, except what this asks you to write there. Leave out of your commits anything your checks generated${generated.length > 0 ? `, and the changes setup made to ${generated.join(", ")}, which the sync rebuilds` : ""}.
If upstream now does what a patch's PATCH.md asks, or something close enough that the patch would duplicate upstream's own version, edit that patch's commit so it's empty, keeping the commit, and write one line saying what upstream does to ${DIR}/<id>/UPSTREAM.md. The sync leaves the patch out.`;
};

// src/build/types.ts
var lastStep = ({ steps }) => steps.at(-1) ?? steps[0];
var stepAt = ({ steps }, index) => {
  const step = steps[index];
  if (step === undefined) {
    throw new RangeError(`the build has ${steps.length} steps, not ${index + 1}`);
  }
  return step;
};
var stepPairs = ([first, ...rest]) => {
  let from = first;
  return rest.map((to) => {
    const pair = { from, to };
    from = to;
    return pair;
  });
};

// src/build/heal.ts
var CONFLICT_MARKER = /^(?:<{7} ours|>{7} theirs)\r?$/mu;
var isCommand = (value) => isText(value) && value.trim() !== "";
var checksIn = (dir) => {
  const written = parseJson(readText(configFile(dir)), isObject);
  if (written === undefined) {
    return;
  }
  const checks = {};
  for (const key of CHECKS) {
    if (has(written, key, isCommand)) {
      checks[key] = written[key];
    }
  }
  return checks;
};
var keepChecks = (config, written) => {
  if (config.verify !== undefined) {
    return;
  }
  if (written === undefined) {
    say(`the agent left ${DIR}/config.json unreadable, so the checks it picked weren't kept`);
    return;
  }
  for (const key of CHECKS) {
    const command = written[key];
    if (config[key] === undefined && command !== undefined) {
      config[key] = command;
      config.picked = { ...config.picked, [key]: command };
    }
  }
};
var nothingLeftButDeletions = (config, build, healing) => healing.left !== undefined && healing.left.conflicted.length === 0 && healing.left.rejected.length === 0 && healing.left.missed.length === 0 && !run("git", ["diff", "--quiet", healing.step, healing.before, "--", ...sourcePaths(config)], build.dir).ok;
var keepHeal = (config, build, healing) => {
  const { id, step, left, rejects, before, fresh, wish } = healing;
  const doing = fresh ? "building" : "healing";
  git(build.dir, "reset", "--soft", "--quiet", step);
  const reason = readText(upstreamDoc(build.dir, id)).trim();
  const doc = patchDoc(build.dir, id);
  const why = fresh ? readText(doc) : "";
  const written = checksIn(build.dir);
  restoreControl(build.dir, step);
  if (reason) {
    keepChecks(config, written);
    reset(build.dir, step);
    build.upstreamHas.set(id, reason);
    return;
  }
  const marked = (left?.conflicted ?? []).filter((file) => {
    const conflicted = path8.join(build.dir, file);
    return existsSync5(conflicted) && CONFLICT_MARKER.test(readFileSync4(conflicted, "utf8"));
  });
  if (marked.length > 0) {
    throw new AutoforkError(`the agent left conflict markers in ${marked.join(", ")} while ${doing} ${id}`);
  }
  if (workingTree(build.dir, rejects) === before && !nothingLeftButDeletions(config, build, healing)) {
    throw new AutoforkError(`the agent changed nothing while ${doing} ${id}`);
  }
  if (why.startsWith(wish)) {
    writeFileSync4(doc, why);
  }
  keepChecks(config, written);
  build.healed.set(id, fresh ? "built" : "healed");
};
var heal = async (config, build, id, broken, patch) => {
  prepared(config, build);
  const left = patch === undefined ? undefined : merge(build.dir, patch.file, config);
  const rejects = left?.rejected.map((file) => `${file}.rej`) ?? [];
  const healing = {
    id,
    step: lastStep(build),
    left,
    rejects,
    before: workingTree(build.dir, rejects),
    fresh: unbuilt(build.dir, id),
    wish: readFileSync4(patchDoc(build.dir, id), "utf8").trimEnd()
  };
  const prompt = healPrompt(config, build, id, broken + (left === undefined ? "" : unfinished(left, build.source, patch?.from)));
  const doing = healing.fresh ? "building" : "healing";
  say(`${doing} ${id}`);
  try {
    if (!await runAgent(config, build.dir, id, prompt, bot)) {
      throw new AutoforkError(`the agent failed while ${doing} ${id}`);
    }
    keepHeal(config, build, healing);
  } finally {
    for (const file of rejects) {
      rmSync4(path8.join(build.dir, file), { force: true });
    }
  }
};

// src/build/fix.ts
import { existsSync as existsSync6 } from "node:fs";
import path9 from "node:path";

// src/patches/id.ts
import { spawnSync as spawnSync4 } from "node:child_process";
var patchId = (config, dir, from, to) => spawnSync4("git", ["patch-id", "--stable"], {
  cwd: dir,
  input: gitBytes(dir, "diff-tree", "-p", "-U0", "--binary", from, to, "--", ...sourcePaths(config))
}).stdout.toString().split(" ")[0] ?? "";

// src/build/fix.ts
var passesAt = (config, build, step) => failureAt(config, build, step) === undefined;
var justRebuiltFails = (config, build, ids, alone) => {
  const last = ids.findLastIndex((id) => build.healed.has(id));
  return last !== -1 && (last === 0 || !alone || passesAt(config, build, stepAt(build, last))) && (last === ids.length - 1 || !passesAt(config, build, stepAt(build, last + 1)));
};
var pauseWhatUpstreamHas = (build, ids) => {
  const pausing = new Set;
  for (const id of ids) {
    const reason = readText(upstreamDoc(build.dir, id)).trim();
    if (reason && !build.upstreamHas.has(id)) {
      build.upstreamHas.set(id, reason);
      build.healed.delete(id);
      pausing.add(id);
    }
  }
  return pausing;
};
var requireOneCommitPerPatch = (build, ids, check) => {
  const base = build.steps[0];
  const rebasing = ["rebase-merge", "rebase-apply"].some((state) => existsSync6(path9.resolve(build.dir, git(build.dir, "rev-parse", "--git-path", state))));
  if (rebasing) {
    throw new AutoforkError(`the agent left a rebase unfinished while fixing ${check}`);
  }
  const onUpstream = run("git", ["merge-base", "--is-ancestor", base, "HEAD"], build.dir).ok;
  if (!onUpstream || git(build.dir, "log", "--reverse", "--format=%s", `${base}..HEAD`) !== ids.join(`
`)) {
    throw new AutoforkError(`the agent's commits on upstream aren't ${ids.join(", ")}, one per patch in that order, so nothing was pushed`);
  }
};
var readBackPatches = (config, build, ids, pausing) => {
  const was = stepPairs(build.steps);
  const base = build.steps[0];
  build.steps = [base, ...git(build.dir, "rev-list", "--reverse", `${base}..HEAD`).split(`
`)];
  const now = stepPairs(build.steps);
  for (const [index, id] of ids.entries()) {
    const before = was[index];
    const after = now[index];
    const wasId = before === undefined ? "" : patchId(config, build.dir, before.from, before.to);
    const nowId = after === undefined ? "" : patchId(config, build.dir, after.from, after.to);
    if (build.upstreamHas.has(id)) {
      if (nowId) {
        throw new AutoforkError(pausing.has(id) ? `the agent wrote UPSTREAM.md for ${id} but left its change in, so nothing was pushed` : `the agent's fix changed ${id}, which upstream already has, so nothing was pushed`);
      }
    } else if (wasId && !nowId) {
      throw new AutoforkError(`the agent's fix left ${id} with nothing to add, so nothing was pushed: say in the PATCH.md files which patch makes which change, or merge them into one`);
    } else if (nowId !== wasId) {
      build.healed.set(id, build.healed.get(id) ?? "healed");
    }
  }
};
var fix = async (config, build, failed, from, alone) => {
  const ids = config.patches.slice(0, build.steps.length - 1);
  const command = config[failed.check] ?? "";
  if (ids.every((id) => build.upstreamHas.has(id))) {
    if (ids.length < config.patches.length) {
      return;
    }
    throw new AutoforkError(`${failed.check} fails on upstream ${short(build.source)}, which has every patch: ${command}`);
  }
  if (justRebuiltFails(config, build, ids, alone)) {
    const last = ids.findLast((id) => build.healed.has(id)) ?? "";
    say(`${failed.check} fails with ${last}, which an agent just built, so run it again`);
    if (passesAt(config, build, lastStep(build))) {
      return;
    }
    throw new AutoforkError(`${failed.check} fails with ${last}, which the agent ${build.healed.get(last) ?? ""}: ${command}`);
  }
  const top = lastStep(build);
  reset(build.dir, top);
  if (failed.check === "verify") {
    prepared(config, build);
  }
  say(`fixing ${failed.check} in the patches`);
  const prompt = fixPrompt(config, build, ids, failed, from);
  if (!await runAgent(config, build.dir, `${failed.check} fix`, prompt, bot)) {
    throw new AutoforkError(`the agent failed while fixing ${failed.check}`);
  }
  const pausing = pauseWhatUpstreamHas(build, ids);
  requireOneCommitPerPatch(build, ids, failed.check);
  git(build.dir, "reset", "--quiet");
  restoreControl(build.dir, top);
  if (!run("git", ["diff", "--cached", "--quiet"], build.dir).ok) {
    gitWith(build.dir, bot, "commit", "--amend", "--quiet", "--no-verify", "--allow-empty", "--no-edit");
  }
  readBackPatches(config, build, ids, pausing);
  build.ready = undefined;
  const still = failureAt(config, build, lastStep(build));
  if (still !== undefined) {
    throw new AutoforkError(`${still.check} still fails after the agent's fix: ${config[still.check] ?? ""}`);
  }
};

// src/build/verify.ts
var guard = (config, build, from, check) => {
  let broke = config.patches.length === 0;
  if (!broke && from !== build.source) {
    say(`verify with upstream ${short(from)} alone, where the fork was`);
    broke = failureAt(config, build, from) === undefined;
  }
  if (broke) {
    throw new AutoforkError(`${check} fails on upstream ${short(build.source)} itself: ${config[check] ?? ""}`);
  }
  say(`${check} fails on upstream alone where the fork was too, so the patches are what make it pass`);
};
var dropPicked = (config, check) => {
  say(`\`${config[check] ?? ""}\` fails on upstream alone, so the checks an agent picked are dropped and the next agent that builds or heals a patch picks new ones`);
  for (const key of Object.keys(config.picked ?? {})) {
    if (key === "setup" || key === "verify") {
      config[key] = undefined;
    }
  }
  config.picked = undefined;
};
var settle = async (config, build, from) => {
  const failed = failureAt(config, build, lastStep(build));
  if (failed === undefined) {
    return;
  }
  const patched = build.steps.length > 1 && (from !== undefined || config.picked !== undefined);
  if (patched) {
    say(`${failed.check} fails, verify with upstream ${short(build.source)} alone`);
  }
  const aloneFailed = patched ? failureAt(config, build, build.steps[0]) : failed;
  if (aloneFailed !== undefined) {
    const { check } = aloneFailed;
    const yours = config.verify !== undefined && config.picked?.verify === undefined;
    if (!yours && config.picked?.[check] !== undefined) {
      dropPicked(config, check);
      await settle(config, build, from);
      return;
    }
    if (from !== undefined) {
      guard(config, build, from, check);
    }
    if (build.steps.length <= config.patches.length) {
      return;
    }
  }
  if (from === undefined) {
    throw new WaitError(`${failed.check} fails, so a patch needs rebuilding`);
  }
  await fix(config, build, failed, from, aloneFailed === undefined);
};
var verify = async (config, build, from) => {
  if (config.setup === undefined && config.verify === undefined) {
    return;
  }
  try {
    await settle(config, build, from);
  } finally {
    reset(build.dir, lastStep(build));
  }
};

// src/build/build.ts
var fitsUpFront = async (config, build, buildNew) => {
  const broken = config.patches.filter((id) => {
    if (unbuilt(build.dir, id)) {
      return buildNew;
    }
    const fits = apply(build.dir, patchFile(build.dir, id), config);
    if (fits) {
      commit(build.dir, id);
    }
    return !fits;
  });
  reset(build.dir, build.steps[0]);
  git(build.dir, "clean", "-fdxq");
  const short = broken.length > 0 ? await shortfall(config.limits, broken.length) : undefined;
  if (short !== undefined) {
    throw new NoRoomError(`${broken.join(", ")} wait${broken.length === 1 ? "s" : ""}: ${short.full}`);
  }
};
var place = async (config, build, id, options, folded) => {
  const { dir } = build;
  const file = patchFile(dir, id);
  const { healFrom } = options;
  if (unbuilt(dir, id) ? options.buildNew === true : !apply(dir, file, config)) {
    if (healFrom === undefined && folded === undefined) {
      throw new WaitError(`${id} doesn't apply to ${short(build.source)}`);
    }
    await verify(config, build, healFrom);
    await heal(config, build, id, folded === undefined ? `Upstream changed, and patch "${id}" no longer applies cleanly.` : `The fork's owner changed patch "${folded}", and patch "${id}" no longer applies cleanly on top of it.`, unbuilt(dir, id) ? undefined : { file, from: healFrom });
  } else if (!unbuilt(dir, id) && !changed(dir)) {
    build.upstreamHas.set(id, "the same change, line for line");
  }
  if (options.fold?.id !== id || apply(dir, options.fold.patch, config)) {
    return folded;
  }
  say(`your changes to ${id} touch lines a later patch changes too, so an agent rebuilds ${id} with them from its PATCH.md`);
  apply(dir, file, config);
  git(dir, "add", "-A");
  await heal(config, build, id, `The fork's owner changed patch "${id}", and their change was made with later patches applied, so git couldn't fit it on "${id}" alone.`, { file: options.fold.patch });
  return id;
};
var build = async (root, config, base, options) => {
  const dir = worktree(root, base);
  const built = {
    dir,
    source: base,
    steps: [commit(dir, `upstream ${short(base)}`)],
    healed: new Map,
    upstreamHas: new Map
  };
  if (options.healFrom !== undefined) {
    await fitsUpFront(config, built, options.buildNew === true);
  }
  let folded;
  for (const id of config.patches) {
    folded = await place(config, built, id, options, folded);
    built.steps.push(commit(dir, id));
  }
  return built;
};

// src/build/compare.ts
var compare = async (root, config, against, base = baseline(root)) => {
  const rebuilt = await build(root, config, base, {});
  try {
    const top = lastStep(rebuilt);
    const drift = git(root, "diff-tree", "-r", "--name-only", top, against, "--", ...sourcePaths(config));
    return { base, rebuilt: top, drift: drift.split(`
`).filter(Boolean) };
  } finally {
    cleanup(root, rebuilt.dir);
  }
};

// src/config/write.ts
import { existsSync as existsSync7, mkdirSync, readFileSync as readFileSync5, writeFileSync as writeFileSync5 } from "node:fs";
import path10 from "node:path";
var keepPatches = (dir) => {
  const file = path10.join(dir, DIR, ".gitignore");
  if (!existsSync7(file)) {
    writeFileSync5(file, `!*.patch
!*.md
!*.json
`);
  }
};
var writeConfig = (dir, { upstream, follow, setup, generated, verify, agent, green, limits }) => {
  mkdirSync(path10.join(dir, DIR), { recursive: true });
  writeFileSync5(configFile(dir), `${JSON.stringify({ upstream, follow, setup, generated, verify, agent, green, limits }, null, 2)}
`);
  keepPatches(dir);
};
var saveConfig = (target, { follow, picked }) => {
  const saved = parseJson(readFileSync5(configFile(target), "utf-8"), isObject);
  if (saved === undefined) {
    throw new AutoforkError(`${DIR}/config.json isn't valid JSON`);
  }
  const config = { ...saved, follow, picked };
  if (JSON.stringify(config) !== JSON.stringify(saved)) {
    writeFileSync5(configFile(target), `${JSON.stringify(config, null, 2)}
`);
  }
};

// src/patches/note.ts
import { existsSync as existsSync8, mkdirSync as mkdirSync2, writeFileSync as writeFileSync6 } from "node:fs";
import path11 from "node:path";
var NOTE = "fork-readme";
var readmeToNote = (root, base, drift) => {
  const readme = git(root, "ls-tree", "--name-only", base).split(`
`).find((file) => /^readme\.md$/iu.test(file));
  const skipped = readme === undefined || drift.includes(readme) || existsSync8(path11.join(root, DIR, NOTE));
  const text = skipped ? "" : git(root, "show", `${base}:${readme}`);
  return text.trim() === "" || text.includes("autofork.com") ? undefined : readme;
};
var addNote = (root, upstream, base, drift) => {
  const readme = readmeToNote(root, base, drift);
  if (readme !== undefined) {
    const name = path11.basename(upstream).replace(/\.git$/u, "");
    mkdirSync2(path11.join(root, DIR, NOTE), { recursive: true });
    writeFileSync6(patchDoc(root, NOTE), `One line under the README's title says this is a personal fork of ${name} that updates itself with autofork, linking ${name}, https://autofork.com and this fork's \`${DIR}/\` folder. The rest of the README stays as upstream wrote it.

To drop the line, delete it from the README and delete this folder, in the same commit.
`);
  }
  return readme;
};

// src/cli/args.ts
var flag = (args, name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;

// src/cli/setup.ts
var KEEPS_ID_TOKEN = /^\s*(?:id-token:\s*['"]?write|permissions:\s*['"]?write-all)/mu;
var commandFlag = (args, name) => {
  const command = flag(args, name);
  return command === "" ? undefined : command;
};
var options = (args) => {
  const setup = commandFlag(args, "--setup");
  const generated = flag(args, "--generated")?.split(",");
  if (generated !== undefined && setup === undefined) {
    throw new AutoforkError("--generated files are rebuilt by --setup, so set it too");
  }
  const asked = flag(args, "--every");
  const every = asked !== undefined && isEvery(asked) ? asked : undefined;
  if (args.includes("--every") && every === undefined) {
    throw new AutoforkError(`--every takes ${Object.keys(EVERY).join(", ")}, not ${asked ?? "nothing"}`);
  }
  return {
    follow: flag(args, "--follow"),
    setup,
    generated,
    verify: commandFlag(args, "--verify"),
    every
  };
};
var privacyOf = (root, every) => {
  const repo = every === undefined ? origin(root) : "";
  const asked = repo === "" ? undefined : run("gh", ["api", `repos/${repo}`, "--jq", ".private"], root);
  return {
    asked: asked !== undefined,
    answer: asked?.ok === true ? asked.out.toString().trim() : undefined
  };
};
var writeWorkflow = (root, upstream, every) => {
  const file = path12.join(root, OWN_WORKFLOW);
  mkdirSync3(path12.join(root, WORKFLOWS), { recursive: true });
  if (existsSync9(file)) {
    if (every !== undefined || !KEEPS_ID_TOKEN.test(readFileSync6(file, "utf-8"))) {
      say(`Kept your ${OWN_WORKFLOW} as it is: its cron line is the schedule, and spend reporting needs \`id-token: write\` in its permissions.`);
    }
    return;
  }
  const { asked, answer } = privacyOf(root, every);
  const hourly = asked && answer !== "false";
  if (hourly) {
    say(`${answer === "true" ? "This repo is private" : "Couldn't tell whether this repo is private"}, and a private repo's scheduled runs bill Actions minutes, so it checks hourly (--every 1h).`);
  }
  writeFileSync7(file, workflow({
    branch: git(root, "branch", "--show-current") || defaultBranch(root, upstream),
    cron: EVERY[every ?? (hourly ? "1h" : "15m")],
    site,
    workflowTokens: false
  }));
};
var tellWhatItFollows = (upstream, follow, chosen) => {
  if ("branch" in parseFollow(follow)) {
    say(`autofork follows ${upstream}'s ${follow} branch${chosen ? "" : ", since it has no releases"}.`);
  } else {
    say(`autofork follows ${upstream}'s ${follow === "releases" ? "" : `${follow} `}releases.`);
  }
};
var inheritedWorkflows = (root, base) => {
  const upstreamHas = new Set(git(root, "ls-tree", "-r", "--name-only", base, "--", WORKFLOWS).split(`
`));
  return git(root, "ls-files", WORKFLOWS).split(`
`).filter((file) => file !== "" && upstreamHas.has(file) && !file.endsWith("/autofork.yml"));
};
var setup = async (root, upstream, { every, ...chosen }) => {
  if (existsSync9(configFile(root))) {
    throw new AutoforkError(`${DIR}/config.json already exists`);
  }
  const follow = chosen.follow ?? await defaultFollow(root, upstream);
  const config = { ...chosen, upstream, follow, limits: LIMITS };
  await fetchUpstream(root, config);
  const base = baseline(root);
  writeConfig(root, config);
  writeWorkflow(root, upstream, every);
  const { drift } = await compare(root, { ...config, patches: [] }, workingTree(root), base);
  const readme = addNote(root, upstream, base, drift);
  const inherited = inheritedWorkflows(root, base);
  tellWhatItFollows(upstream, follow, chosen.follow !== undefined);
  if (inherited.length > 0) {
    say(`Your fork has ${inherited.length} workflow${inherited.length === 1 ? "" : "s"} copied from upstream, and they run here too. Delete the ones you don't want. autofork leaves workflows to you: it never copies upstream's new ones in, and when upstream changes one you keep, the sync's agent brings that into your copy, or opens an issue when the workflow's token can't push workflow files.`);
  }
  if (readme !== undefined) {
    say(`The first sync with an agent adds a line to ${readme} saying this is a personal fork kept current by autofork. To skip it, delete ${DIR}/${NOTE}/.`);
  }
  if (drift.length > 0) {
    say(`Your branch already changes ${drift.length} file${drift.length === 1 ? "" : "s"}. Save them as a patch: write ${DIR}/<id>/PATCH.md, then autofork save <id>`);
  }
};
var ghApi = (root, ...args) => {
  const result = run("gh", ["api", ...args], root);
  return result.ok ? parseJson(result.out.toString(), isObject) : undefined;
};
var forkOn = (root, repo) => {
  const answer = ghApi(root, `repos/${repo}`);
  return has(answer, "fork", (fork) => fork === true) ? {
    parent: has(answer, "parent", (parent) => has(parent, "full_name", isText)) ? answer.parent.full_name : undefined,
    description: has(answer, "description", isText) ? answer.description.trim() : "",
    login: has(answer, "owner", (owner) => has(owner, "login", isText)) ? answer.owner.login : ""
  } : undefined;
};
var ownerName = (root, login) => {
  const owner = ghApi(root, `users/${login}`);
  const name = has(owner, "name", isText) ? owner.name.trim() : undefined;
  const called = has(owner, "type", (type) => type === "User") ? name?.split(/\s+/u)[0] : name;
  return called === undefined || called === "" ? login : called;
};
var claim = (root, upstream) => {
  const repo = origin(root);
  const fork = repo === "" ? undefined : forkOn(root, repo);
  if (fork === undefined) {
    return;
  }
  run("gh", ["api", "-X", "PUT", `repos/${repo}/actions/permissions`, "-F", "enabled=true"], root);
  run("gh", ["repo", "edit", repo, "--enable-issues"], root);
  if (fork.parent?.toLowerCase() !== githubRepo(upstream)?.toLowerCase()) {
    return;
  }
  if (/autofork/iu.test(fork.description)) {
    return;
  }
  const who = ownerName(root, fork.login);
  ghApi(root, "-X", "PATCH", `repos/${repo}`, "-f", `description=${[`${who}'s autofork`, fork.description].filter(Boolean).join(" · ")}`);
};

// src/cli/fork.ts
var OWNER_REPO = /^[\w.-]+\/(?<name>[\w.-]+)$/u;
var secretSet = (root, repo) => claudeToken !== undefined && run("gh", ["secret", "set", "CLAUDE_CODE_OAUTH_TOKEN", "--repo", repo, "--body", claudeToken], root).ok;
var fork = async (cwd, args) => {
  const [upstream = ""] = args;
  const name = OWNER_REPO.exec(upstream)?.groups?.name;
  if (name === undefined) {
    throw new AutoforkError(`usage: autofork fork <owner/repo> ${FORK_OPTIONS}`);
  }
  const chosen = options(args);
  if (!run("gh", ["repo", "fork", upstream, "--clone", "--default-branch-only"], cwd).ok) {
    throw new AutoforkError("gh couldn't fork it. Is the GitHub CLI installed and logged in?");
  }
  const root = path13.join(cwd, name);
  await setup(root, upstream, chosen);
  claim(root, upstream);
  const repo = origin(root);
  const secret = secretSet(root, repo);
  git(root, "add", DIR, OWN_WORKFLOW);
  git(root, "commit", "--quiet", "-m", `autofork: follow ${upstream}`);
  git(root, "push", "--quiet");
  say(`${repo} now keeps itself current with ${upstream}. It's cloned in ./${path13.basename(root)}.`);
  if (!secret) {
    say(`Last step, a Claude sign-in for the fork (paste the token setup-token prints) and its first sync:
${claudeSteps(` --repo ${repo}`)}
${firstSync(` --repo ${repo}`)}
${codexHint(` --repo ${repo}`)}`);
  }
  say(LINK_HINT.replace("npx", `cd ${path13.basename(root)} && npx`));
};

// src/cli/init.ts
var init = async (root, args) => {
  const [upstream] = args;
  if (upstream === undefined || upstream === "") {
    throw new AutoforkError(`usage: autofork init <owner/repo | git url> ${FORK_OPTIONS}`);
  }
  await setup(root, upstream, options(args));
  claim(root, upstream);
  const mine = origin(root);
  const repo = mine === "" ? "" : ` --repo ${mine}`;
  say(`Give the fork a Claude sign-in (paste the token setup-token prints), then commit and push:
${claudeSteps(repo)}
If you pushed before the secret was set, start the first sync by hand:
${firstSync(repo)}
${codexHint(repo)}`);
  say(LINK_HINT);
};

// src/cli/link.ts
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
var OPENERS = new Map([
  ["darwin", "open"],
  ["win32", "explorer"]
]);
var POLL = 3000;
var WAIT = 600000;
var answerOf = async (response) => {
  if (!response.ok && response.status < 500 && response.status !== 429) {
    throw new AutoforkError(`${site}/api/link answered ${response.status}: ${await response.text()}`);
  }
  const answer = response.ok ? await readBody(response, isObject) : undefined;
  return answer === undefined ? undefined : has(answer, "linked", (value) => value === true);
};
var linked = async (ask) => {
  let answer;
  try {
    answer = await answerOf(await fetch(`${site}/api/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ask),
      signal: AbortSignal.timeout(1e4)
    }));
  } catch (error) {
    if (error instanceof AutoforkError) {
      throw error;
    }
  }
  return answer;
};
var linkedBefore = async (ask, deadline) => {
  if (Date.now() >= deadline) {
    return false;
  }
  await sleep(POLL);
  return await (await linked(ask) === true || linkedBefore(ask, deadline));
};
var openInBrowser = (page) => {
  spawn(OPENERS.get(process.platform) ?? "xdg-open", [page], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
};
var link = async (root) => {
  const [owner = "", name] = origin(root).split("/");
  if (name === undefined || name === "") {
    throw new AutoforkError("run autofork link inside a clone of your fork on GitHub");
  }
  const ask = { owner, name };
  const now = await linked(ask);
  if (now === undefined) {
    throw new AutoforkError(`can't reach ${site}, try again in a minute`);
  }
  if (!now) {
    const fetched = run("git", ["fetch", "--quiet", "origin", "HEAD"], root);
    if (!fetched.ok) {
      throw new AutoforkError(`can't fetch ${owner}/${name}: ${fetched.err}`);
    }
    if (!run("git", ["cat-file", "-e", `FETCH_HEAD:${DIR}/config.json`], root).ok) {
      throw new AutoforkError(`push ${DIR}/config.json to ${owner}/${name}'s default branch first`);
    }
    const page = `${site}/link/${owner}/${name}`;
    say(`finish linking in your browser: ${page}`);
    openInBrowser(page);
    if (!await linkedBefore(ask, Date.now() + WAIT)) {
      throw new AutoforkError(`not linked yet: finish at ${page}, then run autofork link again`);
    }
  }
  say("linked: autofork.com starts it within a minute of upstream changing.");
};

// src/cli/save.ts
import { existsSync as existsSync12, rmSync as rmSync6, writeFileSync as writeFileSync9 } from "node:fs";
import path15 from "node:path";

// src/build/refresh.ts
import { existsSync as existsSync10, rmSync as rmSync5, writeFileSync as writeFileSync8 } from "node:fs";
var refresh = (target, config, build) => {
  keepPatches(target);
  const pairs = stepPairs(build.steps);
  for (const [index, id] of config.patches.entries()) {
    const pair = pairs[index];
    const diff = pair === undefined ? Buffer.alloc(0) : gitBytes(build.dir, "diff-tree", "-p", "--binary", "--full-index", pair.from, pair.to, "--", ...sourcePaths(config));
    if (diff.length > 0 || existsSync10(patchFile(target, id))) {
      writeFileSync8(patchFile(target, id), diff);
    }
  }
  for (const [id, reason] of build.upstreamHas) {
    rmSync5(patchFile(target, id), { force: true });
    writeFileSync8(upstreamDoc(target, id), `${reason}

${config.upstream} does this on its own as of ${short(build.source)}, so autofork stopped applying this patch.
To keep upstream's version, delete ${DIR}/${id}/.
To keep yours, say in PATCH.md how it differs from upstream's, delete this file and push. The next sync rebuilds it.
`);
  }
};

// src/config/read.ts
import { existsSync as existsSync11, readdirSync as readdirSync2, readFileSync as readFileSync7 } from "node:fs";
import path14 from "node:path";

// src/config/limits.ts
var LIMITS_TAKE_NUMBERS = `"limits" in ${DIR}/config.json takes numbers, like ${JSON.stringify(LIMITS)}`;
var isLimit = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var isLimits = (value) => value === undefined || isObject(value) && !Array.isArray(value) && Object.entries(value).every(([key, limit]) => Object.hasOwn(LIMITS, key) && isLimit(limit)) && !(("rebuild" in value) && value.rebuild === 0);

// src/config/read.ts
var discover = (root) => readdirSync2(path14.join(root, DIR), { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync11(patchDoc(root, entry.name))).map((entry) => entry.name).toSorted();
var readWritten = (root) => {
  let raw;
  try {
    raw = JSON.parse(readFileSync7(configFile(root), "utf-8"));
  } catch (error) {
    throw new AutoforkError(`${DIR}/config.json isn't valid JSON: ${messageOf(error)}`);
  }
  if (!has(raw, "upstream", isFilled)) {
    throw new AutoforkError(`${DIR}/config.json needs "upstream", like "owner/repo"`);
  }
  return raw;
};
var commandAt = (written, key) => has(written, key, isFilled) ? written[key] : undefined;
var pickedChecks = (written, own) => {
  const saved = has(written, "picked", isObject) ? written.picked : undefined;
  const picked = {};
  for (const key of CHECKS) {
    const pick = has(saved, key, isFilled) ? saved[key] : undefined;
    if (own[key] === undefined && pick !== undefined) {
      picked[key] = pick;
    }
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
};
var readConfig = async (root) => {
  if (!existsSync11(configFile(root))) {
    throw new AutoforkError("no .autofork/config.json here. Start with: autofork init <owner/repo>");
  }
  const written = readWritten(root);
  const setup = commandAt(written, "setup");
  const verify = commandAt(written, "verify");
  const generated = has(written, "generated", isTextList) ? written.generated : undefined;
  if (generated !== undefined && generated.length > 0 && setup === undefined) {
    throw new AutoforkError(`"generated" files are rebuilt by "setup", so set your own in ${DIR}/config.json`);
  }
  if (!has(written, "limits", isLimits)) {
    throw new AutoforkError(LIMITS_TAKE_NUMBERS);
  }
  const follow = has(written, "follow", isText) ? written.follow : await defaultFollow(root, written.upstream);
  const picked = pickedChecks(written, { setup, verify });
  return {
    upstream: written.upstream,
    follow,
    setup: setup ?? picked?.setup,
    generated,
    verify: verify ?? picked?.verify,
    agent: commandAt(written, "agent"),
    green: has(written, "green", isBoolean) ? written.green : undefined,
    limits: { ...LIMITS, ...written.limits },
    picked,
    patches: discover(root).filter((id) => !existsSync11(upstreamDoc(root, id)))
  };
};

// src/cli/save.ts
var save = async (root, args) => {
  const [id] = args;
  if (id === undefined || !PATCH_ID.test(id)) {
    throw new AutoforkError("usage: autofork save <id>   (id like fix-login)");
  }
  if (!existsSync12(patchDoc(root, id))) {
    throw new AutoforkError(`write ${DIR}/${id}/PATCH.md first: what the change does and why`);
  }
  requireIntent(root, id);
  rmSync6(upstreamDoc(root, id), { force: true });
  const config = await readConfig(root);
  await fetchUpstream(root, config);
  const files = workingTree(root);
  const { base, rebuilt, drift } = await compare(root, config, files);
  if (drift.length === 0) {
    say(`nothing to save: your code matches what the patches build. Push ${DIR}/${id}/PATCH.md as it is and the next sync has an agent build it.`);
    return;
  }
  const fold = path15.join(gitDir(root), "autofork-fold.patch");
  writeFileSync9(fold, gitBytes(root, "diff-tree", "-p", "--binary", "--full-index", rebuilt, files, "--", ...sourcePaths(config)));
  const result = await build(root, config, base, { fold: { id, patch: fold } });
  try {
    refresh(root, config, result);
    say(`saved ${drift.length} file${drift.length === 1 ? "" : "s"} to ${DIR}/${id}. Commit and push.`);
  } finally {
    rmSync6(fold, { force: true });
    cleanup(root, result.dir);
  }
};

// src/cli/status.ts
import { existsSync as existsSync13 } from "node:fs";
var noteOn = (root, id) => {
  if (existsSync13(upstreamDoc(root, id))) {
    return "  (upstream has it: see UPSTREAM.md)";
  }
  return unbuilt(root, id) ? "  (not built yet)" : "";
};
var status = async (root) => {
  const config = await readConfig(root);
  await fetchUpstream(root, config);
  const { base, drift } = await compare(root, config, workingTree(root));
  const behind = git(root, "rev-list", "--count", "--first-parent", `${base}..refs/autofork/upstream`);
  say(`${config.upstream} at ${short(base)}, ${behind} commit${behind === "1" ? "" : "s"} behind upstream`);
  for (const id of discover(root)) {
    say(`  ${id}${noteOn(root, id)}`);
  }
  if (drift.length > 0) {
    say(`not in any patch yet:
  ${drift.join(`
  `)}`);
  }
};

// src/upstream/green.ts
var RED = new Set(["failure", "timed_out", "action_required", "startup_failure"]);
var isConclusion = (value) => value === null || isText(value);
var isCheckRun = (value) => has(value, "conclusion", isConclusion);
var isCheckRunList = (value) => Array.isArray(value) && value.every(isCheckRun);
var isCheckRuns = (value) => has(value, "total_count", isNumber) && has(value, "check_runs", isCheckRunList);
var passedFrom = async (repo, sha, page, read) => {
  const response = await githubApi(`repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`);
  const runs = response.ok ? await readBody(response, isCheckRuns) : undefined;
  if (runs === undefined) {
    say(`can't read upstream checks (${response.status}), using upstream's tip`);
    return;
  }
  if (runs.check_runs.some(({ conclusion }) => conclusion === null || conclusion === "" || RED.has(conclusion))) {
    return false;
  }
  const total = read + runs.check_runs.length;
  return runs.check_runs.length === 0 || total >= runs.total_count ? true : await passedFrom(repo, sha, page + 1, total);
};
var firstGreen = async (repo, [sha, ...older]) => {
  if (sha === undefined) {
    return false;
  }
  const passed = await passedFrom(repo, sha, 1, 0);
  if (passed === undefined) {
    return;
  }
  return passed ? sha : await firstGreen(repo, older);
};
var newestGreen = async (root, config, base, tip) => {
  const repo = githubRepo(config.upstream);
  if (config.green === false || !("branch" in parseFollow(config.follow)) || repo === undefined) {
    return tip;
  }
  const commits = git(root, "rev-list", "--first-parent", "--max-count=30", `${base}..${tip}`).split(`
`).filter(Boolean);
  if (commits.length === 0) {
    return tip;
  }
  const green = await firstGreen(repo, commits);
  if (green === undefined) {
    return tip;
  }
  if (green === false) {
    say(`no newer upstream commit has passed its checks yet, staying on ${short(base)}`);
    return base;
  }
  if (green !== tip) {
    say(`upstream's tip isn't green yet, using ${short(green)}`);
  }
  return green;
};

// src/workflows/update.ts
var workflowsBehind = (root, since, source) => {
  const files = (...args) => git(root, "diff", "--name-only", "--no-renames", ...args, "--", WORKFLOWS).split(`
`);
  const upstreamChanged = new Set(files(since, source));
  return files("--diff-filter=MD", "HEAD", source).filter((file) => file !== "" && upstreamChanged.has(file));
};
var updatePrompt = (upstream, files, range) => `You are keeping a patched fork of ${upstream} in sync. The workflows in ${WORKFLOWS}/ are the fork's own copies, and upstream changed ${files.join(", ")}: git diff ${range} -- ${WORKFLOWS}

Bring into this fork's copies what it needs from those changes, and keep what the fork does differently. Add a workflow only where upstream split or renamed one the fork keeps. Only what you change in ${WORKFLOWS}/ is kept, except autofork.yml, and the sync commits it.`;
var workflowAgent = async (config, build, prompt) => {
  let ran;
  try {
    ran = await runAgent(config, build.dir, "workflow update", prompt);
  } catch (error) {
    if (!(error instanceof AutoforkError)) {
      throw error;
    }
    say(`workflow update ${error instanceof NoRoomError ? `has no room: ${error.why}` : `can't run: ${error.message}`}. The workflows stay as they were, and later syncs won't bring them over.`);
  }
  return ran;
};
var keepWorkflowChanges = (dir, head) => {
  const rest = [".", `:(exclude)${WORKFLOWS}`];
  git(dir, "checkout", "--", ...rest);
  git(dir, "clean", "-fdq", "--", ...rest);
  run("git", ["checkout", "--", OWN_WORKFLOW], dir);
  git(dir, "clean", "-fq", "--", OWN_WORKFLOW);
  git(dir, "add", "-A", "--", WORKFLOWS);
  return git(dir, "diff", "--cached", "--name-only", "--no-renames", head, "--", WORKFLOWS).split(`
`).filter(Boolean);
};
var updateWorkflows = async (config, build, files, range) => {
  const head = git(build.dir, "rev-parse", "HEAD");
  say(`bringing upstream's changes into ${files.join(", ")}`);
  const ran = await workflowAgent(config, build, updatePrompt(config.upstream, files, range));
  git(build.dir, "reset", "--quiet", head);
  if (ran === false) {
    say("the agent failed while updating workflows, so they stay as they were");
  }
  if (ran !== true) {
    reset(build.dir);
  }
  return ran === true ? keepWorkflowChanges(build.dir, head) : undefined;
};

// src/cli/sync.ts
var keepsUntracked = (base, drift) => `these files differ from what your patches build, so a sync would drop them:
  ${drift.join(`
  `)}
Where one is just an old copy of upstream's, take upstream's first: git checkout ${short(base)} -- <file>, or git rm <file> if upstream had it and deleted it. Then save the fork's own changes, on top of upstream's copies, as a patch: write ${DIR}/<id>/PATCH.md, then run autofork save <id>`;
var rebuild = async (sync) => {
  const { root, config, args, source, healFrom, buildNew, behind, range } = sync;
  try {
    const result = await build(root, config, source, { healFrom, buildNew });
    await verify(config, result, healFrom);
    regenerate(config, result);
    if (behind.length === 0 || args.includes("--no-workflows")) {
      return { result, updated: undefined };
    }
    if (healFrom === undefined) {
      throw new WaitError("upstream changed workflows this fork keeps");
    }
    return { result, updated: await updateWorkflows(config, result, behind, range) };
  } catch (error) {
    if (!(error instanceof WaitError)) {
      throw error;
    }
    if (error instanceof NoRoomError) {
      say(`autofork: ${error.message}`);
      output({ result: "waiting", limits: error.message });
    } else {
      say(`autofork: ${error.message}. The next run that heals rebuilds it.`);
      output({ result: "waiting" });
    }
    return;
  }
};
var syncMessage = ({ config, source, behind, range }, { result, updated }) => {
  const lines = [
    ...[...result.healed].map(([id, done]) => `${done} ${id}`),
    ...[...result.upstreamHas].map(([id, reason]) => `upstream has ${id}: ${reason}`),
    ...updated === undefined ? behind.map((file) => `upstream changed ${file} in ${range}`) : updated.map((file) => `brought upstream's changes to ${file} in ${range}`)
  ];
  return [`autofork: sync ${config.upstream} to ${short(source)}`, lines.join(`
`)].filter(Boolean).join(`

`);
};
var land = (sync, built) => {
  const { root, config, source, tip, tag, behind } = sync;
  const { result } = built;
  saveConfig(result.dir, config);
  refresh(result.dir, config, result);
  const tree = git(result.dir, "rev-parse", `${commit(result.dir, "refresh")}^{tree}`);
  if (tree === git(root, "rev-parse", "HEAD^{tree}") && behind.length === 0) {
    say("autofork: already up to date");
    output({ result: "current" });
    return;
  }
  const head = git(root, "rev-parse", "HEAD");
  const parents = ["-p", head];
  if (!run("git", ["merge-base", "--is-ancestor", source, head], root).ok) {
    parents.push("-p", source);
  }
  const message = syncMessage(sync, built);
  git(root, "merge", "--ff-only", "--quiet", git(root, "commit-tree", tree, ...parents, "-m", message));
  say(message);
  output(tag !== undefined && source === tip ? { result: "synced", tag } : { result: "synced" });
};
var sync = async (root, args) => {
  const config = await readConfig(root);
  for (const id of config.patches) {
    requireIntent(root, id);
  }
  if (git(root, "status", "--porcelain")) {
    throw new AutoforkError("commit or stash your changes first");
  }
  const { tip, tag } = await fetchUpstream(root, config);
  const base = baseline(root);
  const source = syncTarget(root, config, base, await newestGreen(root, config, base, tip));
  const key = `${short(source)}-${short(git(root, "rev-parse", "HEAD"))}`;
  output({ key });
  if (flag(args, "--skip") === key) {
    say(`autofork: already failed on upstream ${short(source)} with this fork, skipping until either changes`);
    output({ result: "skipped" });
    return;
  }
  const healFrom = args.includes("--no-heal") ? undefined : base;
  const fresh = config.patches.filter((id) => unbuilt(root, id));
  const buildNew = fresh.length > 0 && healFrom !== undefined && signedIn(config, root);
  if (fresh.length > 0 && !buildNew) {
    say(`autofork: the fork follows upstream without ${fresh.join(", ")} until a sync with an agent builds ${fresh.length === 1 ? "it" : "them"}`);
  }
  if (base === source && !buildNew) {
    say(`autofork: already up to date with ${config.upstream} at ${short(source)}`);
    output({ result: "current" });
    return;
  }
  const { drift } = await compare(root, config, "HEAD", base);
  if (drift.length > 0) {
    throw new AutoforkError(keepsUntracked(base, drift));
  }
  const moved = base === source ? short(source) : `${short(base)} → ${short(source)}`;
  say(`upstream ${moved}, ${config.patches.length} patch${config.patches.length === 1 ? "" : "es"}`);
  openLedger(ledgerPath ?? `${scratch(root)}-ledger.json`);
  const since = run("git", ["merge-base", "HEAD", source], root).out.toString().trim() || base;
  const plan = {
    root,
    config,
    args,
    source,
    tip,
    tag,
    healFrom,
    buildNew,
    behind: workflowsBehind(root, since, source),
    range: `${short(since)}..${short(source)}`
  };
  try {
    const built = await rebuild(plan);
    if (built !== undefined) {
      land(plan, built);
    }
  } finally {
    cleanup(root, scratch(root));
    saveLedger();
  }
};

// src/autofork.ts
var commands = { init, link, save, status, sync };
var isCommand2 = (name) => name !== undefined && Object.hasOwn(commands, name);
var main = async ([name, ...args]) => {
  if (name === "fork") {
    await fork(process.cwd(), args);
    return;
  }
  if (!isCommand2(name)) {
    process.stdout.write(USAGE);
    return;
  }
  const top = run("git", ["rev-parse", "--show-toplevel"], process.cwd());
  if (!top.ok) {
    throw new AutoforkError("run autofork inside your fork's git checkout");
  }
  await commands[name](top.out.toString().trim(), args);
};
try {
  await main(process.argv.slice(2));
} catch (error) {
  output({ error: (error instanceof Error ? error.message : String(error)).slice(0, 50000) });
  if (!(error instanceof AutoforkError)) {
    throw error;
  }
  say(`autofork: ${error.message}`);
  process.exitCode = 1;
}
