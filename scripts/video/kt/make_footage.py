#!/usr/bin/env python3
"""Cut the footage the KT videos use out of the source screen recordings.

Every clip becomes a compositor "shot": a folder of 1920x1080 JPEG frames plus meta.json
({shot_id, frames: [{file, t_ms}], geometry}). The ERP part of the screen (app_rect, source pixels)
is cropped out of the browser window, scaled to fit 1920x1080 and centred on a dark band colour,
so the compositor never stretches it. t_ms counts from the clip's src_start.

  python3 scripts/video/kt/make_footage.py --clips reports/video/kt/clips.json [--fps 15] [--only id1,id2] [--force]

clips.json: {"clips": [{"id", "src", "src_start", "src_end", "app_rect": [x, y, w, h]}]}
            src = file name inside reports/video/kt/src/
Writes    : reports/video/kt/footage/<id>/f_000001.jpg ... + meta.json
Needs     : an ffmpeg binary (--ffmpeg, or $KT_FFMPEG).
"""
import argparse
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
KT = os.path.join(ROOT, 'reports', 'video', 'kt')
W, H = 1920, 1080
BAND = '0x121110'   # close to the ERP dark theme's page colour


def geometry(rect):
    x, y, w, h = rect
    s = min(W / w, H / h)
    sw, sh = int(round(w * s / 2)) * 2, int(round(h * s / 2)) * 2
    return {'app_rect': rect, 'scale': s, 'out_w': sw, 'out_h': sh, 'ox': (W - sw) // 2, 'oy': (H - sh) // 2}


def band_colours(ff, c):
    """Mean colour of the first and last pixel rows of the ERP area at the clip start: the bands above and below
    the picture continue the app's own header and page colours instead of a flat black."""
    x, y, w, h = c['app_rect']
    out = []
    for yy in (y + 2, y + h - 3):
        raw = subprocess.run([ff, '-v', 'error', '-ss', f"{c['src_start'] + 0.5:.3f}", '-i', os.path.join(KT, 'src', c['src']), '-frames:v', '1',
                              '-vf', f'crop={w - w % 2}:2:{x - x % 2}:{yy - yy % 2},scale=64:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
        px = [raw[i:i + 3] for i in range(0, len(raw), 3)]
        # median per channel: ignores a logo or a button in that row
        med = [sorted(p[k] for p in px)[len(px) // 2] for k in range(3)]
        out.append('0x%02x%02x%02x' % tuple(med))
    return out


def cut(ff, c, fps, force):
    out = os.path.join(KT, 'footage', c['id'])
    meta_path = os.path.join(out, 'meta.json')
    g = geometry(c['app_rect'])
    key = {'src': c['src'], 'src_start': c['src_start'], 'src_end': c['src_end'], 'app_rect': c['app_rect'], 'fps': fps, 'v': 2}
    if not force and os.path.exists(meta_path):
        old = json.load(open(meta_path))
        if old.get('key') == key:
            return f"{c['id']}: up to date"
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.startswith('f_') and f.endswith('.jpg'):
            os.remove(os.path.join(out, f))
    x, y, w, h = c['app_rect']
    top, bottom = band_colours(ff, c)
    g['bands'] = [top, bottom]
    vf = (f"fps={fps},crop={w}:{h}:{x}:{y},scale={g['out_w']}:{g['out_h']}:flags=lanczos,"
          f"pad={W}:{g['out_h'] + (H - g['out_h'] - g['oy'])}:{g['ox']}:0:color={bottom},"
          f"pad={W}:{H}:0:{g['oy']}:color={top}")
    dur = c['src_end'] - c['src_start']
    src = os.path.join(KT, 'src', c['src'])
    subprocess.run([ff, '-v', 'error', '-y', '-ss', f"{c['src_start']:.3f}", '-i', src, '-t', f'{dur:.3f}',
                    '-vf', vf, '-q:v', '2', '-start_number', '1', os.path.join(out, 'f_%06d.jpg')], check=True)
    files = sorted(f for f in os.listdir(out) if f.startswith('f_') and f.endswith('.jpg'))
    frames = [{'file': f, 't_ms': round(i * 1000 / fps, 1)} for i, f in enumerate(files)]
    json.dump({'shot_id': c['id'], 'key': key, 'geometry': g, 'frames': frames}, open(meta_path, 'w'), indent=0)
    return f"{c['id']}: {len(frames)} frames ({dur:.1f} s)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--clips', required=True)
    ap.add_argument('--fps', type=int, default=15)
    ap.add_argument('--only', default='')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--ffmpeg', default=os.environ.get('KT_FFMPEG', 'ffmpeg'))
    a = ap.parse_args()
    clips = json.load(open(a.clips))['clips']
    if a.only:
        keep = set(a.only.split(','))
        clips = [c for c in clips if c['id'] in keep]
    with ThreadPoolExecutor(a.jobs) as ex:
        for line in ex.map(lambda c: cut(a.ffmpeg, c, a.fps, a.force), clips):
            print(line, flush=True)


if __name__ == '__main__':
    main()
