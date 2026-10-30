#!/usr/bin/env python3
"""Contact sheet of rendered frames, for reviewing motion without a video player.

  /usr/bin/python3 scripts/video/compose/contact_sheet.py <framesDir> <out.jpg> <first> <last> [step] [cols] [--crop x,y,w,h] [--width px]

  first/last are 1-based frame numbers (r_000001.jpg = frame 1 = t 0).
  --crop cuts the same region out of every frame (full-resolution detail check).
Needs only Pillow, which is already on this machine.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont


def main():
    args = [a for a in sys.argv[1:]]
    crop = None
    width = 480
    if '--crop' in args:
        i = args.index('--crop')
        crop = tuple(int(v) for v in args[i + 1].split(','))
        del args[i:i + 2]
    if '--width' in args:
        i = args.index('--width')
        width = int(args[i + 1])
        del args[i:i + 2]
    if len(args) < 4:
        print(__doc__)
        sys.exit(2)
    frames_dir, out, first, last = args[0], args[1], int(args[2]), int(args[3])
    step = int(args[4]) if len(args) > 4 else 1
    cols = int(args[5]) if len(args) > 5 else 4
    nums = list(range(first, last + 1, step))
    tiles = []
    for n in nums:
        p = os.path.join(frames_dir, 'r_%06d.jpg' % n)
        if not os.path.exists(p):
            print('missing', p)
            continue
        im = Image.open(p).convert('RGB')
        if crop:
            x, y, w, h = crop
            im = im.crop((x, y, x + w, y + h))
        if im.width != width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        tiles.append((n, im))
    if not tiles:
        sys.exit('no frames found')
    tw, th = tiles[0][1].size
    pad, label = 8, 22
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (tw + pad) + pad, rows * (th + label + pad) + pad), (24, 26, 32))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 15)
    except Exception:
        font = ImageFont.load_default()
    for i, (n, im) in enumerate(tiles):
        x = pad + (i % cols) * (tw + pad)
        y = pad + (i // cols) * (th + label + pad)
        d.text((x + 2, y + 2), 'f%d  t=%.3fs' % (n, (n - 1) / 30.0), fill=(235, 238, 245), font=font)
        sheet.paste(im, (x, y + label))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    sheet.save(out, quality=92)
    print('wrote', out, sheet.size, '%d frames' % len(tiles))


if __name__ == '__main__':
    main()
