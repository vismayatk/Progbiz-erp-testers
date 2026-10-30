#!/bin/sh
# PoC: software compositing versus Metal GPU for the recommended 3840x2160 screencast, plus the transition test.
# Every result line carries the 1-minute load average, because other jobs on the machine change the numbers.
# usage: sh scripts/video/capture/poc/run_final.sh
cd "$(dirname "$0")/../../../.." || exit 1
R=reports/video/poc-capture
: > $R/final_bench.jsonl
: > $R/transition_results.jsonl
GPU="--enable-gpu --use-angle=metal"
B="scripts/video/capture/poc/bench_screencast.js"
T="scripts/video/capture/poc/bench_transition.js"
echo "load before: $(sysctl -n vm.loadavg)"
node $B --id F_sw_dsf2_jpeg95_busy     --flavor shell --dsf 2 --page busy  | tail -1 >> $R/final_bench.jsonl
node $B --id F_sw_dsf2_jpeg95_quiet    --flavor shell --dsf 2 --page quiet | tail -1 >> $R/final_bench.jsonl
node $B --id F_metal_dsf2_jpeg95_busy  --flavor shell --dsf 2 --page busy  --args "$GPU" | tail -1 >> $R/final_bench.jsonl
node $B --id F_metal_dsf2_jpeg95_quiet --flavor shell --dsf 2 --page quiet --args "$GPU" | tail -1 >> $R/final_bench.jsonl
node $B --id F_sw_dsf2_png_busy        --flavor shell --dsf 2 --page busy  --format png | tail -1 >> $R/final_bench.jsonl
node $B --id F_sw_dsf1_jpeg95_busy     --flavor shell --dsf 1 --page busy  | tail -1 >> $R/final_bench.jsonl
for i in 1 2 3; do
  node $T --id T_sw_dsf2_run$i    --flavor shell --dsf 2 > /dev/null
  node $T --id T_metal_dsf2_run$i --flavor shell --dsf 2 --args "$GPU" > /dev/null
done
node $T --id T_sw_dsf1        --flavor shell --dsf 1 > /dev/null
node $T --id T_metal_dsf1     --flavor shell --dsf 1 --args "$GPU" > /dev/null
node $T --id T_sw_dsf2_png    --flavor shell --dsf 2 --format png > /dev/null
node $T --id T_chromium_dsf2  --flavor chromium --dsf 2 > /dev/null
node $T --id T_chrome_dsf2    --flavor chrome --dsf 2 > /dev/null
echo "load after: $(sysctl -n vm.loadavg)"
/usr/bin/python3 scripts/video/capture/poc/summarize_bench.py $R/final_bench.jsonl
echo
/usr/bin/python3 - <<'PY'
import json
print('%-22s %-10s %-44s %6s %8s %6s %6s' % ('transition run', 'frame', 'frames in each 220 ms fade (ideal 13)', 'mean', 'fps', 'lag', 'load'))
for l in open('reports/video/poc-capture/transition_results.jsonl'):
    r = json.loads(l)
    if not r.get('ok'):
        print(r.get('id'), 'FAILED', r.get('error')); continue
    print('%-22s %-10s %-44s %6.1f %8.1f %6s %6s' % (r['id'], r['frame'], r['frames_per_transition'], r['mean_frames_per_transition'], r['fps_during_transition'], r['mean_arrival_lag_ms'], r.get('loadavg_1m')))
PY
