#!/usr/bin/env bash
#
# Encode a master (or a folder of stills) into a file that seeks fast in both
# directions, then verify the result actually got the keyframe spacing it asked
# for. See FFMPEG.md for why each flag is here.
#
#   ./scripts/encode-scrub.sh -i realestate.mp4 -o public/video/block-a -w 1280
#   ./scripts/encode-scrub.sh -i 'frames/frame_%04d.jpg' -o public/video/out -w 1280 -f 25
#
set -euo pipefail

INPUT=""
OUTPUT=""
WIDTH=1280
GOP=10
CRF=26
FPS=24
# Optional filter applied BEFORE the scale — grading, cropping, de-noise.
PREFILTER=""
# Set when the input is an image sequence rather than a video file.
FROM_STILLS=0

usage() {
  cat <<'USAGE'
Usage: encode-scrub.sh -i INPUT -o OUTPUT_BASE [options]

  -i  Input master, or a printf pattern for stills (e.g. 'frames/f_%04d.jpg')
  -o  Output base path, without extension (.mp4 and .jpg are appended)
  -w  Output width in pixels                      (default 1280)
  -g  GOP size — keyframe every N frames          (default 10)
  -c  CRF quality, lower is better                (default 26)
  -f  Frame rate                                  (default 24)
  -p  ffmpeg filter chain to apply before scaling (e.g. a tone curve)
  -s  Treat the input as an image sequence
USAGE
}

while getopts "i:o:w:g:c:f:p:sh" opt; do
  case "$opt" in
    i) INPUT="$OPTARG" ;;
    o) OUTPUT="$OPTARG" ;;
    w) WIDTH="$OPTARG" ;;
    g) GOP="$OPTARG" ;;
    c) CRF="$OPTARG" ;;
    f) FPS="$OPTARG" ;;
    p) PREFILTER="$OPTARG" ;;
    s) FROM_STILLS=1 ;;
    h) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
  usage
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

# -framerate must come BEFORE -i for image sequences. After -i it means output
# rate, and ffmpeg demuxes the stills at its 25 fps default and then resamples,
# duplicating or dropping frames.
INPUT_ARGS=(-i "$INPUT")
if [ "$FROM_STILLS" -eq 1 ]; then
  INPUT_ARGS=(-framerate "$FPS" -i "$INPUT")
fi

VF="scale=${WIDTH}:-2:flags=lanczos"
if [ -n "$PREFILTER" ]; then
  # Before the scale, so grading works on the full-resolution source and the
  # downscale is the last thing that touches the pixels.
  VF="${PREFILTER},${VF}"
fi

echo "Encoding ${INPUT} -> ${OUTPUT}.mp4  (${WIDTH}px, GOP ${GOP}, CRF ${CRF}, ${FPS} fps)"
[ -n "$PREFILTER" ] && echo "  prefilter       ${PREFILTER}"

ffmpeg -y -v error "${INPUT_ARGS[@]}" -an \
  -c:v libx264 -profile:v high -level:v 4.1 -pix_fmt yuv420p \
  -crf "$CRF" -preset slow -tune film \
  -g "$GOP" -keyint_min "$GOP" -sc_threshold 0 \
  -bf 0 \
  -r "$FPS" \
  -vf "$VF" \
  -movflags +faststart \
  "${OUTPUT}.mp4"

# Poster: half a second in, so it is never the black frame a film usually opens
# on. Encoded from the output, so it matches what the scrub will show.
ffmpeg -y -v error -ss 0.5 -i "${OUTPUT}.mp4" -vframes 1 -q:v 4 "${OUTPUT}-poster.jpg"

# ---------------------------------------------------------------- verify ----
#
# `-g` is a request, not a guarantee: without `-sc_threshold 0` the encoder
# still inserts its own keyframes at scene cuts and the spacing goes irregular.
# Never ship without checking the number you actually got.

MAX_GOP=$(ffprobe -v error -select_streams v:0 -show_entries packet=flags -of csv=p=0 "${OUTPUT}.mp4" \
  | awk 'BEGIN{p=-1;m=0} /^K/{if(p>=0 && NR-p>m) m=NR-p; p=NR} END{print m+0}')

B_FRAMES=$(ffprobe -v error -select_streams v:0 -show_entries stream=has_b_frames -of csv=p=0 "${OUTPUT}.mp4")
SIZE_KIB=$(( $(stat -c %s "${OUTPUT}.mp4" 2>/dev/null || stat -f %z "${OUTPUT}.mp4") / 1024 ))

echo
echo "  size            ${SIZE_KIB} KiB"
echo "  max GOP         ${MAX_GOP} frames  (asked for ${GOP})"
echo "  has_b_frames    ${B_FRAMES}"

STATUS=0
if [ "$MAX_GOP" -gt "$GOP" ]; then
  echo "  ! keyframe spacing is larger than requested — backward scrubbing will stall" >&2
  STATUS=1
fi
if [ "$B_FRAMES" != "0" ]; then
  echo "  ! B-frames present — every seek pays for out-of-order decode" >&2
  STATUS=1
fi
[ "$STATUS" -eq 0 ] && echo "  ok — ready to scrub"

exit "$STATUS"
