<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/header-dark.png">
  <img alt="autopatch: Fork anything. Keep your changes." src="assets/header-light.png">
</picture>

autopatch is a GitHub Action that updates your fork every night, and has an agent redo any change that stops applying.

```
upstream   ──●──────────●──────────●───────▶
               \          \          \
your fork  ─────●──────────●──────────●─────▶  every night: newest upstream + your patches
```

Each change you make to a fork is a patch: the diff, plus a `PATCH.md` that says what it does and why. Git applies the patches that still fit. When one doesn't, an agent reads its `PATCH.md` and builds it again on the new code.

A real one: [my T3 Code fork](https://github.com/AVGVSTVS96/t3code) was 383 upstream commits behind. [This run](https://github.com/AVGVSTVS96/t3code/actions/runs/38093414658) had Claude rebuild its patch, typecheck it, and push a signed commit, in under two minutes.

## Start

In your fork:

```sh
npx github:AVGVSTVS96/autopatch init owner/repo --verify "bun install && bun test"
```

That writes `.autopatch/config.json` and `.github/workflows/autopatch.yml`, which runs every night. Add a `CLAUDE_CODE_OAUTH_TOKEN` secret to the repo (`claude setup-token` prints one) and push. That's it.

## Add a patch

Change the code however you like, by hand or with your agent. Then say what it's for:

```sh
npx github:AVGVSTVS96/autopatch add dark-mode "Follow the system theme in every view. Upstream hardcodes light colors in theme.ts, so add a dark palette and switch on prefers-color-scheme."
```

`add` turns every change no patch holds yet into the diff, and writes your text as the `PATCH.md`:

```
.autopatch/
├── config.json
└── dark-mode/
    ├── PATCH.md          what it does and why
    └── dark-mode.patch   the diff, kept current by autopatch
```

Commit and push.

- **More changes later?** Run `add` with the same id and they fold in.
- **No code yet?** Run `add` with just the text. The agent builds it on the next sync.

A `PATCH.md` is plain prose: no frontmatter, no required headings. Write it like you'd explain the change to someone: what it must do, not which lines it touches. Edit it any time; when the diff stops applying, it's what the agent rebuilds from. The format is [PATCH.md](https://patchmd.vercel.app).

## What happens every night

`autopatch sync` is what the action runs. It:

1. picks upstream's newest commit whose checks passed, so a broken upstream never lands in your fork
2. applies each patch with git, in order
3. hands any patch that no longer applies (or has no diff yet) to an agent, which rebuilds it from its `PATCH.md` on the new code
4. drops a patch if upstream already does what it asks, with the reason in the commit
5. runs your `verify` command
6. pushes a signed commit, with each rebuilt diff saved so git applies it alone next time

When every patch applies cleanly, no agent is called at all. When anything fails, nothing is pushed and your fork stays on its last good build. A failed sync isn't retried on the same upstream commit until something changes, so a stuck patch can't burn your quota every night. Running the workflow by hand always retries.

Your fork keeps its own `.github/`, so upstream's workflows never run with your secrets.

## Commands

```
autopatch init <owner/repo>      track an upstream repo from this fork
autopatch add <id> ["text"]      turn your changes into a patch, or fold them into one
autopatch status                 list patches, and changes no patch holds yet
autopatch sync                   rebuild on the latest upstream; an agent redoes what no longer applies
```

Run them with `npx github:AVGVSTVS96/autopatch <command>`.

## Config

`.autopatch/config.json`:

| key | |
| --- | --- |
| `upstream` | `owner/repo` on GitHub, or any git URL |
| `branch` | upstream branch to follow, read from upstream at `init` |
| `verify` | shell command that proves the build, run after every rebuild |
| `patches` | patch ids, in the order they apply |
| `agent` | command that rebuilds a patch, prompt on stdin. Default: `claude -p --dangerously-skip-permissions` |
| `green` | `false` to sync to upstream's tip even when its checks failed |

Any agent that reads a prompt from stdin works. Codex:

```json
"agent": "codex exec --dangerously-bypass-approvals-and-sandbox"
```

Set up whatever `verify` needs (Node, Bun, Rust) in the workflow before the autopatch step, and add the agent's secret.

## Where it came from

1. **[pi-patcher](https://github.com/AVGVSTVS96/pi-patcher)** (May): patches to the [pi](https://github.com/earendil-works/pi-coding-agent) coding agent that heal themselves across updates. A proof of concept.
2. **[PATCH.md](https://patchmd.vercel.app)** (June): the format, a patch's intent in plain words beside its diff.
3. **[herdr](https://github.com/AVGVSTVS96/herdr)** (July): the first fork kept this way, and another proof of concept.
4. **[Claude Code plugins](https://github.com/AVGVSTVS96/claude-plugins-official), [Buzz](https://github.com/AVGVSTVS96/buzz) and [T3 Code](https://github.com/AVGVSTVS96/t3code)** (October): forks I rely on, the Claude Code plugins one most of all.
5. **autopatch**: the loop those forks each carried their own copy of, written once for any fork.

## License

MIT
