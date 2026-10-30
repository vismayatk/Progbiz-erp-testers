#!/usr/bin/env python3
"""mixwav.py - place narration clips on a silent bed and write ONE WAV.

Python 3 standard library only (no numpy, no audioop).

    python3 mixwav.py <cues.json> <total_duration_s> <out.wav> [options]

cues.json is a list (or {"cues": [...]}) of
    {"file": "clip.wav", "start_s": 12.5, "gain": 1.0}

  * every clip must be PCM 16-bit, 48 kHz (mono, or stereo which is
    down-mixed). Convert anything else first:
        afconvert -f WAVE -d LEI16@48000 -c 1 in.aiff out.wav
  * relative clip paths are resolved against the current directory first and
    then against the directory of cues.json
  * each clip gets a linear fade-in and fade-out (default 10 ms)
  * clipping guard: if the summed signal would exceed the ceiling (default
    0.98 of full scale) the WHOLE mix is attenuated by one common factor, so
    nothing is hard-clipped and the relative levels are preserved

Output: WAV, PCM 16-bit, 48 kHz, mono, exactly round(total_duration_s * 48000)
samples long.

Options:
    --fade-ms N      fade length per clip edge in milliseconds (default 10)
    --ceiling F      peak ceiling as a fraction of full scale (default 0.98)
    --report FILE    also write the placement report as JSON
    --strict         treat overlapping or truncated clips as errors
"""

import argparse
import array
import json
import math
import os
import struct
import sys
import wave

RATE = 48000
FULL_SCALE = 32767


def fail(msg):
    sys.stderr.write("mixwav: ERROR: %s\n" % msg)
    sys.exit(1)


def warn(msg):
    sys.stderr.write("mixwav: warning: %s\n" % msg)


def dbfs(peak):
    if peak <= 0:
        return float("-inf")
    return 20.0 * math.log10(peak / float(FULL_SCALE))


def fmt_db(v):
    return "-inf" if v == float("-inf") else "%.2f" % v


def resolve(path, cue_dir):
    if os.path.isabs(path):
        return path
    if os.path.exists(path):
        return os.path.abspath(path)
    alt = os.path.join(cue_dir, path)
    if os.path.exists(alt):
        return os.path.abspath(alt)
    return os.path.abspath(path)


def parse_wav(path):
    """Minimal RIFF/WAVE reader. Returns (channels, rate, bits, format_tag, data bytes).

    Handles plain PCM (format tag 1) and WAVE_FORMAT_EXTENSIBLE (0xFFFE), which
    afconvert writes for some layouts and which the wave module of Python 3.9
    rejects with "unknown format: 65534".
    """
    with open(path, "rb") as fh:
        blob = fh.read()
    if len(blob) < 12 or blob[0:4] != b"RIFF" or blob[8:12] != b"WAVE":
        raise ValueError("not a RIFF/WAVE file")
    pos = 12
    fmt = None
    data = None
    while pos + 8 <= len(blob):
        cid = blob[pos:pos + 4]
        size = struct.unpack_from("<I", blob, pos + 4)[0]
        body = pos + 8
        if cid == b"fmt ":
            if size < 16:
                raise ValueError("short fmt chunk")
            tag, channels, rate, _avg, _align, bits = struct.unpack_from("<HHIIHH", blob, body)
            if tag == 0xFFFE and size >= 40:
                tag = struct.unpack_from("<H", blob, body + 24)[0]
            fmt = (channels, rate, bits, tag)
        elif cid == b"data":
            data = blob[body:min(len(blob), body + size)]
        pos = body + size + (size & 1)
    if fmt is None:
        raise ValueError("no fmt chunk")
    if data is None:
        raise ValueError("no data chunk")
    return fmt[0], fmt[1], fmt[2], fmt[3], data


def read_wav(path):
    """Return (array('h') interleaved samples, channels, rate) of a 16-bit PCM WAV."""
    channels, rate, bits, tag, raw = parse_wav(path)
    if tag != 1:
        raise ValueError("format tag %d is not integer PCM" % tag)
    if bits != 16:
        raise ValueError("%d-bit samples; 16-bit is required" % bits)
    usable = len(raw) - (len(raw) % (2 * channels))
    samples = array.array("h")
    samples.frombytes(raw[:usable])
    if sys.byteorder == "big":
        samples.byteswap()
    return samples, channels, rate


def read_clip(path):
    """Return the clip as array('h') of mono samples at 48 kHz."""
    hint = "convert with: afconvert -f WAVE -d LEI16@48000 -c 1 <in> <out.wav>"
    if not os.path.exists(path):
        fail("clip not found: %s" % path)
    try:
        samples, channels, rate = read_wav(path)
    except (OSError, ValueError, struct.error) as e:
        fail("cannot read %s as 16-bit PCM WAV: %s; %s" % (path, e, hint))
    if rate != RATE:
        fail("%s is %d Hz; %d Hz is required; %s" % (path, rate, RATE, hint))
    if channels not in (1, 2):
        fail("%s has %d channels; mono or stereo is required; %s" % (path, channels, hint))
    if channels == 2:
        left = samples[0::2]
        right = samples[1::2]
        samples = array.array("h", [(a + b) // 2 for a, b in zip(left, right)])
    return samples


def shape_clip(samples, gain, fade_n):
    """Apply gain and linear fades. Returns a list of ints (may exceed 16 bit)."""
    n = len(samples)
    if gain == 1.0:
        out = samples.tolist()
    else:
        out = [int(round(s * gain)) for s in samples]
    f = min(fade_n, n // 2)
    for i in range(f):
        k = i / float(f)
        out[i] = int(round(out[i] * k))
        out[n - 1 - i] = int(round(out[n - 1 - i] * k))
    return out


def main():
    ap = argparse.ArgumentParser(
        description="Place WAV clips on a silent bed (48 kHz mono 16-bit).",
        epilog="cue list: [{\"file\": \"a.wav\", \"start_s\": 12.5, \"gain\": 1.0}, ...]")
    ap.add_argument("cues", help="JSON cue list")
    ap.add_argument("total", type=float, help="total duration of the bed in seconds")
    ap.add_argument("out", help="output WAV")
    ap.add_argument("--fade-ms", type=float, default=10.0)
    ap.add_argument("--ceiling", type=float, default=0.98)
    ap.add_argument("--report", default=None)
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()

    if a.total <= 0:
        fail("total duration must be > 0")
    if not (0.0 < a.ceiling <= 1.0):
        fail("--ceiling must be in (0, 1]")
    if a.fade_ms < 0:
        fail("--fade-ms must be >= 0")

    try:
        with open(a.cues, "r", encoding="utf-8") as fh:
            cues = json.load(fh)
    except (OSError, ValueError) as e:
        fail("cannot read cue list %s: %s" % (a.cues, e))
    if isinstance(cues, dict):
        cues = cues.get("cues")
    if not isinstance(cues, list):
        fail("the cue list must be a JSON array (or an object with a 'cues' array)")

    cue_dir = os.path.dirname(os.path.abspath(a.cues))
    total_n = int(round(a.total * RATE))
    fade_n = int(round(a.fade_ms / 1000.0 * RATE))
    bed = array.array("i", [0]) * total_n
    if bed.itemsize < 4:
        fail("platform int is smaller than 32 bit")

    placed = []
    problems = 0
    for idx, cue in enumerate(cues):
        if not isinstance(cue, dict) or "file" not in cue or "start_s" not in cue:
            fail("cue %d must be an object with 'file' and 'start_s'" % idx)
        try:
            start_s = float(cue["start_s"])
            gain = float(cue.get("gain", 1.0))
        except (TypeError, ValueError):
            fail("cue %d: start_s and gain must be numbers" % idx)
        if start_s < 0:
            fail("cue %d: start_s is negative (%s)" % (idx, start_s))
        if gain < 0:
            fail("cue %d: gain is negative (%s)" % (idx, gain))
        path = resolve(str(cue["file"]), cue_dir)
        samples = read_clip(path)
        src_n = len(samples)
        start_i = int(round(start_s * RATE))
        truncated = False
        if start_i >= total_n:
            warn("cue %d (%s) starts at %.3f s, after the end of the bed (%.3f s); skipped"
                 % (idx, os.path.basename(path), start_s, a.total))
            problems += 1
            continue
        if start_i + src_n > total_n:
            truncated = True
            problems += 1
            warn("cue %d (%s) runs past the end of the bed by %.3f s; truncated (with fade-out)"
                 % (idx, os.path.basename(path), (start_i + src_n - total_n) / float(RATE)))
            samples = samples[: total_n - start_i]
        shaped = shape_clip(samples, gain, fade_n)
        n = len(shaped)
        peak = max(max(shaped), -min(shaped)) if n else 0
        seg = bed[start_i:start_i + n]
        bed[start_i:start_i + n] = array.array("i", [x + y for x, y in zip(seg, shaped)])
        placed.append({
            "index": idx,
            "file": path,
            "start_s": round(start_i / float(RATE), 6),
            "end_s": round((start_i + n) / float(RATE), 6),
            "duration_s": round(n / float(RATE), 6),
            "source_duration_s": round(src_n / float(RATE), 6),
            "start_sample": start_i,
            "end_sample": start_i + n,
            "gain": gain,
            "peak_dbfs": None if peak == 0 else round(dbfs(peak), 2),
            "truncated": truncated,
        })

    overlaps = []
    ordered = sorted(placed, key=lambda p: p["start_sample"])
    for prev, cur in zip(ordered, ordered[1:]):
        if cur["start_sample"] < prev["end_sample"]:
            ov = (prev["end_sample"] - cur["start_sample"]) / float(RATE)
            overlaps.append({"a": prev["index"], "b": cur["index"], "overlap_s": round(ov, 6)})
            problems += 1
            warn("cue %d and cue %d overlap by %.3f s" % (prev["index"], cur["index"], ov))

    if a.strict and problems:
        fail("--strict: %d placement problem(s), nothing written" % problems)

    peak = max(max(bed), -min(bed)) if total_n else 0
    ceiling = int(a.ceiling * FULL_SCALE)
    attenuation_db = 0.0
    if peak > ceiling:
        scale = ceiling / float(peak)
        attenuation_db = 20.0 * math.log10(scale)
        warn("mix peak %d exceeds the ceiling %d; whole mix attenuated by %.2f dB"
             % (peak, ceiling, -attenuation_db))
        bed = array.array("i", [int(round(v * scale)) for v in bed])
        peak = max(max(bed), -min(bed))

    out = array.array("h", [max(-32768, min(32767, v)) for v in bed])
    if sys.byteorder == "big":
        out.byteswap()
    out_dir = os.path.dirname(os.path.abspath(a.out))
    os.makedirs(out_dir, exist_ok=True)
    w = wave.open(a.out, "wb")
    try:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(out.tobytes())
    finally:
        w.close()

    report = {
        "out": os.path.abspath(a.out),
        "sample_rate": RATE,
        "channels": 1,
        "bits": 16,
        "total_samples": total_n,
        "duration_s": round(total_n / float(RATE), 6),
        "fade_ms": a.fade_ms,
        "ceiling": a.ceiling,
        "peak_dbfs": None if peak == 0 else round(dbfs(peak), 2),
        "attenuation_db": round(attenuation_db, 2),
        "clips": placed,
        "overlaps": overlaps,
    }
    if a.report:
        with open(a.report, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)

    for p in placed:
        print("mixwav: clip %2d  %8.3f s -> %8.3f s  (%.3f s)  gain %.2f  peak %s dBFS  %s%s"
              % (p["index"], p["start_s"], p["end_s"], p["duration_s"], p["gain"],
                 "-inf" if p["peak_dbfs"] is None else fmt_db(p["peak_dbfs"]),
                 os.path.basename(p["file"]), "  [TRUNCATED]" if p["truncated"] else ""))
    print("mixwav: wrote %s  %.3f s  %d samples  48000 Hz mono 16-bit  peak %s dBFS  clips %d/%d"
          % (a.out, total_n / float(RATE), total_n,
             "-inf" if peak == 0 else fmt_db(dbfs(peak)), len(placed), len(cues)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
