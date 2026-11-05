#!/bin/sh
# tile.sh out.png cols in1 in2 ...: a grid of frames at 960 wide each
out=$1; cols=$2; shift 2
n=$#; inputs=""; i=0; chain=""
for f in "$@"; do inputs="$inputs -i $f"; chain="$chain[$i]scale=960:-1[s$i];"; i=$((i+1)); done
labels=""; i=0; while [ $i -lt $n ]; do labels="$labels[s$i]"; i=$((i+1)); done
rows=$(( (n + cols - 1) / cols ))
layout=""; i=0
while [ $i -lt $n ]; do layout="$layout$(( (i % cols) * 960 ))_$(( (i / cols) * 540 ))|"; i=$((i+1)); done
ffmpeg -v error -y $inputs -filter_complex "$chain${labels}xstack=inputs=$n:layout=${layout%|}:fill=white" "$out"
