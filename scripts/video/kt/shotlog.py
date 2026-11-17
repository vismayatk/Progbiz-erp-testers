#!/usr/bin/env python3
"""Authoring aid: a readable log of what appears and disappears on screen in a KT footage clip,
from the clip's OCR samples (privacy_masks.py writes them). Times are clip seconds.

  python3 scripts/video/kt/shotlog.py <clip_id> [--find "Voucher Type"] [--min-len 3]

Without --find: every sample where at least 3 texts appeared or vanished, with the new texts.
With --find: the intervals in which a label is visible and where it is (footage px).
"""
import argparse
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
KT = os.path.join(ROOT, 'reports', 'video', 'kt')
norm = lambda s: re.sub(r'[^a-z0-9ഀ-ൿ]+', '', s.lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('clip')
    ap.add_argument('--find', default=None)
    ap.add_argument('--min-len', type=int, default=3)
    ap.add_argument('--changes', type=int, default=3)
    a = ap.parse_args()
    d = os.path.join(KT, 'footage', a.clip)
    meta = json.load(open(os.path.join(d, 'meta.json')))
    ocr = json.load(open(os.path.join(d, 'ocr_samples.json')))
    tof = {f['file']: f['t_ms'] / 1000 for f in meta['frames']}
    samples = sorted(((tof[f], items) for f, items in ocr.items() if f in tof), key=lambda x: x[0])
    if a.find:
        want = norm(a.find)
        runs, cur = [], None
        for t, items in samples:
            hit = [i for i in items if norm(i['text']) == want or (norm(i['text']).startswith(want) and len(norm(i['text'])) <= len(want) + 3)]
            if hit:
                b = hit[0]['box']
                if cur and abs(cur['box'][1] - b[1]) < 6:
                    cur['t1'] = t
                else:
                    cur = {'t0': t, 't1': t, 'box': b}
                    runs.append(cur)
            else:
                cur = None
        for r in runs:
            print(f"{r['t0']:7.1f} - {r['t1']:7.1f}  at {r['box']}")
        if not runs:
            print('not found')
        return
    prev = set()
    for t, items in samples:
        cur = {i['text'].strip() for i in items if len(i['text'].strip()) >= a.min_len}
        new, gone = cur - prev, prev - cur
        if len(new) + len(gone) >= a.changes or not prev:
            show = sorted(new, key=lambda s: -len(s))[:14]
            print(f"{t:7.1f}  +{len(new):<3} -{len(gone):<3} {' | '.join(show)[:300]}")
        prev = cur


if __name__ == '__main__':
    main()
