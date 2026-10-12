# autopatch messaging

The source of truth for how we talk about autopatch. The site, README, OG image and launch post draw from here. Numbers come from `copy/facts.json` (run `node copy/facts.mjs`), never typed by hand. When this file and an asset disagree, fix it here first, then `rg` every asset for the old wording.

Every claim below was checked against `~/Developer/autopatch` (`src/autopatch.ts`, `action.yml`, `action.sh`, `README.md`) on Oct 10 2026, and the patch model (plain-prose PATCH.md, `add <id> "text"`) on Oct 11. The README's first line and this hero's sub line say the same thing; keep them in step.

## The idea in one sentence

autopatch keeps your changes on top of someone else's repo: every night your fork is rebuilt from upstream plus your patches, and when one stops applying, an agent re-implements it from the intent you wrote down.

Bassim's own words, for the README and the launch, verbatim: "i can fork and customize anything, the agents will autonomously track upstream and re-implement my changes."

## Hero

- **Headline:** Fork anything. Keep your changes.
- **Sub line:** A GitHub Action that updates your fork every night, and has an agent redo any change that stops applying. *(19 words)*
- **Band above it:** your fork, every night *(no SHAs: plain words read as a product, not a log)*
- **Command under it:** `npx github:AVGVSTVS96/autopatch init owner/repo`

## Sections

Oct 11 rework, from Bassim: "the copy's quite heavy... makes this look so complicated", "a little too techy feeling... like hacker feeling. i want it to feel more like a finished product", "show just how easy it is to set up autopatch and fork a repo", and explain the commands: "What is adding a patch exactly? ... When do you do that exactly? ... How do you create patches exactly? Like files?" The PATCH.md site's hand-written copy (`~/Developer/PATCH.md/apps/website/src/spec.mdx`) sets the tone: say what the thing is, plainly, then show it.

One headline, at most one short line, one visual each. No terminal logs, SHAs or YAML on the page; those live in the README and the linked run.

### 1. Set it up once

Three steps: fork it; run `init` (adds the nightly workflow, `--verify` takes the test command); `claude setup-token` and save it as `CLAUDE_CODE_OAUTH_TOKEN`, push. "That's it."

### 2. Change anything. Say why.

**Line:** Edit the code however you like, by hand or with your agent. Then `add` turns it into a patch.

**Visual:** the `add` command with its sentence, then what it writes: PATCH.md holding exactly that sentence, the folder, and the real `window-title.patch` diff from the T3 Code fork. Two asides: same id folds more in; words only makes an intent-only patch the agent builds on the next sync.

### 3. Every night, it rebuilds your fork

**Visual:** five diff rows in sans: upstream's newest green commit (context), your patches applied with git (+), any that no longer fit redone by an agent from their PATCH.md (+), any upstream now does itself dropped (-), your tests then a signed commit (context). Beside it, the real T3 Code run as a result card: 383 upstream commits behind, 1 patch redone by Claude Code, typecheck passed, signed and pushed, 1m 55s.

**Under it:** No agent runs when every patch fits. If anything fails, nothing is pushed.

### 4. Four commands

`init`, `add`, `status`, `sync`, one plain line each. Note: run with `npx github:AVGVSTVS96/autopatch`; Claude Code by default, `agent` in config.json for Codex or any CLI agent.

### 5. How it got here

A dated timeline, in Bassim's order: pi-patcher (May 22, proof of concept), PATCH.md (Jun 27, the format), herdr (Jul 24, the first fork kept this way, also a proof of concept; {forks.2.upstreamCommitsAbsorbed} upstream commits), Claude Code plugins (Oct 4, "the one I rely on most"), Buzz (Oct 5), T3 Code (Oct 6, the first fork on autopatch), autopatch (Oct 10).

## Meta

- **Title:** autopatch: fork anything, keep your changes
- **Description:** A GitHub Action that updates your fork every night, and has an agent redo any change that stops applying.
- **Site:** https://autopatchmd.vercel.app
- **Repo description (GitHub):** Fork anything and keep your changes. An agent re-implements the ones that stop applying.

## OG image (1200×630)

- **Big:** Fork anything. Keep your changes.
- **Small:** autopatch · autopatchmd.vercel.app
- **Alt text:** autopatch: fork anything, keep your changes. Patches replay on upstream every night, and an agent re-implements the ones that stop applying.

Nothing else on it. Keep the bottom fifth clear for X's title bar.

## What it is

- A CLI and a GitHub Action, in one file of TypeScript ({tool.sourceLines} lines, {tool.runtimeDependencies} runtime dependencies, MIT).
- Your patches as plain files in your fork: `.autopatch/<id>/PATCH.md` and `<id>.patch`, in order, listed in `.autopatch/config.json`.
- Commands: `init`, `add`, `status`, `sync`.
- Your fork's own `.github/` replaces upstream's on every rebuild, so upstream's workflows never run with your secrets.

## What it isn't

- **Not a rebase bot.** It rebuilds your fork from upstream each time: upstream, then each patch in order. Patches stack, and a later one can touch the same files as an earlier one.
- **Not hands-off forever.** If the agent can't make the change pass your verify command, nothing lands and the run fails, so you see it. Don't say "maintains itself", "zero maintenance" or "never breaks".
- **Not a model call every night.** When every patch applies, there's no agent at all. A sync that failed isn't retried on the same upstream commit with the same patches, so a stuck heal can't burn your quota.
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
| Your fork maintains itself. | Your patches replay on upstream every night. |
| AI-powered conflict resolution. | When a patch stops applying, an agent rewrites it from its intent. |
| Never rebase again. | Git applies what it can. The agent handles the rest, and your tests check it. |
| Fork anything, forever. | Fork anything. Keep your changes. |

## Name

autopatch, one word, always lowercase, even at the start of a sentence. Never "AutoPatch", "Autopatch" or "auto-patch" (Bassim says "auto patch" out loud; it's still one word written). PATCH.md keeps its casing: it's a file name.
