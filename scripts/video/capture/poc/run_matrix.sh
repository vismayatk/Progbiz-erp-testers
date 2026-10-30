#!/bin/sh
# PoC (B): run the screencast benchmark matrix on the local test page. Appends one JSON line per run.
# usage: sh scripts/video/capture/poc/run_matrix.sh
cd "$(dirname "$0")/../../../.." || exit 1
OUT=reports/video/poc-capture/bench_results.jsonl
: > "$OUT"
B="node scripts/video/capture/poc/bench_screencast.js"
run() { echo ">> $*"; $B "$@" 2>&1 | tail -1 >> "$OUT"; }
for fl in shell chromium chrome; do
  run --id B_${fl}_dsf2_jpeg95_busy   --flavor $fl --dsf 2 --format jpeg --quality 95  --page busy
  run --id B_${fl}_dsf2_jpeg95_quiet  --flavor $fl --dsf 2 --format jpeg --quality 95  --page quiet
  run --id B_${fl}_dsf2_png_busy      --flavor $fl --dsf 2 --format png                --page busy
  run --id B_${fl}_dsf1_jpeg95_busy   --flavor $fl --dsf 1 --format jpeg --quality 95  --page busy
done
run --id B_shell_dsf2_jpeg100_busy    --flavor shell --dsf 2 --format jpeg --quality 100 --page busy
run --id B_shell_dsf2_jpeg100_quiet   --flavor shell --dsf 2 --format jpeg --quality 100 --page quiet
run --id B_shell_dsf2_png_quiet       --flavor shell --dsf 2 --format png                --page quiet
run --id B_shell_dsf1_jpeg100_busy    --flavor shell --dsf 1 --format jpeg --quality 100 --page busy
run --id B_shell_dsf1_png_busy        --flavor shell --dsf 1 --format png                --page busy
run --id B_shell_dsf1_png_quiet       --flavor shell --dsf 1 --format png                --page quiet
run --id B_shell_dsf1_jpeg95_quiet    --flavor shell --dsf 1 --format jpeg --quality 95  --page quiet
run --id B_shell_dsf2emu_jpeg95_busy  --flavor shell --dsf 2 --format jpeg --quality 95  --page busy --noforce
run --id B_shell_dsf2emu_jpeg95_quiet --flavor shell --dsf 2 --format jpeg --quality 95  --page quiet --noforce
echo "done -> $OUT"
