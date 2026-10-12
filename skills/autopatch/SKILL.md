---
name: autopatch
description: Fork a repo and keep your changes to it working as upstream moves. Use when asked to fork, customize or patch someone else's project, or when changing code in a repo that has an .autopatch/ folder.
---

# autopatch

A fork with an `.autopatch/` folder is upstream plus patches. A workflow rebuilds it from upstream: patches that still apply go in with git, and an agent rebuilds the rest from their `PATCH.md`.

```
.autopatch/<id>/
├── PATCH.md      what the change does and why
└── <id>.patch    the diff, written by autopatch
```

## Fork a repo

```sh
npx github:AVGVSTVS96/autopatch fork owner/repo --verify "<command that checks a build>"
```

It needs `gh` logged in. If `CLAUDE_CODE_OAUTH_TOKEN` is set, it also adds that secret; otherwise tell the user to run `claude setup-token` and `gh secret set CLAUDE_CODE_OAUTH_TOKEN`. In a fork that's already cloned, use `init owner/repo` instead.

## Change a fork

1. Make the change.
2. Write `.autopatch/<id>/PATCH.md`: what the change does and why, as plain prose. Describe the behavior, not the lines, so an agent can rebuild it after upstream rewrites that code.
3. Run `npx github:AVGVSTVS96/autopatch save <id>`.
4. Commit everything and push.

Every source change must belong to a patch: a sync refuses to run while the fork has changes no patch holds, and `autopatch status` lists them. To change an existing patch, edit the code, update its `PATCH.md` if the intent changed, and `save` the same id.

A patch can also be just a `PATCH.md`. Push it and the next heal run builds it.
