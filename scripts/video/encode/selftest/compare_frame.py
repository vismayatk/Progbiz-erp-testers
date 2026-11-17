#!/usr/bin/env python3
"""Compare a frame grabbed from the encoded video with its source frame.

    python3 compare_frame.py <source.jpg> <grab.png> <frames_meta.json> <out_prefix>

Writes
  <out_prefix>_text_2x.png     fine-text crop, source on top, encoded below, 2x nearest-neighbour
  <out_prefix>_lines_4x.png    1 px line grid + coloured text crop, 4x
and prints PSNR (whole frame, and without the noise block) and the mean RGB of
every colour patch next to the expected value. Needs Pillow only.
"""
import json
import math
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def psnr(a, b):
    diff = ImageChops.difference(a, b)
    st = ImageStat.Stat(diff)
    mse = sum(v for v in st.sum2) / float(len(st.sum2) * a.size[0] * a.size[1])
    return float("inf") if mse == 0 else 10.0 * math.log10(255.0 * 255.0 / mse)


def stack(src, enc, box, scale, path):
    a = src.crop(box)
    b = enc.crop(box)
    w, h = a.size
    a = a.resize((w * scale, h * scale), Image.NEAREST)
    b = b.resize((w * scale, h * scale), Image.NEAREST)
    label_h = 26
    out = Image.new("RGB", (w * scale, 2 * (h * scale + label_h)), (255, 255, 0))
    d = ImageDraw.Draw(out)
    f = ImageFont.truetype(FONT, 16)
    d.rectangle([0, 0, w * scale, label_h], fill=(0, 90, 0))
    d.text((8, 4), "SOURCE frame (JPEG q95)  crop %s  x%d" % (box, scale), font=f, fill=(255, 255, 255))
    out.paste(a, (0, label_h))
    y = label_h + h * scale
    d.rectangle([0, y, w * scale, y + label_h], fill=(120, 0, 0))
    d.text((8, y + 4), "ENCODED H.264 frame (grabbed from the MP4)  x%d" % scale, font=f, fill=(255, 255, 255))
    out.paste(b, (0, y + label_h))
    out.save(path)
    print("compare_frame: wrote %s  %dx%d" % (path, out.size[0], out.size[1]))


def main():
    src = Image.open(sys.argv[1]).convert("RGB")
    enc = Image.open(sys.argv[2]).convert("RGB")   # raw code values; the ICC tag is ignored on purpose
    meta = json.load(open(sys.argv[3]))
    prefix = sys.argv[4]
    assert src.size == enc.size == (1920, 1080), (src.size, enc.size)

    print("compare_frame: PSNR whole frame            %.2f dB" % psnr(src, enc))
    a = src.copy()
    b = enc.copy()
    ImageDraw.Draw(a).rectangle([1552, 872, 1888, 1068], fill=(0, 0, 0))
    ImageDraw.Draw(b).rectangle([1552, 872, 1888, 1068], fill=(0, 0, 0))
    print("compare_frame: PSNR without the noise block %.2f dB" % psnr(a, b))
    tb = (40, 596, 1140, 964)
    print("compare_frame: PSNR fine-text panels only   %.2f dB" % psnr(src.crop(tb), enc.crop(tb)))

    worst = 0
    for p in meta["patches"]:
        x0, y0, x1, y1 = p["box"]
        box = (x0 + 20, y0 + 20, x1 - 20, y1 - 20)
        ms = ImageStat.Stat(src.crop(box)).mean
        me = ImageStat.Stat(enc.crop(box)).mean
        err = max(abs(me[i] - p["rgb"][i]) for i in range(3))
        worst = max(worst, err)
        print("  patch %-10s expected %-15s source %-22s encoded %-22s max error %.1f"
              % (p["name"], tuple(p["rgb"]), tuple(round(v, 1) for v in ms), tuple(round(v, 1) for v in me), err))
    print("compare_frame: worst colour patch error %.1f code values (of 255)" % worst)

    stack(src, enc, (40, 600, 800, 700), 2, prefix + "_text_2x.png")
    stack(src, enc, (40, 740, 800, 840), 2, prefix + "_darktext_2x.png")
    stack(src, enc, (40, 880, 440, 945), 4, prefix + "_colourtext_4x.png")
    stack(src, enc, (1176, 756, 1456, 826), 4, prefix + "_lines_4x.png")


if __name__ == "__main__":
    main()
