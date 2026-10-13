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
- **The action:** one input, prefilled as a placeholder: `T3 Code, but always show context usage`. Button: **Fork it**.
- **Sign-in, right under it:** **Continue with ChatGPT** and **Continue with Claude**, side by side, both live.
- **One small line under the buttons:** Runs on the ChatGPT or Claude plan you already pay for.

Nothing else above the fold. No command, no diagram, no second example.

## Sections

Bassim, Oct 12: "There's far too much text overall. Do less, in general", "Show only one example for that first part, and show the others further down the page", "users shouldn't come away thinking it's complicated. It should still feel rich, with good visualizations."

Each section is a headline, at most one short line, and one visual. Each gets its own layout.

1. **Watch it change.**
   Line: The agent forks it into your GitHub and makes the change. You follow along here.
   Visual: T3 Code as it looks today, the run's progress beside it, and the context usage button appearing in the composer. Progress, not a chat: there's no back-and-forth with the agent today.

2. **Every release, your changes go back on top.**
   Line: When a release breaks one, the agent rebuilds it from what you asked for.
   Visual: three T3 Code releases on one track. Release 1: both changes go on. Release 2: one breaks and is rebuilt. Release 3: T3 Code ships context usage itself, so that change pauses and an issue opens on the fork: `context-usage: upstream does this now`.
   Footnote, small: My T3 Code fork took 156 upstream commits in its first two days and kept all 3 changes. (`facts.json`: the T3 Code fork's `upstreamCommitsAbsorbed` and `patches`; read them, don't type them.)

3. **What you asked for is the patch.**
   Line: Each change is kept in plain words next to its code, so it can be rebuilt on code that doesn't exist yet.
   Visual: the request ("always show context usage") becoming `PATCH.md`'s first sentence and a diffstat. First sentence only, never the whole file.

4. **When they catch up, you decide.**
   Line: If they ship their own version of your change, yours pauses and you get an issue. Keep theirs or bring yours back.
   Visual: the real issue on the fork, title `context-usage: upstream does this now`, with its two choices.
   Small, under it: Alerts on autofork are coming soon. For now it's a GitHub notification.

5. **Yours.**
   Line: The fork lives in your GitHub and runs in your own GitHub Actions, on your own plan. Free on public forks.
   Visual: the fork's GitHub header ("forked from pingdotgg/t3code") and the two sign-in buttons as they really look.

6. **More forks.**
   Line: none.
   Visual: four requests as rows, each with its app's icon, from forks Bassim runs (real PATCH.md, rewritten as what someone would type):
   - herdr, but every pane shows its ID on its border
   - Claude Code's Telegram plugin, but every forum topic is its own session
   - Buzz, but I can connect an agent that runs somewhere else
   - T3 Code, but the window title shows the thread I'm on

7. **Rather run it yourself?**
   Line: The engine is open source. Use it with your own agent and your own GitHub Actions.
   Visual: `npx skills add AVGVSTVS96/autofork` and a link to the repo. Commands, config and schedules live in the README, not here.

8. **How it got here.** A five-dot line, labels only, no adjectives:
   pi-patcher (May) · PATCH.md (June) · herdr (July) · my forks (October) · autofork (October).
   Bassim: "a timeline is cool, but don't make it sound cringe." No "the one I rely on most", no story.

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
- **Site:** https://autofork.com (autofork.dev too)
- **GitHub repo description:** Make it yours, keep their updates. Your fork gets every release; when one breaks a change, an agent rebuilds it.

## OG image (1200×630)

- **Big:** Make it yours. / Keep their updates.
- **Small:** autofork.com
- **Alt:** autofork: Make it yours. Keep their updates.

Nothing else. Keep the bottom fifth clear for X's title bar.

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
