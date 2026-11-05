import librosa,numpy as np,sys,subprocess,os
BPM=126.2; BAR=240/BPM
def build(name,guess,out,tail_bars=2):
    f=name+".mp3"
    y,sr=librosa.load(name+".a.wav",sr=22050)
    oe=librosa.onset.onset_strength(y=y,sr=sr)
    t,b=librosa.beat.beat_track(onset_envelope=oe,sr=sr,start_bpm=126,tightness=400)
    bt=librosa.frames_to_time(b,sr=sr); p=np.polyfit(np.arange(len(bt)),bt,1); tempo=60/p[0]
    beat=p[0]
    # refine drop: beat in window with max low-band energy jump
    S=np.abs(librosa.stft(y,n_fft=2048,hop_length=512))**2; fr=librosa.fft_frequencies(sr=sr,n_fft=2048)
    low=S[fr<150].sum(0); 
    def lowat(x,w=0.25): i=int(x*sr/512); j=int((x+w)*sr/512); return low[i:j].mean()+1e-9
    best=min(bt,key=lambda x:abs(x-guess))
    # snap to 4-beat grid of fitted line from best
    r=tempo/BPM
    dur=len(y)/sr
    rms=librosa.feature.rms(y=y,hop_length=512)[0]; times=librosa.frames_to_time(np.arange(len(rms)),sr=sr,hop_length=512)
    aud=times[np.where(20*np.log10(rms+1e-6)>-35)[0].max()]
    tailstart=best+4*beat*np.floor((aud-best)/(4*beat))-4*beat*(tail_bars-1)
    segs=[(best-16*beat,best),(best,best+60*beat),(tailstart,tailstart+4*beat*tail_bars+1.5)]
    print(name,"tempo",round(tempo,2),"drop",round(best,2),"audible end",round(aud,1),"tail",round(tailstart,2),"dur",round(dur,1))
    d=f"/tmp/cut-{name}"; os.makedirs(d,exist_ok=True)
    fl=[]
    for i,(a,c) in enumerate(segs):
        o=f"{d}/s{i}.wav"
        subprocess.run(["ffmpeg","-v","error","-y","-ss",f"{a:.4f}","-t",f"{c-a:.4f}","-i",f,"-af",f"rubberband=tempo={1/r:.5f}:pitchq=quality,afade=t=in:d=0.004","-ar","48000",o],check=True)
        fl.append(o)
    # lengths post-stretch: seg0 = 16 beats = 4 bars exactly, seg1 take 15 bars, seg2 tail
    subprocess.run(["ffmpeg","-v","error","-y","-i",fl[0],"-i",fl[1],"-i",fl[2],"-filter_complex",
      f"[0]atrim=0:{4*BAR:.4f}[a];[1]atrim=0:{15*BAR:.4f},afade=t=out:st={15*BAR-0.01:.4f}:d=0.01[b];[2]atrim=0:{4*BAR*tail_bars+1.5:.4f},afade=t=out:st={4*BAR*tail_bars+0.3:.4f}:d=1.2[c];[a][b][c]concat=n=3:v=0:a=1,atrim=0:38.8,loudnorm=I=-14:TP=-1.5:LRA=11",
      "-ar","48000",out],check=True)
if __name__=="__main__":
    build(sys.argv[1],float(sys.argv[2]),sys.argv[3])
