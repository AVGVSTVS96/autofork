# type: plan for the new headline (Oct 13)

The kinetic type option (tweet 6 of the launch thread for now). One statement per screen, words landing on the beat of T5. Today it opens and closes on "Make it yours. / Keep their updates.", the line Simon found hard to understand. It now opens and closes on Simon's two:

- **Fork any open-source app and never rebase it again.**
- **Personal forks of open-source apps that update themselves.**

## What stays

The beat grid, every scene's start beat and the soundtrack (`out/soundtrack.wav`, T5 cut by `music.js`). Scenes swap words on the same beats, so the typing ticks, the Fork it press, the tone on 156 and the chord on the wordmark still land where they did. Music is being chosen separately.

## Beats (beat → seconds, a beat is 0.46 s)

| beat | time | on screen | change and why |
| --- | --- | --- | --- |
| 0–4 | 0.00 | **Fork any open-source app** (the poster frame), the ultramarine branch draws out from under "app" and lands on its node | was "Make it yours." The poster now says what the product does in the viewer's own word, fork |
| 4 | 1.85 | **never** · white on the ultramarine field | was "Keep" |
| 5 | 2.31 | **rebase** · ultramarine on white | was "their" |
| 6 | 2.77 | **again.** · white on ultramarine | was "updates." The three stabs spell the promise; "rebase" is the word every fork owner groans at |
| 7–8 | 3.23 | **and never rebase it again.** whole, ultramarine | was "Keep their updates." The line read once in one piece, completing the poster's line |
| 8–12 | 3.70 | **Name an open source app**; the badge flies through herdr, Ghostty, Buzz, pi, cmux, tmux, UTM and lands on T3 Code | unchanged |
| 12–16 | 5.55 | **and what you'd change.** The composer types "but always show context usage", Fork it presses | unchanged |
| 16–20 | 7.41 | flashes: your fork's page and its run, then T3 Code with the context button ("my change") | unchanged |
| 20–28 | 9.26 | **Each new release,** / **your changes go back on top.** Five releases land a beat apart and each merges into yours | was "Every release / arrives with your changes." Same promise in the site's new words (Sections.tsx); "on top" is what the graph draws |
| 28–36 | 12.96 | **When a release breaks yours,** / (ultramarine field) **an agent rebuilds it from what you asked for.** | unchanged: the magic underneath |
| 36–40 | 16.67 | flash: the site's "You asked" card and the three releases it went back into | unchanged |
| 40–48 | 18.52 | **If they ship your change, yours pauses until you pick.** | unchanged: the honest edge, timed to the music's stop |
| 48–54 | 22.21 | "My T3 Code fork, first 2 days" · **156** · commits from T3 Code. / **I never rebased it.** (stamped on beat 50) | was "commits from T3 Code. / One change broke on day one. / The agent rebuilt it." The scene is 2.77 s, too short for 156 plus three lines; the rebuild is already told at 12.96–18.52, so the proof keeps only the number and the payoff of the opening: 156 commits, zero rebases (`copy/facts.json`: 156; every sync is an autofork/autopatch commit by github-actions; MESSAGING's proof line says "and I never rebased it"). The last line now gets about 1.9 s |
| 54–60 | 24.98 | **Your GitHub. Your plan.** The fork's GitHub card, Continue with ChatGPT / Continue with Claude | unchanged |
| 60–64 | 27.69 | Introducing | unchanged |
| 64–70 + 1 s | 29.54 | the wordmark lands with the chord and draws its branch; **Personal forks of open-source apps / that update themselves.** ("update themselves" in ultramarine) lands as the node pops (beat 66, 30.46 s); autofork.com on the song's stab at beat 68.6 where the tagline used to land | was "Make it yours. Keep their updates.", stamped at 31.67 with 1.6 s left. The definition is the last line read before the link, so it now comes in with the wordmark and gets about 2.85 s, in the same tail, with no change to the soundtrack |
| rail | all | top right: **Fork any open-source app and never rebase it again.** | was "Make it yours. Keep their updates." The headline, word for word, as the quiet line that rides every scene |

## Thread fit (Bassim's call)

The launch thread attaches type to tweet 6, which is about living examples ("coming soon"); type shows none of that. The Films topic's living-examples film matches tweet 6; type fits better as the alternative to demo. Raised in the report, not changed here.

## Copy checks

- `rg -i "make it yours|keep their"` finds nothing in the folder's page.
- "open-source" hyphenated in both lines, as Simon wrote it.
- No "nightly", "maintains itself", "never breaks".

## Done when

Stills at 0, 2.4, 3.4, 10.5, 23.9, 31.7, 33 and a 1 s sheet show each word whole and centered; the strobe words don't clip at 440 px ("rebase" is wider than "their"; scale it to fit the frame with the same margins as "updates."); re-encoded on the same soundtrack.
