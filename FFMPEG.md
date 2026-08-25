# Encoding for scroll scrubbing

How to turn 700 frames (or an existing master) into a file that seeks fast in
**both** directions.

The measurements below were taken on this repo's earlier master, `realestate.mp4`
with ffmpeg 9.0 — 1280×720, 24 fps, 10.00 s, 240 frames, 2.02 Mbps, **2.58 MiB**.
They are what the settings below are based on. The file currently shipped is
different — see **The film currently shipped**.

## TL;DR

```bash
ffmpeg -i input.mp4 -an \
  -c:v libx264 -profile:v high -level:v 4.1 -pix_fmt yuv420p \
  -crf 26 -preset slow -tune film \
  -g 10 -keyint_min 10 -sc_threshold 0 \
  -bf 0 \
  -r 24 \
  -vf "scale=1280:-2:flags=lanczos" \
  -movflags +faststart \
  out.mp4
```

Or run the wrappers, which also **verify** the result:

```bash
./scripts/encode-scrub.sh -i realestate-upscaled.mp4 -o public/video/tower -w 1280 -f 24
```
```powershell
.\scripts\encode-scrub.ps1 -InputPath .\realestate-upscaled.mp4 -Output .\public\video\tower -Width 1280 -Fps 24
```

What that bought on this file: worst-case seek work fell from **229 frames to 9**,
for **+17 %** on disk (2.58 MiB → 3.03 MiB).

---

## The film currently shipped

`realestate-upscaled.mp4` — 2560×1440, 24 fps, 10.00 s, 240 frames, 9.96 Mbps,
**12.0 MiB**, `has_b_frames=0`, keyframes every 60 frames, no audio.

```bash
CURVE="curves=r='0/0 0.22/0.22 0.50/0.60 0.7255/0.9647 1/1':g='0/0 0.22/0.22 0.50/0.60 0.7255/0.9647 1/1':b='0/0 0.22/0.22 0.50/0.60 0.7333/0.9647 1/1'"

./scripts/encode-scrub.sh -i realestate-upscaled.mp4 -o public/video/tower        -w 1280 -f 24 -p "$CURVE"
./scripts/encode-scrub.sh -i realestate-upscaled.mp4 -o public/video/tower-mobile -w  720 -f 24 -p "$CURVE"
```

Or just `npm run encode`, which carries the same curve.

Shipped result: **1280×720, 24 fps, 240 frames, max GOP 10, no B-frames, 1194 KiB.**
The 720px mobile cut is 549 KiB.

### The tone curve, and why it is not optional

The master renders its building on a **mid-grey studio sweep**, measured at
rgb(185, 185, 187) across the frame edges. That is a problem the CSS cannot
solve. The page is near-white, so a `contain` fit puts a grey rectangle on it
with a hard edge; and the building's own lit concrete measures the same tone as
the sweep, so no clamp, key or blend separates the two.

The curve fixes it at the source. It is a shoulder, not a brightness lift:
the bottom quarter is left alone (`0.22/0.22`), the mid-tones are lifted gently
(`0.50/0.60`), and the backdrop's own value is mapped to just under white
(`0.7255/0.9647`). Blue gets its own slightly different input point because the
sweep is a shade cool and a single master curve would have carried that cast
into the highlights.

Measured on the output, over six frames spanning the film:

| | before | after |
|---|---:|---:|
| frame-edge median | #b8b8bb | **#f4f4f6** |
| contrast against the `#f6f6f6` page | 1.41 | **1.01** |
| body copy over the gutter columns, worst frame | 2.64:1 | **5.61:1** |

At 1.01 the letterbox around the frame is indistinguishable from the frame
itself, which is what lets the film be full-bleed with no visible edge anywhere.
The building keeps its modelling — the curve costs about 7% on disk
(1110 → 1194 KiB) and nothing in quality.

The one thing the curve does not reach is the building's **cast shadow**, which
runs off the right-hand edge of the frame from about halfway through. That is
handled in CSS, by `.film__wash` in `src/styles/film.css`.

If you swap the master for footage already shot on white, drop the `-p` flag.

---

## The source file was the problem

Before changing anything, measure what you have. This is the check that matters:

```bash
ffprobe -v error -select_streams v:0 -show_entries packet=flags -of csv=p=0 in.mp4 \
  | awk 'BEGIN{p=-1;m=0} /^K/{if(p>=0 && NR-p>m) m=NR-p; p=NR} END{print m}'
```

`realestate.mp4` printed **230**. Two keyframes in the entire 240-frame file —
one at the start, one near the end.

That single number explains every scrubbing complaint you would have had with
this footage, and no amount of JavaScript could have fixed it.

## Why GOP size is the whole ballgame

Seeking to time *T* is not random access. The decoder must find the last
keyframe at or before *T*, then decode every frame from there forward to reach
it. With a 230-frame GOP, landing on frame 229 means decoding 229 frames.

Scrubbing **backward** is the pathological case. Going forward a decoder can
often keep its state and step to the next frame. Going backward, every frame is
a fresh seek-to-keyframe-then-decode-forward operation. At GOP 230 that is over a
hundred wasted frame decodes *per displayed frame* — which is exactly the
juddering wall you hit scrolling up.

Shrinking the GOP bounds that work. Measured, all at CRF 26, `-bf 0`:

| `-g` | Worst-case decode per seek | Size | SSIM vs source |
|-----:|---------------------------:|-----:|---------------:|
| default (max 220) | 219 frames | 2270 KiB | 0.98152 |
| 48   | 47 frames                  | 2421 KiB | 0.98201 |
| 24   | 23 frames                  | 2569 KiB | 0.98251 |
| **10** | **9 frames**             | **3027 KiB** | **0.98334** |
| 5    | 4 frames                   | 3746 KiB | 0.98362 |

**GOP 10 is the knee.** Going from 24 → 10 costs 17.8 % more bytes and cuts
worst-case seek work by 2.6×. Going from 10 → 5 costs another 23.8 % and buys
only 2.25× — and 9 frames of decode is already ~2–3 ms on any hardware decoder,
well inside a 16.7 ms frame budget. There is nothing left to win.

Note the SSIM column moves the *right* way as GOP shrinks. At a fixed CRF, more
keyframes means slightly higher fidelity, because I-frames are encoded at higher
quality than the P-frames they replace. Short GOP costs bytes, not quality.

### Don't reach for all-intra

The intuition "make every frame a keyframe and seeking becomes free" is a trap.
Removing inter-frame prediction forces every frame to carry its full detail
budget, and it disables x264's mb-tree rate control — which is where a lot of
your quality-per-byte comes from. You pay a large size increase to save the last
9 frames of decode. Not worth it.

### The two flags people forget

`-g 10` alone does **not** give you keyframes every 10 frames.

- **`-sc_threshold 0`** — the one that matters. It disables scene-cut keyframe
  insertion. Leave it out and spacing becomes content-dependent and irregular:
  most of the clip is fine, then one shot has a 40-frame gap that stalls every
  time the user scrubs across it.
- **`-keyint_min 10`** — belt and braces. With `-sc_threshold 0` it is largely
  redundant, but it pins the *minimum* IDR interval so no encoder build or future
  flag change can sneak an early keyframe in and stretch the following span.

Regular spacing is what makes scrub cost *predictable*, which matters more than
making it low on average. Always verify you got what you asked for — both
wrapper scripts do this and exit non-zero if not.

## `-bf 0` — no B-frames

B-frames reference *both* earlier and later frames, so decode order differs from
display order. To show one B-frame the decoder must first decode frames that come
after it. During playback that is free (it is pipelined ahead); during scrubbing
it is pure added latency on every seek, and it defeats the decoder's ability to
step cleanly frame by frame.

The source had `has_b_frames=2`. Dropping them costs a few percent in size. Give
it up — smooth backward scrubbing is worth more.

Verify: `ffprobe -v error -select_streams v:0 -show_entries stream=has_b_frames -of csv=p=0 out.mp4`
must print `0`.

## Picking CRF

At GOP 10, `-bf 0`, 1280 wide:

| `-crf` | Size | SSIM vs source |
|-------:|-----:|---------------:|
| 24 | 3768 KiB | 0.98669 |
| **26** | **3027 KiB** | **0.98334** |
| 28 | 2439 KiB | 0.97891 |
| 30 | 1973 KiB | 0.97319 |

**26** is shipped here. This footage is aerial architectural work — scaffold
poles, rebar and cladding joints are exactly the high-frequency detail that
low-bitrate H.264 smears first. If your film is softer or the stage is smaller
on screen, 28 is a legitimate 19 % saving.

Remember you are re-encoding an already-compressed master, so you are paying a
second generation loss. Encode from the original stills if you still have them.

## Why not WebM / VP9

The settings that make scrubbing fast are the settings VP9 most depends on for
its efficiency. Measured on the same source:

| Codec | Default GOP | Forced GOP 10 | Cost of short GOP |
|-------|------------:|--------------:|------------------:|
| x264 (CRF 26)   | 2270 KiB | 3027 KiB | **+33.3 %** |
| libvpx-vp9 (CRF 32) | 2746 KiB | 3945 KiB | **+43.7 %** |

VP9 is punished harder. On top of that, VP9's hardware decode coverage is
narrower than H.264's, and for scrubbing **decode speed is the entire game** —
a software-decoded seek turns a 4 ms operation into a 30 ms one, which is a
dropped frame every time.

So this project ships H.264 only, in two sizes, and no WebM twin. (The two codecs
are not quality-matched in that table — VP9's CRF scale is not x264's — so read
it as the *relative* cost of short GOP within each codec, which is the point.)

## Other flags, and why

| Flag | Reason |
|------|--------|
| `-movflags +faststart` | Moves the `moov` atom to the front. Without it, duration lives at the *end* of the file — the browser must fetch the tail before `loadedmetadata` fires, so the component's ready gate waits on an extra round trip. Non-negotiable. |
| `-an` | Drops audio. A scrub track is silent anyway, and it removes an interleaved stream the demuxer skips past on every seek. |
| `-pix_fmt yuv420p` | 8-bit 4:2:0 is the only format with universal hardware decode. 4:2:2, 4:4:4 or 10-bit silently fall back to software decoding. |
| `-profile:v high -level:v 4.1` | Broadest hardware support. Avoid `high10` / `high444`. |
| `-preset slow` | Encode time is a one-off cost; bytes are paid by every visitor. |
| `-r 24` | Pin the output rate so `fps={24}` in the component matches exactly. |
| `-vf scale=W:-2` | `-2` keeps the height even (H.264 requires it) and preserves aspect. |
| `flags=lanczos` | Sharper downscale than the default bicubic, which matters on fine structural detail. |

## From 700 stills directly

If you have the source frames, encode from them rather than from a compressed
master — you skip a generation of loss entirely:

```bash
ffmpeg -framerate 25 -i 'source-frames/frame_%04d.jpg' -an \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf 26 -preset slow -tune film \
  -g 10 -keyint_min 10 -sc_threshold 0 -bf 0 \
  -vf "scale=1280:-2:flags=lanczos" -movflags +faststart \
  out.mp4
```

Or: `./scripts/encode-scrub.sh -i 'source-frames/frame_%04d.jpg' -o public/video/out -s -f 25`

Three things to get right:

1. **`-framerate 25` must come BEFORE `-i`.** After `-i` it means output rate,
   and ffmpeg will demux the stills at its 25 fps default and then resample,
   duplicating or dropping frames.
2. **Numbering must be zero-padded and gapless** (`frame_0001.jpg` …
   `frame_0700.jpg`). A gap silently truncates the encode at the gap. Check
   first: `ls source-frames | wc -l` should print 700.
3. **Match `fps` in the component to `-framerate`.** 700 frames at 25 fps is
   28.0 s of video; frame *n* lives at `n / 25` seconds, and `fps={25}` makes the
   component snap seeks to those exact frame centres.

### What you save

700 JPEGs at ~120 KB each is roughly **84 MB across 700 requests**. The same
motion as H.264 at GOP 10 is **one request** and a few MB, because only what
changed between neighbouring frames is transmitted. That is the entire reason
for this approach — and it is why the GOP has to be short, since short GOP is
what buys back the random access the image sequence gave you for free.

## Verifying an encode

```bash
# Keyframe spacing — must equal your -g
ffprobe -v error -select_streams v:0 -show_entries packet=flags -of csv=p=0 out.mp4 \
  | awk 'BEGIN{p=-1;m=0} /^K/{if(p>=0 && NR-p>m) m=NR-p; p=NR} END{print m}'

# B-frames — must be 0
ffprobe -v error -select_streams v:0 -show_entries stream=has_b_frames -of csv=p=0 out.mp4

# faststart — moov must appear BEFORE mdat
ffprobe -v trace -i out.mp4 2>&1 | grep -oE "type:'(moov|mdat)'" | head -2

# Frame count, rate and duration — feed the rate to the component's fps prop
ffprobe -v error -select_streams v:0 \
  -show_entries stream=nb_frames,r_frame_rate,duration -of default=nw=1 out.mp4
```

Both wrapper scripts run the first two automatically and fail loudly.
