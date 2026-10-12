# autofork messaging

The source of truth for how the site, OG image, README and launch post talk about autofork. Numbers come from `copy/facts.json` (`node copy/facts.mjs`), never typed by hand. When the product and this file disagree, the product wins and this file follows.

## The idea in one sentence

Name an open source app and what you'd change, and autofork gives you your own fork of it that keeps up with every release.

Bassim's words, verbatim, for the launch and the about line: "i can fork and customize anything, the agents will autonomously track upstream and re-implement my changes."

Who it's for, his words: "anybody who knows some open source repo exists." Not hackers. Hackers get one clear line near the bottom.

## Name

autofork, one word, lowercase, even at the start of a sentence. One name for everything: the site, the CLI, the GitHub Action, the repo. `PATCH.md` keeps its casing because it's a file name. Never "AutoFork", "Auto Fork" or "autopatch" anywhere new; `rg -i autopatch` the site before every deploy.

## Hero

- **Headline:** Fork anything. / Keep your changes. (Bassim's line, kept: "The monophon hero headline is perfectly fine." Two diff rows, mono.)
- **Sub line:** Name an open source app and what you'd change. Your fork keeps up with every release. (16 words)
- **The action:** one input, prefilled as a placeholder: `T3 Code, but always show context usage`. Button: **Fork it**.
- **Sign-in, right under it:** `Sign in with ChatGPT` (live) and `Claude` with "Coming soon" and a **Get an invite** button.
- **One small line under the buttons:** Runs on the ChatGPT or Claude plan you already pay for.

Nothing else above the fold. No command, no diagram, no second example.

## Sections

Bassim, Oct 12: "There's far too much text overall. Do less, in general", "Show only one example for that first part, and show the others further down the page", "users shouldn't come away thinking it's complicated. It should still feel rich, with good visualizations."

Each section is a headline, at most one short line, and one visual. Each gets its own layout.

1. **Watch it change.**
   Line: The agent forks it into your GitHub and makes the change while you watch. Ask for more anytime.
   Visual: T3 Code as it looks today, the agent's session beside it, and the context usage button appearing in the composer.

2. **Every release, your changes go back on top.**
   Line: When a release breaks one, the agent rebuilds it from what you asked for.
   Visual: three T3 Code releases on one track. Release 1: both changes go on. Release 2: one breaks and is rebuilt. Release 3: T3 Code ships context usage itself, so that change is dropped.
   Footnote, small: My T3 Code fork took 156 upstream commits in its first two days and kept all 3 changes. (`facts.json`: the T3 Code fork's `upstreamCommitsAbsorbed` and `patches`; read them, don't type them.)

3. **What you asked for is the patch.**
   Line: Each change is kept in plain words next to its code, so it can be rebuilt on code that doesn't exist yet.
   Visual: the request ("always show context usage") becoming `PATCH.md`'s first sentence and a diffstat. First sentence only, never the whole file.

4. **Yours.**
   Line: The fork lives in your GitHub account and runs on your own plan. With Claude, the computer is on us.
   Visual: the fork's GitHub header ("forked from pingdotgg/t3code") and the two sign-in buttons as they really look.

5. **More forks.**
   Line: none.
   Visual: four requests as rows, each with its app's icon, from forks Bassim runs (real PATCH.md, rewritten as what someone would type):
   - herdr, but every pane shows its ID on its border
   - Claude Code's Telegram plugin, but every forum topic is its own session
   - Buzz, but I can connect an agent that runs somewhere else
   - T3 Code, but the window title shows the thread I'm on

6. **Rather run it yourself?**
   Line: The engine is open source. Use it with your own agent and your own GitHub Actions.
   Visual: `npx skills add AVGVSTVS96/autofork` and a link to the repo. Commands, config and schedules live in the README, not here.

7. **How it got here.** A five-dot line, labels only, no adjectives:
   pi-patcher (May) · PATCH.md (June) · herdr (July) · my forks (October) · autofork (October).
   Bassim: "a timeline is cool, but don't make it sound cringe." No "the one I rely on most", no story.

Footer: autofork · GitHub · MIT.

## Before a claim goes live, check it against the build

The site ships the same day as the product. These lines describe the product Bassim decided on; each must be true in the build before it's on the page:

- "forks it into your GitHub" needs GitHub sign-in and the fork in the user's account.
- "while you watch" and "Ask for more anytime" need a live session view. If the user only gets a result, say "makes the change" and drop the rest.
- "With Claude, the computer is on us" is the Claude version only. Don't say where the ChatGPT version runs until it's decided.
- Anything about installing the app ("next to the original", "never over it") stays off the page until install ships.

## Meta

- **Title:** autofork: fork anything, keep your changes
- **Description:** Name an open source app and what you'd change. autofork builds your fork and keeps it current with every release.
- **Site:** https://autofork.dev
- **GitHub repo description:** Fork anything and keep your changes. When a release breaks one, an agent rebuilds it.

## OG image (1200×630)

- **Big:** Fork anything. / Keep your changes.
- **Small:** autofork.dev
- **Alt:** autofork: Fork anything. Keep your changes.

Nothing else. Keep the bottom fifth clear for X's title bar.

## What it isn't

- **Not nightly, not a schedule.** It follows the app's releases by default (skipping pre-releases); a branch is an option. The hourly check is git only. Never write "every night" or "nightly". Bassim: "It should just be based on full fucking releases."
- **Not hands-off forever.** If a rebuilt change fails the fork's checks, nothing lands. Never "maintains itself", "zero maintenance", "never breaks".
- **Not an agent on every release.** Changes that still fit go on with git. The agent runs only when one breaks.
- **Not API billing.** It runs on the plan the user already has. Bassim: "Nobody should ever be using Claude models with API prices."
- **Not for hackers first.** No CLI above section 6.

## Words

Plain words, like a person who built it. Short sentences, real numbers.

- On the site, for everyone: fork, change, release, rebuild, your GitHub, your plan. Say "the app" or its name, not "upstream", except in footnotes. "Patch" appears once, in section 3, where it's the real file.
- `PATCH.md`, `heal`, `verify`, `follow`, `.autofork/` belong in the README and section 6, not above it.
- Claude's offer is "coming soon" with "Get an invite". Not "waitlist" on the page.
- The user picks: "your fork", "what you'd change". Never a role we hand them.
- No: self-maintaining, autonomous fork, forever, AI-powered, magic, seamless, effortless, supercharge, unlock, unleash, slop.
- No em dashes. No setup-and-punchline lines on the site. No feature lists.
- Sentence case on the site. Lowercase in the launch post.
