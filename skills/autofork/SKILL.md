---
name: autofork
description: Fork a repo and keep your changes to it working as upstream moves. Use when asked to fork, customize or patch someone else's project, or when changing code in a repo that has an .autofork/ folder.
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

It follows upstream's releases, or its default branch if it has none. `--follow <branch>` picks a branch. It needs `gh` logged in. If `CLAUDE_CODE_OAUTH_TOKEN` is set, it also adds that secret; otherwise tell the user to run `claude setup-token` and `gh secret set CLAUDE_CODE_OAUTH_TOKEN`. In a fork that's already cloned, use `init owner/repo` instead.

## Change a fork

1. Make the change.
2. Write `.autofork/<id>/PATCH.md`: what the change does and why, as plain prose. Describe the behavior, not the lines, so an agent can rebuild it after upstream rewrites that code.
3. Run `npx github:AVGVSTVS96/autofork save <id>`.
4. Commit everything and push.

Every source change must belong to a patch: a sync refuses to run while the fork has changes no patch holds, and `autofork status` lists them. To change an existing patch, edit the code, update its `PATCH.md` if the intent changed, and `save` the same id.

A patch can also be just a `PATCH.md`. Push it and the next sync has an agent build it.

## When upstream has a patch

If `.autofork/<id>/UPSTREAM.md` exists, upstream shipped its own version of that patch and autofork stopped applying it. Show the user what it says and ask which they want. Upstream's: delete `.autofork/<id>/`. Theirs: update `PATCH.md` to say how theirs differs from upstream's, delete `UPSTREAM.md`, and push; the next sync rebuilds it.
