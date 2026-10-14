# branch

One option for autofork's launch video: the git graph is the video. Their line in gray, yours peeling off in ultramarine, every update merging into yours. It's one object the film rides along, drawn from the real T3 Code fork (AVGVSTVS96/t3code): real releases, real commit SHAs, one dot per upstream commit in the 156 it took, the real agent run that rebuilt `window-title`, and the 3 real `PATCH.md` changes.

`out/video.mp4` is 62 s, 1920×1080, 60 fps, with sound. `out/sheet.png` is a frame every second.

## Storyboard

120 BPM, so a bar is 2 s. Cuts and camera moves start on half seconds; the camera holds between moves.

| Time | Scene | On screen | Caption | Why |
|---|---|---|---|---|
| 0–4 | Their line | Gray trunk labeled T3 Code, drawing in its real releases v0.0.42 to v0.0.45 | T3 Code won't merge big features. · “Big features will not be.” T3 Code's README | Opens on the real problem, the launch post's first line |
| 4–8 | The fork | The camera glides to 9503155 (Oct 6), where yours peels off carrying `window-title`; the trunk runs on to Oct 10 while yours sits still | So you fork it. / Now you rebase it every time they ship. | The problem as one picture: the gap between Oct 6 and Oct 10, named in the headline's word |
| 8–10 | Introducing | Plain field; the music stops for the last beat | Introducing | His ask: a held card before the name |
| 10–15 | Name | The wordmark; its two lines draw on the drop | Personal forks of open-source apps / that update themselves. | The name, and what it is in one sentence |
| 15–21 | Ask | The site's composer: T3 Code badge, "put the thread's name in the window title" typed, Fork it pressed | Name an app and what you'd change. · Runs on the ChatGPT or Claude plan you already pay for. | The surface is one sentence, and it's the change the rest of the film follows |
| 21–26 | It breaks | Back on the same frame: 9afde1c merges into yours, `window-title` turns red and dashed | Sometimes an update breaks your change. | Sets up the mechanism with the real failure |
| 26–34 | Underneath | Cut to dark, zoomed on the node: the PATCH.md sentence, then the real Actions log of Oct 10 (healing window-title 22:59:45, the agent's own sentence, healed 23:01:11); the node turns ultramarine | An agent rebuilds it from what you asked for. | The "magic underneath" beat, over the music's breakdown |
| 34–42 | Every update | Back to light, the camera rides the five real syncs (74dfbb6, ed0f7b9, d45d1a1, abc80c8, 8f25cf9), one per bar; `context-usage` joins at abc80c8, `fork-readme` at the last rebuild | Each time they ship, / your changes go back on top. | The promise, in the ride, on the lift |
| 42–48 | Proof | Pull back over Oct 10 to Oct 12: one dot per upstream commit, every merge, the rebuilt `window-title` chip pulses | My T3 Code fork took 156 commits in its first two days. / One change broke and the agent rebuilt it. / I never rebased it. | The facts.json line, as the graph it describes, and the 4–8 setup paid off |
| 48–54 | They catch up | Their line ships context usage; the update still lands, your `context-usage` arrives dashed and paused, and the issue the engine opens hangs under it | If they ship their own version, / yours pauses until you pick. | The trust line from the launch post |
| 54–58 | Headline | The site's hero on the graph: "Fork any open-source app" on their line, "and never rebase it again." on yours | | The headline lands on the branch |
| 58–62 | End | Wordmark on the take's last chord, autofork.com | Runs on the ChatGPT or Claude plan you already pay for. | The button, rings out |

The header's wordmark and tagline stay hidden until the name has been introduced; the wordmark steps aside for the headline card, and the tagline (the headline itself) for the headline and end cards.

## How it's built

```
index.html   the scenes as <section data-s data-e>; [data-in] enters at the scene's start plus that many seconds
video.css    the site's tokens (autofork-app/src/style.css) at video scale, light and dark
video.js     the world graph built from the fork's data, the camera, one seek(t)
logo.js      the wordmark from autofork-app/src/svg/autofork.svg, drawn on
sound.js     cuelume cues panned to where they sit on screen, and the music cut from the take
data/        upstream.tsv: the 156 upstream commits between 9afde1c and 8f25cf9
```

Everything moves from one clock: `seek(t)` sets the camera, how far each line has drawn (a line's head is a list of `[time, x]`, and each dot pops when the head passes it), the springs (Motion, no bounce except the healed node), and the overlays.

```sh
bun install
ffmpeg -i ../music/A2.wav -af "rubberband=tempo=0.987167:pitchq=quality:transients=crisp" -ar 48000 -c:a pcm_f32le sound/a2-120.wav
s=~/.agents/skills/brand-it/scripts
export TMPDIR=$PWD/.scratch
bun $s/video.mjs . stills 0 24.1 29.7
bun $s/video.mjs . sheet 1
bun $s/video.mjs . audio     # out/soundtrack.wav, -14 LUFS
bun $s/video.mjs . video     # out/branch.mp4, then: mv out/branch.mp4 out/video.mp4
```

## Music

Take A2 from `../music` ("autofork branch A", Suno v6, crisp minimal electronic). It measures 121.56 BPM, not 120, so it's stretched to 120 with rubberband (pitch kept) and its bars land on the film's even seconds. `sound.js` cuts it on downbeats: the intro under the problem, a one-beat stop before the name, the drop on the name, the breakdown under the agent, the lift under the ride, full groove under the proof, and the last two bars and ring-out for the end. About a dozen cuelume cues, two at full weight (the name, the healed node), plus keystrokes while the composer types.

## Real data

- Releases: `gh release list -R pingdotgg/t3code` (v0.0.42 Sep 16 to v0.0.45 Oct 2, the last full release).
- The fork point 9503155 (Oct 6) and the first sync, `upstream 9503155da67a → 9afde1c6dbe0`: Actions run 38093414658, which also holds the agent's words and the times shown.
- Commits behind: `gh api repos/pingdotgg/t3code/compare/9503155...9afde1c` (383, drawn as dots, never stated). 156 and the one heal come from `copy/facts.json`.
- Syncs: the fork's `autopatch: sync` and `autofork: sync` commits; `context-usage` was added Oct 12 06:56 just before the abc80c8 sync, and `fork-readme` was built by the agent in the Oct 12 23:06 sync.
- The pause is the product's behavior, not an event yet: T3 Code hasn't shipped context usage. The issue title is the one the engine opens.
