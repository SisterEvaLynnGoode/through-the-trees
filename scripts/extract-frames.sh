#!/usr/bin/env bash
# Extract frames from hero.mp4 for scroll-scrubbing
# Usage: bash scripts/extract-frames.sh

set -e

FFMPEG="${FFMPEG_PATH:-ffmpeg}"
INPUT="public/hero.mp4"
FRAMES_1X="public/frames"
FRAMES_2X="public/frames@2x"

mkdir -p "$FRAMES_1X" "$FRAMES_2X"

echo "==> Extracting 1x frames (1600px wide, 24fps, q:v 4)..."
"$FFMPEG" -i "$INPUT" \
  -vf "fps=24,scale=1600:-1" \
  -q:v 4 \
  "$FRAMES_1X/frame_%04d.jpg" \
  -y

echo "==> Extracting 2x retina frames (2400px wide, 24fps, q:v 4)..."
"$FFMPEG" -i "$INPUT" \
  -vf "fps=24,scale=2400:-1" \
  -q:v 4 \
  "$FRAMES_2X/frame_%04d.jpg" \
  -y

FRAME_COUNT=$(ls "$FRAMES_1X"/frame_*.jpg 2>/dev/null | wc -l)
echo "==> Total frames extracted: $FRAME_COUNT"

SIZE_1X=$(du -sh "$FRAMES_1X" | cut -f1)
SIZE_2X=$(du -sh "$FRAMES_2X" | cut -f1)
echo "==> 1x frames total size: $SIZE_1X"
echo "==> 2x frames total size: $SIZE_2X"
