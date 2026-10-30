#!/usr/bin/python3
"""PoC: print the screencast benchmark matrix (bench_results.jsonl) as a table.
usage: summarize_bench.py reports/video/poc-capture/bench_results.jsonl
"""
import json, sys

rows = []
for line in open(sys.argv[1]):
    line = line.strip()
    if not line.startswith('{'):
        continue
    try:
        rows.append(json.loads(line))
    except Exception as e:
        print('unparsable line:', line[:120])

hdr = '%-30s %-14s %-10s %-8s %6s | %-22s %-13s %-13s %-13s | %5s %7s' % (
    'run', 'browser', 'frame', 'format', 'KB/fr', 'anim|static fps(page)', 'scroll', 'typing', 'mouse-move', 'lag', 'frames') + '  load'
print(hdr)
print('-' * len(hdr))
for r in rows:
    if not r.get('ok'):
        print('%-30s FAILED: %s' % (r.get('id'), r.get('error')))
        continue
    ph = {p['name']: p for p in r['phases']}

    def f(name):
        p = ph.get(name)
        if not p:
            return '-'
        return '%.1f (%.0f) g%d' % (p['fps'], p['page_fps'], p['max_gap_ms'])
    first = ph.get('animation') or ph.get('static')
    fmt = r['format'] + (str(r['quality']) if r['format'] == 'jpeg' else '')
    print('%-30s %-14s %-10s %-8s %6d | %-22s %-13s %-13s %-13s | %5.1f %7d' % (
        r['id'].replace('B_', ''), r['browser_version'], '%dx%d' % (r['frame_width'], r['frame_height']), fmt, r['avg_frame_kb'],
        ('%s %.1f (%.0f) g%d' % (first['name'][:4], first['fps'], first['page_fps'], first['max_gap_ms'])),
        f('scroll'), f('typing'), f('mouse-move'), r['stats']['mean_arrival_lag_ms'], r['total_frames']) + ('  %s' % r.get('loadavg_1m', '?')))
print()
print('fps = captured frames per second in that phase; (page) = frames the page itself produced per second')
print('(requestAnimationFrame counter, 0 on the quiet page because the counter only runs with ?sync=1);')
print('gN = longest gap between two captured frames in ms; lag = mean ms between Chrome presenting a frame and Node receiving it.')
