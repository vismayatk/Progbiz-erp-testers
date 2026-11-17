#!/usr/bin/env python3
"""Generate synthetic 1920x1080 test frames for the encoder proof.

    python3 gen_test_frames.py <outDir> [count=300] [fps=30] [nonoise]

Each frame r_%06d.jpg shows
  * a large 0-based frame number and the time it must appear at (n / fps)
  * a moving circle and a moving bar (motion)
  * several lines of fine 12 px text, dark-on-light, light-on-dark and coloured
  * a 12 px line that changes every frame
  * six flat colour patches with known RGB values (colour round-trip check)
  * a block of random noise that changes every frame (loads the rate control)

Needs Pillow only.
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

PATCHES = [
    ("grey128", (128, 128, 128)),
    ("white", (255, 255, 255)),
    ("near_black", (16, 16, 16)),
    ("red", (200, 30, 30)),
    ("green", (30, 160, 60)),
    ("blue", (30, 60, 200)),
]
PATCH_X0, PATCH_Y0, PATCH_SIZE, PATCH_GAP = 1180, 600, 100, 16

FINE_LINES = [
    "Lead #1042  Demo Customer  Source: Website  Stage: Warm  Assigned to: Executive A  Next follow-up: 29 Sep 2026 10:30",
    "The quick brown fox jumps over the lazy dog. 0123456789  il1I|  O0o  rn m  cl d  @#%&  Pipeline Value 12,45,000.00",
    "Today's Follow-ups 14   Delayed 3   Upcoming Activities 27   Win rate 38.5%   Conversion rate 21.2%   Lost rate 9.4%",
    "Search & Filter: status = Hot, owner = any, created between 01/09/2026 and 29/09/2026, sorted by last activity (desc)",
]


def font(path, size):
    return ImageFont.truetype(path, size)


def build_base():
    img = Image.new("RGB", (W, H), (244, 246, 250))
    d = ImageDraw.Draw(img)
    # header bar
    d.rectangle([0, 0, W, 64], fill=(24, 46, 84))
    d.text((24, 18), "ENCODER PROOF  -  synthetic test pattern  -  1920 x 1080", font=font(ARIAL_BOLD, 26), fill=(255, 255, 255))

    f12 = font(ARIAL, 12)
    # light panel: dark text on white
    d.rectangle([40, 600, 1140, 720], fill=(255, 255, 255), outline=(200, 205, 215))
    d.text((52, 606), "12 px dark on white", font=font(ARIAL_BOLD, 12), fill=(90, 90, 90))
    for i, line in enumerate(FINE_LINES):
        d.text((52, 626 + i * 20), line, font=f12, fill=(20, 20, 20))
    # dark panel: light text on dark
    d.rectangle([40, 740, 1140, 860], fill=(28, 32, 44))
    d.text((52, 746), "12 px light on dark", font=font(ARIAL_BOLD, 12), fill=(170, 170, 170))
    for i, line in enumerate(FINE_LINES):
        d.text((52, 766 + i * 20), line, font=f12, fill=(235, 235, 235))
    # coloured text (hard case for 4:2:0 chroma)
    d.rectangle([40, 880, 1140, 960], fill=(255, 255, 255), outline=(200, 205, 215))
    d.text((52, 886), "12 px coloured", font=font(ARIAL_BOLD, 12), fill=(90, 90, 90))
    d.text((52, 906), FINE_LINES[0], font=f12, fill=(200, 30, 30))
    d.text((52, 926), FINE_LINES[2], font=f12, fill=(30, 60, 200))

    # colour patches
    for i, (name, rgb) in enumerate(PATCHES):
        x = PATCH_X0 + i * (PATCH_SIZE + PATCH_GAP)
        d.rectangle([x, PATCH_Y0, x + PATCH_SIZE - 1, PATCH_Y0 + PATCH_SIZE - 1], fill=rgb)
        d.text((x, PATCH_Y0 + PATCH_SIZE + 4), "%s %d,%d,%d" % ((name,) + rgb), font=font(ARIAL, 11), fill=(40, 40, 40))

    # 1 px line grid (sharpness)
    for k in range(0, 200, 4):
        d.line([1180 + k, 760, 1180 + k, 860], fill=(0, 0, 0))
        d.line([1400, 760 + k // 2, 1600, 760 + k // 2], fill=(0, 0, 0)) if k % 8 == 0 else None
    return img


def main():
    out = sys.argv[1]
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 300
    fps = float(sys.argv[3]) if len(sys.argv) > 3 else 30.0
    with_noise = not (len(sys.argv) > 4 and sys.argv[4] == "nonoise")
    os.makedirs(out, exist_ok=True)
    base = build_base()
    big = font(ARIAL_BOLD, 200)
    mid = font(ARIAL_BOLD, 44)
    f12 = font(ARIAL, 12)

    for n in range(count):
        img = base.copy()
        d = ImageDraw.Draw(img)
        t = n / fps
        d.text((60, 90), "FRAME %04d" % n, font=big, fill=(18, 28, 60))
        d.text((64, 320), "t = %.3f s   file r_%06d.jpg   (%d of %d)" % (t, n + 1, n + 1, count), font=mid, fill=(40, 60, 110))
        d.text((64, 384), "frame %04d  changing 12 px line: shown at %.4f s, 0-based index %d, checksum %08d"
               % (n, t, n, (n * 2654435761) % 100000000), font=f12, fill=(20, 20, 20))

        # moving circle along a sine path
        cx = 120 + int((W - 240) * (n / max(1, count - 1)))
        cy = 500 + int(60 * math.sin(n / 12.0))
        d.ellipse([cx - 46, cy - 46, cx + 46, cy + 46], fill=(235, 120, 20), outline=(120, 50, 0), width=4)
        # moving vertical bar
        bx = 1180 + (n * 7) % 600
        d.rectangle([bx, 420, bx + 18, 560], fill=(20, 150, 140))

        # changing noise block (worst case for the rate control; "nonoise" skips it)
        if with_noise:
            noise = Image.frombytes("RGB", (320, 180), os.urandom(320 * 180 * 3))
            img.paste(noise, (1560, 880))

        img.save(os.path.join(out, "r_%06d.jpg" % (n + 1)), "JPEG", quality=95, subsampling=0)

    meta = {
        "count": count, "fps": fps, "width": W, "height": H,
        "patches": [
            {"name": name, "rgb": list(rgb),
             "box": [PATCH_X0 + i * (PATCH_SIZE + PATCH_GAP), PATCH_Y0,
                     PATCH_X0 + i * (PATCH_SIZE + PATCH_GAP) + PATCH_SIZE, PATCH_Y0 + PATCH_SIZE]}
            for i, (name, rgb) in enumerate(PATCHES)
        ],
    }
    with open(os.path.join(out.rstrip("/") + "_meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    print("gen_test_frames: wrote %d frames to %s" % (count, out))


if __name__ == "__main__":
    main()
