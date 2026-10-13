# saves

autofork's launch video told through Bassim's own X timeline. The feed sets it up in real posts from his likes, bookmarks and replies (people forking the tools they use, T3 Code taking more PRs a day than anyone can merge, Theo telling a forker to keep his fork on top of Orchestrator V2, then Bassim's own "i can fork and customize anything"), and autofork answers with the product.

`out/video.mp4` · 1920×1080, 60 fps, 38.8 s, with sound · `out/sheet.png` is a frame every 2 s.

## Storyboard

Cuts land on the music's beats (take C1, 126.2 BPM, a beat every 0.475 s).

| time | scene | on screen | why it's there |
| --- | --- | --- | --- |
| 0.0 | feed | Max Katz: "my fork of @zeddotdev, basically zed + herdr + cmux, merged into superzed" | open on the point: people fork the tools they use (244K views) |
| 2.9 | feed | DHH: "2,200 PRs deep" | the originals move fast |
| 4.8 | feed | Theo's reply: "We're at like 300 a day for T3 Code" | faster than any fork keeps up by hand |
| 7.6 | feed | Theo: "there is literally no world in which we merge this" (the groove drops here) | and they won't merge yours |
| 10.0 | feed | Theo: "would be easier to maintain your fork on top of" | the ask autofork answers |
| 12.4 | feed | bassim: "i can fork and customize anything, the agents will autonomously track upstream and re-implement my changes", quoting his Oct 6 post | his words, the thesis |
| 15.2 | intro | the camera flicks once more, off the end of the feed onto "Introducing" on the same white, for two beats; the music dips under a low-pass filter and a riser | the beat before the name, in the feed's own motion |
| 16.2 | name | the wordmark draws its branch; "Make it yours. / Keep their updates." | the name and the hero line, on the music's return |
| 19.0 | ask | the composer: T3 Code, types "always show context usage", Fork it; "you / t3code, forked from pingdotgg/t3code" | the whole product in one action |
| 22.8 | graph | their line with releases; each merges into yours | "Every release arrives with your change already in it." |
| 25.7 | heal | a release doesn't fit; the real PATCH.md line; the agent rebuilds it; the next release merges clean | the magic underneath |
| 30.4 | proof | "156 commits from T3 Code. One change broke on day one. The agent rebuilt it." over the fork's composer with the context button | the real numbers from `copy/facts.json` (156 commits, 1 heal) |
| 36.1 | end | the wordmark, autofork.com, the take's closing chord | where to go |

The feed is X's timeline column (Oct 2026), rebuilt from x.com's own markup: its icon paths, sizes and colors, real text, real counts (fetched Oct 13 from x.com and fxtwitter, in `data/posts.jsonl`), real images and avatars. Each post is shown whole; one phrase gets autofork's ultramarine as the camera lands on it. The camera snaps post to post on the beat, like a flick through the feed.

## Make it

```sh
s=~/.agents/skills/brand-it/scripts
export TMPDIR=$PWD/.scratch
./music.sh                          # music.m4a from ../music/C1.wav
bun $s/video.mjs . stills 0 8 13    # single moments
bun $s/video.mjs . sheet 2          # contact sheet
git clone https://github.com/Bodila51/opus-sound-layer ~/.cache/sound-layer   # once, MIT; needs uv
SOUND_LAYER=~/.cache/sound-layer bun sfx.mjs   # out/soundtrack.wav: the music plus cues, -14 LUFS
bun $s/video.mjs . video            # out/saves.mp4 (copied to out/video.mp4)
```

- `index.html` holds the scenes (`data-s`/`data-e` seconds), `posts.js` the posts and the X post drawing, `video.js` the clock (springs baked to CSS `linear()`, the feed camera, typing), `sound.js` the music's break filter, `sfx.mjs` the cue sheet read off the page's own timing (`audio/cues.json`) and the mix.
- Every `.a` element animates at its scene's start plus `--d`; `seek(t)` pauses every animation at `t`, so any frame renders on its own.
- The feed camera takes `data-stops`: `[time, post id, scale, "top" | "center"]`; its last stop is `#next`, the "Introducing" card at the end of the column.

## Music

Suno take C1 from `../music/README.md` (crafty mallet pop-house, F major, [Suno](https://suno.com/song/c76fafb8-e10e-4df0-8feb-9eb16ed73dbe)), at its own tempo. `music.sh` cuts it to the picture:

- it starts on its first downbeat at 0 s; its four sparse marimba bars run under the first posts and the full groove drops on Theo's "no world in which we merge this" at 7.6 s;
- every cut sits on one of its beats (measured at 126.2 BPM by autocorrelating its onsets);
- under "Introducing" (15.2 to 16.2 s) it plays on through a low-pass filter (`sound.js`): the downbeat lands full with the flick, the filter closes over half a beat, holds, and opens over the last half beat so the full groove returns with the wordmark. The break runs from the feed's last camera stop to the feed scene's end and its ramps are quarters of it, so retiming to another take means moving those two times;
- at 32.3 s it jumps onto its last two bars, so the closing chord lands on the end card at 36.1 s.

Cues are real CC0 recordings (`sfx/`, every one listed in `sfx/CREDITS.md`), placed by [opus-sound-layer](https://github.com/Bodila51/opus-sound-layer) from the page's own timing, never by hand: each swish sits on the feed camera's peak speed (stop time plus the snap spring's `visual/5.8`, which `qa.py` matches to the picture's motion peak to the frame), the wordmark's lines on the draw spring's peak, the keys on the typing clock (every fourth letter), the rest on their elements' `--d`. The mixer solves each sound's gain against the music under it, runs everything through one short room and masters to -14 LUFS.

| time | cue | sound |
| --- | --- | --- |
| 2.9, 4.8, 7.7, 10.1, 12.4 | the feed's snaps | cloth swishes |
| 15.3 | the flick onto "Introducing" | a soft swoosh |
| 16.2 | the wordmark | a reverse swell into a low wood hit and boom |
| 16.4, 16.8, 17.1 | the two lines draw, the node lands | swishes, a bubble pop |
| 19.4 to 20.5 | composer typing | six keyboard recordings in turn |
| 20.9 | Fork it | a mouse click |
| 21.4 | the fork lands | a wood tap |
| 23.9, 24.9, 29.1, 31.4 | releases merging, the proof | pops |
| 26.4 | a release doesn't fit | a dull metal clank |
| 28.0 | the agent rebuilds it | a soft interface confirm |
| 36.1 | the end card | a thump and boom with a long bell ring |

`qa.py` on the encoded mp4 (`audio/qa.png` shows every cue on the spectrogram): sync, loudness (-14.0 LUFS) and true peak (-2.0 dBTP, under -1 after AAC at 320k) pass, as does every cue's audibility and no silence; the two heroes (wordmark, end card) lift their 125-250 Hz body 2.7 and 2.4 dB where it asks for 3, and the soft pops and clicks warn that the picture barely moves under them. Nobody has listened to it yet.

## Credits

Every post is shown as it is on X, with the author's name, avatar and media:

- Max Katz, [@maxktz](https://x.com/maxktz/status/2076331470633816181) (superzed)
- DHH, [@dhh](https://x.com/dhh/status/2098755120540393908)
- Theo, [@theo](https://x.com/theo/status/2098769191226740966), [and](https://x.com/theo/status/2099709776896954603) [again](https://x.com/theo/status/2099710945429987722); the image in his kanban post is from JJ Eaton's (@jayleaton) video
- bassim, [@avgvstvs96](https://x.com/avgvstvs96/status/2108047388304871934), quoting [his Oct 6 post](https://x.com/avgvstvs96/status/2107421377334800815)

The sounds are CC0 recordings from Freesound and [Kenney](https://kenney.nl); see `sfx/CREDITS.md`. Affiliate badges are Photon's and 37signals' own avatars. The emoji is [Twemoji](https://github.com/jdecked/twemoji) (CC-BY 4.0), as X draws it. X's icons are X's. The X posts are set in [Inter](https://rsms.me/inter/) (OFL) standing in for X's Chirp, which isn't free to ship. The T3 Code shot is the T3 Code UI transcribed on autofork.com.

## Not verified

- Counts are from Oct 13 and will drift.
- Theo's kanban post is shown as written ("It's a fucking kanban??"), because the brief asked for "no world in which we merge this". Cutting it leaves his Orchestrator reply, which carries the ask on its own.
