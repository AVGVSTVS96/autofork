#!/bin/sh
set -e
cd "$(dirname "$0")"
ffmpeg -hide_banner -loglevel error -y -ss 0.539 -i ../music/tech-live.mp3 -af "
atempo=126.2/124,aresample=48000,atrim=0:38.8,asetpts=PTS-STARTPTS,
afade=t=in:d=0.03,afade=t=out:st=36.1:d=2.7" -c:a aac -b:a 256k music.m4a
