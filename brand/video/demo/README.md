# demo

One real run, the product doing one thing, in the spirit of the launch videos Bassim saved that got millions of views: Clicky (FarzaTV, one long demo), Anatomy (wheresryan22, the UI in a frame with a two-tone caption under it) and Showrunner (sahilhandapanda, short and confident). Type "T3 Code, but always show context usage" into autofork, fork it, continue with Claude, watch the run, get T3 Code with the button. Then two days of T3 Code commits land and the change is still there, and xtool shows it isn't a T3 Code trick.

`out/video.mp4` is 1920×1080, 60 fps, 39 s, with sound. `out/sheet.png` is a frame every 2 s.

## Storyboard

Cuts land on the music's beat (129.85 BPM, a beat is 0.462 s); the table is in seconds rounded from beats.

| Time | Scene | On screen | Caption | Why |
| --- | --- | --- | --- | --- |
| 0.0–3.2 | ask | autofork.com's hero for a beat, then a push in to the composer at full size: the T3 Code badge, "but always show context usage" types out, a pan onto Fork it as it's pressed | **Name an app** and what you'd change. | The whole product is one sentence. The first frame is the real hero, so it works as the poster |
| 3.2–5.5 | fork | Signed in to GitHub, "Making your fork…", then "Your fork: AVGVSTVS96/t3code" | **It forks it** into your GitHub. | The fork is yours, in your account |
| 5.5–8.3 | claude | Claude picked, the sign-in panel, the code pasted as the music drops in, Start | **Continue with Claude.** Your plan does the work. | No API bill; it runs on the plan you have |
| 8.3–12.9 | run | The fork page's run card, each step landing on a beat: Starting a computer, Getting the code, Installing tools, The agent builds your change, then Built "Always show the thread's context usage in the composer." | **An agent builds it** in your own GitHub Actions. | The run's progress |
| 12.9–16.2 | t3 | T3 Code, then a punch onto the composer as the context-usage button pops in with "my change" | **T3 Code,** with your change in it. | The payoff: before and after, in the app |
| 16.2–18.9 | patch | GitHub: `.autofork/context-usage/PATCH.md`, then its plain-words text. The music cuts out for the last beat | **Saved as what you asked for.** The agent rebuilds from it. | The magic underneath |
| 18.9–23.1 | time | The music slams back in as GitHub's commit list for the fork scrolls from Oct 10 to Oct 12 through T3 Code's commits and lands on `autofork: sync pingdotgg/t3code to 8f25cf9` | **Two days later,** 156 commits from T3 Code. | Time passes |
| 23.1–25.4 | still | The button, still there | **Your change is still there.** | The change survived all of it |
| 25.4–28.2 | kept | The fork page with its three changes, all built | **One change broke on day one.** The agent rebuilt it. | The heal from facts.json: window-title broke on the first sync and the agent rebuilt it |
| 28.2–30.5 | xtool | The composer again: xtool, "but free teams keep their App Groups" | **Any open source app.** Here's my xtool. | Second proof, a different kind of app |
| 30.5–33.3 | xfork | GitHub: AVGVSTVS96/xtool's `.autofork/let-free-personal-teams-use/PATCH.md`, the same ask in plain words | **Any open source app.** Here's my xtool. | What you typed is what's kept |
| 33.3–38.8 | end | The wordmark, Make it yours. / Keep their updates., autofork.com; the music's last stab rings out | | The name and where to go |

No "Introducing" card: like Anatomy, the name comes at the end, after the demo has made the point.

## What's real

- **autofork.com** (hero, fork flow, fork page) is the live site's own markup and CSS (`ui/app.css` is the deployed stylesheet), captured by `tools/capture.ts` in headless Chrome with the API answered locally: signed in as AVGVSTVS96, the fork ready, Claude's sign-in, and the run's states. The step names, the change text and the "Built …" line are what the app prints; the elapsed times (4 s, 6 s, 19 s, 23 s, 1m 35s, 2m 14s) are from the T3 Code fork's run 38320148192. It's the real UI in each state, not a screen recording of a live run.
- **T3 Code** is the site's transcription of its source (the "Mine, today" window), with the context-usage button and its "my change" label. The button popping in is the before and after: stock T3 Code only shows its compact button once a thread gets big (the PATCH.md says so).
- **One change broke on day one** shows the fork page with the three changes the fork had through Oct 12 (context-usage, fork-readme, window-title), the same API mocking; app-name was added by hand on Oct 13 and isn't counted.
- **GitHub** is screenshots of the real pages. The commit list is the fork's real `/commits/main` pages joined into one strip by `tools/commits.ts`, keeping T3 Code's 156 commits and the one `autofork: sync` commit and leaving out Bassim's own commits and the older syncs from before the rename.
- **Numbers** are from `../../copy/facts.json` (156 upstream commits, 1 heal, first two days). xtool's "4 commits ahead" is GitHub's own banner.

## Sound

Music is Suno take **T5** from `../music` (crisp minimal electronic, 129.85 BPM, C major; [Suno](https://suno.com/song/36806651-b6b2-429a-92ac-04b31cfb8346)), trimmed into `sound/music.m4a`. It starts 4.06 s in, so the video opens near the end of its build and the full groove drops in under the pasted code. Its one-beat stop sits at the end of the PATCH.md scene, where `sound.js` also mutes it to make a real stop, and its return lands on the commit scroll; its last stab rings out on the end card. Ten effects, all synthesized in C major from the same cue list as the picture: taps on Fork it, Claude and Start, a tick when the fork is made and on the xtool cut, a chime when the change is built, a bell when the button pops in, a whoosh under the scroll, a land on the sync commit, and a soft chord on the last stab. Mastered by `video.mjs` to -14 LUFS.

## Make it

```sh
s=~/.agents/skills/brand-it/scripts
export TMPDIR=$PWD/.scratch
bun $s/video.mjs . stills 0 12.5    # single moments
bun $s/video.mjs . sheet 2          # contact sheet
bun $s/video.mjs . audio            # music + cues → out/soundtrack.wav
bun $s/video.mjs . video            # out/demo.mp4, renamed to out/video.mp4
```

Open `index.html` through a static server rooted at the repo to watch it; click for sound, `?t=20` to jump.

Rebuilding the UI from the live site: `bun tools/capture.ts .scratch/live` (autofork.com with the API answered locally), `bun tools/ui.ts .scratch/live ui` (the states as templates), `bun tools/commits.ts media/github-commits.png`, and `bun tools/shoot.ts` for the other GitHub pages. `tools/tempo.py` and `tools/beats.py` (run with `uv run --with librosa python -I`) found the music's grid.

## Layout

- `index.html` the scenes, `video.css` the stage (the site's tokens and fonts), `video.js` the clock: scenes in beats, the camera (a point in the page and a zoom, eased with a no-bounce spring between keys), the states and the cues.
- `ui/` the live site's pages as iframes; `frame.js` swaps a state in and measures elements, so the camera aims at `.ask button` instead of at pixels.
- `media/` GitHub screenshots and the logo, `public/` the site's fonts and repo icons, `sound/` the music.
