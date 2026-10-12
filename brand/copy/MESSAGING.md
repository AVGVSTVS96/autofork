# autopatch messaging

The source of truth for how the site, OG image and launch post talk about autopatch. The README in `~/Developer/autopatch` is the source for what the tool does; when they disagree, the README wins and this file follows. Numbers come from `copy/facts.json` (`node copy/facts.mjs`), never typed by hand.

## The idea in one sentence

autopatch keeps your fork on top of upstream, and when upstream breaks one of your changes, an agent rebuilds it.

Bassim's own words, for the launch, verbatim: "i can fork and customize anything, the agents will autonomously track upstream and re-implement my changes."

## Hero

- **Headline:** Fork anything. / Keep your changes. (two diff rows, mono, no band above them)
- **Sub line:** autopatch keeps your fork on top of upstream. When upstream breaks one of your changes, an agent rebuilds it.
- **Command:** `npx github:AVGVSTVS96/autopatch fork pingdotgg/t3code`
- **Under it:** the real T3 Code heal as a product view: its PATCH.md beside the run (383 commits pulled in, window-title no longer applied, Claude Code rebuilt it, typecheck passed, signed commit, 1m 55s).

## Sections

Oct 12, Bassim, on a hardcoded schedule: "If a schedule is going to be hardcoded to run the user's coding agent, spending the user's money, it shouldn't be on a nightly schedule. It should just be based on full fucking releases. Nightlies and all that shit should be configuration options", and "use t3 code for the auto patch examples".

Oct 12, Bassim: "the page still has that kind of bare-bones skeleton kind of feel... I wanted to feel more like a complete finished product", "like other projects you go there, you kind of get it and you're impressed", "agents are going to be using this. We're not expecting human beings to use the CLI", "the every night wording that you put in everywhere as if every repo has nightly releases", and on the timeline: "don't make it sound cringe".

One headline, one short line, one visual each.

1. **One command.** `fork` forks, clones and adds the workflow (and the secret, if `CLAUDE_CODE_OAUTH_TOKEN` is set). `init owner/repo` for a fork you already have.
2. **A patch is a folder.** PATCH.md says what the change does, the diff sits beside it. The real `context-usage` patch from the T3 Code fork, its PATCH.md in full. Changed the code: write the PATCH.md, `save <id>`. Only an idea: push the PATCH.md and the workflow has an agent build it.
3. **Made for your agent.** `npx skills add AVGVSTVS96/autopatch`, then an example session on T3 Code: fork, edit, write the context-usage PATCH.md, save, push.
4. **Follows releases.** A new upstream release rebuilds the fork; nightlies and other pre-releases are skipped; `"follow": "main"` follows a branch instead. The visual is T3 Code's real releases over two weeks (Sep 28 to Oct 11: 3 releases, 71 nightlies and previews). Release: rebuilt, signed commit. Agent: only when a release breaks a patch. Check: hourly, git only.
5. **Yours to change.** The T3 Code fork's real `config.json`, every key from the README's Config table, and the workflow file being yours (`heal: false`).
6. **Commands.** `fork`, `init`, `save`, `status`, `sync` and the `--follow`/`--verify` options, worded as `--help` prints them.
7. **History.** The README's list, as is: pi-patcher (May, proof of concept), PATCH.md (June, the format), herdr (July, the first fork rebuilt from patches, proof of concept), forks of Claude Code's plugins, Buzz and T3 Code (October, in daily use), autopatch (October). Facts, no ranking of which fork he likes.

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
