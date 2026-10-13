#!/bin/sh
set -e
cd "$(dirname "$0")"
ffmpeg -hide_banner -loglevel error -y -i ../music/C1.wav -filter_complex "
[0]asplit=2[a][b];
[a]atrim=0:32.293,asetpts=PTS-STARTPTS[m];
[b]atrim=58.436:63.2,asetpts=PTS-STARTPTS[e];
[m][e]acrossfade=d=0.03:c1=tri:c2=tri" -c:a aac -b:a 256k music.m4a
