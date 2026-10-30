#!/usr/bin/env python3
"""Privacy masks for the KT footage: OCR every clip (5 samples per second) and blur what must not be shown.

Masked: phone numbers (10+ digits), e-mail addresses, and every text that matches a term in
reports/video/kt/privacy_terms.json ({"terms": ["Biju ummer", ...], "regex": ["..."]}, case-insensitive;
a term matches when it is contained in an OCR line). A detection becomes a blur rectangle that lasts
from 0.35 s before to 0.35 s after it was seen; repeated sightings at about the same place are merged.

  python3 scripts/video/kt/privacy_masks.py [--only id1,id2] [--step 3]

Reads : reports/video/kt/footage/<id>/f_*.jpg + meta.json
Writes: reports/video/kt/footage/<id>/masks.json ({"masks": [{"t0", "t1", "rect", "text"}]}, clip seconds, footage px)
        reports/video/kt/footage/<id>/ocr_samples.json (cache)
Needs : the Vision OCR helper (--ocr, or $KT_OCR).
"""
import argparse
import json
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
KT = os.path.join(ROOT, 'reports', 'video', 'kt')
PHONE = re.compile(r'(?:\+?\d[\d \-]{8,}\d)')
EMAIL = re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+')


def load_terms():
    p = os.path.join(KT, 'privacy_terms.json')
    d = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    terms = [t.lower() for t in d.get('terms', []) if t.strip()]
    rx = [re.compile(r, re.I) for r in d.get('regex', [])]
    keep = [re.compile(r, re.I) for r in d.get('never_mask', [])]
    return terms, rx, keep


def sensitive(text, terms, rx, keep):
    if any(k.search(text) for k in keep):
        return False
    digits = re.sub(r'\D', '', text)
    for m in PHONE.finditer(text):
        if len(re.sub(r'\D', '', m.group())) >= 10:
            return True
    if len(digits) >= 10 and len(digits) <= 13 and not re.search(r'[.,]\d\d\b', text):
        return True
    if EMAIL.search(text):
        return True
    low = text.lower()
    if any(t in low for t in terms):
        return True
    return any(r.search(text) for r in rx)


def iou(a, b):
    ax1, ay1, ax2, ay2 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx1, by1, bx2, by2 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    iw, ih = max(0, min(ax2, bx2) - max(ax1, bx1)), max(0, min(ay2, by2) - max(ay1, by1))
    inter = iw * ih
    u = a[2] * a[3] + b[2] * b[3] - inter
    return inter / u if u else 0


def run(ocr, cid, step, terms, rx, keep, force):
    d = os.path.join(KT, 'footage', cid)
    meta = json.load(open(os.path.join(d, 'meta.json')))
    frames = meta['frames'][::step]
    cache = os.path.join(d, 'ocr_samples.json')
    samples = json.load(open(cache)) if os.path.exists(cache) and not force else {}
    need = [f for f in frames if f['file'] not in samples]
    for i in range(0, len(need), 40):
        batch = need[i:i + 40]
        tmp = os.path.join(d, '_ocr_tmp.json')
        subprocess.run([ocr, tmp] + [os.path.join(d, f['file']) for f in batch], check=True, capture_output=True)
        samples.update(json.load(open(tmp)))
        os.remove(tmp)
    json.dump(samples, open(cache, 'w'))
    dt = step / 15.0
    open_m = []
    done = []
    for f in frames:
        t = f['t_ms'] / 1000
        hits = []
        for it in samples.get(f['file'], []):
            if sensitive(it['text'], terms, rx, keep):
                x, y, w, h = it['box']
                hits.append(([x - 8, y - 6, w + 16, h + 12], it['text']))
        for r, text in hits:
            for m in open_m:
                if iou(m['rect'], r) > 0.35 and t - m['t1'] <= dt * 2.5:
                    m['t1'] = t
                    m['rect'] = [min(m['rect'][0], r[0]), min(m['rect'][1], r[1]),
                                 max(m['rect'][0] + m['rect'][2], r[0] + r[2]) - min(m['rect'][0], r[0]),
                                 max(m['rect'][1] + m['rect'][3], r[1] + r[3]) - min(m['rect'][1], r[1])]
                    break
            else:
                open_m.append({'t0': t, 't1': t, 'rect': r, 'text': text})
        still = []
        for m in open_m:
            (still if t - m['t1'] <= dt * 2.5 else done).append(m)
        open_m = still
    done += open_m
    masks = [{'t0': round(max(0, m['t0'] - 0.35), 3), 't1': round(m['t1'] + 0.35, 3), 'rect': m['rect'], 'text': m['text']} for m in done]
    json.dump({'masks': masks}, open(os.path.join(d, 'masks.json'), 'w'), indent=0, ensure_ascii=False)
    return f'{cid}: {len(frames)} samples, {len(masks)} masks'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--step', type=int, default=3)
    ap.add_argument('--jobs', type=int, default=6)
    ap.add_argument('--force', action='store_true', help='redo the OCR (the mask rules always rerun)')
    ap.add_argument('--ocr', default=os.environ.get('KT_OCR', 'ocr'))
    a = ap.parse_args()
    terms, rx, keep = load_terms()
    ids = sorted(x for x in os.listdir(os.path.join(KT, 'footage')) if os.path.exists(os.path.join(KT, 'footage', x, 'meta.json')))
    if a.only:
        ids = [i for i in ids if i in set(a.only.split(','))]
    with ThreadPoolExecutor(a.jobs) as ex:
        for line in ex.map(lambda c: run(a.ocr, c, a.step, terms, rx, keep, a.force), ids):
            print(line, flush=True)


if __name__ == '__main__':
    main()
