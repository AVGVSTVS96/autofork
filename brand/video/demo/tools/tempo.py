import sys, numpy as np, librosa
path, lo, hi = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
y, sr = librosa.load(path, sr=22050, mono=True)
hop = 64
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
fps = sr / hop
best = None
for bpm in np.arange(lo, hi, 0.01):
    period = 60 / bpm * fps
    for phase in np.arange(0, period, 1):
        idx = (phase + period * np.arange(int((len(env) - phase) / period))).astype(int)
        idx = idx[(idx / fps > 6) & (idx / fps < 38)]
        score = env[idx].mean()
        if best is None or score > best[0]: best = (score, bpm, phase / fps)
score, bpm, phase = best
beat = 60 / bpm
print(f"bpm {bpm:.2f} beat {beat:.5f} phase {phase:.4f} first beat {phase % beat:.4f}")
