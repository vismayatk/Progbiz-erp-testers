#!/usr/bin/env python3
"""Content check of a rendered frame folder (r_000001.jpg ...): counts are not enough, a render can
finish with every file present and still be wrong (a broken canvas gives white or black frames).
Samples frames across the whole video (every second) and fails when a corner pixel is not the
dark-blue background that every Progbiz scene has. Usage: check_frames.py <framesDir> [fps]"""
import os, sys
from PIL import Image
d = sys.argv[1]; fps = int(sys.argv[2]) if len(sys.argv) > 2 else 30
n = len([f for f in os.listdir(d) if f.startswith('r_') and f.endswith('.jpg')])
bad = []
for k in range(1, n + 1, fps):
    im = Image.open(os.path.join(d, 'r_%06d.jpg' % k))
    w, h = im.size
    for p in (im.getpixel((4, 4)), im.getpixel((w - 5, h - 5))):
        if not (p[2] > 55 and p[0] < 45 and p[2] > p[0] + 25):      # dark blue
            bad.append((k, p)); break
print('checked %d frames of %d: %d with a wrong background' % (len(range(1, n + 1, fps)), n, len(bad)))
if bad:
    print('first:', bad[:5]); sys.exit(1)
