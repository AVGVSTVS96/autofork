import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const owner = "AVGVSTVS96"

const forks = [
  { repo: "claude-plugins-official", name: "Claude Code plugins", upstream: "anthropics/claude-plugins-official", patches: "patches", ref: "main" },
  { repo: "buzz", name: "buzz", upstream: "block/buzz", patches: "fork/patches", ref: "nightly-green-main" },
  { repo: "herdr", name: "herdr", upstream: "herdrdev/herdr", patches: "patches", ref: "main" },
]

const gh = (...args) => JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 << 20 }))
const api = (path) => gh("api", "--paginate", "--slurp", path).flat()
const day = (iso) => iso.slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)

const count = (fork) => {
  const patches = api(`repos/${owner}/${fork.repo}/contents/${fork.patches}?ref=${fork.ref}`)
    .filter((entry) => entry.type === "dir")
    .map((entry) => entry.name)

  const runs = gh("run", "list", "-R", `${owner}/${fork.repo}`, "--workflow", "sync-upstream.yml", "--limit", "1000", "--json", "conclusion,createdAt")
  const green = runs.filter((run) => run.conclusion === "success").map((run) => run.createdAt).sort()
  const firstRun = runs.map((run) => run.createdAt).sort()[0]

  const syncs = api(`repos/${owner}/${fork.repo}/commits?per_page=100`)
    .filter((c) => c.commit.message.startsWith("chore: sync patched fork to "))
  const sources = syncs.map((c) => c.commit.message.split("\n")[0].split(" ").at(-1))
  const absorbed = sources.length > 1
    ? gh("api", `repos/${fork.upstream}/compare/${sources.at(-1)}...${sources[0]}`).total_commits
    : 0

  const releases = api(`repos/${owner}/${fork.repo}/releases?per_page=100`)
  const healed = new Set([
    ...syncs.filter((c) => /healed by/i.test(c.commit.message)).map((c) => sources[syncs.indexOf(c)]),
    ...releases.filter((r) => /healed by/i.test(r.body ?? "")).map((r) => r.body.match(/Source: `(\w+)`/)?.[1]),
  ])

  return {
    repo: `${owner}/${fork.repo}`,
    name: fork.name,
    upstream: fork.upstream,
    patches: patches.length,
    patchIds: patches,
    syncRuns: runs.length,
    greenSyncRuns: green.length,
    syncCommits: syncs.length,
    upstreamCommitsAbsorbed: absorbed,
    heals: healed.size,
    patchedReleases: releases.length,
    firstSync: day(firstRun),
    lastGreenSync: day(green.at(-1)),
    greenDays: daysBetween(firstRun, green.at(-1)),
  }
}

const tool = (dir) => {
  const src = readdirSync(join(dir, "src")).filter((file) => file.endsWith(".ts"))
  const code = src.map((file) => readFileSync(join(dir, "src", file), "utf8"))
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
  return {
    sourceFiles: src.length,
    sourceLines: code.reduce((total, text) => total + text.trimEnd().split("\n").length, 0),
    runtimeDependencies: Object.keys(pkg.dependencies ?? {}).length,
    node: pkg.engines?.node,
    license: pkg.license,
    defaultCron: code.join("\n").match(/cron: "([^"]+)"/)?.[1],
    commands: [...code.join("\n").matchAll(/^  autopatch (\w+)/gm)].map((match) => match[1]),
  }
}

const created = (repo) => day(gh("api", `repos/${owner}/${repo}`).created_at)

const perFork = forks.map(count)
const sum = (key) => perFork.reduce((total, fork) => total + fork[key], 0)
const firstSync = perFork.map((fork) => fork.firstSync).sort()[0]

const facts = {
  countedAt: new Date().toISOString(),
  owner,
  site: "https://autopatchmd.vercel.app",
  repo: `https://github.com/${owner}/autopatch`,
  action: `${owner}/autopatch@v1`,
  tool: tool(process.env.AUTOPATCH_DIR ?? join(homedir(), "Developer/autopatch")),
  lineage: {
    piPatcher: { repo: `https://github.com/${owner}/pi-patcher`, created: created("pi-patcher") },
    patchMd: { repo: `https://github.com/${owner}/PATCH.md`, site: "https://patchmd.vercel.app", created: created("PATCH.md") },
  },
  forks: perFork,
  totals: {
    forks: perFork.length,
    patches: sum("patches"),
    syncRuns: sum("syncRuns"),
    greenSyncRuns: sum("greenSyncRuns"),
    syncCommits: sum("syncCommits"),
    upstreamCommitsAbsorbed: sum("upstreamCommitsAbsorbed"),
    heals: sum("heals"),
    firstSync,
    daysSinceFirstSync: daysBetween(firstSync, new Date().toISOString()),
  },
  how: {
    patches: "Directories under each fork's patches folder (buzz: fork/patches on nightly-green-main), each a PATCH.md plus its .patch. Includes each fork's own README patch and herdr's auto-managed heal-overflow.",
    syncRuns: "gh run list --workflow sync-upstream.yml, every conclusion. greenSyncRuns counts only success.",
    syncCommits: "Commits on the fork's default branch whose message starts with 'chore: sync patched fork to', one per upstream commit or release the fork was rebuilt on.",
    upstreamCommitsAbsorbed: "gh api compare on the upstream repo, from the first synced source commit to the latest one.",
    heals: "Distinct upstream sources where a sync commit or patched release says patches were 'healed by <agent>' after git apply failed.",
    greenDays: "First sync run to the last successful one.",
    tool: "Read from the autopatch checkout (AUTOPATCH_DIR, default ~/Developer/autopatch): lines in src/*.ts, dependencies in package.json, the cron in the workflow init writes, commands from the usage text.",
  },
}

writeFileSync(new URL("./facts.json", import.meta.url), `${JSON.stringify(facts, null, 2)}\n`)
console.log(JSON.stringify(facts.totals, null, 2))
