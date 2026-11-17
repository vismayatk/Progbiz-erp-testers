#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_recording.py - turn a PERSON'S recorded narration into the section audio and the
timing file (cues.json) that the video edit needs.

Python 3 standard library only.  External programs: afconvert, afinfo (part of macOS).
Nothing is downloaded or installed.  The script is read-only input; the recordings are
never modified, everything is written to --out.

Usage (run from the repo root)
------------------------------
    python3 scripts/video/vo/ingest_recording.py \
        --script scripts/video/beta/vo_script_v3.ml.json \
        --in  <folder with one recording per section> \
        --out <folder> [--single <one long recording>] [--overrides overrides.json]

What it does
------------
 1. finds one audio file per section (file name starts with the section number 01..12 or
    contains the section id) and converts it with afconvert to WAV PCM 16-bit 48 kHz mono
 2. cleans it: DC offset removed, leading / trailing silence trimmed (0.15 s of room tone
    kept), speech level brought to -20 dBFS RMS (measured on the voiced parts) under a
    -3 dBFS peak ceiling, short fades at both ends; measures noise floor, clipping, level
 3. finds the pauses and chooses the N-1 pauses that split the section into its N
    sentences: dynamic programming over the candidate pauses, scored by pause length and
    by how well the sentence lengths agree with the text lengths
 4. writes <out>/<section_id>.wav, <out>/cues.json and <out>/report.md

See scripts/video/vo/INGEST.md for the full description.
"""

from __future__ import print_function

import argparse
import array
import bisect
import datetime
import json
import math
import os
import re
import shutil
import subprocess
import sys
import unicodedata
import wave
from operator import mul

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

# --------------------------------------------------------------------------------------
# Audio contract
# --------------------------------------------------------------------------------------
SR = 48000                 # Hz
FRAME = 480                # analysis frame: 480 samples = 10 ms
HOP_S = FRAME / float(SR)
FULL = 32768.0
DIGITAL_SILENCE_DB = -90.0
AUDIO_EXT = (".m4a", ".wav", ".wave", ".mp3", ".aif", ".aiff", ".aifc", ".caf", ".aac",
             ".mp4", ".m4b", ".3gp", ".amr", ".flac")

# --------------------------------------------------------------------------------------
# Parameters (every one can be changed with --set name=value)
# --------------------------------------------------------------------------------------
DEFAULTS = {
    # cleaning
    "room_tone_s": 0.15,            # silence kept before the first / after the last word
    "target_rms_db": -20.0,         # speech level of every delivered section (voiced parts)
    "peak_ceiling_db": -3.0,        # no sample above this in the delivered file
    "max_limit_db": 6.0,            # the peak limiter may take off at most this much
    "fade_in_s": 0.010,
    "fade_out_s": 0.030,
    # warnings
    "noisy_floor_db": -45.0,        # floor of the DELIVERED file above this -> "noisy"
    "quiet_speech_db": -35.0,       # speech level of the SOURCE below this -> "very quiet"
    # pause detection
    "thr_above_floor_db": 8.0,      # silence threshold = noise floor + this ...
    "thr_below_speech_db": 35.0,    # ... but never lower than speech level - this
    "thr_max_below_speech_db": 12.0,  # ... and never higher than speech level - this
    "min_run_s": 0.06,              # shortest stretch that counts as silence at all
    "min_candidate_s": 0.15,        # shortest pause offered to the solver
    "min_pause_s": 0.35,            # a pause shorter than this is "short" (penalised)
    "breath_below_speech_db": 18.0,  # a sound this far below the speech level, between two
    "breath_max_s": 0.8,            # silences and not longer than this, is breath / noise
    "breath_loud_below_speech_db": 5.0,  # a louder one (down to this) is still breath when
    "breath_zcr_per_s": 1500.0,     # it is noise-like: zero-crossing rate above this
    "click_max_s": 0.05,            # any isolated sound shorter than this is a click
    # sentence solver
    "sigma_rel": 0.18,              # tolerated deviation of a sentence from its text share
    "sigma_abs_s": 0.30,
    "w_pause": 8.0,                 # weight of the pause-length term
    "lref_min_s": 0.50,             # pause length that earns the full score: the (N-1)th
    "lref_max_s": 1.00,             # longest pause of the section, kept inside this range
    "short_penalty": 6.0,           # extra cost of a pause of min_candidate_s, fading to 0
                                    # at min_pause_s
    "virtual_penalty": 7.0,         # cost of an ESTIMATED boundary (no usable pause); it is
                                    # reduced when even the longest pauses of the section
                                    # are short (the speaker did not pause between sentences)
    "snap_s": 0.30,                 # an estimated boundary moves to the quietest spot nearby
    "onset_preroll_s": 0.02,        # start_s is this much before the detected onset
    "offset_postroll_s": 0.03,      # end_s is this much after the detected end of speech
    # --single: splitting one long recording into sections
    "single_min_pause_s": 0.6,
    "single_sigma_rel": 0.12,
    "single_sigma_abs_s": 0.50,
    "single_w_pause": 8.0,
    "single_lref_min_s": 1.0,
    "single_lref_max_s": 3.0,
    "single_short_penalty": 6.0,
    "single_virtual_penalty": 8.0,
    "single_pad_s": 0.40,           # audio kept around each section before cleaning
}


def log(msg=""):
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def run(cmd):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError("command failed (%d): %s\n%s" % (
            p.returncode, " ".join(cmd), p.stderr.decode("utf-8", "replace").strip()))
    return p.stdout.decode("utf-8", "replace")


# --------------------------------------------------------------------------------------
# Small numeric helpers
# --------------------------------------------------------------------------------------
def p2db(power):
    """mean-square power (16-bit units) -> dBFS"""
    if power <= 0.0:
        return -120.0
    return max(-120.0, 10.0 * math.log10(power / (FULL * FULL)))


def amp2db(amp):
    if amp <= 0.0:
        return -120.0
    return max(-120.0, 20.0 * math.log10(amp / FULL))


def db2amp(db):
    return FULL * (10.0 ** (db / 20.0))


def pct(sorted_vals, q):
    """q-th percentile (0..100) of an already sorted list."""
    if not sorted_vals:
        return None
    i = int(round((len(sorted_vals) - 1) * q / 100.0))
    return sorted_vals[max(0, min(len(sorted_vals) - 1, i))]


def r3(v):
    return None if v is None else round(v, 3)


def r1(v):
    return None if v is None else round(v, 1)


# --------------------------------------------------------------------------------------
# WAV / afconvert
# --------------------------------------------------------------------------------------
def afinfo(path):
    out = run(["afinfo", path])
    d = {}
    m = re.search(r"File type ID:\s+(\S+)", out)
    d["file_type"] = m.group(1) if m else None
    m = re.search(r"Data format:\s+(\d+) ch,\s+(\d+) Hz,\s+(.*)", out)
    if m:
        d["channels"] = int(m.group(1))
        d["rate"] = int(m.group(2))
        d["fmt"] = m.group(3).strip()
    m = re.search(r"estimated duration:\s+([0-9.]+) sec", out)
    d["duration_s"] = float(m.group(1)) if m else None
    return d


def to_wav(src, dst, channels=None):
    """Any format afconvert can read -> WAV PCM 16-bit 48 kHz mono.  A stereo or
    multi-channel source is mixed down (--mix); afconvert rejects --mix on a mono source."""
    if channels is None:
        channels = afinfo(src).get("channels") or 1
    cmd = ["afconvert", "-f", "WAVE", "-d", "LEI16@%d" % SR, "-c", "1"]
    if channels > 1:
        cmd.append("--mix")
    cmd += ["--src-complexity", "bats", "-r", "127", src, dst]
    run(cmd)


def read_wav(path):
    """WAV PCM 16-bit 48 kHz mono -> array('h').  Own RIFF reader: afconvert writes a
    WAVE_FORMAT_EXTENSIBLE header (format tag 65534) for some sources, which the wave
    module of Python 3.9 refuses."""
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("%s: not a RIFF/WAVE file" % path)
    pos, fmt, pcm = 12, None, None
    while pos + 8 <= len(data):
        cid = data[pos:pos + 4]
        size = int.from_bytes(data[pos + 4:pos + 8], "little")
        body = data[pos + 8:pos + 8 + size]
        if cid == b"fmt ":
            tag = int.from_bytes(body[0:2], "little")
            ch = int.from_bytes(body[2:4], "little")
            rate = int.from_bytes(body[4:8], "little")
            bits = int.from_bytes(body[14:16], "little")
            if tag == 0xFFFE and len(body) >= 40:
                tag = int.from_bytes(body[24:26], "little")     # sub-format GUID head
            fmt = (tag, ch, rate, bits)
        elif cid == b"data":
            pcm = body
        pos += 8 + size + (size & 1)
    if fmt is None or pcm is None:
        raise ValueError("%s: fmt or data chunk missing" % path)
    tag, ch, rate, bits = fmt
    if tag != 1 or bits != 16 or rate != SR or ch != 1:
        raise ValueError("%s: format %d, %d ch / %d Hz / %d-bit, expected PCM 1 ch / %d Hz "
                         "/ 16-bit" % (path, tag, ch, rate, bits, SR))
    a = array.array("h")
    a.frombytes(pcm[: len(pcm) - (len(pcm) % 2)])
    if sys.byteorder == "big":
        a.byteswap()
    return a


def write_wav(path, samples):
    b = samples
    if sys.byteorder == "big":
        b = array.array("h", samples)
        b.byteswap()
    tmp = path + ".tmp"
    w = wave.open(tmp, "wb")
    try:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b.tobytes())
    finally:
        w.close()
    os.replace(tmp, path)


# --------------------------------------------------------------------------------------
# Text
# --------------------------------------------------------------------------------------
def sentence_text(s):
    """A sentence of the script: a string, or an object with "text" (language pack)."""
    if isinstance(s, dict):
        return s.get("text", "")
    return s


def speech_weight(text):
    """How much speaking a text is expected to take, in "spoken characters".

    It is the text length in characters with three refinements, so that the share of a
    sentence inside its section predicts its share of the speaking time a little better:
      * spaces and punctuation count 0 (pauses are taken out of the time axis anyway)
      * a digit counts 3 and a letter of an upper-case abbreviation (ERP, CRM) counts 3,
        because they are spoken as whole words / letter names
      * in Indic scripts the virama (the sign that joins consonants) counts 0 and a
        dependent vowel sign, anusvara or visarga counts 0.5
    Only RATIOS between sentences of the same section are used."""
    w = 0.0
    for tok in re.split(r"\s+", text):
        letters = [c for c in tok if unicodedata.category(c)[0] == "L"]
        abbrev = (2 <= len(letters) <= 5 and
                  all(unicodedata.category(c) == "Lu" for c in letters))
        for c in tok:
            cat = unicodedata.category(c)
            if cat == "Nd":
                w += 3.0
            elif cat[0] == "L":
                w += 3.0 if abbrev else 1.0
            elif cat in ("Mn", "Mc"):
                if unicodedata.combining(c) == 9:       # virama
                    continue
                w += 0.5
    return w


def count_chars(text):
    return len(text)


def count_words(text):
    toks = re.split(u"[\\s—–•]+", text)
    return len([t for t in toks if re.search(r"\w", t, re.U)])


# --------------------------------------------------------------------------------------
# Frame-level view of a recording
# --------------------------------------------------------------------------------------
def frame_powers(a):
    n = len(a) // FRAME
    out = [0.0] * n
    f = float(FRAME)
    for i in range(n):
        fr = a[i * FRAME:(i + 1) * FRAME]
        out[i] = sum(map(mul, fr, fr)) / f
    return out


class Track(object):
    """Levels, silences, sounds and pauses of one recording (10 ms frames)."""

    def __init__(self, a, P):
        self.P = P
        self.a = a
        self.samples = len(a)
        self.duration_s = len(a) / float(SR)
        pw = frame_powers(a)
        n = len(pw)
        self.nf = n
        # 3-frame (30 ms) smoothing of the power
        sm = [0.0] * n
        for i in range(n):
            lo, hi = max(0, i - 1), min(n, i + 2)
            sm[i] = sum(pw[lo:hi]) / (hi - lo)
        self.pw = sm
        self.db = [p2db(x) for x in sm]
        self.silent_file = False
        self._levels()
        self._segment()

    # ---------------------------------------------------------------- levels
    def _levels(self):
        P, db, n = self.P, self.db, self.nf
        if n == 0:
            self.silent_file = True
            self.l95 = self.speech_db = self.floor_db = self.thr_db = -120.0
            self.floor_method = "empty file"
            return
        srt = sorted(db)
        self.l95 = pct(srt, 95)
        vthr = self.l95 - 25.0
        voiced = [p for p, d in zip(self.pw, db) if d >= vthr]
        self.speech_db = p2db(sum(voiced) / len(voiced)) if voiced else -120.0
        self.voiced_thr_db = vthr
        need = max(10, int(0.01 * n))
        quiet = sorted(d for d in db if DIGITAL_SILENCE_DB < d < self.l95 - 30.0)
        digital = sum(1 for d in db if d <= DIGITAL_SILENCE_DB)
        if len(quiet) >= need:
            self.floor_db = pct(quiet, 25)
            self.floor_method = "level of the pauses"
        elif digital >= need:
            self.floor_db = DIGITAL_SILENCE_DB
            self.floor_method = "digital silence"
        else:
            self.floor_db = pct(srt, 5)
            self.floor_method = ("quietest 5 % of the recording (the pauses are less than "
                                 "30 dB below the loudest speech)")
        thr = max(self.floor_db + P["thr_above_floor_db"],
                  self.speech_db - P["thr_below_speech_db"])
        thr = min(thr, self.speech_db - P["thr_max_below_speech_db"])
        self.thr_db = thr
        if self.speech_db < -80.0:
            self.silent_file = True

    # ---------------------------------------------------------------- silences and sounds
    def _segment(self):
        P, db, n = self.P, self.db, self.nf
        self.runs, self.sounds, self.gaps = [], [], []
        self.first_f = self.last_f = None
        self.vcum = [0] * (n + 1)
        if self.silent_file:
            return
        thr = self.thr_db
        silent = [d < thr for d in db]
        # silent runs of at least min_run_s
        min_run = max(1, int(round(P["min_run_s"] / HOP_S)))
        runs, s = [], None
        for i in range(n):
            if silent[i]:
                if s is None:
                    s = i
            elif s is not None:
                if i - s >= min_run:
                    runs.append([s, i])
                s = None
        if s is not None and n - s >= min_run:
            runs.append([s, n])
        # sounds = what lies between the silent runs
        sounds, prev = [], 0
        for (rs, re_) in runs + [[n, n]]:
            if rs > prev:
                seg = db[prev:rs]
                sounds.append({"s": prev, "e": rs, "max_db": max(seg),
                               "edge": prev == 0 or rs == n})
            prev = re_
        click = P["click_max_s"]
        for so in sounds:
            d = (so["e"] - so["s"]) * HOP_S
            if d < click:
                so["kind"] = "click"
            elif (so["max_db"] < self.speech_db - P["breath_below_speech_db"] and
                  d <= P["breath_max_s"]):
                so["kind"] = "breath"
            elif (so["max_db"] < self.speech_db - P["breath_loud_below_speech_db"] and
                  d <= P["breath_max_s"] and
                  self._noise_like(so["s"], so["e"], P["breath_zcr_per_s"])):
                so["kind"] = "breath"           # louder, but noise-like: a breath, not a word
            else:
                so["kind"] = "speech"
        self.runs, self.sounds = runs, sounds
        speech = [so for so in sounds if so["kind"] == "speech"]
        if not speech:
            self.silent_file = True
            return
        self.first_f, self.last_f = speech[0]["s"], speech[-1]["e"]      # [first, last)
        # voiced-time axis: frames that belong to speech sounds
        vc, k = self.vcum, 0
        flag = [0] * n
        for so in speech:
            for i in range(so["s"], so["e"]):
                flag[i] = 1
        for i in range(n):
            k += flag[i]
            vc[i + 1] = k
        self.voiced_frames = k
        # gaps = pauses between two consecutive speech sounds (breaths and clicks that
        # lie inside a pause belong to the pause)
        gaps = []
        for a_, b_ in zip(speech[:-1], speech[1:]):
            g0, g1 = a_["e"], b_["s"]
            quiet = sum(min(re_, g1) - max(rs, g0) for rs, re_ in runs
                        if re_ > g0 and rs < g1)
            inner = [so for so in sounds if so["s"] >= g0 and so["e"] <= g1]
            gaps.append({
                "f0": g0, "f1": g1,
                "t0": g0 * HOP_S, "t1": g1 * HOP_S,
                "length": (g1 - g0) * HOP_S,
                "quiet_s": quiet * HOP_S,
                "breaths": sum(1 for so in inner if so["kind"] == "breath"),
                "clicks": sum(1 for so in inner if so["kind"] == "click"),
                "v": vc[g0] * HOP_S,
            })
        self.gaps = gaps

    def _noise_like(self, f0, f1, zcr_per_s):
        """True when at least 80 % of the 10 ms frames of the sound have a zero-crossing
        rate above zcr_per_s: breath and other noise, as opposed to a word (a vowel has
        a low zero-crossing rate)."""
        a = self.a
        rates = []
        for f in range(f0, f1):
            fr = a[f * FRAME:(f + 1) * FRAME]
            if len(fr) < 2:
                continue
            neg = [x < 0 for x in fr]
            zc = sum(1 for p, q in zip(neg, neg[1:]) if p != q)
            rates.append(zc / HOP_S)
        if not rates:
            return False
        rates.sort()
        return rates[int(0.2 * (len(rates) - 1))] >= zcr_per_s

    # ---------------------------------------------------------------- helpers
    def v_at(self, t):
        """voiced seconds before time t"""
        f = max(0, min(self.nf, int(round(t / HOP_S))))
        return self.vcum[f] * HOP_S

    def time_at_v(self, v):
        """time at which v seconds of speech have been spoken"""
        k = int(round(v / HOP_S))
        k = max(0, min(self.vcum[-1], k))
        f = bisect.bisect_left(self.vcum, k)
        return max(0, min(self.nf, f)) * HOP_S

    def quietest(self, t, radius, lo, hi, win_s=0.05):
        """centre of the quietest win_s window within radius of t, kept inside [lo, hi]"""
        w = max(1, int(round(win_s / HOP_S)))
        f_lo = max(0, int(round(max(lo, t - radius) / HOP_S)))
        f_hi = min(self.nf - w, int(round(min(hi, t + radius) / HOP_S)) - w)
        if f_hi < f_lo:
            return t
        best, best_f = None, None
        for f in range(f_lo, f_hi + 1):
            p = sum(self.pw[f:f + w])
            # prefer, among equally quiet spots, the one nearest to t
            key = (round(p2db(p / w)), abs((f + w / 2.0) * HOP_S - t))
            if best is None or key < best:
                best, best_f = key, f
        return (best_f + w / 2.0) * HOP_S

    def level_at(self, t):
        f = max(0, min(self.nf - 1, int(t / HOP_S)))
        return self.db[f] if self.nf else -120.0


# --------------------------------------------------------------------------------------
# The solver: choose the N-1 boundaries
# --------------------------------------------------------------------------------------
INF = float("inf")


def solve_boundaries(track, weights, P, prefix="", pinned=None, t_start=None, t_end=None):
    """Choose len(weights)-1 boundaries inside the speech of `track`.

    weights  expected share of every unit (sentence or section), any positive numbers
    pinned   {boundary index k (1-based, boundary AFTER unit k): (end_of_k_s, start_of_next_s)}
    Returns a list of boundary dicts, in order."""
    g = lambda name: P[prefix + name]                       # noqa: E731
    n_units = len(weights)
    nb = n_units - 1
    pinned = pinned or {}
    t_first = track.first_f * HOP_S if t_start is None else t_start
    t_last = track.last_f * HOP_S if t_end is None else t_end
    v0 = track.v_at(t_first)
    v_total = track.v_at(t_last) - v0
    if nb <= 0:
        return [], {"candidates": [], "lref_s": None, "lref_raw_s": None, "pause_trust": 1.0,
                    "cost": 0.0, "voiced_s": v_total, "t_first": t_first, "t_last": t_last}
    tw = float(sum(weights)) or 1.0
    exp = [v_total * w / tw for w in weights]               # expected voiced seconds
    cum = [sum(exp[:k]) for k in range(n_units + 1)]

    min_cand = P["min_candidate_s"] if not prefix else 0.5 * g("min_pause_s")
    min_pause = g("min_pause_s")
    real = [gp for gp in track.gaps
            if gp["length"] >= min_cand and gp["t0"] >= t_first and gp["t1"] <= t_last]
    lens = sorted((gp["length"] for gp in real), reverse=True)
    if len(lens) >= nb:
        lref_raw = lens[nb - 1]
    elif lens:
        lref_raw = lens[-1]
    else:
        lref_raw = 0.0
    lref = max(g("lref_min_s"), min(g("lref_max_s"), lref_raw))
    # when even the (N-1)th longest pause of the section is short, the speaker did not
    # pause between the sentences: an estimate by text length becomes the cheaper choice
    trust = (lref_raw - min_cand) / max(1e-6, g("lref_min_s") - min_cand)
    trust = max(0.25, min(1.0, trust))
    virtual_cost = g("virtual_penalty") * trust

    cands = []
    for gp in real:
        short = gp["length"] < min_pause
        cost = g("w_pause") * (1.0 - min(1.0, gp["length"] / lref))
        if short:
            cost += g("short_penalty") * min(1.0, max(0.0, (min_pause - gp["length"]) /
                                                         max(1e-6, min_pause - min_cand)))
        cands.append({"kind": "pause", "t0": gp["t0"], "t1": gp["t1"], "v": gp["v"] - v0,
                      "length": gp["length"], "quiet_s": gp["quiet_s"],
                      "breaths": gp["breaths"], "short": short, "cost": cost, "only": None})
    for k in range(1, nb + 1):
        if k in pinned:
            e, s = pinned[k]
            cands.append({"kind": "manual", "t0": e, "t1": s, "v": track.v_at(e) - v0,
                          "length": max(0.0, s - e), "quiet_s": None, "breaths": 0,
                          "short": False, "cost": 0.0, "only": k})
        else:
            t = track.time_at_v(v0 + cum[k])
            t = max(t_first, min(t_last, t))
            cands.append({"kind": "virtual", "t0": t, "t1": t, "v": cum[k],
                          "length": 0.0, "quiet_s": None, "breaths": 0, "short": False,
                          "cost": virtual_cost, "only": k})
    cands.sort(key=lambda c: (c["t0"], c["t1"], c["kind"] != "pause"))
    m = len(cands)

    s_rel, s_abs = g("sigma_rel"), g("sigma_abs_s")

    def seg(k, d):                                          # unit k (1-based) lasts d
        e = exp[k - 1]
        sig = math.sqrt((s_rel * e) ** 2 + s_abs ** 2)
        if d <= 0.0:
            return 1e6
        return ((d - e) / sig) ** 2

    def allowed(k, j):
        c = cands[j]
        if k in pinned:
            return c["only"] == k and c["kind"] == "manual"
        return c["only"] is None or c["only"] == k

    # forward
    F = [[INF] * m for _ in range(nb + 1)]
    back = [[-1] * m for _ in range(nb + 1)]
    for j in range(m):
        if allowed(1, j):
            F[1][j] = seg(1, cands[j]["v"]) + cands[j]["cost"]
    for k in range(2, nb + 1):
        for j in range(m):
            if not allowed(k, j):
                continue
            cj = cands[j]
            best, bi = INF, -1
            for i in range(m):
                fi = F[k - 1][i]
                if fi == INF:
                    continue
                ci = cands[i]
                if i == j or ci["t1"] > cj["t0"] + 1e-9 or ci["t0"] >= cj["t0"] and i > j:
                    continue
                c = fi + seg(k, cj["v"] - ci["v"])
                if c < best:
                    best, bi = c, i
            if bi >= 0:
                F[k][j] = best + cj["cost"]
                back[k][j] = bi
    # backward (cost of everything after boundary k at candidate j)
    Bk = [[INF] * m for _ in range(nb + 1)]
    for j in range(m):
        if F[nb][j] < INF:
            Bk[nb][j] = seg(n_units, v_total - cands[j]["v"])
    for k in range(nb - 1, 0, -1):
        for i in range(m):
            if F[k][i] == INF:
                continue
            ci = cands[i]
            best = INF
            for j in range(m):
                if Bk[k + 1][j] == INF or not allowed(k + 1, j) or i == j:
                    continue
                cj = cands[j]
                if ci["t1"] > cj["t0"] + 1e-9 or ci["t0"] >= cj["t0"] and i > j:
                    continue
                c = seg(k + 1, cj["v"] - ci["v"]) + cj["cost"] + Bk[k + 1][j]
                if c < best:
                    best = c
            Bk[k][i] = best
    total = [[F[k][j] + Bk[k][j] if F[k][j] < INF and Bk[k][j] < INF else INF
              for j in range(m)] for k in range(nb + 1)]
    best_cost, jbest = INF, -1
    for j in range(m):
        if total[nb][j] < best_cost:
            best_cost, jbest = total[nb][j], j
    if jbest < 0:
        raise RuntimeError("the boundary solver found no solution (this is a bug)")
    chosen = [None] * (nb + 1)
    j = jbest
    for k in range(nb, 0, -1):
        chosen[k] = j
        j = back[k][j]

    # results
    out = []
    for k in range(1, nb + 1):
        c = cands[chosen[k]]
        prev_v = cands[chosen[k - 1]]["v"] if k > 1 else 0.0
        next_v = cands[chosen[k + 1]]["v"] if k < nb else v_total
        d_before, d_after = c["v"] - prev_v, next_v - c["v"]

        def z(kk, d):
            e = exp[kk - 1]
            return (d - e) / math.sqrt((s_rel * e) ** 2 + s_abs ** 2)
        zb, za = z(k, d_before), z(k + 1, d_after)
        # alternatives for this boundary: best total with another candidate here
        alts = []
        for j in range(m):
            if j == chosen[k] or total[k][j] == INF:
                continue
            alts.append((total[k][j], j))
        alts.sort()
        margin = (alts[0][0] - best_cost) if alts else None
        alt_list = []
        for tc, j in alts[:3]:
            a = cands[j]
            alt_list.append({"kind": a["kind"], "pause_start_s": r3(a["t0"]),
                             "pause_end_s": r3(a["t1"]), "pause_s": r3(a["length"]),
                             "extra_cost": round(tc - best_cost, 2)})
        b = {"after": k, "kind": c["kind"], "t0": c["t0"], "t1": c["t1"],
             "length": c["length"], "quiet_s": c["quiet_s"], "breaths": c["breaths"],
             "short": c["short"], "v": c["v"], "expected_v": cum[k],
             "z_before": zb, "z_after": za, "margin": margin, "alternatives": alt_list}
        out.append(b)

    # estimated boundaries: place them between their detected neighbours, in proportion
    # to the text, then move to the quietest spot nearby
    k = 1
    while k <= nb:
        if out[k - 1]["kind"] != "virtual":
            k += 1
            continue
        k2 = k
        while k2 + 1 <= nb and out[k2]["kind"] == "virtual":
            k2 += 1
        va = out[k - 2]["v"] if k > 1 else 0.0
        ta = out[k - 2]["t1"] if k > 1 else t_first
        vb = out[k2]["v"] if k2 < nb else v_total
        tb = out[k2]["t0"] if k2 < nb else t_last
        wsum = float(sum(weights[k - 1:k2 + 1])) or 1.0
        acc = 0.0
        prev_t = ta
        for kk in range(k, k2 + 1):
            acc += weights[kk - 1]
            v = va + (vb - va) * acc / wsum
            t = track.time_at_v(v0 + v)
            t = track.quietest(t, P["snap_s"], prev_t + 0.05, tb - 0.05)
            t = max(prev_t, min(tb, t))
            out[kk - 1].update({"t0": t, "t1": t, "v": track.v_at(t) - v0, "length": 0.0})
            prev_t = t
        k = k2 + 1

    # confidence
    for b in out:
        if b["kind"] == "virtual":
            b["timing"], b["confidence"] = "estimated", 0.15
        elif b["kind"] == "manual":
            b["timing"], b["confidence"] = "manual", 1.0
        else:
            b["timing"] = "detected"
            mg = b["margin"]
            c_margin = 1.0 if mg is None else 1.0 - math.exp(-max(0.0, mg) / 3.0)
            c_len = 0.4 + 0.6 * min(1.0, b["length"] / 0.4)
            # a boundary is suspicious when the sentence before it is too short and the
            # one after it too long (or the other way round)
            zz = min(abs(b["z_before"]), abs(b["z_after"])) \
                if b["z_before"] * b["z_after"] < 0 else 0.0
            c_pos = 1.0 if zz <= 1.5 else math.exp(-((zz - 1.5) ** 2) / 3.0)
            b["confidence"] = round(c_margin * c_len * c_pos, 2)
        c = b["confidence"]
        b["confidence_label"] = "high" if c >= 0.75 else ("medium" if c >= 0.45 else "low")

    info = {
        "lref_s": lref, "lref_raw_s": lref_raw, "pause_trust": trust,
        "cost": best_cost, "voiced_s": v_total,
        "t_first": t_first, "t_last": t_last,
        "candidates": [{"t0": c["t0"], "t1": c["t1"], "length": c["length"],
                        "short": c["short"], "breaths": c["breaths"],
                        "quiet_s": c["quiet_s"]} for c in cands if c["kind"] == "pause"],
    }
    return out, info


# --------------------------------------------------------------------------------------
# Cleaning
# --------------------------------------------------------------------------------------
def clip_stats(a):
    """(samples at or near full scale, longest run of them)"""
    lim = 32700
    hi = max(a) if len(a) else 0
    lo = min(a) if len(a) else 0
    if hi < lim and lo > -lim:
        return 0, 0
    n = longest = cur = 0
    for x in a:
        if x >= lim or x <= -lim:
            n += 1
            cur += 1
            if cur > longest:
                longest = cur
        else:
            cur = 0
    return n, longest


def limit_peaks(f, ceiling):
    """Look-ahead peak limiter on a list of floats, in place.  Only the neighbourhood of
    samples above `ceiling` is touched.  Returns (samples touched, max reduction in dB)."""
    n = len(f)
    blk = 48                                    # 1 ms
    nb = (n + blk - 1) // blk
    req = [1.0] * nb
    hot = []
    for b in range(nb):
        seg = f[b * blk:(b + 1) * blk]
        pk = max(max(seg), -min(seg))
        if pk > ceiling:
            req[b] = ceiling / pk
            hot.append(b)
    if not hot:
        return 0, 0.0
    LOOK, AVG, REL = 4, 3, 40.0                 # ms: look-ahead/hold, smoothing, release
    span = set()
    for b in hot:
        for x in range(max(0, b - LOOK - AVG - 1), min(nb, b + 400)):
            span.add(x)
    span = sorted(span)
    mn = {}
    for b in span:
        lo, hi = max(0, b - LOOK), min(nb, b + LOOK + 1)
        mn[b] = min(req[lo:hi])
    g = {}
    for b in span:
        vals = [mn.get(x, 1.0) for x in range(b - AVG, b + AVG + 1)]
        g[b] = sum(vals) / len(vals)
    # release: the gain recovers exponentially after a peak
    k = math.exp(-1.0 / REL)
    prev_b, prev_g = None, 1.0
    for b in span:
        if prev_b is not None and b == prev_b + 1:
            rec = 1.0 - (1.0 - prev_g) * k
            if rec < g[b]:
                g[b] = rec
        prev_b, prev_g = b, g[b]
    touched, worst = 0, 1.0
    half = blk / 2.0
    for b in span:
        gb = g[b]
        if gb >= 0.99999 and g.get(b - 1, 1.0) >= 0.99999 and g.get(b + 1, 1.0) >= 0.99999:
            continue
        gl, gr = g.get(b - 1, 1.0), g.get(b + 1, 1.0)
        base = b * blk
        for i in range(base, min(n, base + blk)):
            pos = (i - base + 0.5 - half) / blk          # -0.5 .. 0.5 around the centre
            if pos < 0:
                gi = gb + (gl - gb) * (-pos)
            else:
                gi = gb + (gr - gb) * pos
            f[i] *= gi
            if gi < worst:
                worst = gi
            touched += 1
    return touched, -20.0 * math.log10(worst) if worst > 0 else 0.0


def clean(raw, P):
    """raw: array('h') 48 kHz mono.  Returns (cleaned array('h') or None, quality dict,
    warnings list)."""
    q, warn = {}, []
    n = len(raw)
    q["source_duration_s"] = r3(n / float(SR))
    if n < SR // 10:
        warn.append("the recording is shorter than 0.1 s")
        return None, q, warn
    dc = sum(raw) / float(n)
    q["dc_offset"] = round(dc, 1)
    q["dc_offset_dbfs"] = r1(amp2db(abs(dc)))
    pk = max(max(raw), -min(raw))
    q["source_peak_dbfs"] = r1(amp2db(pk))
    nclip, runclip = clip_stats(raw)
    q["source_full_scale_samples"] = nclip
    q["source_longest_full_scale_run"] = runclip
    q["clipped"] = bool(runclip >= 3)
    if q["clipped"]:
        warn.append("CLIPPED: %d samples at full scale, longest run %d samples - record "
                    "again with a lower input level" % (nclip, runclip))

    idc = int(round(dc))
    if idc:
        a0 = array.array("h", [max(-32768, min(32767, x - idc)) for x in raw])
    else:
        a0 = raw
    tr = Track(a0, P)
    if tr.silent_file:
        warn.append("no speech found in the recording")
        q["source_speech_dbfs"] = r1(tr.speech_db)
        return None, q, warn
    q["source_speech_dbfs"] = r1(tr.speech_db)
    q["source_noise_floor_dbfs"] = r1(tr.floor_db)
    q["noise_floor_method"] = tr.floor_method
    q["snr_db"] = r1(tr.speech_db - tr.floor_db)
    if tr.speech_db < P["quiet_speech_db"]:
        warn.append("VERY QUIET: speech level of the source is %.1f dBFS - the gain needed "
                    "also raises the noise; record closer to the microphone" % tr.speech_db)

    # trim, keeping room tone
    room = int(round(P["room_tone_s"] * SR))
    s_on = tr.first_f * FRAME
    s_off = min(n, tr.last_f * FRAME)
    c0, c1 = max(0, s_on - room), min(n, s_off + room)
    q["source_offset_s"] = r3(c0 / float(SR))
    q["head_cut_s"] = r3(c0 / float(SR))
    q["tail_cut_s"] = r3((n - c1) / float(SR))
    q["head_room_s"] = r3((s_on - c0) / float(SR))
    q["tail_room_s"] = r3((c1 - s_off) / float(SR))
    if s_on - c0 < 0.5 * room:
        warn.append("the recording starts only %.2f s before the first word - leave a "
                    "moment of silence before speaking" % ((s_on - c0) / float(SR)))
    if c1 - s_off < 0.5 * room:
        warn.append("the recording stops only %.2f s after the last word - the end of "
                    "the last word may be cut" % ((c1 - s_off) / float(SR)))

    # gain to the target speech level, peak ceiling enforced by a limiter
    gain_db = P["target_rms_db"] - tr.speech_db
    seg = a0[c0:c1]
    pk2 = max(max(seg), -min(seg))
    ceiling = db2amp(P["peak_ceiling_db"])
    over_db = amp2db(pk2) + gain_db - P["peak_ceiling_db"]
    q["gain_limited_by_peak_db"] = 0.0
    if over_db > P["max_limit_db"]:
        cut = over_db - P["max_limit_db"]
        gain_db -= cut
        q["gain_limited_by_peak_db"] = r1(cut)
        warn.append("the peaks are %.1f dB above what the limiter may take off; the section "
                    "is delivered %.1f dB below the target level" % (over_db, cut))
    g = 10.0 ** (gain_db / 20.0)
    q["gain_db"] = r1(gain_db)
    f = [x * g for x in seg]
    touched, red = limit_peaks(f, ceiling - 1.0)
    q["limiter_samples"] = touched
    q["limiter_ms"] = r1(1000.0 * touched / SR)
    q["limiter_max_reduction_db"] = r1(red)
    # fades
    L = len(f)
    k = min(int(P["fade_in_s"] * SR), L // 2)
    for i in range(k):
        f[i] *= i / float(k)
    k = min(int(P["fade_out_s"] * SR), L // 2)
    for i in range(k):
        f[L - 1 - i] *= i / float(k)
    out = array.array("h", [max(-32768, min(32767, int(round(x)))) for x in f])
    return out, q, warn


# --------------------------------------------------------------------------------------
# One section
# --------------------------------------------------------------------------------------
def process_section(sec, raw, P, overrides=None):
    """sec: section of the script; raw: array('h').  Returns (entry dict, cleaned samples)."""
    texts = [sentence_text(s) for s in sec["sentences"]]
    n_sent = len(texts)
    weights = [max(1.0, speech_weight(t)) for t in texts]
    ov = overrides or {}
    entry = {"id": sec["id"], "title": sec.get("title"), "file": "%s.wav" % sec["id"],
             "present": True}
    cleaned, q, warn = clean(raw, P)
    if cleaned is None:
        entry.update({"present": False, "quality": q, "warnings": warn,
                      "note": "recording unusable: " + "; ".join(warn)})
        return entry, None

    tr = Track(cleaned, P)
    q["speech_dbfs"] = r1(tr.speech_db)
    q["noise_floor_dbfs"] = r1(tr.floor_db)
    pk = max(max(cleaned), -min(cleaned))
    q["peak_dbfs"] = r1(amp2db(pk))
    q["silence_threshold_dbfs"] = r1(tr.thr_db)
    q["noisy"] = bool(tr.floor_db > P["noisy_floor_db"])
    if q["noisy"]:
        warn.append("NOISY: noise floor of the delivered file is %.1f dBFS (limit %.0f); "
                    "pauses are harder to find and the noise will be audible" % (
                        tr.floor_db, P["noisy_floor_db"]))
    dur = len(cleaned) / float(SR)
    t_first, t_last = tr.first_f * HOP_S, min(dur, tr.last_f * HOP_S)

    # manual corrections
    pinned, notes = {}, []
    starts = {int(k): float(v) for k, v in (ov.get("sentence_starts") or {}).items()}
    ends = {int(k): float(v) for k, v in (ov.get("sentence_ends") or {}).items()}
    for n_, t in sorted(starts.items()):
        if n_ < 2 or n_ > n_sent:
            warn.append("override ignored: sentence_starts[%d] (the section has sentences "
                        "1..%d and sentence 1 starts where the speech starts)" % (n_, n_sent))
            continue
        if not (t_first < t < t_last):
            warn.append("override ignored: sentence %d start %.2f s is outside the speech "
                        "(%.2f .. %.2f s)" % (n_, t, t_first, t_last))
            continue
        e = ends.get(n_ - 1)
        if e is None:
            # end of the previous sentence = start of the pause that leads up to t
            e = t
            for gp in tr.gaps:
                if gp["t0"] - 0.05 <= t <= gp["t1"] + 0.15:
                    e = min(t, gp["t0"])
                    break
        e = min(e, t)
        pinned[n_ - 1] = (e, t)
        if tr.level_at(t + 0.03) < tr.thr_db and tr.level_at(t + 0.10) < tr.thr_db:
            notes.append("manual start of sentence %d (%.2f s) is followed by silence - "
                         "check the value" % (n_, t))
    for n_, t in sorted(ends.items()):
        if n_ not in [k for k in pinned]:
            warn.append("override ignored: sentence_ends[%d] needs sentence_starts[%d] "
                        "as well" % (n_, n_ + 1))

    bounds, info = solve_boundaries(tr, weights, P, pinned=pinned)

    pre, post = P["onset_preroll_s"], P["offset_postroll_s"]
    sent = []
    for i in range(n_sent):
        if i == 0:
            s, s_t = max(0.0, t_first - pre), "detected"
        else:
            b = bounds[i - 1]
            s = b["t1"] if b["timing"] != "detected" else max(b["t0"], b["t1"] - pre)
            s_t = b["timing"]
        if i == n_sent - 1:
            e, e_t = min(dur, t_last + post), "detected"
        else:
            b = bounds[i]
            e = b["t0"] if b["timing"] != "detected" else min(b["t1"], b["t0"] + post)
            e_t = b["timing"]
        e = max(e, s)
        if "estimated" in (s_t, e_t):
            timing = "estimated"
        elif "manual" in (s_t, e_t):
            timing = "manual"
        else:
            timing = "detected"
        voiced = tr.v_at(e) - tr.v_at(s)
        d = {"n": i + 1, "text": texts[i], "chars": count_chars(texts[i]),
             "words": count_words(texts[i]), "weight": round(weights[i], 1),
             "start_s": r3(s), "duration_s": r3(e - s), "end_s": r3(e),
             "timing": timing, "start_timing": s_t, "end_timing": e_t,
             "speech_s": r3(voiced)}
        sent.append(d)
    for i in range(n_sent - 1):
        sent[i]["pause_after_s"] = r3(sent[i + 1]["start_s"] - sent[i]["end_s"])
    for d in sent:
        if d["duration_s"] < 0.2:
            warn.append("sentence %d is only %.2f s long - its boundaries are certainly "
                        "wrong; correct them with --overrides" % (d["n"], d["duration_s"]))

    # pace check: a sentence spoken much faster or slower than the others
    rates = [(d["weight"] / d["speech_s"]) if d["speech_s"] and d["speech_s"] > 0 else None
             for d in sent]
    ok = sorted(x for x in rates if x)
    med = ok[len(ok) // 2] if ok else None
    for d, x in zip(sent, rates):
        d["pace_vs_section"] = round(x / med, 2) if (x and med) else None
        if n_sent > 1 and d["pace_vs_section"] is not None and \
                (d["pace_vs_section"] > 1.45 or d["pace_vs_section"] < 0.65):
            notes.append("sentence %d is spoken at %.0f %% of the pace of the section - "
                         "check its boundaries (or words were added / left out)" % (
                             d["n"], 100.0 * d["pace_vs_section"]))

    bl = []
    for b in bounds:
        bl.append({
            "after_sentence": b["after"], "timing": b["timing"],
            "pause_start_s": r3(b["t0"]), "pause_end_s": r3(b["t1"]),
            "pause_s": r3(b["length"]),
            "short_pause": bool(b["short"]), "breaths_in_pause": b["breaths"],
            "confidence": b["confidence"], "confidence_label": b["confidence_label"],
            "margin": None if b["margin"] is None else round(b["margin"], 2),
            "expected_speech_before_s": r3(b["expected_v"]),
            "found_speech_before_s": r3(b["v"]),
            "alternatives": b["alternatives"],
        })
        if b["timing"] == "estimated":
            warn.append("ESTIMATED: no usable pause between sentence %d and %d; the "
                        "boundary (%.2f s) is placed by text length" % (
                            b["after"], b["after"] + 1, b["t0"]))
        elif b["timing"] == "detected" and b["confidence_label"] == "low":
            warn.append("LOW CONFIDENCE: boundary between sentence %d and %d at %.2f s "
                        "(pause %.2f s) - listen and correct with --overrides if needed" % (
                            b["after"], b["after"] + 1, b["t1"], b["length"]))
        elif b["timing"] == "detected" and b["short"]:
            notes.append("boundary between sentence %d and %d is on a short pause "
                         "(%.2f s)" % (b["after"], b["after"] + 1, b["length"]))
    usable = len([c for c in info["candidates"] if not c["short"]])
    if usable < n_sent - 1:
        notes.append("%d pauses of at least %.2f s found, %d needed" % (
            usable, P["min_pause_s"], n_sent - 1))
    if n_sent > 1 and info["lref_raw_s"] < P["min_pause_s"]:
        warn.append("NO CLEAR PAUSES: the %d longest pause(s) of the section are only "
                    "%.2f s or shorter - the speaker did not pause between the sentences; "
                    "boundaries are hard to find" % (n_sent - 1, info["lref_raw_s"]))
    longest = max([c["length"] for c in info["candidates"]] or [0.0])
    if longest > 2.5:
        notes.append("a pause of %.1f s inside the section - was the text re-started?" % longest)

    n_est = sum(1 for b in bounds if b["timing"] == "estimated")
    n_man = sum(1 for b in bounds if b["timing"] == "manual")
    confs = [b["confidence"] for b in bounds]
    sec_conf = min(confs) if confs else 1.0
    q.update({
        "duration_s": r3(dur),
        "speech_s": r3(info.get("voiced_s", tr.v_at(t_last) - tr.v_at(t_first))),
        "pauses_found": len(info["candidates"]),
        "pauses_usable": usable,
        "pause_reference_s": r3(info["lref_raw_s"]),
        "pause_trust": round(info["pause_trust"], 2),
        "boundaries_needed": n_sent - 1,
        "boundaries_detected": sum(1 for b in bounds if b["timing"] == "detected"),
        "boundaries_estimated": n_est,
        "boundaries_manual": n_man,
        "confidence": round(sec_conf, 2),
        "confidence_label": "high" if sec_conf >= 0.75 else (
            "medium" if sec_conf >= 0.45 else "low"),
        "warnings": warn,
        "notes": notes,
    })
    entry.update({
        "duration_s": r3(dur),
        "timing": "estimated" if n_est else "detected",
        "words": sum(d["words"] for d in sent),
        "chars": sum(d["chars"] for d in sent),
        "sentences": sent,
        "boundaries": bl,
        "pauses": [{"start_s": r3(c["t0"]), "end_s": r3(c["t1"]), "length_s": r3(c["length"]),
                    "short": bool(c["short"]), "breaths": c["breaths"]}
                   for c in info["candidates"]],
        "quality": q,
    })
    return entry, cleaned


# --------------------------------------------------------------------------------------
# Finding the recordings
# --------------------------------------------------------------------------------------
def norm_name(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def section_number(sec, index):
    m = re.match(r"^0*(\d+)", sec["id"])
    return int(m.group(1)) if m else index + 1


def match_file(name, sections):
    """Index of the section a file name stands for, and the rule that matched, or None.
    The rules, in order: the section id, a leading number, the first number anywhere in
    the name, the name part of the id.  When the two weak rules point at different
    sections (e.g. "leads take2.m4a") the rule is reported as ambiguous."""
    stem = os.path.splitext(name)[0]
    ns = norm_name(stem)
    for i, sec in enumerate(sections):                       # the section id
        nid = norm_name(sec["id"])
        if re.search(r"(^|_)%s($|_)" % re.escape(nid), ns):
            return i, "section id"
    numbers = dict((section_number(s, i), i) for i, s in enumerate(sections))
    m = re.match(r"^\s*0*(\d{1,3})(?!\d)", stem)
    if m and int(m.group(1)) in numbers:                     # leading number
        return numbers[int(m.group(1))], "leading number"
    by_name = None
    for i, sec in enumerate(sections):                       # the name part of the id
        tail = norm_name(re.sub(r"^\d+[_\- ]*", "", sec["id"]))
        if tail and re.search(r"(^|_)%s($|_)" % re.escape(tail), ns):
            by_name = i
            break
    for m in re.finditer(r"(?<!\d)0*(\d{1,3})(?!\d)", stem):  # first number in the name
        if int(m.group(1)) in numbers:
            i = numbers[int(m.group(1))]
            if by_name is not None and by_name != i:
                return i, ("number in the name - AMBIGUOUS, the name also contains '%s'; "
                           "rename the file to start with the section number" %
                           re.sub(r"^\d+[_\- ]*", "", sections[by_name]["id"]))
            return i, "number in the name"
    if by_name is not None:
        return by_name, "section name"
    return None, None


def find_recordings(folder, sections):
    """{section index: {"path", "rule", "others": [...]}}, [ignored files]"""
    found, ignored = {}, []
    for name in sorted(os.listdir(folder)):
        p = os.path.join(folder, name)
        if name.startswith(".") or not os.path.isfile(p):
            continue
        if os.path.splitext(name)[1].lower() not in AUDIO_EXT:
            ignored.append((name, "not an audio file this tool reads"))
            continue
        i, rule = match_file(name, sections)
        if i is None:
            ignored.append((name, "the name does not start with a section number or id"))
            continue
        if i in found:
            # two files for one section: the newer one wins, the other is reported
            old = found[i]
            if os.path.getmtime(p) > os.path.getmtime(old["path"]):
                found[i] = {"path": p, "rule": rule, "others": old["others"] + [old["path"]]}
            else:
                old["others"].append(p)
            continue
        found[i] = {"path": p, "rule": rule, "others": []}
    return found, ignored


# --------------------------------------------------------------------------------------
# --single: one long recording
# --------------------------------------------------------------------------------------
def split_single(raw, sections, P, overrides=None):
    """Returns ([(c0, c1) sample range per section], boundaries, info, warnings)."""
    warn = []
    n = len(raw)
    dc = int(round(sum(raw) / float(max(1, n))))
    a0 = array.array("h", [max(-32768, min(32767, x - dc)) for x in raw]) if dc else raw
    tr = Track(a0, P)
    if tr.silent_file:
        raise RuntimeError("no speech found in the long recording")
    weights = [max(1.0, sum(speech_weight(sentence_text(s)) for s in sec["sentences"]))
               for sec in sections]
    pinned = {}
    ids = [s["id"] for s in sections]
    for sid, t in ((overrides or {}).get("section_starts") or {}).items():
        if sid not in ids:
            warn.append("override ignored: unknown section %r" % sid)
            continue
        k = ids.index(sid)
        t = float(t)
        if k == 0:
            warn.append("override ignored: the first section starts where the speech starts")
            continue
        e = t
        for gp in tr.gaps:
            if gp["t0"] - 0.05 <= t <= gp["t1"] + 0.15:
                e = min(t, gp["t0"])
                break
        pinned[k] = (e, t)
    bounds, info = solve_boundaries(tr, weights, P, prefix="single_", pinned=pinned)
    pad = int(round(P["single_pad_s"] * SR))
    t_first, t_last = tr.first_f * FRAME, min(n, tr.last_f * FRAME)
    ranges = []
    for i in range(len(sections)):
        s = t_first if i == 0 else int(round(bounds[i - 1]["t1"] * SR))
        e = t_last if i == len(sections) - 1 else int(round(bounds[i]["t0"] * SR))
        lo_lim = 0 if i == 0 else int(round(
            (bounds[i - 1]["t0"] + bounds[i - 1]["t1"]) / 2.0 * SR))
        hi_lim = n if i == len(sections) - 1 else int(round(
            (bounds[i]["t0"] + bounds[i]["t1"]) / 2.0 * SR))
        c0 = max(lo_lim, s - pad)
        c1 = min(hi_lim, e + pad)
        ranges.append((c0, max(c0, c1)))
    info["noise_floor_dbfs"] = r1(tr.floor_db)
    info["speech_dbfs"] = r1(tr.speech_db)
    info["duration_s"] = r3(n / float(SR))
    return ranges, bounds, info, warn


# --------------------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------------------
def short(text, n=56):
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[:n - 1].rstrip() + u"…"


def md_escape(s):
    return s.replace("|", "\\|")


def write_report(path, cues, P):
    L = []
    t = cues["totals"]
    L.append("# Narration ingest report")
    L.append("")
    L.append("- generated: %s" % cues["generated_at"])
    L.append("- script: `%s`" % cues["script"])
    inp = cues["input"]
    if inp.get("single"):
        L.append("- input: one long recording `%s`" % inp["single"])
    if inp.get("folder"):
        L.append("- input folder: `%s`" % inp["folder"])
    if cues.get("overrides_file"):
        L.append("- overrides: `%s`" % cues["overrides_file"])
    L.append("- sections found: **%d of %d**" % (t["sections_present"], t["sections_expected"]))
    if cues["missing_sections"]:
        L.append("- **MISSING sections: %s**" % ", ".join(
            "`%s`" % x for x in cues["missing_sections"]))
    L.append("- narration length: %.2f s" % t["duration_s"])
    L.append("- sentence boundaries: %d detected, %d estimated, %d set by hand" % (
        t["boundaries_detected"], t["boundaries_estimated"], t["boundaries_manual"]))
    if t["sections_to_check"]:
        L.append("- **sections to check by ear: %s**" % ", ".join(
            "`%s`" % x for x in t["sections_to_check"]))
    else:
        L.append("- no section is flagged")
    L.append("")
    L.append("All times are seconds inside the delivered section file `<section_id>.wav` "
             "(the cleaned file in this folder), not inside the original recording. "
             "`source offset` is where the delivered file starts inside the original.")
    L.append("")

    sp = cues.get("single_split")
    if sp:
        L.append("## Split of the long recording into sections")
        L.append("")
        L.append("- length %.2f s, speech level %.1f dBFS, noise floor %.1f dBFS" % (
            sp["duration_s"], sp["speech_dbfs"], sp["noise_floor_dbfs"]))
        L.append("- confidence of the split: **%s** (lowest boundary confidence %.2f)" % (
            sp["confidence_label"], sp["confidence"]))
        for w in sp["warnings"]:
            L.append("- WARNING: %s" % w)
        L.append("")
        L.append("| section starts | at (s) | pause before (s) | timing | confidence |")
        L.append("|---|---:|---:|---|---|")
        for b in sp["boundaries"]:
            L.append("| `%s` | %.2f | %.2f | %s | %s (%.2f) |" % (
                b["section"], b["section_start_s"], b["pause_s"], b["timing"],
                b["confidence_label"], b["confidence"]))
        L.append("")

    L.append("## Overview")
    L.append("")
    L.append("| section | source file | length (s) | sentences | timing | confidence | "
             "noise floor (dBFS) | speech (dBFS) | peak (dBFS) | warnings |")
    L.append("|---|---|---:|---:|---|---|---:|---:|---:|---:|")
    for s in cues["sections"]:
        q = s["quality"]
        L.append("| `%s` | %s | %.2f | %d | %s | %s | %.1f | %.1f | %.1f | %d |" % (
            s["id"], md_escape(s.get("source_file") or "-"), s["duration_s"],
            len(s["sentences"]), s["timing"], q["confidence_label"],
            q["noise_floor_dbfs"], q["speech_dbfs"], q["peak_dbfs"], len(q["warnings"])))
    for sid in cues["missing_sections"]:
        L.append("| `%s` | **missing** | - | - | - | - | - | - | - | - |" % sid)
    for s in cues.get("unusable_sections", []):
        L.append("| `%s` | %s | **unusable**: %s | | | | | | | |" % (
            s["id"], md_escape(s.get("source_file") or "-"), md_escape(s.get("note", ""))))
    L.append("")
    if cues["ignored_files"]:
        L.append("Files in the input folder that were not used:")
        L.append("")
        for f in cues["ignored_files"]:
            L.append("- `%s` - %s" % (f["file"], f["reason"]))
        L.append("")

    for s in cues["sections"]:
        q = s["quality"]
        L.append("## %s - %s" % (s["id"], s.get("title") or ""))
        L.append("")
        L.append("- source: `%s` (matched by %s), delivered: `%s`, %.2f s" % (
            s.get("source_file") or "-", s.get("matched_by") or "-", s["file"],
            s["duration_s"]))
        L.append("- source offset %.3f s; cut %.2f s at the start and %.2f s at the end; "
                 "room tone kept %.2f s / %.2f s" % (
                     q["source_offset_s"], q["head_cut_s"], q["tail_cut_s"],
                     q["head_room_s"], q["tail_room_s"]))
        L.append("- source: speech %.1f dBFS, noise floor %.1f dBFS (%s), peak %.1f dBFS, "
                 "DC offset %.1f" % (
                     q["source_speech_dbfs"], q["source_noise_floor_dbfs"],
                     q["noise_floor_method"], q["source_peak_dbfs"], q["dc_offset"]))
        L.append("- delivered: gain %+.1f dB, speech %.1f dBFS, noise floor %.1f dBFS, "
                 "peak %.1f dBFS, limiter touched %.1f ms (max %.1f dB)" % (
                     q["gain_db"], q["speech_dbfs"], q["noise_floor_dbfs"], q["peak_dbfs"],
                     q["limiter_ms"], q["limiter_max_reduction_db"]))
        L.append("- pauses found: %d (%d of at least %.2f s), boundaries needed: %d; "
                 "confidence of the section: **%s** (%.2f)" % (
                     q["pauses_found"], q["pauses_usable"], P["min_pause_s"],
                     q["boundaries_needed"], q["confidence_label"], q["confidence"]))
        if s.get("other_files"):
            L.append("- WARNING: more than one file for this section; not used: %s" % ", ".join(
                "`%s`" % x for x in s["other_files"]))
        for w in q["warnings"]:
            L.append("- WARNING: %s" % w)
        for w in q["notes"]:
            L.append("- note: %s" % w)
        L.append("")
        L.append("| n | start (s) | end (s) | length (s) | timing | pace | text |")
        L.append("|---:|---:|---:|---:|---|---:|---|")
        for d in s["sentences"]:
            L.append("| %d | %.2f | %.2f | %.2f | %s | %s | %s |" % (
                d["n"], d["start_s"], d["end_s"], d["duration_s"], d["timing"],
                "-" if d["pace_vs_section"] is None else "%.0f %%" % (
                    100 * d["pace_vs_section"]),
                md_escape(short(d["text"]))))
        L.append("")
        if s["boundaries"]:
            L.append("| boundary | pause from (s) | to (s) | pause (s) | timing | confidence | "
                     "margin | next best choice |")
            L.append("|---|---:|---:|---:|---|---|---:|---|")
            for b in s["boundaries"]:
                alt = "-"
                if b["alternatives"]:
                    a = b["alternatives"][0]
                    if a["kind"] == "virtual":
                        alt = "estimate at %.2f s (+%.1f)" % (a["pause_start_s"], a["extra_cost"])
                    else:
                        alt = "pause %.2f-%.2f s (+%.1f)" % (
                            a["pause_start_s"], a["pause_end_s"], a["extra_cost"])
                L.append("| %d / %d | %.2f | %.2f | %.2f%s | %s | %s (%.2f) | %s | %s |" % (
                    b["after_sentence"], b["after_sentence"] + 1, b["pause_start_s"],
                    b["pause_end_s"], b["pause_s"],
                    " (breath)" if b["breaths_in_pause"] else "",
                    b["timing"], b["confidence_label"], b["confidence"],
                    "-" if b["margin"] is None else "%.1f" % b["margin"], alt))
            L.append("")
        used = set((b["pause_start_s"], b["pause_end_s"]) for b in s["boundaries"])
        if s["pauses"]:
            items = []
            for p in s["pauses"]:
                mark = "**" if (p["start_s"], p["end_s"]) in used else ""
                items.append("%s%.2f-%.2f (%.2f)%s" % (
                    mark, p["start_s"], p["end_s"], p["length_s"], mark))
            L.append("All pauses of at least %.2f s, from-to (length); the ones used as "
                     "sentence boundaries are bold:" % P["min_candidate_s"])
            L.append("")
            L.append(", ".join(items))
            L.append("")
    with open(path + ".tmp", "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    os.replace(path + ".tmp", path)


# --------------------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------------------
def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, path)


def rel(p):
    if not p:
        return p
    ap = os.path.abspath(p)
    if ap.startswith(REPO_ROOT + os.sep):
        return os.path.relpath(ap, REPO_ROOT)
    return ap


def parse_args(argv):
    ap = argparse.ArgumentParser(
        description="Recorded narration -> cleaned section WAVs + cues.json + report.md")
    ap.add_argument("--script", required=True, help="narration script (vo_script_v3.<lang>.json)")
    ap.add_argument("--in", dest="indir", help="folder with one recording per section")
    ap.add_argument("--out", required=True, help="output folder")
    ap.add_argument("--single", help="one long recording of the whole script")
    ap.add_argument("--overrides", help="JSON file with manual corrections")
    ap.add_argument("--label", default="recording", help="name stored as 'voice' in cues.json")
    ap.add_argument("--set", action="append", default=[], metavar="NAME=VALUE",
                    help="change a parameter, e.g. --set min_pause_s=0.3 (see DEFAULTS)")
    ap.add_argument("--strict", action="store_true",
                    help="exit with status 2 when a section is missing, unusable or estimated")
    ap.add_argument("--quiet", action="store_true")
    return ap.parse_args(argv)


def main(argv=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])
    P = dict(DEFAULTS)
    for item in args.set:
        if "=" not in item:
            sys.exit("ingest: --set needs NAME=VALUE, got %r" % item)
        k, v = item.split("=", 1)
        if k not in P:
            sys.exit("ingest: unknown parameter %r (known: %s)" % (k, ", ".join(sorted(P))))
        P[k] = float(v)
    if not args.indir and not args.single:
        sys.exit("ingest: give --in <folder> or --single <file> (or both)")
    for tool in ("afconvert", "afinfo"):
        if not shutil.which(tool):
            sys.exit("ingest: %s not found (it is part of macOS)" % tool)
    with open(args.script, "r", encoding="utf-8") as fh:
        script = json.load(fh)
    sections = script.get("sections") or []
    if not sections:
        sys.exit("ingest: no sections in %s" % args.script)
    for sec in sections:
        if not sec.get("sentences"):
            sys.exit("ingest: section %s has no sentences" % sec.get("id"))
    overrides = {}
    if args.overrides:
        with open(args.overrides, "r", encoding="utf-8") as fh:
            overrides = json.load(fh)
    ov_sections = overrides.get("sections") or {}
    known = set(s["id"] for s in sections)
    global_warn = []
    for sid in ov_sections:
        if sid not in known:
            global_warn.append("overrides: unknown section %r ignored" % sid)

    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    work = os.path.join(out, ".ingest_tmp")
    os.makedirs(work, exist_ok=True)
    say = (lambda m: None) if args.quiet else log

    # ------------------------------------------------------------ inputs
    raws, meta = {}, {}
    ignored = []
    single_block = None
    if args.single:
        if not os.path.isfile(args.single):
            sys.exit("ingest: %s not found" % args.single)
        say("reading the long recording %s" % args.single)
        info = afinfo(args.single)
        tmp = os.path.join(work, "single.wav")
        to_wav(args.single, tmp, info.get("channels"))
        long_raw = read_wav(tmp)
        os.remove(tmp)
        ranges, sb, sinfo, swarn = split_single(long_raw, sections, P, overrides.get("single"))
        confs = [b["confidence"] for b in sb] or [1.0]
        single_block = {
            "file": rel(args.single), "source_format": info,
            "duration_s": sinfo["duration_s"], "speech_dbfs": sinfo["speech_dbfs"],
            "noise_floor_dbfs": sinfo["noise_floor_dbfs"],
            "confidence": round(min(confs), 2),
            "confidence_label": "high" if min(confs) >= 0.75 else (
                "medium" if min(confs) >= 0.45 else "low"),
            "warnings": swarn, "boundaries": [],
        }
        for b in sb:
            sid = sections[b["after"]]["id"]
            single_block["boundaries"].append({
                "section": sid, "section_start_s": r3(b["t1"]),
                "previous_section_end_s": r3(b["t0"]), "pause_s": r3(b["length"]),
                "timing": b["timing"], "confidence": b["confidence"],
                "confidence_label": b["confidence_label"],
                "margin": None if b["margin"] is None else round(b["margin"], 2),
                "alternatives": b["alternatives"]})
            if b["timing"] == "estimated":
                single_block["warnings"].append(
                    "ESTIMATED: no usable pause before section %s; the cut at %.2f s is "
                    "placed by text length" % (sid, b["t1"]))
            elif b["confidence_label"] == "low":
                single_block["warnings"].append(
                    "LOW CONFIDENCE: start of section %s at %.2f s (pause %.2f s)" % (
                        sid, b["t1"], b["length"]))
        for i, sec in enumerate(sections):
            c0, c1 = ranges[i]
            raws[i] = long_raw[c0:c1]
            meta[i] = {"source_file": rel(args.single), "matched_by": "split of the long recording",
                       "base_offset_s": c0 / float(SR), "others": [], "source_format": None}
        del long_raw
    if args.indir:
        if not os.path.isdir(args.indir):
            sys.exit("ingest: %s is not a folder" % args.indir)
        found, ign = find_recordings(args.indir, sections)
        ignored = [{"file": n, "reason": r} for n, r in ign]
        for i, f in sorted(found.items()):
            tmp = os.path.join(work, "%02d.wav" % i)
            try:
                info = afinfo(f["path"])
                to_wav(f["path"], tmp, info.get("channels"))
                raws[i] = read_wav(tmp)
            except Exception as e:                                  # noqa
                global_warn.append("cannot read %s: %s" % (
                    os.path.basename(f["path"]), str(e).splitlines()[-1]))
                ignored.append({"file": os.path.basename(f["path"]),
                                "reason": "afconvert could not read it"})
                if not (args.single and i in raws):
                    raws.pop(i, None)
                continue
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)
            meta[i] = {"source_file": rel(f["path"]), "matched_by": f["rule"],
                       "base_offset_s": 0.0, "others": [rel(x) for x in f["others"]],
                       "source_format": info}

    # ------------------------------------------------------------ sections
    done, unusable, missing = [], [], []
    for i, sec in enumerate(sections):
        sid = sec["id"]
        if i not in raws:
            missing.append(sid)
            say("  %-16s MISSING" % sid)
            continue
        entry, cleaned = process_section(sec, raws[i], P, ov_sections.get(sid))
        m = meta[i]
        entry["source_file"] = m["source_file"]
        entry["matched_by"] = m["matched_by"]
        entry["source_format"] = m["source_format"]
        if m["others"]:
            entry["other_files"] = m["others"]
        if cleaned is None:
            unusable.append(entry)
            say("  %-16s UNUSABLE: %s" % (sid, entry["note"]))
            continue
        q = entry["quality"]
        if "AMBIGUOUS" in (m["matched_by"] or ""):
            q["warnings"].append("FILE NAME: %s was taken for this section by the %s" % (
                os.path.basename(m["source_file"]), m["matched_by"]))
        elif m["matched_by"] in ("number in the name", "section name"):
            q["notes"].append("the file name %s does not start with the section number; it "
                              "was matched by the %s - make sure it is the right file (a "
                              "default name like 'New Recording 3' carries a counter, not "
                              "the section)" % (os.path.basename(m["source_file"]),
                                                m["matched_by"]))
        q["source_offset_s"] = r3(q["source_offset_s"] + m["base_offset_s"])
        write_wav(os.path.join(out, entry["file"]), cleaned)
        done.append(entry)
        say("  %-16s %6.2f s  %d sentences  %-9s confidence %-6s floor %6.1f dBFS  "
            "%d warning(s)" % (sid, entry["duration_s"], len(entry["sentences"]),
                               entry["timing"], q["confidence_label"],
                               q["noise_floor_dbfs"], len(q["warnings"])))
        for w in q["warnings"]:
            say("      WARNING: " + w)
        raws[i] = None

    # pace of every section against the others: a wrong file shows up here
    rates = [(e, e["quality"]["speech_s"] and
              sum(d["weight"] for d in e["sentences"]) / e["quality"]["speech_s"])
             for e in done]
    vals = sorted(r for _, r in rates if r)
    med = vals[len(vals) // 2] if vals else None
    for e, r in rates:
        e["quality"]["pace_vs_all_sections"] = round(r / med, 2) if (r and med) else None
        if len(vals) >= 3 and r and (r / med > 1.35 or r / med < 0.70):
            e["quality"]["warnings"].append(
                "PACE: this section is spoken at %.0f %% of the pace of the other sections "
                "- wrong file, or text added / left out?" % (100.0 * r / med))

    to_check = [e["id"] for e in done
                if e["quality"]["warnings"] or e["quality"]["confidence_label"] == "low"
                or e["timing"] == "estimated"]
    nb_det = sum(e["quality"]["boundaries_detected"] for e in done)
    nb_est = sum(e["quality"]["boundaries_estimated"] for e in done)
    nb_man = sum(e["quality"]["boundaries_manual"] for e in done)
    cues = {
        "schema": "progbiz-vo-cues/1",
        "voice": args.label,
        "mode": "recorded",
        "tool": "scripts/video/vo/ingest_recording.py",
        "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "script": rel(args.script),
        "lang": script.get("lang"),
        "input": {"folder": rel(args.indir) if args.indir else None,
                  "single": rel(args.single) if args.single else None},
        "overrides_file": rel(args.overrides) if args.overrides else None,
        "audio_format": {"container": "WAV", "encoding": "PCM signed 16-bit little-endian",
                         "sample_rate": SR, "channels": 1},
        "targets": {"speech_rms_dbfs": P["target_rms_db"],
                    "peak_ceiling_dbfs": P["peak_ceiling_db"],
                    "room_tone_s": P["room_tone_s"]},
        "parameters": P,
        "definitions": {
            "start_s / end_s": "seconds inside the delivered section file <id>.wav",
            "duration_s (section)": "length of the delivered section file, room tone included",
            "timing": "detected = both ends of the sentence lie on pauses found in the audio; "
                      "estimated = at least one end was placed by text length; "
                      "manual = set in the overrides file",
            "confidence": "0..1, lowest boundary confidence of the section; heuristic",
            "source_offset_s": "time inside the ORIGINAL recording of sample 0 of the "
                               "delivered file",
            "noise_floor_dbfs": "level of the pauses of the delivered file",
            "speech_dbfs": "RMS of the voiced frames of the delivered file",
            "weight": "text length in spoken characters (see speech_weight in the tool)",
        },
        "totals": {
            "sections_expected": len(sections),
            "sections_present": len(done),
            "duration_s": r3(sum(e["duration_s"] for e in done)),
            "sentences": sum(len(e["sentences"]) for e in done),
            "sentences_detected": sum(1 for e in done for d in e["sentences"]
                                      if d["timing"] == "detected"),
            "sentences_estimated": sum(1 for e in done for d in e["sentences"]
                                       if d["timing"] == "estimated"),
            "sentences_manual": sum(1 for e in done for d in e["sentences"]
                                    if d["timing"] == "manual"),
            "boundaries_detected": nb_det,
            "boundaries_estimated": nb_est,
            "boundaries_manual": nb_man,
            "sections_estimated": [e["id"] for e in done if e["timing"] == "estimated"],
            "sections_to_check": to_check,
        },
        "missing_sections": missing,
        "unusable_sections": unusable,
        "ignored_files": ignored,
        "warnings": global_warn,
        "single_split": single_block,
        "sections": done,
    }
    write_json(os.path.join(out, "cues.json"), cues)
    write_report(os.path.join(out, "report.md"), cues, P)
    try:
        os.rmdir(work)
    except OSError:
        pass

    say("")
    say("sections: %d of %d   narration %.2f s   boundaries: %d detected, %d estimated, "
        "%d manual" % (len(done), len(sections), cues["totals"]["duration_s"],
                       nb_det, nb_est, nb_man))
    if missing:
        log("MISSING sections: %s" % ", ".join(missing))
    if unusable:
        log("UNUSABLE recordings: %s" % ", ".join(e["id"] for e in unusable))
    for w in global_warn:
        log("WARNING: " + w)
    if single_block:
        for w in single_block["warnings"]:
            log("WARNING (split): " + w)
    if to_check:
        say("check by ear: %s" % ", ".join(to_check))
    say("written: %s" % rel(os.path.join(out, "cues.json")))
    say("         %s" % rel(os.path.join(out, "report.md")))
    if not done:
        log("ingest: no usable recording found")
        return 1
    if args.strict and (missing or unusable or nb_est):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
