#!/usr/bin/python3
"""
PoC: sharpness / fidelity of each capture method against a lossless ground-truth screenshot.

Region compared: the static data table of the local test page (13 px text, 1 px borders).
Metric (Pillow only): ImageChops.difference + ImageStat -> mean absolute error and RMS error per
channel value (0..255), PSNR derived from the RMS, and "edge energy" (mean of FIND_EDGES on the
luminance) relative to the ground truth: below 100 % = softer than the truth, above = ringing / noise.

usage: sharpness.py <config.json> [out.json]
config = [{ "name", "test", "gt", "compare_at": "native" | "1080" }, ...]
  native : the test frame is resized (Lanczos) to the ground-truth size if it differs, compared at that size
  1080   : test and ground truth are both resized (Lanczos) to 1920x1080 first = what the final video shows
"""
import json, math, os, sys
from PIL import Image, ImageChops, ImageStat, ImageFilter

# table region in CSS pixels of the 1920x1080 viewport (x0, y0, x1, y1)
REGION = (264, 426, 1896, 1040)


def region_of(im):
    s = im.size[0] / 1920.0
    return im.crop((int(REGION[0] * s), int(REGION[1] * s), int(REGION[2] * s), int(REGION[3] * s)))


def edge_energy(im):
    g = im.convert('L').filter(ImageFilter.FIND_EDGES)
    w, h = g.size
    g = g.crop((2, 2, w - 2, h - 2))  # FIND_EDGES produces a border artefact
    return ImageStat.Stat(g).mean[0]


def compare(test_path, gt_path, compare_at):
    t = Image.open(test_path).convert('RGB')
    g = Image.open(gt_path).convert('RGB')
    native = '%dx%d' % t.size
    if compare_at == '1080':
        if t.size != (1920, 1080):
            t = t.resize((1920, 1080), Image.LANCZOS)
        if g.size != (1920, 1080):
            g = g.resize((1920, 1080), Image.LANCZOS)
    else:
        if t.size != g.size:
            # a cropped frame (1920x993) is padded, a scaled one is resized
            if abs(t.size[0] / g.size[0] - t.size[1] / g.size[1]) > 0.01:
                canvas = Image.new('RGB', (t.size[0], int(t.size[0] * g.size[1] / g.size[0])), (0, 0, 0))
                canvas.paste(t, (0, 0))
                t = canvas
            if t.size != g.size:
                t = t.resize(g.size, Image.LANCZOS)
    tr, gr = region_of(t), region_of(g)
    diff = ImageChops.difference(tr, gr)
    st = ImageStat.Stat(diff)
    mean = sum(st.mean) / 3.0
    rms = math.sqrt(sum(v * v for v in st.rms) / 3.0)
    psnr = 99.0 if rms == 0 else 20 * math.log10(255.0 / rms)
    # worst pixel
    ext = diff.convert('L').getextrema()
    e_t, e_g = edge_energy(tr), edge_energy(gr)
    return {
        'native_size': native, 'compared_at': '%dx%d' % t.size,
        'mean_abs_err': round(mean, 3), 'rms_err': round(rms, 3), 'psnr_db': round(psnr, 1),
        'max_err_luma': ext[1], 'edge_energy': round(e_t, 2), 'edge_energy_gt': round(e_g, 2),
        'edge_retention_pct': round(100.0 * e_t / e_g, 1) if e_g else None,
    }


def main():
    cfg = json.load(open(sys.argv[1]))
    out = []
    for c in cfg:
        if not os.path.exists(c['test']) or not os.path.exists(c['gt']):
            out.append({'name': c['name'], 'error': 'missing file', 'test': c['test'], 'gt': c['gt']})
            continue
        r = compare(c['test'], c['gt'], c.get('compare_at', 'native'))
        r['name'] = c['name']
        r['test'] = c['test']
        out.append(r)
    hdr = '%-58s %-10s %-10s %8s %8s %8s %6s %9s' % ('method', 'native', 'compared', 'meanAbs', 'RMS', 'PSNR', 'max', 'edges %')
    print(hdr)
    print('-' * len(hdr))
    for r in out:
        if 'error' in r:
            print('%-58s %s (%s)' % (r['name'], r['error'], r['test']))
            continue
        print('%-58s %-10s %-10s %8.3f %8.3f %8.1f %6d %9.1f' % (r['name'], r['native_size'], r['compared_at'], r['mean_abs_err'], r['rms_err'], r['psnr_db'], r['max_err_luma'], r['edge_retention_pct']))
    if len(sys.argv) > 2:
        json.dump(out, open(sys.argv[2], 'w'), indent=1)


if __name__ == '__main__':
    main()
