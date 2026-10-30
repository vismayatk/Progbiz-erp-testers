#!/bin/bash
# End-to-end proof of the encoder tool chain. Everything is local and offline.
#
#   bash scripts/video/encode/selftest/run_selftest.sh          # 300-frame proof
#   LONG=1 bash scripts/video/encode/selftest/run_selftest.sh   # + 7,200-frame (4 min) run
#
# Output goes to reports/video/poc-encode/ (git-ignored). Exit code 0 = all checks passed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENC="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$ENC/../../.." && pwd)"
BIN="$ROOT/reports/video/build/bin"
OUT="$ROOT/reports/video/poc-encode"
PY=/usr/bin/python3
cd "$ROOT"

step() { printf '\n=== %s\n' "$*"; }

step "1. build"
bash "$ENC/build.sh"
swiftc -O -swift-version 5 -suppress-warnings "$HERE/yuvpeek.swift" -o "$BIN/yuvpeek"

step "2. synthetic frames (300 x 1920x1080, Pillow)"
rm -rf "$OUT/frames"
$PY "$HERE/gen_test_frames.py" "$OUT/frames" 300 30

step "3. narration clips (say -> afconvert 48 kHz mono 16-bit)"
mkdir -p "$OUT/audio"
say -o "$OUT/audio/clip1.aiff" "Start from the Home screen and get an instant view of the day."
say -o "$OUT/audio/clip2.aiff" "Less time searching. Fewer missed follow-ups."
for c in clip1 clip2; do
  afconvert -f WAVE -d LEI16@48000 -c 1 "$OUT/audio/$c.aiff" "$OUT/audio/$c.wav"
  afinfo "$OUT/audio/$c.wav" | grep -E "Data format|estimated duration"
done

step "4. mix: clips at 1.0 s and 6.0 s on a 10 s bed, then read the samples back"
cat > "$OUT/audio/cues.json" <<'JSON'
[
  {"file": "clip1.wav", "start_s": 1.0, "gain": 1.0},
  {"file": "clip2.wav", "start_s": 6.0, "gain": 1.0}
]
JSON
$PY "$ENC/mixwav.py" "$OUT/audio/cues.json" 10 "$OUT/audio/mix.wav" --report "$OUT/audio/mix_report.json"
$PY "$HERE/verify_mix.py" "$OUT/audio/mix.wav" "$OUT/audio/cues.json"

step "5. encode 300 frames + audio"
/usr/bin/time -l "$BIN/encode" "$OUT/frames" 30 "$OUT/audio/mix.wav" "$OUT/poc_300.mp4" 2>&1 \
  | grep -E "^encode:|real|maximum resident|peak memory" | tee "$OUT/encode_300.log"

step "6. probe"
"$BIN/probe" "$OUT/poc_300.mp4" --frames | tee "$OUT/probe_300.txt"
"$BIN/probe" "$OUT/poc_300.mp4" --frames --json > "$OUT/probe_300.json"
$PY - "$OUT/probe_300.json" 300 30 10.0 <<'PYEOF'
import json, sys
r = json.load(open(sys.argv[1])); frames = int(sys.argv[2]); fps = float(sys.argv[3]); dur = float(sys.argv[4])
v = [t for t in r["tracks"] if t["media_type"] == "vide"][0]
a = [t for t in r["tracks"] if t["media_type"] == "soun"][0]
checks = [
    ("video codec avc1", v["codec_fourcc"] == "avc1"),
    ("H.264 High profile", v.get("h264_profile") == "High"),
    ("1920x1080", (v["width"], v["height"]) == (1920, 1080)),
    ("square pixels", v["pixel_aspect_ratio"] == "1:1"),
    ("30 fps nominal", abs(v["nominal_fps"] - fps) < 0.01),
    ("constant frame rate", v["constant_frame_rate"] is True),
    ("sample count %d" % frames, v["sample_count"] == frames),
    ("keyframe gap <= 2 s", v["max_keyframe_gap_s"] <= 2.0 + 1e-6),
    ("BT.709 tags", v["color_primaries"] == v["color_transfer"] == v["color_matrix"] == "ITU_R_709_2"),
    ("video duration within 0.05 s", abs(v["duration_s"] - dur) <= 0.05),
    ("audio is AAC", a["codec_fourcc"].strip() == "aac"),
    ("audio 48 kHz", a["sample_rate"] == 48000),
    ("audio >= 160 kbit/s", a["estimated_bitrate_bps"] >= 160000),
    ("audio duration within 0.05 s", abs(a["duration_s"] - dur) <= 0.05),
    ("fast start (moov before mdat)", r.get("fast_start") is True),
]
bad = 0
for name, ok in checks:
    print("  %-34s %s" % (name, "PASS" if ok else "FAIL")); bad += 0 if ok else 1
print("probe checks: %d/%d passed" % (len(checks) - bad, len(checks)))
sys.exit(1 if bad else 0)
PYEOF

step "7. grab frames at 0.0 s, 3.5 s, 9.9 s (expected frame numbers 0, 105, 297)"
mkdir -p "$OUT/grabs"
for t in 0.0 3.5 9.9; do "$BIN/grabframe" "$OUT/poc_300.mp4" "$t" "$OUT/grabs/grab_$t.png"; done
$PY "$HERE/compare_frame.py" "$OUT/frames/r_000106.jpg" "$OUT/grabs/grab_3.5.png" "$OUT/frames_meta.json" "$OUT/grabs/cmp_3.5"
"$BIN/yuvpeek" "$OUT/poc_300.mp4" 3.5 1200 620 60 60  1316 620 60 60  1432 620 60 60

step "8. macOS tooling"
rm -rf "$OUT/ql"; mkdir -p "$OUT/ql"
qlmanage -t -s 640 -o "$OUT/ql" "$OUT/poc_300.mp4" 2>&1 | tail -2
ls -la "$OUT/ql"
mdls -name kMDItemContentType -name kMDItemCodecs -name kMDItemDurationSeconds -name kMDItemPixelWidth \
     -name kMDItemPixelHeight -name kMDItemAudioBitRate -name kMDItemVideoBitRate -name kMDItemAudioSampleRate \
     -name kMDItemAudioChannelCount "$OUT/poc_300.mp4" || true
afinfo "$OUT/poc_300.mp4" | grep -E "File type|Data format|estimated duration|bit rate" || true

if [ "${LONG:-0}" = "1" ]; then
  step "9. 7,200 frames (4 minutes): same 300 frames linked 24 times, 240 s audio bed"
  rm -rf "$OUT/frames_7200"; mkdir -p "$OUT/frames_7200"
  $PY - "$OUT" <<'PYEOF'
import json, os, sys
out = sys.argv[1]
for i in range(1, 7201):
    os.symlink(os.path.abspath("%s/frames/r_%06d.jpg" % (out, ((i - 1) % 300) + 1)), "%s/frames_7200/r_%06d.jpg" % (out, i))
cues, t, k = [], 1.0, 0
while t < 236:
    cues.append({"file": "clip%d.wav" % (1 + k % 2), "start_s": t, "gain": 1.0}); t += 5.0; k += 1
json.dump(cues, open(out + "/audio/cues_240.json", "w"), indent=1)
print("linked 7200 frames, %d cues" % len(cues))
PYEOF
  $PY "$ENC/mixwav.py" "$OUT/audio/cues_240.json" 240 "$OUT/audio/mix_240.wav" | tail -1
  /usr/bin/time -l "$BIN/encode" "$OUT/frames_7200" 30 "$OUT/audio/mix_240.wav" "$OUT/poc_7200.mp4" 2>&1 \
    | grep -E "^encode: (done|wrote|audio written|7200)|real|maximum resident|peak memory" | tee "$OUT/encode_7200.log"
  "$BIN/probe" "$OUT/poc_7200.mp4" --frames | tee "$OUT/probe_7200.txt"
  "$BIN/grabframe" "$OUT/poc_7200.mp4" 123.4 "$OUT/grabs/long_123.4.png"
  rm -rf "$OUT/frames_7200"
fi

step "selftest finished"
