#!/usr/bin/env python3
"""Read a mixed WAV back and check where the energy starts.

    python3 verify_mix.py <mix.wav> <cues.json> [tolerance_s=0.002]

For every cue it reports
  * the first non-zero sample of the mix at/after the previous clip's end
  * the expected onset  = start_s + leading digital silence of the source clip
  * the RMS in the 50 ms before start_s (must be silent unless clips overlap)
Exit code 0 when every onset is within the tolerance, 1 otherwise.
Standard library only.
"""
import array
import json
import math
import os
import sys


sys.dont_write_bytecode = True  # keep scripts/video/encode free of __pycache__
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from mixwav import read_wav  # noqa: E402  (own RIFF reader, also reads WAVE_FORMAT_EXTENSIBLE)


def read(path):
    a, ch, rate = read_wav(path)
    if ch == 2:
        a = array.array("h", [(x + y) // 2 for x, y in zip(a[0::2], a[1::2])])
    return a, rate, ch


def rms(seg):
    if not len(seg):
        return 0.0
    return math.sqrt(sum(v * v for v in seg) / float(len(seg)))


def first_nonzero(a, lo, hi, thresh=0):
    for i in range(max(0, lo), min(len(a), hi)):
        if abs(a[i]) > thresh:
            return i
    return None


def main():
    mix_path, cue_path = sys.argv[1], sys.argv[2]
    tol = float(sys.argv[3]) if len(sys.argv) > 3 else 0.002
    mix, rate, ch = read(mix_path)
    print("verify_mix: %s  %d Hz  %d ch  %d samples = %.3f s" % (mix_path, rate, ch, len(mix), len(mix) / float(rate)))
    cues = json.load(open(cue_path))
    if isinstance(cues, dict):
        cues = cues["cues"]
    cue_dir = os.path.dirname(os.path.abspath(cue_path))

    ok = True
    prev_end = 0
    for i, c in enumerate(sorted(cues, key=lambda c: c["start_s"])):
        path = c["file"]
        if not os.path.isabs(path) and not os.path.exists(path):
            path = os.path.join(cue_dir, path)
        clip, crate, _ = read(path)
        lead = first_nonzero(clip, 0, len(clip))
        lead = 0 if lead is None else lead
        start_i = int(round(c["start_s"] * rate))
        expected = start_i + lead
        found = first_nonzero(mix, prev_end, len(mix))
        pre = rms(mix[max(prev_end, start_i - int(0.05 * rate)):start_i])
        inside = rms(mix[start_i:start_i + len(clip)])
        if found is None:
            print("  cue %d: NO energy found after %.3f s  -> FAIL" % (i, prev_end / float(rate)))
            ok = False
            continue
        err = (found - expected) / float(rate)
        good = abs(err) <= tol and pre == 0.0
        ok = ok and good
        print("  cue %d: start_s %.3f  clip leading silence %.4f s  expected onset %.4f s  "
              "measured onset %.4f s  error %+.4f s  rms_before %.1f  rms_inside %.1f  -> %s"
              % (i, c["start_s"], lead / float(rate), expected / float(rate), found / float(rate),
                 err, pre, inside, "OK" if good else "FAIL"))
        prev_end = start_i + len(clip)
    tail = rms(mix[prev_end:])
    print("  rms after the last clip: %.1f" % tail)

    print("  energy per 0.5 s window (RMS, 16-bit units):")
    step = rate // 2
    for k in range(0, len(mix), step):
        r = rms(mix[k:k + step])
        print("    %5.1f - %5.1f s  %8.1f  %s" % (k / float(rate), (k + step) / float(rate), r, "#" * int(min(60, r / 100))))
    print("verify_mix: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
