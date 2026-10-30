#!/bin/sh
# run_test_keynote.sh - regenerate the tech-keynote proof set (music, SFX, test mix with
# the v4 narration, measurements, determinism + default-style regression, AAC listening copies).
# Run from the repo root:  sh scripts/video/audio/run_test_keynote.sh
set -e
D=scripts/video/audio
K=reports/video/beta/audio_v4/music/test_keynote
VOICE=reports/video/beta/build/voice_v4.wav
SECTIONS=25.6,40.3,60.1,81.8,99.5,117.2,143.9,164.7,179.9,206.5
WARM_MD5=3d0149b640cb8c7e2507f0f34ce1d71f   # default (warm) style, --dur 240 --outro-at 232 --lift 25,110,190
mkdir -p "$K"

node $D/make_music.js --style keynote --dur 226 --out $K/music_keynote.wav --outro-at 219.5 --sections $SECTIONS
node $D/make_sfx.js --outdir $K/sfx
node $D/mix.js --voice $VOICE --music $K/music_keynote.wav --sfx $K/events_keynote.json --dur 226 \
  --out $K/mix_keynote.wav --report $K/mix_keynote.report.json
# same mix with a 1 dB deeper duck (report only; the wav is dropped again)
node $D/mix.js --voice $VOICE --music $K/music_keynote.wav --sfx $K/events_keynote.json --dur 226 --duck-db -13 \
  --out $K/mix_keynote_duck13.wav --report $K/mix_keynote_duck13.report.json 2>/dev/null
rm -f $K/mix_keynote_duck13.wav

node $D/analyze.js --in $K/music_keynote.wav --arrangement $K/music_keynote.arrangement.json --json $K/music_keynote.analysis.json
node $D/analyze.js --in $K/mix_keynote.wav --speech --outro-at 219.5 --json $K/mix_keynote.analysis.json > /dev/null
for f in impact sweep tick glass shimmer; do node $D/analyze.js --in $K/sfx/$f.wav --json $K/sfx/$f.analysis.json > /dev/null; done
node $D/verify_mix.js --mix $K/mix_keynote.wav --voice $VOICE --music $K/music_keynote.wav \
  --report $K/mix_keynote.report.json --arrangement $K/music_keynote.arrangement.json --json $K/mix_keynote.verify.json

echo "== determinism (keynote) and regression (default style)"
node $D/make_music.js --style keynote --dur 226 --out $K/_again.wav --outro-at 219.5 --sections $SECTIONS --quiet
A=$(md5 -q $K/music_keynote.wav); B=$(md5 -q $K/_again.wav)
[ "$A" = "$B" ] && echo "keynote render identical twice: $A" || { echo "KEYNOTE NOT DETERMINISTIC $A $B"; exit 1; }
node $D/make_music.js --dur 240 --out $K/_warm.wav --outro-at 232 --lift 25,110,190 --quiet
W=$(md5 -q $K/_warm.wav)
[ "$W" = "$WARM_MD5" ] && echo "default style byte-identical to the earlier test: $W" || { echo "DEFAULT STYLE CHANGED $W (expected $WARM_MD5)"; exit 1; }
rm -f $K/_again.wav $K/_again.arrangement.json $K/_warm.wav $K/_warm.arrangement.json

afconvert -f m4af -d aac -b 192000 $K/mix_keynote.wav $K/mix_keynote.m4a
afconvert -f m4af -d aac -b 192000 $K/music_keynote.wav $K/music_keynote.m4a
echo "done: $K"
