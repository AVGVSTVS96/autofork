# Music takes

Suno takes for the launch video options, all model v6 (chirp-hawk, Suno's latest), instrumental (empty lyrics). The WAVs (48 kHz stereo, Suno's WAV export) sit next to this file and stay out of git (`*.wav`). If one is missing, download it again from its Suno link.

How these were measured: tempo is a straight line fitted to librosa's beat times, so it shows drift from the prompted tempo (Suno often lands a few BPM off). "Drop" is where the loudness per bar jumps to the full groove. "Ends" is the last loud moment. The descriptions come from the prompt and the measured loudness map, not from listening, so play a take before you cut to it.

## Quick pick

| Direction | Best bets | Why |
|---|---|---|
| type (20-35s, highest energy) | T5, T8, T6 | 128-129 BPM, start on beat one. T5 is full by 5.6s, has a one-beat stop at 22.0s and a clean end at 41s |
| branch (~50s, graph drawing on the beat) | A1, A2, B1, B2 | 120-123 BPM, quiet pluck intro (15-19s) then the groove; trim the intro or start the graph there |
| demo / saves (hard cuts) | C1, C2, T3 | crafty mallet pop-house at 126, full by 7.8s (C1); T3 band in at 7.9s |

## A: branch, crisp minimal electronic

Prompt: `Instrumental only. 120 BPM, C major, 4/4. Crisp, minimal, precise electronic for a sleek software launch film. Tight punchy kick, crisp claps on 2 and 4, ticking closed hats, a clean plucked synth arpeggio that adds one note layer at a time, warm round sub bass (no booming hits), glassy bell accents, airy modern mix. Starts with just a lone ticking pulse and the pluck for 4 bars, short riser, then the full groove drops in. Changes one layer every 8 bars. A stripped breakdown of just the pluck and bells in the middle, a final lift with everything, and it ends on one clean chord stab that rings out.`
Excluded: `vocals, voice, choir, dubstep, heavy drop, gong, cinematic boom, trailer`. Duration: auto. (Made by the first run.)

| File | Length | Tempo | Drop | Sounds like | Suno |
|---|---|---|---|---|---|
| A1.wav | 2:40.0 | 123.0 | 19.1s | 19s quiet pluck intro, full groove 19.1–79.6s (short dip at 48s), stripped breakdown 79.6–97.2s, full 97.2–112.8s, second breakdown 112.8–128.4s, final lift 128.4–144s, rings out to 159s | [link](https://suno.com/song/770a29e2-c7b7-4cb4-905f-9960d8af313b) |
| A2.wav | 1:52.2 | 120.0 | 19.4s | 19s quiet intro, groove 19.4–47.4s, 2-bar dip at 47.4s, full 51.4–75.4s, breakdown 75.4–83.4s, lift 83.4–91.4s, short break, last 2 bars at 103.4s, ring-out from 107s | [link](https://suno.com/song/f59fa923-ba1d-4c14-93c2-e624e866a5f1) |

## B: branch, nu-disco / French touch

Prompt: `Instrumental only. 120 BPM, C major, 4/4. Elegant nu-disco / French touch house, filtered chord stabs, rubbery bassline for a sleek software launch film. Tight punchy kick, crisp claps on 2 and 4, ticking closed hats, a clean plucked synth arpeggio that adds one note layer at a time, warm round sub bass (no booming hits), glassy bell accents, airy modern mix. Starts with just a lone ticking pulse and the pluck for 4 bars, short riser, then the full groove drops in. Changes one layer every 8 bars. A stripped breakdown of just the pluck and bells in the middle, a final lift with everything, and it ends on one clean chord stab that rings out.`
Excluded: `vocals, voice, choir, vocal chops, dubstep, heavy drop, gong, cinematic boom, trailer, orchestral hits, lo-fi`. Duration: 1:30.

| File | Length | Tempo | Drop | Sounds like | Suno |
|---|---|---|---|---|---|
| B1.wav | 1:31.5 | 123.2 | 15.3s | 15s building intro, groove 15.3–50.4s (1-bar dip at 29s), softer breakdown 50.4–66s, full 66–77.7s, short break, ends ~87s with a tail to 91s | [link](https://suno.com/song/8701267f-2d6c-4d51-81a7-039f1f3d1435) |
| B2.wav | 1:30.0 | 123.0 | 19.1s | 19s intro (dip just before the drop at 17.2s), groove 19.1–42.6s, breakdown 42.6–50.4s, full 50.4–77.7s, break 77.7–81.6s, last hit at 81.6s, ends ~88s | [link](https://suno.com/song/7882d8b2-fccb-4b7d-b531-334f83aa4cfd) |

## T5-T8: type, 128 BPM, instant start (this run)

### Type C: crisp minimal electronic, a stab on every downbeat (T5, T6)

Prompt: `Instrumental only. 128 BPM, C major, 4/4. High-energy, crisp, minimal electronic for a fast kinetic-typography software launch film. Starts instantly on beat one with the full groove, no intro, no fade in. Tight dry punchy kick on every beat, sharp claps on 2 and 4, crisp 16th hi-hats, a bright staccato chord stab on the first beat of every bar, bouncy plucked synth bass, a short catchy clean synth lead hook. Every bar has a clear accent on the one. A one-beat stop of silence after bar 8, then straight back in. Clean, dry, polished modern mix, punchy but no booming low hits. Ends cleanly on one short bright chord stab with a short tail.`
Excluded: `vocals, voice, choir, vocal chops, dubstep, heavy drop, gong, cinematic boom, trailer, orchestral hits, lo-fi, long intro`. Duration: 0:45.

| File | Length | Tempo | Drop | Sounds like | Suno |
|---|---|---|---|---|---|
| T5.wav | 0:44.0 | 128.4 | 5.6s | first downbeat at 0.0s (bar 1.870s), 3 bars building, full from 5.6s, one-beat stop at 22.0s, full to 39.3s, clean end at ~41s then silence | [link](https://suno.com/song/36806651-b6b2-429a-92ac-04b31cfb8346) |
| T6.wav | 0:45.0 | 129.0 | 15.4s | starts at 0.07s with a mid-level groove for 8 bars, full from 15.4s, ends 44.7s right at the file end (may be cut, not a ringing end) | [link](https://suno.com/song/e53c0534-d564-4d5f-9c0f-3ada94244fb3) |

### Type D: punchy French touch electro house (T7, T8)

Prompt: `Instrumental only. 128 BPM, A minor, 4/4. Punchy, sleek French touch electro house for a fast kinetic-typography software launch film. Starts instantly on beat one, no intro. Tight four-on-the-floor kick, crisp claps on 2 and 4, open hats on the offbeat, short filtered disco chord stabs that hit on every downbeat, a rubbery staccato bassline, a bright clean synth hook. A filter sweep opens over 4 bars, then the full groove. Stuttered stab fill every 8 bars, one beat of silence, straight back in. Crisp, clean, dry, modern mix with lots of punch and space, no booming low hits. Ends cleanly on one short chord stab.`
Excluded: same as type C. Duration: 0:45.

| File | Length | Tempo | Drop | Sounds like | Suno |
|---|---|---|---|---|---|
| T7.wav | 0:45.5 | 133.6 | ~13.3s, full by 15.1s | ran fast (133.6, not 128). Filtered groove from 0.26s, opens up 13–15s, 2-bar dip at 25.8s, full to 42s, ends at the file end (may be cut) | [link](https://suno.com/song/600d14ce-73bf-4d2b-8ad2-2e34acf8a793) |
| T8.wav | 0:46.3 | 128.8 | 14.3s, second drop 29.2s | starts at 0.14s, filter opens over the first 14s, groove 14.3–27.3s, break at 27.3s, full again 29.2–44.1s, short end at 44–46s | [link](https://suno.com/song/cd534c7a-c08e-4b84-810a-fa00843d739d) |

## T1-T4: type, 120 BPM (first run)

### Type A: kinetic electro-funk (T1, T2)

Prompt: `Instrumental only. 120 BPM, C major, 4/4. Kinetic, crisp, minimal electro-funk for a fast typographic software launch film. Tight dry kick, sharp handclaps on 2 and 4, ticking 16th hi-hats, punchy staccato synth bass, bright stabbed piano chords, a short catchy clean synth lead hook. Starts instantly with a tight filtered drum-and-stab groove for 2 bars, one bar of stuttered stabs, a full one-beat stop of silence, then the full groove slams in. Changes one layer every 4 bars. Very clean, dry, modern mix with lots of punch and space. Ends on one bright chord stab that rings out.`
Excluded: `vocals, choir, orchestral, cinematic trailer, dubstep, lo-fi, distorted`. Duration: 1:00.

| File | Length | Tempo | Drop | Sounds like | Suno |
|---|---|---|---|---|---|
| T1.wav | 0:59.3 | 119.7 | ~6.4s, full by 10.4s | starts at 0.16s, builds over 10s rather than one slam, full groove 10–54s with a 2-bar dip at 30.5s, ends ~58s | [link](https://suno.com/song/37b6e2d9-b2e7-4482-919a-2bb060d789bf) |
| T2.wav | 0:59.2 | 123.1 | 8.3s (stop at 8.0s just before) | starts at 0.14s, filtered groove, stop at ~8.0s then the groove, 1-bar dip at 16.1s, full to ~57s | [link](https://suno.com/song/05b972a8-3ce3-445f-adbd-7bff654aa37e) |

### Type B: bright indie electronic (T3, T4)

Prompt: `Instrumental only. 120 BPM, C major, 4/4. Bright, punchy, elegant indie electronic for an Apple-style product launch film. Crisp live-sounding drums with a snappy snare, handclaps and tambourine, staccato muted electric guitar, bouncy round synth bass, glassy synth plucks, short bright synth brass stabs. Opens with a tight pulse and stabs for 2 bars, a quick drum fill, a one-beat stop of silence, then the full band drops in with a catchy hook. Confident, upbeat, sleek and uncluttered, every hit lands on the beat. Ends on one clean final chord hit that rings out.`
Excluded: `vocals, choir, orchestral, cinematic trailer, dubstep, lo-fi, distorted`. Duration: 1:00.

| File | Length | Tempo | Drop | Sounds like | Suno |
|---|---|---|---|---|---|
| T3.wav | 0:58.8 | 119.6 | 7.9s | starts at 0.07s, 4 bars of pulse and stabs, band in at 7.9s, full and even to ~56s, ends ~58s | [link](https://suno.com/song/f5da6912-894e-44ef-800a-99ac808061fc) |
| T4.wav | 1:00.0 | 122.7 | 9.8s (gap 8.0–9.0s before it) | starts at 0.07s, quieter 5-bar intro, gap at 8–9s, band in at 9.8s, full to 56.7s, ends at the file end (may be cut) | [link](https://suno.com/song/e74312d8-8193-4f4a-a306-00f9e0e4330e) |

## C: crafty mallet pop-house (for demo / saves)

Prompt: `Instrumental only. 124 BPM, F major, 4/4. Crafty, elegant, sleek percussive pop-house for a modern software launch film. Crisp tight kick, finger snaps and claps, ticking shaker, a bright marimba and pizzicato string ostinato, warm round bass, glassy electric piano chords, a playful clean synth lead hook. Starts on beat one with marimba and snaps for 2 bars, then the full groove. Clear 4-bar phrases with a crisp accent on every downbeat, a short stripped break at the halfway point, a final lift, and one clean final chord hit. Bright, airy, uncluttered modern mix, no booming low hits.`
Excluded: `vocals, voice, choir, vocal chops, dubstep, heavy drop, gong, cinematic boom, trailer, orchestral hits, lo-fi, ukulele, whistling`. Duration: 1:00.

| File | Length | Tempo | Drop | Sounds like | Suno |
|---|---|---|---|---|---|
| C1.wav | 1:03.2 | 126.3 | 7.8s | first downbeat ~0.2s, 4 sparse bars, full from 7.8s, steady to 38.2s, stripped break 38.2–43.9s, lift 43.9–59.1s, short end to 63s | [link](https://suno.com/song/c76fafb8-e10e-4df0-8feb-9eb16ed73dbe) |
| C2.wav | 1:01.5 | 125.7 | 16.5s (half-up at 7.0s) | starts at 0.12s, steps up at 7.0s, full from 16.5s, 1-bar break at 45.1s, full to 54.7s, fades 56–61s and stops at the file end | [link](https://suno.com/song/58c8849b-366e-4153-933b-fee4e8da81cc) |

## Cinetic score takes (saves, no Suno)

Rendered by cinetic's own engine (`scripts/audio/score.py` in Leon Lin's cinetic), music only (no cues), at 126.2 BPM like the saves cut. `cinetic/build.py` renders four short scores (feed to the name, name to composer, composer to end card, end card) and joins them on beats, so the cut's landmarks fall on bar starts: drive on the name at 16.162 s, a fresh downbeat on the composer at 19.014 s, the resolve chord on the end card at 36.126 s. The feed's four sparse bars run to 7.6 s and the groove drops there, as before. 38.8 s, about -13 LUFS before saves' own -14 mix, ends on a fade. Re-render: `python3 cinetic/build.py .. a b` (needs uv; scores and chords are in the script). Not listened to; judged by the loudness map only. Previews on the saves cut are in `previews/` (untracked).

| File | Key | What it does | Why it fits saves |
|---|---|---|---|
| cinetic-saves-a.wav | F major | clock-tick breakdown 0-7.6 s, groove to the name, drive 16.2-19.0 s, groove through the product to a soft resolve at 36.1 s | the engine's section changes sit on the storyboard's cuts |
| cinetic-saves-b.wav | A dorian | same grid, four-on-the-floor from 7.6 s on, brighter at the name, minor colour | darker and more tense under the X feed |

## Suno takes still in the library, not exported

Suno downloads were at 0 until 11/4 on Oct 13, so these exist only as clips in the library. Parameters for all four: v6, Max Mode on, weirdness 30-40, style influence 70-75, 52 s, exclude `vocals, voice, choir, vocal chops, marimba, ukulele, whistling, dubstep, trailer, cinematic boom, orchestral hits, EDM drop, lo-fi hip hop, stock corporate, big synth lead`.

- "autofork saves felt" (126 BPM, D minor, warm felt piano and Rhodes stabs, dusty swung drums, no hook): [clip 1](https://suno.com/song/2570d7c5-0a2c-4961-9144-6d0fe0b23270), [clip 2](https://suno.com/song/26b9984f-918c-4cd6-b670-94976dfe8b1f)
- "autofork saves pulse" (126 BPM, A minor, deep minimal melodic house, plucked arpeggio ostinato): [clip 1](https://suno.com/song/2a66d354-f47b-4c99-8c6f-dabd955020dd), [clip 2](https://suno.com/song/b905931d-c465-4374-a413-c4c9a64fda3e)
- "phase" (minimalist phasing pulse) and "pocket" (live funk) did not appear in the library; resubmit with `.scratch/gen.mjs` if wanted.
