# autopatch

Fork anything and keep your changes. When upstream moves, an agent re-implements the ones that stop applying.

```
upstream   ──●──────────●──────────●───────▶
               \          \          \
your fork  ─────●──────────●──────────●─────▶  every night: newest upstream + your patches
```

Every change you make to a fork is a patch: a `PATCH.md` that says what it does and why, plus the diff. Every night a GitHub Action rebuilds your fork from upstream and applies each patch with git. Patches that still apply never touch a model. When one doesn't, its `PATCH.md` becomes the prompt: an agent rebuilds it on the new code, your tests prove it, and the fresh diff is saved so tomorrow git can apply it alone.

## Start

In your fork's checkout:

```sh
npx github:AVGVSTVS96/autopatch init owner/repo --verify "bun install && bun test"
```

That writes `.autopatch/config.json` and `.github/workflows/autopatch.yml`. Then change whatever you want, and turn it into a patch:

```sh
npx github:AVGVSTVS96/autopatch add dark-mode "Dark mode everywhere"
```

`add` captures every file that differs from what your patches already build, committed or not. Run it again with the same id to fold more changes into that patch.

Write the `## Intent` in `.autopatch/dark-mode/PATCH.md` (or ask your agent to), commit, and push. Add a `CLAUDE_CODE_OAUTH_TOKEN` secret to the repo (`claude setup-token` prints one). That's it.

## A patch

```
.autopatch/
├── config.json
└── dark-mode/
    ├── PATCH.md
    └── dark-mode.patch
```

```md
---
summary: Dark mode everywhere
baseline: 5f0c2e1a9b7d4c3e8f6a1b2c3d4e5f6a7b8c9d0e
---

## Intent

Follow the system theme in every view. Upstream hardcodes light colors in
`theme.ts`; this adds a dark palette and switches on `prefers-color-scheme`.

## Invariants

Upstream's light palette stays byte for byte, so its theme changes keep landing.
```

`## Intent` is the only required section. It's the contract: when the diff stops applying, the agent rebuilds the patch from it, so say what the patch must do, not which lines it touches. `## Invariants`, `## Verification` and `## Removal` are welcome; the agent reads the whole file. The `baseline` is the upstream commit the diff was made on, and autopatch keeps it current. The format is [PATCH.md](https://patchmd.vercel.app).

## What a sync does

`autopatch sync` runs the same loop locally that the action runs every night:

1. **Refuses to drop your work.** If `main` has changes no patch holds, a rebuild would erase them, so it stops and lists the files. `autopatch add` captures them.
2. **Picks a green upstream.** It syncs to the newest upstream commit whose GitHub checks passed, so a red `main` upstream never lands in your fork. Set `"green": false` to take the tip.
3. **Rebuilds.** Upstream at that commit, your own `.github/` in place of upstream's (upstream workflows never run with your secrets), then each patch in order with `git apply --3way`. Patches stack, so a later one can change the same file as an earlier one.
4. **Heals what drifted, one patch at a time.** The agent gets that patch's `PATCH.md`, its stale diff, and the upstream changes under it. A clean exit isn't proof: it must change source files, or write `OBSOLETE` explaining that upstream now does it, in which case the patch is dropped with that reason in the commit.
5. **Verifies** with your `verify` command.
6. **Commits** the rebuilt tree with upstream as its second parent, and rewrites each patch's diff and `baseline`. In the action, GitHub creates that commit through its API, so it's signed.

When a sync fails, nothing is pushed and `main` stays on the last good build. The same upstream commit with the same patches isn't retried, so a stuck heal can't burn your quota every night.

## Config

`.autopatch/config.json`:

| key | |
| --- | --- |
| `upstream` | `owner/repo` on GitHub, or any git URL |
| `branch` | upstream branch to follow, read from upstream at `init` |
| `verify` | shell command that proves the build, run after every rebuild |
| `patches` | patch ids, in the order they apply |
| `agent` | command that heals, prompt on stdin. Default: `claude -p --dangerously-skip-permissions` |
| `green` | `false` to sync to upstream's tip even when its checks failed |

Any agent that reads a prompt from stdin works. Codex:

```json
"agent": "codex exec --dangerously-bypass-approvals-and-sandbox"
```

The workflow `init` writes runs daily. Set up whatever `verify` needs (Node, Bun, Rust) before the autopatch step, and add the agent's secret.

## Commands

```
autopatch init <owner/repo>   track an upstream repo from this fork
autopatch add <id> [summary]  turn your changes into a patch (or fold them into one)
autopatch status              what's patched, and what isn't yet
autopatch sync                rebuild on the latest upstream; an agent heals what drifts
```

## Where it came from

[pi-patcher](https://github.com/AVGVSTVS96/pi-patcher) kept my patches to the [pi](https://github.com/earendil-works/pi-coding-agent) agent alive across updates, and the pi agent healed them. That became the [PATCH.md](https://patchmd.vercel.app) format, then the sync loop behind my forks of [Claude Code's plugins](https://github.com/AVGVSTVS96/claude-plugins-official), [Buzz](https://github.com/AVGVSTVS96/buzz) and [herdr](https://github.com/AVGVSTVS96/herdr). Each fork carried its own copy of the sync script and workflow, 600 to 1,100 lines apiece. autopatch is that loop written once, in about 500 lines, with a fix for every way those forks actually failed.

## License

MIT
