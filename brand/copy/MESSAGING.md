# autopatch messaging

The source of truth for how we talk about autopatch. The site, README, OG image and launch post draw from here. Numbers come from `copy/facts.json` (run `node copy/facts.mjs`), never typed by hand. When this file and an asset disagree, fix it here first, then `rg` every asset for the old wording.

Every claim below was checked against `~/Developer/autopatch/src/autopatch.ts` on Oct 10 2026. The GitHub Action's own file (`action.yml`) didn't exist yet when this was written, so nothing here describes how it commits or pushes. Check it before adding a line about that.

## The idea in one sentence

autopatch keeps your changes on top of someone else's repo: your patches replay on upstream every day, and when one stops applying, an agent rewrites it from the intent you wrote down.

Bassim's own words, for the README and the launch, verbatim: "i can fork and customize anything, the agents will autonomously track upstream and re-implement my changes."

## Hero

- **Headline:** Fork anything. Keep your changes.
- **Sub line:** Your patches replay on upstream every day, and an agent heals the ones that drift. *(15 words)*
- **Command under it:** `npx github:AVGVSTVS96/autopatch init owner/repo`

Runners-up for the headline, in order:

1. **Your fork, current every morning.** Plain, but says less about why you'd fork.
2. **Customize anything. Keep up with upstream.** Two jobs in one line; reads like a list.

"heal" and "drift" are the tool's own words (its usage text says "an agent heals what drifts"), so they're fine in the hero. Explain them once in the sections, never in the hero.

## Sections

One headline, one short line, one visual each. The visual carries the explanation. Sentence case on the site; the name is always lowercase.

### 1. A patch is a diff plus what you meant

**Line:** Each change lives in `.autopatch/<id>/`: the git diff, and a PATCH.md that says in plain words what it's for.

**Visual:** the folder, then a real PATCH.md beside its `.patch`. Use herdr's `pane-border-ids` (public: github.com/AVGVSTVS96/herdr/tree/main/patches/pane-border-ids), cropped to `## Intent` and the first two `## Invariants`. Sections a PATCH.md can have: Intent (required; sync refuses without it), and optionally Invariants, Verification, Removal.

### 2. Git first. The agent only when git can't

**Line:** Patches that still apply go in with a 3-way merge and no model call. Only a broken one wakes the agent.

**Visual:** the sync's real output, in its exact shape (the CLI prints these lines; SHAs are 12 characters):

```
upstream 3f2a91c04be1 → 8b0e44d9a7c2, 4 patches
healing pane-border-ids
autopatch: sync herdrdev/herdr to 8b0e44d9a7c2

healed pane-border-ids
```

Three of four patches applied without a line of output. That silence is the point; let it show.

### 3. Healed from intent, proven by your tests

**Line:** The agent rebuilds the change on today's code from its PATCH.md, and your verify command has to pass before anything lands.

**Visual:** the Intent paragraph on the left, the new diff on the right, the verify command under both with its pass. If verify fails, nothing is committed and the fork stays where it was.

### 4. Healed once, plain git after

**Line:** The rewritten diff goes back into the patch, so the next sync applies it without a model.

**Visual:** the sync commit's change to `<id>.patch`, with the `baseline:` line in PATCH.md moving to the new upstream SHA.

### 5. When upstream ships it, the patch retires

**Line:** If upstream already does what the intent asks, the agent says how, and the patch is deleted with that reason in the commit.

**Visual:** one commit message line: `dropped retry-login: upstream retries in auth.ts since #4123`. *(Made up but realistic; the format `dropped <id>: <reason>` is real.)*

### 6. Built on green

**Line:** It picks upstream's newest commit whose checks all passed, so a broken upstream main never becomes yours.

**Visual:** upstream's last few commits with their check dots; the tip is red or pending, the arrow lands on the newest green one. (It looks back up to 30 commits; `"green": false` turns this off.)

### 7. Three forks, kept this way since July

**Line:** Claude Code plugins, buzz and herdr took in {totals.upstreamCommitsAbsorbed} upstream commits, and an agent rewrote patches {totals.heals} times along the way.¹

**Visual:** a three-row ledger, one per fork: name, upstream repo, patch count, upstream commits taken in, heals. Numbers from `facts.json` `forks[]`. herdr's 315 dwarfs the others' 28 and 51: show numbers as text, no bars.

¹ Footnote, verbatim: *Counted with `gh` on Oct 10 2026 from each fork's sync commits and patched releases. These forks run the per-repo workflows autopatch was packaged from.*

That second sentence is required. autopatch itself is new today; the forks prove the technique, not this release.

### 8. pi-patcher, then PATCH.md, then autopatch

**Line:** Self-healing patches for one coding agent in May, a spec for any patch in June, any repo today.

**Visual:** three steps on a line with dates from `facts.json` `lineage` (May 22, Jun 27, today), each with its repo link. Credit pi-patcher and PATCH.md by name here and in the README.

### 9. Start

**Headline:** Three commands.

**Line:** Track upstream, turn your changes into a patch, push.

**Visual:** a terminal with the real commands and their real replies:

```
$ npx github:AVGVSTVS96/autopatch init owner/repo
autopatch tracks owner/repo (main).
Add a CLAUDE_CODE_OAUTH_TOKEN secret (claude setup-token), commit, and push.

$ autopatch add fix-login
captured 2 files in .autopatch/fix-login. Write its ## Intent, then commit.

$ autopatch sync
```

Under it, small: *Runs as a GitHub Action, daily by default. Heals with Claude Code; set `agent` in `.autopatch/config.json` to any CLI agent that takes a prompt on stdin.*

Check the README's install line before shipping this block: without a global install, `add` and `sync` are `npx github:AVGVSTVS96/autopatch add ...` too.

## Meta

- **Title:** autopatch: fork anything, keep your changes
- **Description:** autopatch replays your patches on upstream every day. When one stops applying, an agent rewrites it from the intent in its PATCH.md.
- **Site:** https://autopatchmd.vercel.app
- **Repo description (GitHub):** Keep your changes on top of someone else's repo. An agent heals the patches that drift.

## OG image (1200×630)

- **Big:** Fork anything. Keep your changes.
- **Small:** autopatch · autopatchmd.vercel.app
- **Alt text:** autopatch: fork anything, keep your changes. Patches replay on upstream daily; an agent heals the ones that drift.

Nothing else on it. Keep the bottom fifth clear for X's title bar.

## What it is

- A CLI and a GitHub Action, in one file of TypeScript ({tool.sourceLines} lines, {tool.runtimeDependencies} runtime dependencies, MIT).
- Your patches as plain files in your fork: `.autopatch/<id>/PATCH.md` and `<id>.patch`, in order, listed in `.autopatch/config.json`.
- Commands: `init`, `add`, `status`, `sync`.

## What it isn't

- **Not a rebase bot.** It rebuilds your fork from upstream each time: upstream, then each patch in order. Patches stack, and a later one can touch the same files as an earlier one.
- **Not hands-off forever.** If the agent can't make the change pass your verify command, nothing lands and the run fails, so you see it. Don't say "maintains itself", "zero maintenance" or "never breaks".
- **Not a model call every day.** When every patch applies, there's no agent at all.
- **Not a skill, a plugin or a mod.** It's a tool that runs in your fork's CI.

## Voice

Plain words, like the README. Short sentences, real numbers, what works and what doesn't.

**Do**
- Use the real names: `PATCH.md`, `.autopatch/`, `verify`, `autopatch sync`, upstream, fork, patch, heal.
- Say what happened: "git applied 3 of 4, the agent rewrote 1, verify passed."
- Lowercase in the launch post and anywhere Bassim speaks. Sentence case on the site.

**Don't**
- No: self-maintaining, autonomous fork, zero maintenance, forever, AI-powered, magic, seamless, effortless, supercharge, unlock.
- Don't call patches "mods". Don't call autopatch a skill.
- No em dashes. Reword the sentence.
- No setup-and-punchline lines on the site. The launch post can have one hook; the page can't.

| Don't | Do |
|---|---|
| Your fork maintains itself. | Your patches replay on upstream every day. |
| AI-powered conflict resolution. | When a patch stops applying, an agent rewrites it from its intent. |
| Never rebase again. | Git applies what it can. The agent handles the rest, and your tests check it. |
| Fork anything, forever. | Fork anything. Keep your changes. |

## Name

autopatch, one word, always lowercase, even at the start of a sentence. Never "AutoPatch", "Autopatch" or "auto-patch" (Bassim says "auto patch" out loud; it's still one word written). PATCH.md keeps its casing: it's a file name.
