import sys, numpy as np, librosa
for path in sys.argv[1:]:
    y, sr = librosa.load(path, sr=22050, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
    rms = librosa.feature.rms(y=y, hop_length=512)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=512)
    bt = np.array(beats)
    slope, icpt = np.polyfit(np.arange(len(bt)), bt, 1)
    print(f"{path}: {len(y)/sr:.1f}s tempo {60/slope:.2f} first beat {icpt:.3f}")
    bar = 4 * slope
    row = []
    for i in range(int((len(y)/sr - icpt) / bar)):
        a, b = icpt + i * bar, icpt + (i + 1) * bar
        m = rms[(times >= a) & (times < b)]
        row.append(f"{a:5.1f}:{20*np.log10(m.mean()+1e-9):5.1f}")
    for i in range(0, len(row), 8): print("   ", "  ".join(row[i:i+8]))
