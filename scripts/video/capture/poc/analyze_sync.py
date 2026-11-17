#!/usr/bin/python3
"""
PoC helper: read the "sync strip" (index.html?sync=1) out of captured frames.

The strip encodes, per page frame, a requestAnimationFrame counter (row 0) and the wall clock in
milliseconds (row 1, low 24 bits). Decoding it from every captured frame tells us
  * how many page frames were dropped or duplicated by the capture method, and
  * whether the frame timestamps in meta.json follow the real time at which the page drew the frame.

usage:  analyze_sync.py <shot_dir_with_meta.json>
        analyze_sync.py --pngdir <dir with out_%06d.png> --fps 25        (recordVideo frames, no meta)
Pillow only (no numpy).
"""
import json, os, sys, glob, statistics
from PIL import Image

CSS_W, CSS_H = 1920, 1080
STRIP_TOP = CSS_H - 24


def decode(path, half=True):
    im = Image.open(path)
    if half and im.format == 'JPEG':
        im.draft('L', (im.size[0] // 2, im.size[1] // 2))
    im = im.convert('L')
    sx = im.size[0] / CSS_W
    sy = sx  # square pixels; a cropped frame (e.g. 1920x993) simply does not contain the strip
    if im.size[1] < (CSS_H - 2) * sy:
        return None
    px = im.load()

    def cell(row, col):
        x = int((col * 10 + 5) * sx)
        y = int((STRIP_TOP + 2 + row * 10 + 5) * sy)
        return px[x, y]

    out = []
    for row in (0, 1):
        white, black = cell(row, 0), cell(row, 1)
        if white - black < 80:
            return None  # reference cells not found
        thr = (white + black) / 2
        v = 0
        for b in range(24):
            if cell(row, 2 + b) > thr:
                v |= (1 << b)
        out.append(v)
    return out  # [raf_counter, ms & 0xffffff]


def summarize(name, recs, have_ts):
    # recs: list of (t_ms or None, raf, ms)
    n = len(recs)
    dup = drop = 0
    dropped_frames = 0
    steps = []
    for i in range(1, n):
        d = recs[i][1] - recs[i - 1][1]
        steps.append(d)
        if d == 0:
            dup += 1
        elif d > 1:
            drop += 1
            dropped_frames += d - 1
    distinct = len(set(r[1] for r in recs))
    span_page_ms = (recs[-1][2] - recs[0][2]) & 0xffffff
    res = {
        'name': name, 'frames_decoded': n, 'distinct_page_frames': distinct, 'duplicate_frames': dup,
        'gaps': drop, 'page_frames_missed': dropped_frames,
        'page_frames_in_span': recs[-1][1] - recs[0][1] + 1,
        'span_s': round(span_page_ms / 1000, 2),
        'distinct_fps': round(distinct / (span_page_ms / 1000), 2) if span_page_ms else None,
        'largest_step_in_page_frames': max(steps) if steps else 0,
    }
    if have_ts:
        errs = []
        offs = []
        for i in range(n):
            offs.append(recs[i][0] - ((recs[i][2] - recs[0][2]) & 0xffffff))
        base = statistics.median(offs)
        errs = [o - base for o in offs]
        res['timestamp_vs_page_clock_ms'] = {
            'median_abs_error': round(statistics.median([abs(e) for e in errs]), 2),
            'p95_abs_error': round(sorted(abs(e) for e in errs)[int(0.95 * (n - 1))], 2),
            'max_abs_error': round(max(abs(e) for e in errs), 2),
        }
    return res


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(2)
    if a[0] == '--pngdir':
        d = a[1]
        files = sorted(glob.glob(os.path.join(d, 'out_*.png')))
        recs, bad = [], 0
        for f in files:
            r = decode(f, half=False)
            if r is None:
                bad += 1
                continue
            recs.append((None, r[0], r[1]))
        res = summarize(os.path.basename(os.path.dirname(d.rstrip('/'))), recs, False)
        res['undecodable'] = bad
        res['files'] = len(files)
        print(json.dumps(res))
        return
    shot = a[0]
    meta = json.load(open(os.path.join(shot, 'meta.json')))
    t_from = float(a[1]) if len(a) > 1 else None
    t_to = float(a[2]) if len(a) > 2 else None
    recs, bad = [], 0
    for fr in meta['frames']:
        if t_from is not None and fr['t_ms'] < t_from:
            continue
        if t_to is not None and fr['t_ms'] > t_to:
            continue
        r = decode(os.path.join(shot, fr['file']))
        if r is None:
            bad += 1
            continue
        recs.append((fr['t_ms'], r[0], r[1]))
    if not recs:
        print(json.dumps({'name': meta['shot_id'], 'error': 'sync strip not found in any frame', 'frames': len(meta['frames'])}))
        return
    res = summarize(meta['shot_id'], recs, True)
    res['undecodable'] = bad
    res['frame_size'] = '%dx%d' % (meta['frame_width'], meta['frame_height'])
    print(json.dumps(res))


if __name__ == '__main__':
    main()
