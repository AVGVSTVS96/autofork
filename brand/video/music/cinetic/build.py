#!/usr/bin/env python3
import json, subprocess, sys, os, math
BPM = 126.2
BAR = 4 * 60 / BPM
SC = os.path.expanduser("~/Developer/films-src/cinetic/skills/cinetic/scripts/audio/score.py")
# (name, start s, end s) on the saves cut: feed to the name, name to composer, composer to end card, end card to end
PARTS = [("intro", 0, 16.162), ("name", 16.162, 19.014), ("body", 19.014, 36.126), ("end", 36.126, 38.8)]
STYLES = {
 "a": dict(key="F major", chords=[
    ["Fmaj9","Fmaj9","Dm9","Bbmaj9","Fmaj9","Dm9","Bbmaj9","C9sus4","Dm9"],
    ["Fmaj9","Fmaj9"],
    ["Dm9","Bbmaj9","C9sus4","Fmaj9","Dm9","Bbmaj9","Gm9","Bbmaj9","C9sus4"],
    ["Fmaj9","Fmaj9"]],
   sections=[
    [dict(bars=[1,4],style="breakdown",clock=True,level=0.8), dict(bars=[5,9],style="groove",level=0.9)],
    [dict(bars=[1,2],style="drive",level=1.0)],
    [dict(bars=[1,9],style="groove",level=0.9)],
    [dict(bars=[1,2],style="resolve",level=0.6,layers={"drums":0})]]),
 "b": dict(key="A dorian", chords=[
    ["Am9","Am9","Dm9","Fmaj9","Am9","Dm9","Fmaj9","E7sus4","Am9"],
    ["Am9","Am9"],
    ["Dm9","Fmaj9","E7sus4","Am9","Dm9","Fmaj9","G6","Fmaj9","E7sus4"],
    ["Am9","Am9"]],
   sections=[
    [dict(bars=[1,4],style="breakdown",clock=True,level=0.75,layers={"arp":1.2}), dict(bars=[5,9],style="drive",level=0.8)],
    [dict(bars=[1,2],style="drive",level=1.0,bright=1.2)],
    [dict(bars=[1,9],style="drive",level=0.9)],
    [dict(bars=[1,2],style="resolve",level=0.6,layers={"drums":0})]]),
}
def run(x, out):
    d = f"/tmp/cinetic-{x}"; os.makedirs(d, exist_ok=True)
    st = STYLES[x]; files = []
    for i, (name, t0, t1) in enumerate(PARTS):
        n = math.ceil((t1 - t0) / BAR) + 1
        total = round((n * BAR + 1.5) * 60)
        json.dump(dict(fps=60, bpm=BPM, total=total, acts={"all": dict(**{"from": 0}, dur=total)}, cue={"lockup": total - 60}, events=[]), open(f"{d}/cues{i}.json", "w"))
        sc = dict(key=st["key"], bpm=BPM, chords=st["chords"][i], sections=st["sections"][i], drops=[], typing="off", master=dict(lufs=-14, fade=0.05))
        json.dump(sc, open(f"{d}/score{i}.json", "w"))
        subprocess.run(["uv","run","--with","numpy","--with","scipy","--with","pyloudnorm","--with","soundfile","python3",SC,"--cues",f"{d}/cues{i}.json","--score",f"{d}/score{i}.json","--out",f"{d}/p{i}.wav","--quiet"], check=True, capture_output=True)
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i",f"{d}/p{i}.wav","-t",f"{t1-t0:.4f}","-af","afade=t=out:st=%.4f:d=0.004" % (t1-t0-0.004) if i < 3 else "anull",f"{d}/c{i}.wav"], check=True)
        files.append(f"{d}/c{i}.wav")
    inp = sum([["-i", f] for f in files], [])
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y",*inp,"-filter_complex","concat=n=4:v=0:a=1,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.84:level=false","-ar","48000",out], check=True)
for x in sys.argv[2:] or ["a","b"]:
    run(x, f"{sys.argv[1]}/cinetic-saves-{x}.wav")
