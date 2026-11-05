"""Prints the beat list in music.js for music/T5.wav.

uv run --with librosa python tools/beats.py ../music/T5.wav

Kick onsets (30-100 Hz) are fitted, four beats either side, to a 129.88 BPM grid that starts at 0.41 s. The intro has
no kick, so its first 12 beats sit 70 ms early, on its stabs. The low band's onsets trail the stabs and claps by about
35 ms, so every later beat moves 35 ms earlier to land on them.
"""
import sys

import librosa
import numpy as np

BPM, FIRST, INTRO, LAG = 129.88, 0.41, 12, 0.035

y, sr = librosa.load(sys.argv[1], sr=22050, mono=True)
spb, hop = 60 / BPM, 64
frame = hop / sr
spectrum = np.abs(librosa.stft(y, n_fft=1024, hop_length=hop))
freqs = librosa.fft_frequencies(sr=sr, n_fft=1024)
low = spectrum[(freqs > 30) & (freqs < 100)].sum(0)
onsets = np.maximum(0, np.diff(np.log(low + 1e-6), prepend=0))
count = int((len(onsets) * frame - FIRST) / spb)


def offset(k):
    ks = np.arange(max(0, k - 4), min(count, k + 5))

    def score(off):
        idx = np.round((FIRST + off + spb * ks) / frame).astype(int)
        return onsets[idx[idx < len(onsets)]].mean()

    return max(np.arange(-0.12, 0.12, 0.002), key=score)


raw = np.array([offset(k) for k in range(count)])
smooth = [np.median(raw[max(0, k - 3) : k + 4]) for k in range(count)]
beats = [FIRST + k * spb + (-0.070 if k < INTRO else smooth[k] - LAG) for k in range(count)]
print(", ".join(f"{t:.3f}".rstrip("0") for t in beats))
