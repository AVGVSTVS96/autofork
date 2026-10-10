# PATCH.md

**A spec for defining agent-healable source patches in markdown**

`v0.0.1` · [patchmd.vercel.app](https://patchmd.vercel.app)

PATCH.md is a proposed new spec for defining agent-healable source patches in markdown. With a single markdown file, agents can self-heal, updating patch definitions when the source changes and re-applying patches.

The file holds two things:

- **intent**: written in plain prose
- **patch edits**: any format diff, patch, edit, or search/replace hunk

That pair is enough to maintain a [self-healing fork](#example-a-self-healing-fork) of an upstream repo from CI alone: a script applies the edits, and when one drifts, an agent reads the file and heals it.

<!-- spec:start -->

<!-- Generated from apps/website/src/spec.mdx. Edit that file instead, then run: vp run gen-readme -->

## The spec

A `PATCH.md` file kept at `<patch-id>/PATCH.md`. The `<patch-id>` can be a custom or generated name, id, etc. This draft also proposes a convention for splitting a patch into multiple files, see [splitting a patch](#splitting-a-patch).

### Structure

Frontmatter isn't required as of this early draft but it's recommended:

```yaml
---
id: <patch-id>
summary: <short summary of the patch's intent>
baseline: <upstream version or commit the edits were last verified against>
lastUpdated: <yyyy-mm-dd>
---
```

The `baseline` pins the edits to the source they were written against. When a patch drifts, a healing agent can diff the baseline against the current source to see exactly what changed.

The only required heading is `## Intent`. After that, edits are defined inside fenced code blocks, in any [format](#patch-format).

Each edit identifies the file it targets, either from the patch's own header or with `file=<path>` on the fence.

````md
# Patch Title

## Intent

> What the patch does and why, in plain prose. Helps the agent understand
> the original intent so it can easily heal or redesign the patch.

## Patch edits

> Any format, one or more per file, each defined inside a fenced code block.

```diff file=<path>
 context
-removed line
+added line
```
````

### Patch format

A patch edit is a fenced code block that defines the patch's current code. Use any diff or patch format you like. The same `search/replace` and `diff` formats agents already produce work here, as do conventional patches supported by `git apply`, `patch`, or a library like Google's `diff-match-patch`. Some examples:

A `search/replace` block, showing the full before and after:

```patch file=dist/package-manager-cli.js
<<<<<<< SEARCH
    console.log(chalk.green(`Updated ${APP_NAME}`));
=======
    console.log(chalk.green(`Updated ${APP_NAME}`));
    try { (await import("node:child_process")).spawnSync("pi-patcher", ["reconcile"], { stdio: "inherit" }); } catch {}
>>>>>>> REPLACE
```

A `diff` hunk, marking only the changed lines:

```diff file=dist/package-manager-cli.js
@@ pi self update success branch @@
    console.log(chalk.green(`Updated ${APP_NAME}`));
+    try { (await import("node:child_process")).spawnSync("pi-patcher", ["reconcile"], { stdio: "inherit" }); } catch {}
```

A standard `git patch`, applicable as-is with existing tools:

```diff
diff --git a/dist/package-manager-cli.js b/dist/package-manager-cli.js
--- a/dist/package-manager-cli.js
+++ b/dist/package-manager-cli.js
@@ -842,6 +842,7 @@
    console.log(chalk.green(`Updated ${APP_NAME}`));
+    try { (await import("node:child_process")).spawnSync("pi-patcher", ["reconcile"], { stdio: "inherit" }); } catch {}
```

> [!NOTE]
> Each edit needs to identify the file it targets. A git or unified diff already carries the path in its header; for formats that don't, add `file=<path>` to the fence so tools can find the target without interpreting prose.

Edits can also live next to the file. A `PATCH.md` with only the intent can sit beside a `<patch-id>.patch` git diff, which `git apply` takes as is. Tools then apply the diff directly and hand the agent the `PATCH.md` only when the diff stops applying.

### Splitting a patch

A patch can touch several files, but when one grows large or bundles unrelated changes, split it into smaller sub-patches. Smaller patches are easier to maintain, and easier for an agent to heal. Sub-patches nest inside their parent's directory, and the relationships are declared in frontmatter.

```txt
bootstrap-hook/
├── PATCH.md
├── hook-insert/
│   └── PATCH.md
└── hook-config/
    └── PATCH.md
```

```yaml
# parent patch frontmatter
parts: [hook-insert, hook-config]

# sub-patch frontmatter
parent: bootstrap-hook
```

### Applying edits

Every edit has a before and an after. The before should appear exactly once in the target file, so there's no ambiguity about where the edit goes. Applying replaces the before with the after. Because the match is unique, applying the same patch twice is safe, and a tool can read each edit's state directly:

- **applied**: the after is present
- **pending**: the before is present
- **drift**: neither is present

All edits in a patch should apply together or not at all. If any edit fails, the patch has drifted.

### Agent-driven healing

A `PATCH.md` is executable two ways: as data, and as a prompt. You can use existing tools to apply patches when they apply cleanly, and call an agent when they need to be healed. The agent gets the whole file: the intent is its prompt, and the stale edits show what applied last looked like. Healing rewrites the edit blocks against the new source and applies them, so the healed `PATCH.md` lands alongside the change it made. Verify a healed patch with the project's tests or checks before accepting it.

You can also have agents handle the full process of applying and healing patches, which can be as simple as `SKILL.md` or `AGENTS.md` instructions. You can even set up a GitHub workflow that maintains a project fork, integrating new upstream commits on a set schedule.

### Example: a self-healing fork

A patched fork of an upstream repo, maintained with no bespoke tooling. The fork's entire divergence from upstream is the `patches/` tree, and the fork branch is rebuilt from it on every sync, so each `PATCH.md` stays the single source of truth:

```txt
my-fork/
├── patches/
│   ├── disable-telemetry/PATCH.md
│   └── custom-auth/PATCH.md
└── .github/workflows/sync-upstream.yml
```

On a schedule or on upstream release, the workflow:

1. resets the fork branch to upstream
2. applies each patch with `git apply` or a small script
3. calls an agent to heal any patch that fails; the agent rewrites the edit blocks, applies them, and updates the `baseline`
4. runs the project's tests to verify each patch still does what its intent says
5. pushes when everything is clean, or opens a PR for review when a patch was healed

When every patch applies cleanly, no model is called. When one drifts, its `PATCH.md` becomes the prompt.

[autopatch](https://github.com/AVGVSTVS96/autopatch) packages this workflow as one GitHub Action and CLI.

### Tools built on PATCH.md

- [pi-patcher](https://github.com/AVGVSTVS96/pi-patcher)
- [autopatch](https://github.com/AVGVSTVS96/autopatch)

### Example

The `bootstrap-hook` patch from [pi-patcher](https://github.com/AVGVSTVS96/pi-patcher), defined as a single `PATCH.md`:

````md
---
id: bootstrap-hook
summary: Run `pi-patcher reconcile` after `pi update` finishes updating itself.
---

# Bootstrap hook

## Intent

Patches Pi to run `pi-patcher reconcile` after `pi update`.

After `pi update` finishes updating, run `pi-patcher reconcile` so every
installed patch is re-applied to the freshly updated install.

The hook goes right after the existing `Updated ${APP_NAME}` success log in pi's
self-update path. It must stay valid in pi's compiled ESM output, and it must not
change update behavior if `pi-patcher` is missing or fails to start.

```diff file=dist/package-manager-cli.js
@@ pi self update success branch @@
    console.log(chalk.green(`Updated ${APP_NAME}`));
+    try { (await import("node:child_process")).spawnSync("pi-patcher", ["reconcile"], { stdio: "inherit" }); } catch {}
```
````

<!-- spec:end -->

---

Contributions and proposals are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.
