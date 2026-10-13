# autofork messaging

The source of truth for how the site, OG image, README and launch post talk about autofork. Numbers come from `copy/facts.json` (`node copy/facts.mjs`), never typed by hand. When the product and this file disagree, the product wins and this file follows.

## The idea in one sentence

Name an open source app and what you'd change. autofork makes it your fork, and every new release arrives with your changes already in it.

The new part isn't forking: a fork always keeps your changes. It's that a changed fork keeps getting the original's updates. Bassim: "it's a novel thing to be able to fork anything and still get updates from upstream."

Bassim's words, verbatim, for the launch and the about line: "i can fork and customize anything, the agents will autonomously track upstream and re-implement my changes."

Who it's for, his words: "anybody who knows some open source repo exists." Not hackers. Hackers get one clear line near the bottom.

## Name

autofork, one word, lowercase, even at the start of a sentence. One name for everything: the site, the CLI, the GitHub Action, the repo. `PATCH.md` keeps its casing because it's a file name. Never "AutoFork", "Auto Fork" or "autopatch" anywhere new; `rg -i autopatch` the site before every deploy.

## Hero

- **Headline:** Make it yours. / Keep their updates. (Bassim picked it, Oct 12: "Four is the perfect start for now. that looks awesome." Two rows on the branch, mono.)
- **Sub line:** Name an open source app and what you'd change. Every new release arrives with your changes already in it. (Approved by Bassim with the headline, as on the sheet. Use it word for word.)
- **The action:** one rounded composer that types out examples: the app as a badge (like T3 Code's composer chips) that rolls through apps people fork (T3 Code, herdr, Ghostty, Buzz, pi, cmux, tmux, UTM) and lands on one, then the change types out. T3 Code and "always show context usage" come first. Focusing it stops the typing and leaves that example as the placeholder. Button: **Fork it**.
- **Sign-in, right under it:** **Continue with ChatGPT** and **Continue with Claude**, side by side, both live.
- **One small line under the buttons:** Runs on the ChatGPT or Claude plan you already pay for.

Nothing else above the fold. No command, no diagram, no second example.

## Sections

Bassim, Oct 13: "too many sections on the page... a lot of reading... We could close it down, make it cleaner, simpler, still have really nice, beautiful, rich visualizations." Five blocks, each a headline, at most one line, and one moving visual. A git graph runs down the left edge the whole way: their line with commits and releases, yours branching off at the headline, each release merging into yours, every section hanging off yours. It grows as you scroll.

1. **It keeps what you meant.**
   Line: Your change is saved as what you asked for, not only as code. When they rewrite things or ship something new, the agent rebuilds yours on top of theirs.
   Visual: "always show context usage" and its PATCH.md intent, then three T3 Code releases that play in turn: it goes back on as is; they redo the composer and the agent rebuilds yours into it; they add a usage meter and yours builds on it. This is the intent line Bassim wants weighed most: whatever T3 Code ships, the patch knows what you meant and takes the good from theirs.
   Footnote: An example on T3 Code. If they ship exactly what you asked for, yours pauses and you decide.

2. **Mine, today.**
   Line: My T3 Code fork took 156 commits from T3 Code in its first two days. One change broke on day one and the agent rebuilt it. (`facts.json`.)
   Visual: T3 Code transcribed from its source (apps/web), threads you can switch, and my context-usage button in the composer, which toggles compact-before-send like the real one. Under it, the four other forks as rows with their icons.

3. **Yours.**
   Line: The fork lives in your GitHub and runs in your own GitHub Actions, on your own plan. Free on public forks.
   Visual: the fork's GitHub header, then "Rather run it yourself? The engine is open source." and `npx skills add AVGVSTVS96/autofork`.

4. **How it got here.** The lineage as a graph, labels only: pi-patcher (May) and PATCH.md (June) on the main line, experimental forks branching off it (herdr July, Claude Code plugins Oct 4, Buzz Oct 6, T3 Code Oct 10), merging back into autofork (October).

Footer: autofork · GitHub · MIT.

## Before a claim goes live, check it against the build

The site ships the same day as the product. These lines describe the product Bassim decided on; each must be true in the build before it's on the page:

- "forks it into your GitHub" needs GitHub sign-in and the fork in the user's account.
- "You follow along here" needs the run's progress on the page.
- Both sign-ins are live: ChatGPT with the code typed on OpenAI's page, Claude with the code copied from Anthropic's page and pasted on ours. Never a terminal command.
- The managed platform (autofork running and watching forks for you, alerts on autofork) is "coming soon". Nothing else is.
- Anything about installing the app ("next to the original", "never over it") stays off the page until install ships.

## Meta

- **Title:** autofork: make it yours, keep their updates
- **Description:** Name an open source app and what you'd change. Every new release arrives with your changes already in it.
- **Site:** https://autofork.com (autofork.dev redirects to it)
- **GitHub repo description:** Make it yours, keep their updates. Your fork gets every release; when one breaks a change, an agent rebuilds it.

## OG image (1200×630)

- **Big:** Make it yours. / Keep their updates.
- **Small:** autofork.com
- **Alt:** autofork: Make it yours. Keep their updates.
- **The composer**, once: T3 Code, always show context usage, Fork it.
- **The T3 Code fork's card**, three true moments from `facts.json` and `launch.md`, newest on top: 4 changes on top, ready for their next release; every change kept, +156 commits, Oct 12; rebuilt by the agent, a change broke on day one, +383 commits, Oct 10.

No line appears twice (Bassim, Oct 13: "the open graph image repeats itself... that doesn't look all that good"). Keep the bottom fifth clear for X's title bar.

## What it isn't

- **Not nightly, not a schedule.** It follows the app's releases by default (skipping pre-releases); a branch is an option. The hourly check is git only. Never write "every night" or "nightly". Bassim: "It should just be based on full fucking releases."
- **Not hands-off forever.** If a rebuilt change fails the fork's checks, nothing lands. Never "maintains itself", "zero maintenance", "never breaks".
- **Not an agent on every release.** Changes that still fit go on with git. The agent runs only when one breaks.
- **Not API billing.** It runs on the plan the user already has. Bassim: "Nobody should ever be using Claude models with API prices."
- **Not hands-off when they catch up.** When the original ships its own version of a change, autofork pauses it and asks. It never quietly picks for you.
- **Not for hackers first.** No CLI above section 7.

## Words

Plain words, like a person who built it. Short sentences, real numbers.

- On the site, for everyone: fork, change, release, update, rebuild, your GitHub, your plan. The original's makers are "they" ("their updates", "they ship"), or the app's name. Not "upstream" on the page, except in footnotes and the real issue title. "Patch" appears once, in section 3, where it's the real file.
- `PATCH.md`, `heal`, `verify`, `follow`, `.autofork/` belong in the README and section 6, not above it.
- Only the managed platform is "coming soon". Not "waitlist" on the page.
- The user picks: "your fork", "what you'd change". Never a role we hand them.
- No: self-maintaining, autonomous fork, forever, AI-powered, magic, seamless, effortless, supercharge, unlock, unleash, slop.
- No em dashes. No setup-and-punchline lines on the site. No feature lists.
- Sentence case on the site. Lowercase in the launch post.
