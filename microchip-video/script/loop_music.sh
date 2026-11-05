#!/usr/bin/env bash
# Crossfade the MusicGen phrase into a bed as long as the film, with a soft fade in and out.
#   bash script/loop_music.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DUR=$(node -e 'const s=require("fs").readFileSync("assets/timing.js","utf8");console.log(JSON.parse(s.slice(s.indexOf("=")+1).trim().replace(/;$/,"")).duration)')
# MusicGen phrases tend to tail off at the end: loop only the strong part
KEEP=${KEEP:-23}
SRC=$(mktemp --suffix=.wav)
trap 'rm -f "$SRC"' EXIT
ffmpeg -hide_banner -loglevel error -y -i assets/music/bed_raw.wav -t "$KEEP" "$SRC"
LEN=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
XF=4
# how many copies are needed so that n*LEN - (n-1)*XF >= DUR
N=$(python3 -c "import math;print(max(2, math.ceil(($DUR - $XF) / ($LEN - $XF)) + 1))")
inputs=(); for _ in $(seq 1 "$N"); do inputs+=(-i "$SRC"); done
chain="[0:a]"
for i in $(seq 1 $((N - 1))); do
  out="[x$i]"; [ "$i" -eq $((N - 1)) ] && out="[joined]"
  chain+="[$i:a]acrossfade=d=$XF:c1=tri:c2=tri$out"
  [ "$i" -lt $((N - 1)) ] && chain+=";[x$i]"
done
FADE_OUT_START=$(python3 -c "print($DUR - 4)")
ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" \
  -filter_complex "$chain;[joined]atrim=0:$DUR,afade=t=in:d=2,afade=t=out:st=$FADE_OUT_START:d=4,highpass=f=60,loudnorm=I=-24:TP=-3,aresample=48000[out]" \
  -map "[out]" -ac 2 assets/music/bed.wav
echo "assets/music/bed.wav: $(ffprobe -v error -show_entries format=duration -of csv=p=0 assets/music/bed.wav)s from $N copies"
