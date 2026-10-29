---
name: autofork
description: Fork a repo and keep your changes to it working as upstream moves. Use when asked to fork, customize or patch someone else's project, when changing code in a repo that has an .autofork/ folder, or when a fork's installed app should update itself from the fork.
---

# autofork

A fork with an `.autofork/` folder is upstream plus patches. A workflow rebuilds it from upstream: patches that still apply go in with git, and an agent rebuilds the rest from their `PATCH.md`.

```
.autofork/<id>/
├── PATCH.md      what the change does and why
└── <id>.patch    the diff, written by autofork
```

## Fork a repo

```sh
npx github:AVGVSTVS96/autofork fork owner/repo --verify "<command that checks a build>"
```

It follows upstream's releases, or its default branch if it has none. `--follow <branch>` picks a branch; `--follow 'v*-nightly.*'` picks a channel of releases by tag, and `init` lists the channels upstream publishes. It needs `gh` logged in. If `CLAUDE_CODE_OAUTH_TOKEN` is set, it also adds that secret; otherwise tell the user to run `claude setup-token` and `gh secret set CLAUDE_CODE_OAUTH_TOKEN`. In a fork that's already cloned, use `init owner/repo` instead.

`verify` is the check a sync has to pass before it pushes, and the agent that rebuilds a patch runs it too. When patches that still apply fail it, one agent run fixes each in its own commit. Take it from upstream's own CI: checks that cover the code the patches touch, pass on upstream as it is (or, when upstream can't build on its own, like a package split out of a monorepo, with the patch that makes it build), and give the same answer every run. Install dependencies with `--setup "<command>"`, so `verify` is just the check, and set up the tools both need in `.github/workflows/autofork.yml`, before the autofork step. Patches that break `setup` are fixed the same way. List the files `setup` writes, like lockfiles, with `--generated <file>,<file>`: they stay out of patches and are rebuilt once the patches are in. All three are kept in `.autofork/config.json`.

## Change a fork

1. Make the change.
2. Write `.autofork/<id>/PATCH.md`, the prose an agent rebuilds the change from after upstream rewrites that code: what the user wants and why, and why it's built the way it is where upstream does it differently. Write it from what the user asked for; a commit message or diff only says how.
3. Run `npx github:AVGVSTVS96/autofork save <id>`.
4. Commit everything and push.

Every source change must belong to a patch: once upstream moves, a sync refuses to rebuild while the fork has changes no patch holds, and `autofork status` lists them. To change an existing patch, edit the code, update its `PATCH.md` if the intent changed, and `save` the same id. When a change reaches code `verify` doesn't check, widen `verify` in `.autofork/config.json`.

A patch can also be just a `PATCH.md`. Push it and the next sync has an agent build it.

Patches go on in the alphabetical order of their ids, each on top of the ones before it. Give a patch the others need, like one that makes the project build on its own, an id that sorts first, like `0-standalone`.

## When upstream has a patch

If `.autofork/<id>/UPSTREAM.md` exists, upstream shipped its own version of that patch and autofork stopped applying it. Show the user what it says and ask which they want. Upstream's: delete `.autofork/<id>/`. Theirs: update `PATCH.md` to say how theirs differs from upstream's, delete `UPSTREAM.md`, and push; the next sync rebuilds it.

## When upstream changes a workflow

`.github/workflows/` is the fork's own, and the rest of `.github/` syncs like code, so a fork's own changes there, like a composite action its release workflow uses, are saved as a patch. When upstream changes a workflow the fork keeps a copy of, the sync's agent brings over what the fork's copy needs, and the commit message says `brought upstream's changes to <file> in <from>..<to>`. Pushing that takes a token that can push workflow files, which a workflow's own GitHub token can't: forks made on autofork.com get one from autofork's GitHub app. For another fork, install the app (https://github.com/apps/autofork-app), then give the autofork step `workflow-token-url: https://autofork.com/api/github/token` and the workflow `id-token: write`. Code the sync runs can reach that token too, so ask the user before turning it on. Without one, the commit message says `upstream changed <file> in <from>..<to>` and the sync opens an issue. Bring over what the fork needs from upstream's change, keeping what the fork's copy does differently, or delete copies the fork doesn't run. Then close the issue.

## Apps that update themselves

A fork's code stays current on its own, but an installed app updates from wherever its updater points, which is upstream. When the user wants installs of the fork that update themselves, follow [releases.md](releases.md).
