#!/bin/sh
# run_test.sh - regenerate the audio proof set (music, SFX, test mix, measurements,
# AAC listening copies). Run from the repo root:
#   sh scripts/video/audio/run_test.sh
set -e
D=scripts/video/audio
T=reports/video/beta/audio_v4/music/test
VOICE=reports/video/beta/build/voice_v3.wav
if [ ! -f "$VOICE" ]; then VOICE=$(ls reports/video/beta/audio_v3/Samantha/*.wav | head -1); fi
mkdir -p "$T"

node $D/make_music.js --dur 240 --out $T/music_test.wav --outro-at 232 --lift 25,110,190
node $D/make_sfx.js --outdir $T/sfx
node $D/mix.js --voice "$VOICE" --music $T/music_test.wav --sfx $T/events_test.json --dur 240 \
  --out $T/mix_test.wav --report $T/mix_test.report.json

node $D/analyze.js --in $T/music_test.wav --arrangement $T/music_test.arrangement.json --json $T/music_test.analysis.json
node $D/analyze.js --in $T/mix_test.wav --speech --outro-at 232 --json $T/mix_test.analysis.json
for f in whoosh click notify pop riser; do node $D/analyze.js --in $T/sfx/$f.wav --json $T/sfx/$f.analysis.json > /dev/null; done
node $D/verify_mix.js --mix $T/mix_test.wav --voice "$VOICE" --music $T/music_test.wav \
  --report $T/mix_test.report.json --json $T/mix_test.verify.json

afconvert -f m4af -d aac -b 192000 $T/mix_test.wav $T/mix_test.m4a
afconvert -f m4af -d aac -b 192000 $T/music_test.wav $T/music_test.m4a
echo "done: $T"
