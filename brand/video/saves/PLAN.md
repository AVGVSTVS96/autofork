# saves: plan for the new headline (Oct 13)

The X video, tweet 1 of the launch thread. Bassim called its hook (the X posts) "perfect"; the jarring cut after his tweet and the slow run from "Introducing" to the composer are already fixed. What changes now is the words autofork says after the feed, around Simon's two lines:

- **Fork any open-source app and never rebase it again.**
- **Personal forks of open-source apps that update themselves.**

Simon's note on the old line ("Customize any open-source app once. Every new release includes your changes."): hard to understand. The new lines use words every developer on X already owns (fork, rebase), so the video says them plainly and lets the feed set them up: Theo's "would be easier to maintain your fork on top of" is the rebase pain, and the headline answers it on the very next card.

## What stays

Every time, every cut, and the soundtrack (`out/soundtrack.wav`, C1 with its cues). The cues are read off the page's timing, and nothing moves in time, so the mix still lines up. Music is being chosen separately; when a new take lands, `music.sh` and `sfx.mjs` re-cut it to these same times.

## Beats

| time | scene | on screen | change and why |
| --- | --- | --- | --- |
| 0.0–15.2 | feed | Max Katz's superzed fork, DHH's 2,200 PRs, Theo's 300 a day, "no world in which we merge this", "easier to maintain your fork on top of", bassim's "i can fork and customize anything" | unchanged: the hook he called perfect |
| 15.2 | intro | the flick off the feed onto "Introducing" | unchanged |
| 16.16 | name | the wordmark draws its branch (smaller than now, 640 px, so the line fits under it); under it **Fork any open-source app** (.1 s) / **and never rebase it again.** in ultramarine (.2 s), 76 px | was "Make it yours. / Keep their updates." The headline lands one card after Theo's "maintain your fork", so the viewer reads it as the answer. Both rows are up by +0.2 s (the old rows came at +.475 and +.951), so the 10 words get about 2.6 s on screen without moving a cut: adding a beat here would push every later cue and the music's closing chord, and undo some of his "quicker to the composer" fix |
| 19.0 | ask | "Name an open source app / and what you'd change." The composer: T3 Code badge, types "always show context usage", Fork it; "you / t3code, forked from pingdotgg/t3code" lands | unchanged: the whole product in one action, fast after the name |
| 22.8 | graph | their line with releases, each merging into yours. Caption: **Each new release, / your change goes back on top.** | was "Every release arrives with your change already in it." Same idea in the site's own new words (Sections.tsx), shorter, and it says what the graph shows: the change riding on top of their line |
| 25.7 | heal | a release doesn't fit, the real PATCH.md line, "the agent is rebuilding it", "rebuilt on the new release". Caption: **When a release breaks your change, / an agent rebuilds it from / what you asked for.** | unchanged: the magic underneath |
| 30.4 | proof | **156 commits from T3 Code.** / **One change broke. The agent rebuilt it.** / **I never rebased it.** (ultramarine) · sub: My T3 Code fork, its first two days. · the fork's composer with the context-usage button | was "One change broke on day one. / The agent rebuilt it." in ultramarine. The last line now pays off the headline with his own fork: 156 commits, zero rebases. Every number is from `copy/facts.json` (upstreamCommitsAbsorbed 156, heals 1, firstSync Oct 10 to Oct 12); the site's "Mine, today" says the same ("and I never rebased it") |
| 36.1 | end | the wordmark draws (smaller, 760 px, higher), **Personal forks of open-source apps / that update themselves.** in ink at 60 px on two lines, already in place on the cut frame, autofork.com under it | was the wordmark and URL alone. The second line is the one-sentence definition, the last thing someone reads before the link. 60 px clears the 58 px phone floor in `brand-it/video.md`, and being there on the cut gives it the card's full 2.7 s |

## Known and kept

The heal scene breaks "always show context usage"; on the real day one it was `window-title`. The graph is a diagram of how it works, not footage, and the proof that follows names no change, so it stays.

## Copy checks

- No "Make it yours" or "Keep their updates" anywhere in the page (`rg` it).
- "open-source" hyphenated as an adjective, as Simon wrote it, in both lines.
- No "nightly", "maintains itself", "never breaks". "Update themselves" is Bassim's approved line; the heal beat keeps it honest (a release can break a change, the agent rebuilds it).

## Done when

Stills at 16.5, 18.9, 25, 33, 38.5 and a 2 s sheet show every line whole and inside the frame; a pair around the 16.16 and 36.1 cuts shows no pop; the mp4 is re-encoded on the same soundtrack.
