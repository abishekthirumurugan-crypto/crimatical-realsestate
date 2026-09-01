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

`new_realestate_video.mp4` — 2560×1440, 24 fps, 10.000 s, 240 frames, 12,041 KiB,
`yuvj420p` (full range), `has_b_frames=0`, keyframes every 60, **plus an AAC-LC
48 kHz stereo 128 kbps track**. It is a single continuous forward dolly through a
finished apartment: street, gate, hall, bedroom, kitchen, terrace. Mean absolute
inter-frame delta is 28.8/255 — an order more motion than the CGI cut it replaced.

```bash
./scripts/encode-scrub.sh -i new_realestate_video.mp4 -o public/video/walkthrough        -w 1280 -c 29 -f 24 -e veryslow
./scripts/encode-scrub.sh -i new_realestate_video.mp4 -o public/video/walkthrough-mobile -w  960 -c 31 -f 24 -e veryslow
```

Or `npm run encode`, which runs both.

Shipped: **1280×720, GOP 10, no B-frames, no audio, 2030 KiB, VMAF 92.44** at a
1920×1080 viewport. The mobile cut is **960×540, 1106 KiB, VMAF 87.87** at
1170×658 (390 CSS px at DPR 3).

### What the sweep actually found

34 encodes, scored with VMAF at real viewport sizes rather than by eye.

**GOP 10 survives this footage.** The worry was that so much inter-frame motion
would defeat `-sc_threshold 0` and let x264 insert its own keyframes. It did not:
every output returned `maxgap == mingap == requested`, with exactly `240/GOP`
keyframes. GOP 10 is still the knee — stretching to 16 saves 116 KiB (5.4%) and
raises worst-case backward-seek work 67% (9 → 15 decodes); 16 → 24 saves a
derisory 43 KiB for another 53%. Keyframes are relatively cheap here: the I:P byte
ratio is 2.76× on this footage against 6.01× on the CGI.

**`-preset veryslow` is free.** 2030 KiB at VMAF 92.44 against `slow`'s 2165 KiB
at 92.23 — 6.2% smaller *and* very slightly better. It is paid once, at build.

**CRF 29 is the last rung above VMAF 90**, and the cliff is immediately below it:

| CRF (veryslow, GOP 10, 1280) | Size | SSIM-Y | VMAF |
|-----:|-----:|-------:|-----:|
| 26 | 2722 KiB | 0.9821 | 97.54 |
| **29** | **2030 KiB** | **0.9746** | **92.44** |
| 30 | 1842 KiB | 0.9713 | 90.07 |
| 31 | 1676 KiB | 0.9676 | 87.33 |
| 32 | 1525 KiB | 0.9634 | 84.39 |

**No prefilter, and that is measured.** Denoising dark photographic footage
sounds right and is wrong: `hqdn3d` at three strengths saved 2.7–3.5% while
costing 2.4–8.2 VMAF. Raising CRF one step saves more (6.5%) for less loss
(−2.37). `smartblur` produced a *larger* file. The tone curve documented below
for the old master has nothing to attach to here — it exists to map a flat
studio sweep onto `--bg`, and this is a full-frame interior with no backdrop.

**Rejected levers.** Frame rate is weak (CRF is a per-frame target, so survivors
absorb the bits): 12 fps saves only 17% while halving scrub smoothness.
`aq-mode=3` loses at matched bytes — 1701 KiB / 84.57 against plain AQ at
1676 KiB / 87.33.

**The mobile cut is cropped to portrait, 480×854.**

It was 960×540 — the same landscape framing as the desktop file, just smaller —
and that was wrong twice over. The player uses `object-fit: cover`, so on a
390×844 phone a 16:9 frame is scaled 1.56× to cover the screen and then cropped
to the middle 26% of its width. The decoder was decoding a full frame and
**74% of every one of them was thrown away**, while the strip that survived was
upscaled 4.69× from 250 source pixels across 1,170 device pixels.

Cropping the master to 9:16 first fixes both ends of that at once:

| | before | after |
|---|---:|---:|
| encode | 960×540, GOP 10 | **480×854, GOP 2** |
| pixels decoded per frame | 518k | **409k** (−21%) |
| fraction of the frame visible | 26% | **82%** |
| upscale on a DPR-3 phone | 4.69× | **2.96×** |
| worst-case decode per seek | 9 frames | **1 frame** |
| file | 1106 KiB | 1218 KiB (+10%) |

Cheaper to decode, far cheaper to seek, and sharper, for 10% more bytes. The
crop is centred and keeps every
beat of the walk — gate, door, hall, bedroom, kitchen, terrace — because the
camera is a forward dolly and the subject is always near the middle.

**Audio.** The source carries a 128 kbps AAC track; `-an` drops it, verified as
0 audio streams in every output. On a scrubber the element is never played, and
it would have added ~160 KiB to a file that already has a budget to watch.

### Scrubbing is seek-bound on a phone

Worth writing down, because it is not obvious and it is what "the video lags"
actually means.

The film spans `scrollLengthVh` × viewport of scroll. On a 390×844 phone at six
screens that is 5,064px, so at 24 fps a distinct frame lands every 21px — and an
ordinary flick of 1,800px in 450ms asks for **190 seeks a second**. Nothing on a
phone is close to that. `ScrollVideo` gates seeks on decoder readiness, so the
excess is dropped rather than queued, and what the reader feels is the picture
trailing their finger.

The first attempt at this was a coarser frame grid on mobile — 12 fps rather
than 24, halving the demand to 95/s. It worked and it was the wrong trade: 42px
of scroll per frame is visible stepping at slow speeds, so trailing was simply
swapped for juddering.

**The right lever is GOP, not frame rate.** Seek cost is dominated by how many
frames the decoder must run through from the last keyframe, and the mobile cut
was inheriting the desktop's GOP 10:

| GOP | size | worst-case decode per seek |
|---:|---:|---:|
| 10 | 796 KiB | 9 frames |
| 5 | 904 KiB | 4 frames |
| **2** | **1218 KiB** | **1 frame** |
| 1 | 1434 KiB | 0 frames |

GOP 2 makes a seek roughly nine times cheaper for 422 KiB, which on a scrubber
is exactly the right place to spend bytes — and it buys back far more headroom
than a 24 fps grid costs, so the grid goes back to matching the encode and the
stepping disappears. GOP 1 was measured too; the extra 216 KiB removes a single
P-frame decode and is not worth it.

This is the one place the general advice in **Don't reach for all-intra** below
bends: that section is about the desktop file, where bytes are the scarce
resource. On the mobile cut the scarce resource is seek time.

`src/pages/Home.tsx` still runs a snappier ease on mobile, since smoothing is a
deliberate lag and a phone has less headroom to hide one in.

### The budget, honestly

`ScrollVideo` uses `preloadStrategy: 'blob'`, so the **whole file gates first
interaction**. 2030 KiB is about 4 s on 4 Mbps. The determinate progress bar
covers it, but if that needs to come down, the lever is the edit rather than the
encoder: the camera dwells three of its ten seconds in the bedroom, and trimming
two of them gives an 8 s cut at **1576 KiB and VMAF 92.64** — same quality per
frame, 22% fewer bytes. Two seconds of trim is worth about three CRF steps.

---

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
