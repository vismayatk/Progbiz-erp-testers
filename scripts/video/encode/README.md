# Video encode tool chain (Swift + AVFoundation, no ffmpeg)

Final stage of the CRM product-demo video pipeline: turns a directory of rendered
frames plus one narration WAV into the delivery MP4, and provides the inspection
tools that replace `ffprobe` / `ffmpeg -ss`.

Nothing is downloaded or installed. Requirements already on the machine:
Swift compiler from the Command Line Tools (`swiftc`), `/usr/bin/python3`,
and for the self-test Pillow, `say`, `afconvert`.

| Tool | Source | Binary | Purpose |
|---|---|---|---|
| encode | `encode.swift` | `reports/video/build/bin/encode` | frames + audio -> H.264/AAC MP4 |
| probe | `probe.swift` | `reports/video/build/bin/probe` | ffprobe replacement |
| grabframe | `grabframe.swift` | `reports/video/build/bin/grabframe` | one exact frame -> PNG |
| mixwav | `mixwav.py` | (script) | narration clips -> one full-length WAV |
| yuvpeek | `selftest/yuvpeek.swift` | `reports/video/build/bin/yuvpeek` | diagnostic: stored Y/Cb/Cr levels |

## Build

```bash
bash scripts/video/encode/build.sh            # about 10 s, quiet
VERBOSE=1 bash scripts/video/encode/build.sh  # show compiler warnings
```

The macOS 27 SDK marks the classic `AVAssetWriter` / `AVAssetReader` calls as
deprecated. They work; the build hides those warnings unless `VERBOSE=1`.

## encode

```bash
reports/video/build/bin/encode <framesDir> <fps> <audio.wav|none> <out.mp4> [options]

# the final video
reports/video/build/bin/encode reports/video/build/final/frames 30 \
    reports/video/build/final/narration.wav reports/video/final/progbiz_crm_demo.mp4
```

Input: `r_000001.jpg`, `r_000002.jpg`, ... (`.jpg`, `.jpeg` or `.png`), numbered
without gaps. A gap or a duplicate number is an error, because it would shift
the picture against the narration.

Output:

* H.264 High profile (auto level, 4.0 at 1080p30), CABAC, 1920x1080, square pixels
* BT.709 primaries / transfer / matrix, video range
* constant frame rate: frame `n` (0-based) is shown at exactly `n / fps` seconds
* average video bitrate 12 Mbit/s, keyframe at least every 2 s
* AAC-LC 48 kHz, 192 kbit/s constant bitrate, stereo (a mono input is copied to L and R)
* fast-start MP4 (`moov` before `mdat`)
* written to a hidden temp file next to the target and renamed when complete,
  so a half-written file never sits at the output path

| Option | Default | Meaning |
|---|---|---|
| `--bitrate N` | 12000000 | video average bitrate, bit/s |
| `--audio-bitrate N` | 192000 | AAC bitrate, bit/s (clamped to what the system encoder allows) |
| `--audio-channels N` | 2 | 1 or 2 |
| `--audio-strategy S` | cbr | `cbr` or `abr` |
| `--keyint S` | 2 | longest keyframe distance in seconds |
| `--size WxH` | 1920x1080 | output size; frames of another size with the same aspect ratio are resampled |
| `--jobs N` | min(cores, 8) | parallel frame decoders = number of decoded frames held in memory |
| `--bframes` | off | allow frame reordering |
| `--limit N` | all | encode only the first N frames (quick previews) |
| `--no-audio-fit` | off | do not trim / pad the audio to the video length |

Audio length: by default the audio is trimmed, or padded with silence, to
exactly the video length (`frames / fps`). Any file AVFoundation can read is
accepted (WAV, AIFF, M4A); it is converted to 48 kHz.

Memory: frames are decoded by a bounded look-ahead pipeline and appended only
while `isReadyForMoreMediaData` is true, each inside an `autoreleasepool`.
Memory use does not grow with the number of frames.

Exit code 0 on success, 1 on any error (message on stderr).

## probe

```bash
reports/video/build/bin/probe <file>                  # duration + per-track summary
reports/video/build/bin/probe <file> --frames         # + per-sample analysis
reports/video/build/bin/probe <file> --frames --json  # machine readable
```

Prints duration, container atom order and fast-start, and per track: codec
fourcc, H.264 profile and level, dimensions, pixel aspect ratio, nominal frame
rate, estimated bitrate, colour tags, audio sample rate and channels.
`--frames` walks every video sample and adds sample count, keyframe count,
longest keyframe gap, min/max frame interval (constant-frame-rate check) and the
exact bitrate.

Note: CoreMedia reports the AAC codec type as `aac ` (the MP4 sample entry is `mp4a`).
WebM/VP8 files (Playwright recordings) are not readable by AVFoundation.

## grabframe

```bash
reports/video/build/bin/grabframe <video> <seconds> <out.png> [--scale WxH]
```

`AVAssetImageGenerator` with time tolerance zero: returns the frame that is on
screen at that time, not the nearest keyframe. Prints requested time, actual
time and the 0-based frame index.

## mixwav.py

```bash
/usr/bin/python3 scripts/video/encode/mixwav.py <cues.json> <total_seconds> <out.wav> \
    [--fade-ms 10] [--ceiling 0.98] [--report report.json] [--strict]
```

```json
[
  {"file": "01_opening_1.wav", "start_s": 0.8,  "gain": 1.0},
  {"file": "01_opening_2.wav", "start_s": 5.2,  "gain": 1.0}
]
```

* clips must be PCM 16-bit 48 kHz, mono (stereo is down-mixed). Make them with
  `say -o x.aiff "sentence"` then `afconvert -f WAVE -d LEI16@48000 -c 1 x.aiff x.wav`
* relative paths are resolved against the current directory, then against the
  directory of the cue file
* 10 ms linear fade-in and fade-out per clip
* clipping guard: if the sum exceeds the ceiling the whole mix is attenuated by
  one factor (nothing is hard-clipped); the attenuation is printed
* overlapping clips and clips that run past the end are reported as warnings;
  with `--strict` they are errors and nothing is written
* output is exactly `round(total_seconds * 48000)` samples, 48 kHz mono 16-bit

## Self-test (the proof)

```bash
bash scripts/video/encode/selftest/run_selftest.sh          # about 20 s
LONG=1 bash scripts/video/encode/selftest/run_selftest.sh   # adds the 7,200-frame run
node scripts/video/encode/selftest/chrome_check.js reports/video/poc-encode/poc_300.mp4 \
     reports/video/poc-encode/chrome 0 3.5 9.9              # playback check in Google Chrome
```

Everything is local; output goes to `reports/video/poc-encode/`.

### Results measured on this machine (29 Sep 2026)

| Check | Result |
|---|---|
| mix onsets (cues at 1.0 s and 6.0 s) | energy starts at 1.0002 s and 6.0001 s, RMS before each clip 0.0 |
| video | avc1, H.264 High 4.0, 1920x1080, 30.000 fps, constant frame rate, 300 samples |
| keyframes | 5 in 10 s, longest gap 2.000 s |
| colour tags | ITU_R_709_2 x3, video range, pixel aspect 1:1 |
| video bitrate | 12.11 Mbit/s (test pattern with a noise block); 2.8 Mbit/s for the same pattern without noise |
| audio | AAC-LC, 48 kHz, 2 ch, 191.9 kbit/s |
| durations | container 10.000 s, video 10.000 s, audio 10.000 s |
| audio sync | decoded MP4 audio vs source mix: lag 0 samples, L equals R |
| fast start | atoms `ftyp moov mdat` |
| grabframe | 0.0 s -> FRAME 0000, 3.5 s -> FRAME 0105, 9.9 s -> FRAME 0297, 123.4 s of the long file -> frame 3702 |
| 12 px text | readable, dark-on-white, light-on-dark and coloured |
| Google Chrome 154 | plays both test files, 1920x1080, 10 s, 0 dropped frames, audio decoded; white reads 254 with JPEG frames and 255 with PNG frames |
| QuickLook / Spotlight importer | thumbnail produced; importer reports H.264 + MPEG-4 AAC, 1920x1080 |
| 300 frames | 1.2 s to 2.1 s (141 to 265 fps, depends on what else runs) |
| 7,200 frames | 27.5 s (262 fps) idle, 49.7 s (145 fps) while another job was using the CPU |
| peak memory | 275 MB for 300 frames, 253 to 304 MB for 7,200 frames |

## Things to know

1. **JPEG frames come out 1 to 2 code values darker; PNG frames are exact.**
   The macOS JPEG decoder (ImageIO, also `sips`) returns white as 254 and a
   (244,246,250) background as (243,245,248) where libjpeg returns 255 and
   (245,246,250). This is in the system decoder, not in the encoder. With PNG
   input, white is stored as Y=235 and reads back as 255 in Chrome. PNG input
   encodes just as fast (264 fps). If exact UI colours matter, render PNG frames.
2. **The encoder converts RGB to Y'CbCr itself (vImage).** Giving BGRA buffers to
   the H.264 encoder stored white as Y=233 instead of 235, which dulls white
   backgrounds. Do not change the pixel format back to BGRA.
3. **Coloured small text loses some saturation.** H.264 High profile is 4:2:0;
   that is inherent in the format, the text stays readable.
4. **The bitrate is a target, not a floor.** Static UI footage needs far less than
   12 Mbit/s and the file will be smaller. That is not a fault.
5. **QuickTime Player shows BT.709 video slightly lighter than Chrome / VLC.**
   That is the usual macOS colour management of 1-1-1 tagged video.
6. **The very first frame is up to 2 code values off** (grey 126,129,128 instead
   of 128,128,128 in Chrome); later frames are exact. The title card hides this.
7. `mdls` shows `(null)` for files under `reports/` until Spotlight has indexed
   them; `mdimport -t -d2 <file>` shows what the importer reads.
