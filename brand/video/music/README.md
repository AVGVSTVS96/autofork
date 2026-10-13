# Music takes

Suno takes for the launch video options. The WAVs (48 kHz stereo, from Suno's WAV export) sit next to this file and stay out of git (`*.wav`). If one is missing, download it again from its Suno link.

How these were measured: tempo is a straight line fitted to librosa's beat times, so it shows drift from the prompted tempo (Suno often lands a few BPM off). "Drop" is where the loudness per bar jumps to the full groove. "Sounds like" comes from the prompt and the measured loudness map, not from listening, so play a take before you cut to it.

More takes are coming (branch B nu-disco, type at 128 BPM, one extra). This file updates as each one lands.

## Branch A: crisp minimal electronic

Prompt: `Instrumental only. 120 BPM, C major, 4/4. Crisp, minimal, precise electronic for a sleek software launch film. Tight punchy kick, crisp claps on 2 and 4, ticking closed hats, a clean plucked synth arpeggio that adds one note layer at a time, warm round sub bass (no booming hits), glassy bell accents, airy modern mix. Starts with just a lone ticking pulse and the pluck for 4 bars, short riser, then the full groove drops in. Changes one layer every 8 bars. A stripped breakdown of just the pluck and bells in the middle, a final lift with everything, and it ends on one clean chord stab that rings out.`
Excluded: `vocals, voice, choir, dubstep, heavy drop, gong, cinematic boom, trailer`. Model v6 (chirp-hawk).

| File | Length | Tempo | Drop | Sounds like | Suno |
|---|---|---|---|---|---|
| A1.wav | 2:40.0 | 123.0 | 19.1s | 19s quiet pluck intro, full groove 19.1–79.6s (short dip at 48s), stripped breakdown 79.6–97.2s, full again 97.2–112.8s, second breakdown 112.8–128.4s, final lift 128.4–144s, tail rings out to the end | [link](https://suno.com/song/770a29e2-c7b7-4cb4-905f-9960d8af313b) |
| A2.wav | 1:52.2 | 120.0 | 19.4s | 19s quiet intro, groove 19.4–47.4s, 2-bar dip at 47.4s, full 51.4–75.4s, breakdown 75.4–83.4s, lift 83.4–91.4s, short break then a last 2 bars at 103.4s and the ring-out from 107s | [link](https://suno.com/song/f59fa923-ba1d-4c14-93c2-e624e866a5f1) |

## Type A: kinetic electro-funk (first run, 120 BPM)

Prompt: `Instrumental only. 120 BPM, C major, 4/4. Kinetic, crisp, minimal electro-funk for a fast typographic software launch film. Tight dry kick, sharp handclaps on 2 and 4, ticking 16th hi-hats, punchy staccato synth bass, bright stabbed piano chords, a short catchy clean synth lead hook. Starts instantly with a tight filtered drum-and-stab groove for 2 bars, one bar of stuttered stabs, a full one-beat stop of silence, then the full groove slams in. Changes one layer every 4 bars. Very clean, dry, modern mix with lots of punch and space. Ends on one bright chord stab that rings out.`
Excluded: `vocals, choir, orchestral, cinematic trailer, dubstep, lo-fi, distorted`. Model v6.

| File | Length | Tempo | Drop | Sounds like | Suno |
|---|---|---|---|---|---|
| T1.wav | 0:59.3 | 119.7 | ~6.4s, full by 10.4s | starts at 0.16s, builds over the first 10s rather than one slam, steady full groove 10–54s, short 2-bar dip at 30.5s, ends 54–59s | [link](https://suno.com/song/37b6e2d9-b2e7-4482-919a-2bb060d789bf) |
| T2.wav | 0:59.2 | 123.1 | 8.3s (dip at 8.0s right before) | starts at 0.14s, filtered groove, a stop at ~8.0s then the groove, one 1-bar dip at 16.1s, full to the end, ends ~57s | [link](https://suno.com/song/05b972a8-3ce3-445f-adbd-7bff654aa37e) |

## Type B: bright indie electronic (first run, 120 BPM)

Prompt: `Instrumental only. 120 BPM, C major, 4/4. Bright, punchy, elegant indie electronic for an Apple-style product launch film. Crisp live-sounding drums with a snappy snare, handclaps and tambourine, staccato muted electric guitar, bouncy round synth bass, glassy synth plucks, short bright synth brass stabs. Opens with a tight pulse and stabs for 2 bars, a quick drum fill, a one-beat stop of silence, then the full band drops in with a catchy hook. Confident, upbeat, sleek and uncluttered, every hit lands on the beat. Ends on one clean final chord hit that rings out.`
Excluded: `vocals, choir, orchestral, cinematic trailer, dubstep, lo-fi, distorted`. Model v6.

| File | Length | Tempo | Drop | Sounds like | Suno |
|---|---|---|---|---|---|
| T3.wav | 0:58.8 | 119.6 | 7.9s | starts at 0.07s, 4 bars of pulse and stabs, band in at 7.9s, full and even to ~56s, short ending | [link](https://suno.com/song/f5da6912-894e-44ef-800a-99ac808061fc) |
| T4.wav | 0:60.0 | 122.7 | 9.8s (dip 8.0–9.0s before it) | starts at 0.07s, quieter 5-bar intro, gap at 8–9s, band in at 9.8s, full to 56.7s, then the end | [link](https://suno.com/song/e74312d8-8193-4f4a-a306-00f9e0e4330e) |
