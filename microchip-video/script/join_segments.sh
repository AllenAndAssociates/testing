#!/usr/bin/env bash
# Join segment renders (hyperframes render --start/--end) into the final film with the full mixed audio.
#   bash script/join_segments.sh <segments-dir> <mixed-audio.m4a> <out.mp4>
# The mixed audio is the audio.m4a HyperFrames writes in its render work directory.
set -euo pipefail
SEG=$1
AUDIO=$2
OUT=$3
LIST=$(mktemp)
trap 'rm -f "$LIST"' EXIT
for s in 0 60 120 180 240; do echo "file '$(realpath "$SEG/seg-$s.mp4")'" >> "$LIST"; done
# one re-encode at CRF 19 (slow preset) keeps it visually lossless against the CRF 16 segments at about half the size
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$LIST" -i "$AUDIO" \
  -map 0:v:0 -map 1:a:0 -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -profile:v high \
  -c:a copy -movflags +faststart -shortest "$OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
