<#
.SYNOPSIS
  Encode a master (or a folder of stills) into a file that seeks fast in both
  directions, then verify it got the keyframe spacing it asked for.

.DESCRIPTION
  Windows counterpart to encode-scrub.sh. See FFMPEG.md for why each flag is
  here — the short version is that keyframe spacing sets the cost of every
  backward seek, and nothing in the player can compensate for getting it wrong.

.EXAMPLE
  .\scripts\encode-scrub.ps1 -InputPath .\realestate.mp4 -Output .\public\video\block-a -Width 1280

.EXAMPLE
  .\scripts\encode-scrub.ps1 -InputPath '.\frames\frame_%04d.jpg' -Output .\public\video\out -FromStills -Fps 25
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$Output,
  [int]$Width = 1280,
  [int]$Gop = 10,
  [int]$Crf = 26,
  [int]$Fps = 24,
  [switch]$FromStills
)

$ErrorActionPreference = 'Stop'

$outDir = Split-Path -Parent $Output
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$mp4 = "$Output.mp4"
$jpg = "$Output-poster.jpg"

# -framerate must come BEFORE -i for image sequences. After -i it means output
# rate, and ffmpeg demuxes the stills at its 25 fps default and then resamples.
$inputArgs = if ($FromStills) { @('-framerate', $Fps, '-i', $InputPath) } else { @('-i', $InputPath) }

Write-Host "Encoding $InputPath -> $mp4  ($Width px, GOP $Gop, CRF $Crf, $Fps fps)"

$encodeArgs = @('-y', '-v', 'error') + $inputArgs + @(
  '-an',
  '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p',
  '-crf', $Crf, '-preset', 'slow', '-tune', 'film',
  '-g', $Gop, '-keyint_min', $Gop, '-sc_threshold', '0',
  '-bf', '0',
  '-r', $Fps,
  '-vf', "scale=$($Width):-2:flags=lanczos",
  '-movflags', '+faststart',
  $mp4
)
& ffmpeg @encodeArgs
if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed with exit code $LASTEXITCODE" }

# Poster: half a second in, so it is never the black frame a film opens on.
& ffmpeg -y -v error -ss 0.5 -i $mp4 -vframes 1 -q:v 4 $jpg
if ($LASTEXITCODE -ne 0) { throw "poster extraction failed with exit code $LASTEXITCODE" }

# ---------------------------------------------------------------- verify ----
#
# `-g` is a request, not a guarantee: without `-sc_threshold 0` the encoder
# still inserts keyframes at scene cuts and the spacing goes irregular. Never
# ship without checking the number you actually got.

$flags = & ffprobe -v error -select_streams v:0 -show_entries packet=flags -of csv=p=0 $mp4

$maxGop = 0
$prev = -1
for ($i = 0; $i -lt $flags.Count; $i++) {
  if ($flags[$i].StartsWith('K')) {
    if ($prev -ge 0 -and ($i - $prev) -gt $maxGop) { $maxGop = $i - $prev }
    $prev = $i
  }
}

$bFrames = (& ffprobe -v error -select_streams v:0 -show_entries stream=has_b_frames -of csv=p=0 $mp4)
$sizeKiB = [math]::Round((Get-Item $mp4).Length / 1KB)

Write-Host ''
Write-Host "  size            $sizeKiB KiB"
Write-Host "  max GOP         $maxGop frames  (asked for $Gop)"
Write-Host "  has_b_frames    $bFrames"

$failed = $false
if ($maxGop -gt $Gop) {
  Write-Warning '  keyframe spacing is larger than requested - backward scrubbing will stall'
  $failed = $true
}
if ("$bFrames" -ne '0') {
  Write-Warning '  B-frames present - every seek pays for out-of-order decode'
  $failed = $true
}
if (-not $failed) { Write-Host '  ok - ready to scrub' }

if ($failed) { exit 1 }
