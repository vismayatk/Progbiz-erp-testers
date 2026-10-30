#!/usr/bin/env python3
"""Authoring aid: when (in SOURCE-recording seconds) and where (footage px) each label is visible in a KT clip.
Matching is the same as build_kt.js locate(): exact, or a prefix with at most 3 extra characters.

  python3 scripts/video/kt/labels.py <clip_id> "Voucher Type" "Party" ...
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
K = os.path.join(ROOT, 'reports', 'video', 'kt', 'footage')
norm = lambda s: re.sub(r'[^a-z0-9ഀ-ൿ]+', '', s.lower())


def runs(clip, label):
    m = json.load(open(f'{K}/{clip}/meta.json'))
    o = json.load(open(f'{K}/{clip}/ocr_samples.json'))
    off = m['key']['src_start']
    tof = {f['file']: f['t_ms'] / 1000 for f in m['frames']}
    want = norm(label)
    out, cur = [], None
    for f in sorted(o, key=lambda k: tof.get(k, 0)):
        if f not in tof:
            continue
        t = tof[f]
        hit = [i for i in o[f] if norm(i['text']) == want or (norm(i['text']).startswith(want) and len(norm(i['text'])) <= len(want) + 3)]
        if hit:
            b = hit[0]['box']
            if cur and t - cur[1] < 0.45 and abs(cur[2][1] - b[1]) < 8:
                cur[1] = t
            else:
                cur = [t, t, b]
                out.append(cur)
    return ' '.join(f"{a + off:.1f}-{b + off:.1f}@{bx[0]},{bx[1]}" for a, b, bx in out[:8]) or '-'


if __name__ == '__main__':
    clip = sys.argv[1]
    for lab in sys.argv[2:]:
        print(f'  {lab:40s} {runs(clip, lab)}')
