# type

autofork's launch video, the kinetic type option: one statement per screen in Host Grotesk, words landing on the beat of a 130 BPM Suno take, the ultramarine branch as the only accent, app names flying through the composer badge, and quick flashes of the real product between the words. 33.3 s.

- `out/video.mp4`: 1920×1080, 60 fps, H.264 + AAC, -14 LUFS, true peak -2.0 dBTP after AAC.
- `out/sheet.png`: a frame every second.

## Storyboard

Beats are the music's (129.9 BPM, a beat is 0.46 s). Every cut is on a beat; the times come from `music.js`.

| time | beats | scene | on screen | why |
| --- | --- | --- | --- | --- |
| 0.00 | 0–4 | Fork any open-source app | the headline's first half on the poster frame; the branch draws out from under it and lands on its node | open on the point; the brand's motif in the first second |
| 1.85 | 4–7 | never / rebase / again. | one word a beat, 440 px, ultramarine and white fields swapping | the promise as a strobe on the intro's stabs |
| 3.23 | 7–8 | and never rebase it again. | the line whole, in ultramarine | the headline's second half, read once in one piece |
| 3.70 | 8–12 | Name an open source app | the composer's badge at 4.6× flies through herdr, Ghostty, Buzz, pi, cmux, tmux, UTM on eighth notes (motion-blurred while it moves) and lands on T3 Code | the app names as the hook, across the build-up |
| 5.55 | 12–16 | and what you'd change. | the site's composer; "but always show context usage" types from the drop, then Fork it presses | the product's one action |
| 7.41 | 16–18 | flash: your fork | autofork.com/AVGVSTVS96/t3code: "Your t3code" and its last run, "The agent builds your change" | what Fork it gives you, real page |
| 8.33 | 18–20 | flash: the change | T3 Code with the context button, pushing in on "my change" | the change living in the app |
| 9.26 | 20–28 | Each new release, your changes go back on top. | their gray line and yours; five releases land a beat apart and each merges into yours, its pill turning ultramarine | the magic underneath, as the brand's git graph |
| 12.96 | 28–30 | When a release breaks yours, | words on sixteenths | sets up the agent |
| 13.89 | 30–36 | an agent rebuilds it from what you asked for. | white on the ultramarine field, a word an eighth | the part nobody else does |
| 16.67 | 36–40 | flash: what you asked | the site's "You asked" card and the three releases it went back into | proof of "what you asked for" |
| 18.52 | 40–48 | If they ship your change, yours pauses until you pick. | "until you pick" lands on the one beat where the song's kick and bass stop | the honest edge, timed to the music pausing |
| 22.21 | 48–54 | 156 commits from T3 Code. I never rebased it. | "My T3 Code fork, first 2 days" over 156, white on ultramarine, with a bright tone | the real number (`copy/facts.json`), slammed in as the music comes back; the opening paid off |
| 24.98 | 54–60 | Your GitHub. Your plan. | the fork's GitHub card, then Continue with ChatGPT / Continue with Claude | where it lives, who pays |
| 27.69 | 60–64 | Introducing | | the song's break; the stop-down before the name |
| 29.54 | 64–70 + 1 s | autofork | the wordmark lands with a chord as the groove returns, its gray line draws, the branch leaves it and lands on its node; "Personal forks of open-source apps that update themselves." comes in with the node, autofork.com on the song's stab | the name, then a short ring-out |

Taken from his saves: the word-swap kinetic type in nikitabier's "perfect launch video"; Varcyyyy's Gumroad film (the field color snapping on the beat, objects arriving on every hit); leomeethewoo's Apple-style article (one key object in the center, space to breathe, 115-130 BPM for "kinetic, sophisticated", sparse sound); the onboarding clips (Hila, Farzad), where the line that's active goes dark and the rest stays gray, which is how the composer's two lines trade places.

## How it's made

The page is the video: `index.html` holds the scenes, `video.css` the brand's tokens and what each kind of motion does with `--p` (a spring's progress, 0 to 1), and `video.js` the one clock. A scene starts at `data-b` (a beat), an element animates at `data-in` beats after its scene with `data-k` (`stamp`, `rise`, `pop`, `draw`, `settle`, `zoom`, `snap`), `data-words="first step"` lands a line one word at a time, and the springs have no bounce except `pop`.

`music.js` holds the take and its beats. They're measured, not assumed: Suno's tempo drifts (the intro runs about 70 ms ahead of the groove and everything after the break about 60 ms early), so `tools/beats.py` fits the file's kicks to a 129.88 BPM grid and `at(beat)` reads the real beat times. The song plays in two segments: beats 1–48 (the build, the drop, the beat where the kick and bass stop), then a cut at the end of that stopped beat straight to beat 65, which skips four bars and lands the break on "Introducing" and the return on the wordmark. `sound.js` renders the music and the only effects (typing ticks, the Fork it press, a tone on 156, a chord on the wordmark) from the same clock, and fades the last 0.4 s of the ring-out.

```sh
s=~/.agents/skills/brand-it/scripts
export TMPDIR=$PWD/.scratch
bun tools/product.mjs                          # product/: the flashes, from autofork.com
uv run --with librosa python tools/beats.py ../music/T5.wav   # the beat list in music.js
bun $s/video.mjs . stills 0 9.3 22.3
bun $s/video.mjs . audio                       # needs ../music/T5.wav (gitignored; Suno link in ../music/README.md)
bun $s/video.mjs . video                       # out/type.mp4, copied to out/video.mp4
bun $s/video.mjs . sheet 1                     # out/type-sheet.png, renamed out/sheet.png
```

Open `index.html` through any static server at the repo root and click to play it with sound; `?t=12` jumps.

Music: "T5" from `../music/README.md` (type C, crisp minimal electronic, prompted at 128 BPM in C major), https://suno.com/song/36806651-b6b2-429a-92ac-04b31cfb8346.

The product shots keep the real UI's own colors, so the fork page's status dots and the GitHub card's dot stay green.
