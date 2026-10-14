# branch: plan for the new headline (Oct 13)

The git graph is the video: T3 Code's gray line, yours peeling off in ultramarine, built from the real fork (AVGVSTVS96/t3code). Tweet 4 of the launch thread, the proof. Today its words are "Make it yours. / Keep their updates.", the line Simon found hard to understand. They become Simon's two:

- **Fork any open-source app and never rebase it again.**
- **Personal forks of open-source apps that update themselves.**

Simon's lines name the pain (rebasing), so the opening now names it too. The story for someone who has never heard of autofork:

```
they won't merge it → you fork it → now you rebase every time they ship
→ autofork: personal forks that update themselves
→ name it → a release breaks it → the agent rebuilds it
→ each time they ship, it goes back on top → 156 commits, never rebased → headline → link
```

## What stays

Every scene's time, the camera, the graph, and the soundtrack (`out/soundtrack.wav`, A2 at 120 BPM cut on downbeats by `sound.js`). Only words change, inside the scenes that already hold them, so the cues still sit on their elements. Music is being chosen separately.

## Beats (a bar is 2 s)

| time | scene | on screen | caption | change and why |
| --- | --- | --- | --- | --- |
| 0–4 | their line | T3 Code's gray trunk drawing its real releases v0.0.42 to v0.0.45 | **T3 Code won't merge big features.** · "Big features will not be." T3 Code's README | unchanged: the real problem, the launch post's first line |
| 4–8 | the fork | yours peels off at 9503155 (Oct 6) carrying `window-title`; their line runs on to Oct 10 while yours sits still | **So you fork it.** / **Now you rebase it every time they ship.** | was "Fork it to make it yours. / It falls behind every release they ship." It now names the chore in the headline's own word, so "never rebase it again" lands later as the fix. The second line arrives as their line pulls away, the gap the picture already draws |
| 8–10 | introducing | plain field, the music stops for its last beat | Introducing | unchanged |
| 10–15 | name | the wordmark draws on the drop; under it **Personal forks of open-source apps** / **that update themselves.** ("update themselves" ultramarine), 60 px, two lines | | was "Make it yours. Keep their updates." on one line. Right after the name, the one-sentence definition tells a first-time viewer what autofork is before the demo starts |
| 15–21 | ask | the composer: T3 Code, "put the thread's name in the window title", Fork it | **Name an app and what you'd change.** · Runs on the ChatGPT or Claude plan you already pay for. | unchanged |
| 21–26 | it breaks | 9afde1c merges into yours, `window-title` turns red and dashed | **Sometimes an update breaks your change.** | unchanged. The break on screen is 9afde1c, a commit on T3 Code's main, not a release (their last full release was v0.0.45 on Oct 2; Oct 10 to 12 the fork followed main), so "update" is the true word on this real footage |
| 26–34 | underneath | dark: the PATCH.md sentence, the real Actions log of Oct 10 (healing 22:59:45, the agent's sentence, healed 23:01:11) | **An agent rebuilds it from what you asked for.** | unchanged: the magic underneath |
| 34–42 | every update | the camera rides the five real syncs, one per bar; `context-usage` and `fork-readme` join | **Each time they ship,** / **your changes go back on top.** | was "Every update after that arrives / with your changes in it." The site's own words (MESSAGING key line 2), in the true unit for this footage: the five syncs follow T3 Code's main, not releases, and four of them were started by hand, so the caption says what happened on every one of them, not that it ran on its own |
| 42–48 | proof | pull back over Oct 10 to Oct 12, one dot per upstream commit, the rebuilt `window-title` chip pulses | **My T3 Code fork took 156 commits in its first two days.** / **One change broke and the agent rebuilt it.** / **I never rebased it.** (ultramarine, on the bar at 46) | was two lines ending "One change broke on day one and the agent rebuilt it." The new third line pays off 4–8 with his own fork. Numbers from `copy/facts.json` (156, 1 heal, Oct 10 to 12); the site's "Mine, today" says "and I never rebased it". |
| 48–54 | they catch up | their line ships context usage, yours arrives dashed and paused, the engine's issue hangs under it | **If they ship their own version,** / **yours pauses until you pick.** | unchanged: the honest edge |
| 54–58 | headline | the site's hero on the graph: **Fork any open-source app** on their line, **and never rebase it again.** on yours (124 px → 104 px so the longer rows fit inside the rails) | | was "Make it yours." / "Keep their updates." The headline lands on the branch, as on autofork.com, after the film has earned it |
| 58–62 | end | the wordmark on the take's last chord, autofork.com | Runs on the ChatGPT or Claude plan you already pay for. | unchanged |
| rail | 10–54 s | top right: **Fork any open-source app and never rebase it again.**, hidden from 54 s on (the headline and end cards) so the line is never on screen twice | | was "Make it yours. Keep their updates." |

## Copy checks

- `rg -i "make it yours|keep their"` finds nothing in the folder's page or README.
- "open-source" hyphenated in both headline lines; "open source app" in the composer heading stays as the site writes it.
- No "nightly", "maintains itself", "never breaks". The break and the rebuild stay on screen, so "update themselves" is never sold as hands-off.

## Done when

Stills at 3.5, 7.5, 13.5, 24, 30, 40, 47.5, 57.5 and a 1 s sheet: every caption whole, inside the rails, not over the graph's labels; the 54–58 rows fit between the rails at 104 px; a pair around the 10 and 54 cuts shows no pop; re-encoded on the same soundtrack.
