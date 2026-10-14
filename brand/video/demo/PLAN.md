# demo: plan for the new headline (Oct 13)

One real run, the product doing one thing (tweet 2 of the launch thread, "how it works"): type "T3 Code, but always show context usage", fork it, continue with Claude, watch the run, get T3 Code with the button; two days of T3 Code commits land and the change is still there; xtool shows it isn't a T3 Code trick. Today it opens on autofork.com's old hero and ends on "Make it yours. / Keep their updates.", the line Simon found hard to understand. It now carries Simon's two:

- **Fork any open-source app and never rebase it again.**
- **Personal forks of open-source apps that update themselves.**

## What stays

Every scene's beat, the camera, the captured UI states and the soundtrack (`out/soundtrack.wav`, T5 trimmed, with its ten cues). The words change inside the same scenes. Music is being chosen separately.

## Beats (129.85 BPM, a beat is 0.462 s)

| time | scene | on screen | caption | change and why |
| --- | --- | --- | --- | --- |
| 0.0–3.2 | ask | autofork.com's hero as it now ships (Home.tsx in autofork-app): **Fork any open-source app / and never rebase it again.**, the sub line **Personal forks of open-source apps that update themselves.**, then the push in to the composer: T3 Code badge, "but always show context usage" types, Fork it pressed | **Name an app** and what you'd change. | the hero in `ui/site.html` was the old "Make it yours. / Keep their updates." and its old sub line. The first frame is the X poster, so it now shows both of Simon's lines at once. The hero's h1 and sub are set to the new site's markup (same classes, `.make` and `.you.never`, h1 sized like the new CSS: 96 px max instead of 128) in every state of the capture that shows the hero, including the fork flow where the headline carries over |
| 3.2–5.5 | fork | "Signed in to GitHub", "Making your fork…", "Your fork: AVGVSTVS96/t3code" | **It forks it** into your GitHub. | unchanged |
| 5.5–8.3 | claude | Claude picked, the code pasted, Start | **Continue with Claude.** Your plan does the work. | unchanged |
| 8.3–12.9 | run | the run card's steps land on the beat, then Built "Always show the thread's context usage in the composer." | **An agent builds it** in your own GitHub Actions. | unchanged |
| 12.9–16.2 | t3 | T3 Code, the context-usage button pops in with "my change" | **T3 Code,** with your change in it. | unchanged |
| 16.2–18.9 | patch | GitHub: `.autofork/context-usage/PATCH.md` in plain words; the music stops for a beat | **Saved as what you asked for.** The agent rebuilds from it. | unchanged: the magic underneath |
| 18.9–23.1 | time | the fork's commit list scrolls Oct 10 → Oct 12 through T3 Code's commits, lands on `autofork: sync pingdotgg/t3code to 8f25cf9` | **My T3 Code fork's first two days:** 156 commits from T3 Code. | was "Two days later, 156 commits from T3 Code.", which, right after the context-usage button, read as if that change went through all 156. It didn't: context-usage was added Oct 12 06:56 and has seen 3 upstream commits; the 156 (9afde1c…8f25cf9) ran through window-title and fork-readme. The new caption claims the fork, which is true |
| 23.1–25.4 | still | the fork page's list of its three changes, all built (the same capture state the kept scene uses), cut in on the beat | **Every change still on top.** I never rebased it. | was the context-usage button with "Your change is still there." The fork's changes, not one button, are what went through the 156, so the shot shows all of them; the caption is the headline proven on screen, right after the commits scrolled by. Every sync on the fork is an `autofork: sync` commit (`copy/facts.json`), and the site's "Mine, today" says the same ("and I never rebased it") |
| 25.4–28.2 | kept | the fork page, its three changes, all built | **One change broke on day one.** The agent rebuilt it. | unchanged; it now continues the still scene's shot, so only the caption changes on the cut |
| 28.2–33.3 | xtool | the composer again: xtool, "but free teams keep their App Groups", then its PATCH.md on GitHub | **Any open source app.** Here's my xtool. | unchanged ("open source" unhyphenated as a noun phrase, as the site writes it) |
| 33.3–38.8 | end | the wordmark, **Fork any open-source app / and never rebase it again.** (line two ultramarine), autofork.com; the music's last stab rings out | | was "Make it yours. / Keep their updates." The headline closes the demo that just proved it |
| rail | from 3.2 s (the fork scene) | top right: Personal forks of open-source apps **that update themselves.** | | was "Make it yours. Keep their updates." The sub line, not the headline: the headline is already on the hero at t=0 and on the end card, and a line on screen twice is the repeat Bassim disliked on the OG image. It starts with the fork scene, since the hero at t=0 shows the sub line itself |

## Copy checks

- `rg -i "make it yours|keep their"` finds nothing in `index.html` or `ui/`.
- "open-source" hyphenated in both headline lines.
- No "nightly", "maintains itself", "never breaks".

## Done when

Stills at 0, 1.5, 24, 36, 38.5 and a 2 s sheet: the hero at t=0 shows both lines whole and the composer in place (the h1 is a different length now, so check the camera's push still frames `.ask`); the end card's longer headline fits inside the frame at its size; re-encoded on the same soundtrack.
