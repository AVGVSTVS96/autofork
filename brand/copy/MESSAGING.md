# autopatch messaging

The source of truth for how the site, OG image and launch post talk about autopatch. The README in `~/Developer/autopatch` is the source for what the tool does; when they disagree, the README wins and this file follows. Numbers come from `copy/facts.json` (`node copy/facts.mjs`), never typed by hand.

## The idea in one sentence

autopatch keeps your fork on top of upstream, and when upstream breaks one of your changes, an agent rebuilds it.

Bassim's own words, for the launch, verbatim: "i can fork and customize anything, the agents will autonomously track upstream and re-implement my changes."

## Hero

- **Headline:** Fork anything. / Keep your changes. (two diff rows, mono, no band above them)
- **Sub line:** autopatch keeps your fork on top of upstream. When upstream breaks one of your changes, an agent rebuilds it.
- **Command:** `npx github:AVGVSTVS96/autopatch fork owner/repo`
- **Under it:** the real T3 Code heal as a product view: its PATCH.md beside the run (383 commits pulled in, window-title no longer applied, Claude Code rebuilt it, typecheck passed, signed commit, 1m 55s).

## Sections

Oct 12, Bassim: "the page still has that kind of bare-bones skeleton kind of feel... I wanted to feel more like a complete finished product", "like other projects you go there, you kind of get it and you're impressed", "agents are going to be using this. We're not expecting human beings to use the CLI", "the every night wording that you put in everywhere as if every repo has nightly releases", and on the timeline: "don't make it sound cringe".

One headline, one short line, one visual each.

1. **One command.** `fork` forks, clones and adds the workflow (and the secret, if `CLAUDE_CODE_OAUTH_TOKEN` is set). `init owner/repo` for a fork you already have.
2. **A patch is a folder.** PATCH.md says what the change does, the diff sits beside it. Changed the code: write the PATCH.md, `save <id>`. Only an idea: push the PATCH.md and the next heal builds it.
3. **Made for your agent.** `npx skills add AVGVSTVS96/autopatch`, then an example session: fork, edit, write PATCH.md, save, push.
4. **On your schedule.** Update every 6 hours, git only. Heal daily, the agent. Follow a branch or `releases`. Both cron lines are yours to change.
5. **Commands.** `fork`, `init`, `save`, `status`, `sync`, one line each, as in the README.
6. **History.** The README's list, as is: pi-patcher (May, proof of concept), PATCH.md (June, the format), herdr (July, the first fork rebuilt from patches, proof of concept), forks of Claude Code's plugins, Buzz and T3 Code (October, in daily use), autopatch (October). Facts, no ranking of which fork he likes.

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

- **Not nightly.** It runs on two schedules the user picks (defaults: update every 6 hours, heal daily) and can follow releases. Never say "every night".
- **Not a rebase bot.** It rebuilds the fork from upstream plus the patches each time.
- **Not hands-off forever.** If the agent can't make the change pass `verify`, nothing lands and the run fails. Don't say "maintains itself", "zero maintenance" or "never breaks".
- **Not a model call on every run.** Updates are git only; the agent runs only to heal.

## Voice

Plain words, like the README. Short sentences, real numbers.

- Use the real names: `PATCH.md`, `.autopatch/`, `verify`, `fork`, `save`, upstream, patch, heal.
- Lowercase in the launch post and anywhere Bassim speaks. Sentence case on the site.
- No: self-maintaining, autonomous fork, zero maintenance, forever, AI-powered, magic, seamless, effortless, supercharge, unlock.
- No em dashes. No setup-and-punchline lines on the site.

## Name

autopatch, one word, always lowercase, even at the start of a sentence. PATCH.md keeps its casing: it's a file name.
