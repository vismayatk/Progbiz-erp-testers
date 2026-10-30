#!/usr/bin/python3
"""
PoC: measure the delay between a logged mouse-move event and the frame that shows its effect.
Needs a capture made with the BAKED DOM cursor (prove_capture.js --cursor baked): the arrow is found
in each frame (near-black, neutral pixels) and matched to the logged pointer path.
usage: cursor_latency.py <shot_dir>
"""
import json, os, sys, statistics
from PIL import Image

shot = sys.argv[1]
m = json.load(open(os.path.join(shot, 'meta.json')))
moves = [e for e in m['events'] if e['type'] == 'move']
frames = m['frames']
s = m['frame_width'] / m['css_width']


def find_cursor(path, near):
    im = Image.open(path)
    im.draft('RGB', (im.size[0] // 2, im.size[1] // 2))
    im = im.convert('RGB')
    k = im.size[0] / m['css_width']
    # search window of +-160 css px around the logged position
    x0 = max(0, int((near[0] - 160) * k)); y0 = max(0, int((near[1] - 160) * k))
    x1 = min(im.size[0], int((near[0] + 160) * k)); y1 = min(im.size[1], int((near[1] + 160) * k))
    px = im.crop((x0, y0, x1, y1)).load()
    xs, ys = [], []
    for y in range(0, y1 - y0):
        for x in range(0, x1 - x0):
            r, g, b = px[x, y]
            if r < 36 and g < 36 and b < 36 and abs(b - r) < 8:
                xs.append(x); ys.append(y)
    if len(xs) < 40:
        return None
    # the tip of the arrow is its top-left corner: path starts at (5,3) inside the 28 px box, tip offset compensated by the script
    return ((x0 + min(xs)) / k, (y0 + min(ys)) / k)


lat = []
checked = 0
for f in frames:
    # only frames while the pointer is travelling
    prior = [e for e in moves if e['t_ms'] <= f['t_ms']]
    if not prior:
        continue
    last = prior[-1]
    if f['t_ms'] - last['t_ms'] > 25:
        continue
    checked += 1
    pos = find_cursor(os.path.join(shot, f['file']), (last['x'], last['y']))
    if not pos:
        continue
    # which logged event is closest to the drawn arrow?
    cand = [e for e in moves if f['t_ms'] - 400 <= e['t_ms'] <= f['t_ms']]
    best = min(cand, key=lambda e: (e['x'] - pos[0]) ** 2 + (e['y'] - pos[1]) ** 2)
    err = ((best['x'] - pos[0]) ** 2 + (best['y'] - pos[1]) ** 2) ** 0.5
    if err < 6:
        lat.append(f['t_ms'] - best['t_ms'])
lat.sort()
print(json.dumps({
    'shot': m['shot_id'], 'frames_checked': checked, 'frames_matched': len(lat),
    'latency_ms': {'min': lat[0], 'median': statistics.median(lat), 'p90': lat[int(0.9 * (len(lat) - 1))], 'max': lat[-1]} if lat else None,
}))
