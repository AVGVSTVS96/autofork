# autopatch messaging

The source of truth for how the site, OG image and launch post talk about autopatch. The README in `~/Developer/autopatch` is the source for what the tool does; when they disagree, the README wins and this file follows. Numbers come from `copy/facts.json` (`node copy/facts.mjs`), never typed by hand.

## The idea in one sentence

autopatch keeps your fork on top of upstream, and when upstream breaks one of your changes, an agent rebuilds it.

Bassim's own words, for the launch, verbatim: "i can fork and customize anything, the agents will autonomously track upstream and re-implement my changes."

## Hero

- **Headline:** Fork anything. / Keep your changes. (two diff rows, mono, no band above them)
- **Sub line:** Tell your agent what to change. autopatch keeps it working through every upstream release.
- **Command:** `npx skills add AVGVSTVS96/autopatch`
- **Under it:** the one example. The prompt ("Fork T3 Code with autopatch. Always show context usage in the composer, and put the thread's title in the window and tab title."), the two patches it makes, and T3 Code with both changes marked.

## Sections

Oct 12, Bassim: "Showing the full patch.md as plain text across the whole app isn't good design. There's far too much text overall. Do less", "The core flow is simple. You tell your coding agent to auto-patch a fork of T3 Code to add context usage and to set the window and tab titles. Show only one example for that first part, and show the others further down the page", "Make the site more designed and distinctive, but minimal."

One headline, at most one short line, one visual each.

1. **Every release, your changes go back on top.** Three releases on an upstream track: both patches apply; one breaks and the agent rebuilds it; upstream ships one and it's dropped. Nightlies skipped, checks run before a push.
2. **A patch is a folder.** PATCH.md's first sentence and the diffstat, not the whole file.
3. **Forks I use every day.** Claude Code plugins, Buzz, herdr: a few of their patches each as `+` rows.
4. **Get started.** The skill, or `fork owner/repo` by hand; commands and config live in the README.
5. **How it got here.** pi-patcher, PATCH.md, herdr, the forks, autopatch, as a five-dot line.

## Meta

- **Title:** autopatch: fork anything, keep your changes
- **Description:** autopatch keeps your fork on top of upstream. When upstream breaks one of your changes, an agent rebuilds it.
- **Site:** https://autopatchmd.vercel.app
- **Repo description (GitHub):** Fork anything and keep your changes. When upstream breaks one, an agent rebuilds it.

## OG image (1200×630)

- **Big:** Fork anything. / Keep your changes.
- **Small:** autopatch · autopatchmd.vercel.app
- **Alt text:** autopatch: Fork anything. Keep your changes.

Nothing else on it. Keep the bottom fifth clear for X's title bar.

## What it isn't

- **Not nightly.** It follows upstream's releases, skipping pre-releases, unless the user sets `follow` to a branch. The hourly check is git only. Never say "every night" or present a schedule as when the agent runs.
- **Not a rebase bot.** It rebuilds the fork from upstream plus the patches each time.
- **Not hands-off forever.** If the agent can't make the change pass `verify`, nothing lands and the run fails. Don't say "maintains itself", "zero maintenance" or "never breaks".
- **Not a model call on every run.** Checks and clean rebuilds are git only; the agent runs only when a release breaks a patch.

## Voice

Plain words, like the README. Short sentences, real numbers.

- Use the real names: `PATCH.md`, `.autopatch/`, `verify`, `fork`, `save`, upstream, patch, heal.
- Lowercase in the launch post and anywhere Bassim speaks. Sentence case on the site.
- No: self-maintaining, autonomous fork, zero maintenance, forever, AI-powered, magic, seamless, effortless, supercharge, unlock.
- No em dashes. No setup-and-punchline lines on the site.

## Name

autopatch, one word, always lowercase, even at the start of a sentence. PATCH.md keeps its casing: it's a file name.
