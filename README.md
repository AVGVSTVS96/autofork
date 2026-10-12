<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/header-dark.png">
  <img alt="autopatch: Fork anything. Keep your changes." src="assets/header-light.png">
</picture>

Fork anything and keep your changes. autopatch keeps your fork on top of upstream, and when upstream breaks one of your changes, an agent rebuilds it.

```sh
npx github:AVGVSTVS96/autopatch fork pingdotgg/t3code
```

That forks the repo, clones it and adds the autopatch workflow. Set `CLAUDE_CODE_OAUTH_TOKEN` first (`claude setup-token` prints one) and it adds that secret too. Already have a fork? Run `init owner/repo` inside it.

## Patches

Each change you keep is a folder in `.autopatch/`:

```
.autopatch/context-usage/
├── PATCH.md              what it does and why
└── context-usage.patch   the diff
```

Change the code, write the `PATCH.md`, and save the diff:

```sh
npx github:AVGVSTVS96/autopatch save context-usage
```

Or just write the `PATCH.md` and push. The workflow has an agent build it.

A `PATCH.md` is plain prose. Describe what the change does, not which lines it touches, so an agent can rebuild it on whatever upstream looks like next. This is the one in [my T3 Code fork](https://github.com/AVGVSTVS96/t3code/tree/main/.autopatch/context-usage):

```md
Always show the thread's context usage in the composer.

Build it on whatever T3 Code shows for context at the time. Right now that's
the compact button next to send, which only shows up once a thread gets big:
keep it there all the time with the context number, as just the icon, without
the "Full"/"Compact" text. Clicking it still makes the next send compact first.

If T3 Code knows whether the prompt cache is still warm, say so in the
button's tooltip.

Once T3 Code shows context usage all the time by default, this patch is done.
```

## Updates

When upstream publishes a release, the workflow rebuilds your fork on it. Patches that still apply go in with git. When one doesn't, an agent rebuilds it from its `PATCH.md`, your `verify` command checks the build, and the result is pushed as a signed commit. If upstream already does what a patch asks, the patch is dropped.

The agent only runs when a release breaks a patch. Between releases, the workflow's hourly check is git only and ends in seconds. A failed rebuild isn't retried until upstream or your fork changes; running the workflow by hand always retries.

To follow a branch instead, set `"follow": "main"`. Every upstream commit then gets the same treatment.

## Agents

```sh
npx skills add AVGVSTVS96/autopatch
```

Your agent then knows how to fork a repo and keep its changes as patches.

## Config

`.autopatch/config.json`:

```json
{
  "upstream": "pingdotgg/t3code",
  "follow": "releases",
  "verify": "pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @t3tools/web typecheck"
}
```

| key | |
| --- | --- |
| `upstream` | `owner/repo`, or any git URL |
| `follow` | `releases` (upstream's newest release tag, skipping pre-releases) or a branch. Default: `releases`, or the default branch if upstream has no releases |
| `verify` | the command that checks a build |
| `agent` | the command that rebuilds a patch, prompt on stdin. Default: `claude -p --dangerously-skip-permissions`. For Codex: `codex exec --dangerously-bypass-approvals-and-sandbox` |
| `green` | when following a branch, `false` takes upstream's newest commit even when its checks failed |

`.github/workflows/autopatch.yml` is yours too: change how often it checks, and set up what `verify` needs (Node, Bun, Rust) before the autopatch step. The action takes `heal: false` to apply what still fits without calling the agent, if you want rebuilds on one schedule and heals on another.

## Commands

```
$ npx github:AVGVSTVS96/autopatch --help
autopatch: fork anything and keep your changes

Usage:
  autopatch fork <owner/repo>   fork it on GitHub, set it up and push
  autopatch init <owner/repo>   set up a fork you already have, from inside it
  autopatch save <id>           save your changes as the patch in .autopatch/<id>
  autopatch status              your patches, and changes no patch holds yet
  autopatch sync                rebuild on upstream; an agent heals what no longer applies

Options for fork and init:
  --follow <releases | branch>  what to keep up with (default: releases, or the
                                default branch if upstream has none)
  --verify <command>            the command that checks a build
```

## History

- **May 2026:** [pi-patcher](https://github.com/AVGVSTVS96/pi-patcher) keeps patches to the [pi](https://github.com/earendil-works/pi-coding-agent) coding agent working across updates. Proof of concept.
- **June:** [PATCH.md](https://patchmd.vercel.app), the format.
- **July:** [herdr](https://github.com/AVGVSTVS96/herdr), the first fork rebuilt from patches. Proof of concept.
- **October:** forks of [Claude Code's plugins](https://github.com/AVGVSTVS96/claude-plugins-official), [Buzz](https://github.com/AVGVSTVS96/buzz) and [T3 Code](https://github.com/AVGVSTVS96/t3code), in daily use.
- **October:** autopatch.

## License

MIT
