#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_vo.py - DRAFT voice-over + timing cue sheet for the ProgBiz ERP CRM demo video.

Python 3 standard library only.  External programs used: say, afconvert, afinfo
(all part of macOS).  Nothing is downloaded or installed.

What it does
------------
For a given macOS voice it synthesises EVERY SENTENCE of scripts/video/vo/script.json
separately (so exact sentence timings are known), converts each one to
WAV / PCM 16-bit / 48 kHz / mono, trims leading and trailing silence, joins the
sentences of a section with a natural pause and writes

    reports/video/audio/<voice>/<section_id>.wav
    reports/video/audio/<voice>/sentences/<section_id>_<n>.wav
    reports/video/audio/<voice>/cues.json
    reports/video/audio/<voice>/timeline.wav        (whole 240 s track, sections at their slots)
    reports/video/audio/samples/<voice>_opening.m4a (with --samples)

script.json is read-only input.  The DISPLAY wording is never changed; only the
text handed to the synthesiser is re-spelled, by the RESPELL table below.

Typical use (run from the repo root)
------------------------------------
    /usr/bin/python3 scripts/video/vo/make_vo.py --list-voices
    /usr/bin/python3 scripts/video/vo/make_vo.py --voice Samantha --samples
    /usr/bin/python3 scripts/video/vo/make_vo.py --voice Samantha --tune --target-wpm 146
    /usr/bin/python3 scripts/video/vo/make_vo.py --voice Samantha --rate 200 --pause 0.30
    /usr/bin/python3 scripts/video/vo/make_vo.py --voice Samantha --audit
    /usr/bin/python3 scripts/video/vo/make_vo.py --measure-only --voice MyRecording
See reports/video/audio/README.md for the full description.
"""

import argparse
import array
import datetime
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import wave
from concurrent.futures import ThreadPoolExecutor

# --------------------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DEFAULT_SCRIPT = os.path.join(HERE, "script.json")
DEFAULT_OUT_ROOT = os.path.join(REPO_ROOT, "reports", "video", "audio")

# --------------------------------------------------------------------------------------
# Audio contract
# --------------------------------------------------------------------------------------
SR = 48000            # Hz
CHANNELS = 1
SAMPWIDTH = 2         # bytes -> PCM 16-bit
WIN = 240             # analysis window: 240 samples = 5 ms at 48 kHz
WIN_S = WIN / float(SR)

# --------------------------------------------------------------------------------------
# RESPELLING TABLE  (display text  ->  text sent to the synthesiser)
# --------------------------------------------------------------------------------------
# The approved wording in script.json is what goes on screen and into cues.json ("text").
# The synthesiser receives the re-spelled string ("spoken" in cues.json).  Word counts and
# words-per-minute are always computed from the DISPLAY text.
#
# Every rule below was checked on 2026-09-29 (macOS 27) by synthesising both spellings and
# comparing the PCM output bit for bit, by comparing durations, and for the vowel of "lead"
# by a spectral measurement (see --audit).  "identical" means byte-identical audio, i.e. the
# rule is a provable no-op for that voice.  Nothing here was judged by ear.
#
#   rule        display      spoken       measured effect
#   ----------  -----------  -----------  ---------------------------------------------------
#   apostrophe  ’ (U+2019)   '            identical audio in Samantha, Daniel, Rishi, Tara,
#                                         Aman.  Kept only as a safety net for other voices.
#   em_dash     — (U+2014)   ", "         Samantha, Daniel: identical to a comma (about 0.2 s
#                                         pause).  Rishi: unspaced dash pauses, a SPACED dash
#                                         is ignored.  Tara, Aman: the dash is IGNORED (no
#                                         pause at all, the two clauses run together); the
#                                         comma gives a 0.15-0.29 s pause.
#   bullet      • (U+2022)   ", "         Not used in the narration today (call-outs only).
#                                         Rishi ignores the bullet; the others read a comma.
#   progbiz     ProgBiz      Prog Biz     identical audio in all five voices (the engines
#                                         already split the CamelCase).  Isolated duration
#                                         0.56-0.72 s, consistent with two syllables.  Kept
#                                         explicit so a future voice cannot spell it out.
#   erp         ERP          E R P        REQUIRED.  Isolated "ERP" is byte-identical to the
#                                         nonsense word "urp" (0.21-0.35 s) in all five voices,
#                                         i.e. it is read as a word.  "E R P" is 0.66-0.75 s
#                                         (three letter names).
#   crm         CRM          C R M        Samantha, Daniel: identical.  Rishi, Tara, Aman:
#                                         0.03-0.19 s longer than "CRM"; both are letter
#                                         readings.  Kept explicit for safety.
#   lead        lead(s)      leed(s)      REQUIRED for Tara, Aman and Daniel.  Tara and Aman
#                                         render the singular "lead" byte-identically to "led"
#                                         (the metal) in "a lead arrives", "open a lead" and
#                                         "A lead is valuable".  Daniel's isolated "lead" has
#                                         its vowel formant peaks at 550/1700 Hz like "led"/
#                                         "bed" (550/1600-1650) and unlike "leed"/"bead"
#                                         (300/2200).  Samantha and Rishi: "leed(s)" is
#                                         byte-identical to "lead(s)" in all eight sentences,
#                                         so the rule is a no-op there.
#
# NOT re-spelled, but flagged for a human listener (see README "Pronunciation risks"):
#   enquiries / enquiry (British spelling read by a US voice), records (noun vs verb stress),
#   Use (verb), separates (verb), follow-up(s), executive, prioritize, the run of six letter
#   names in "ProgBiz ERP CRM gives ...".
#
# To change a pronunciation: edit the replacement here, re-run the voice, listen.
# Alternatives that were measured but not chosen: "E.R.P." / "E-R-P" (same as "E R P" in
# most voices, about 0.09 s tighter in Rishi), "Progbiz" / "Prog-Biz" (single-word reading,
# 0.01-0.13 s shorter), "[[slnc 300]]" for the dash (honoured by Samantha, Daniel, Rishi;
# silently ignored by Tara and Aman, so it is not used).
RESPELL = [
    # (rule id, regular expression on the display text, replacement)
    ("apostrophe", u"[\u2018\u2019]", u"'"),
    ("em_dash", u"\\s*[\u2014\u2013]\\s*", u", "),
    ("bullet", u"\\s*\u2022\\s*", u", "),
    ("progbiz", r"\bProgBiz\b", u"Prog Biz"),
    ("progbiz_lc", r"\bProgbiz\b", u"Prog biz"),
    ("erp", r"\bERP\b", u"E R P"),
    ("crm", r"\bCRM\b", u"C R M"),
    ("lead", r"\b([Ll])ead(s?)\b", r"\1eed\2"),
]
# Per-voice exceptions: rule ids to skip, or extra rules to append, for one voice only.
RESPELL_SKIP = {
    # "Samantha": {"crm"},
}
RESPELL_EXTRA = {
    # "Daniel": [("example", r"\bprioritize\b", u"prioritise")],
}

# Pause inserted after individual sentences when it should differ from --pause.
# Key = "<section_id>_<n>", value = seconds.
PAUSE_AFTER = {
}

# --------------------------------------------------------------------------------------
# Voices
# --------------------------------------------------------------------------------------
DEFAULT_VOICES = ["Samantha", "Daniel", "Rishi", "Tara", "Aman"]

# "say -r" is NOT the delivered pace.  The values below were found by measuring the generated
# audio (--tune) on 2026-09-29, macOS 27, and are used when neither --rate nor --tune is
# given.  "pause" is the silence between sentences that goes with that rate.
# Re-run --tune after an OS update: the voices are system assets and can change.
TUNED = {
}

# Pauses tried by --tune when --pause is not given ("about 0.35 s").
PAUSE_GRID = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50]

# Voices that are never offered for narration (novelty, legacy MacinTalk, Eloquence).
NOVELTY = set("""Albert Bad_News Bahh Bells Boing Bubbles Cellos Wobble Deranged Good_News
Hysterical Jester Organ Pipe_Organ Superstar Trinoids Whisper Zarvox Fred Junior Kathy Ralph
Eddy Flo Grandma Grandpa Reed Rocko Sandy Shelley""".split())


def log(msg=""):
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def run(cmd):
    """Run a program, return stdout (str).  Raises RuntimeError with stderr on failure."""
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError("command failed (%d): %s\n%s" % (
            p.returncode, " ".join(cmd), p.stderr.decode("utf-8", "replace")))
    return p.stdout.decode("utf-8", "replace")


def list_voices():
    """[(name, locale)] from `say -v ?`, in the order printed (duplicates removed)."""
    out = run(["say", "-v", "?"])
    voices, seen = [], set()
    for line in out.splitlines():
        m = re.match(r"^(.*?)\s+([a-z]{2,3}[_-][A-Za-z0-9]{2,})\s+#", line)
        if not m:
            continue
        key = (m.group(1).strip(), m.group(2))
        if key not in seen:
            seen.add(key)
            voices.append(key)
    return voices


def short_name(name):
    return re.sub(r"\s*\(.*$", "", name).strip()


def find_voice(name, voices):
    """Exact name first, then the short name ('Rishi' for 'Rishi (English (India))')."""
    # a voice identifier such as com.apple.voice.Tara.premium is passed to say as it is
    # (say accepts identifiers; the premium variants are not listed by `say -v ?` by id)
    m = re.match(r"^com\.apple\.voice\.(?:[a-z]+\.)?(?:([a-z]{2}-[A-Z]{2})\.)?([A-Za-z]+)", name)
    if m:
        short = m.group(2)
        loc = (m.group(1) or "").replace("-", "_")
        if not loc:
            for n, l in voices:
                if short_name(n) == short:
                    loc = l
                    break
        return name, loc or "en_US"
    for n, loc in voices:
        if n == name:
            return n, loc
    for n, loc in voices:
        if short_name(n) == name and loc.startswith("en"):
            return n, loc
    for n, loc in voices:
        if short_name(n) == name:
            return n, loc
    return None


def safe_dir(name):
    return re.sub(r"[^A-Za-z0-9]+", "_", short_name(name)).strip("_") or "voice"


def is_novelty(name):
    return re.sub(r"\s+", "_", short_name(name)) in NOVELTY


def quality_tag(name):
    m = re.search(r"\((Enhanced|Premium)\)", name)
    if m:
        return m.group(1)
    if re.search(r"siri", name, re.I):
        return "Siri"
    return ""


# --------------------------------------------------------------------------------------
# Text
# --------------------------------------------------------------------------------------
def respell(text, voice=None, skip=()):
    """Display text -> text for the synthesiser.  Returns (spoken, [rule ids applied])."""
    rules = [r for r in RESPELL if r[0] not in RESPELL_SKIP.get(voice, set())]
    rules += RESPELL_EXTRA.get(voice, [])
    applied = []
    out = text
    for rid, pat, rep in rules:
        if rid in skip:
            continue
        new = re.sub(pat, rep, out)
        if new != out:
            applied.append(rid)
            out = new
    out = re.sub(r"\s+", " ", out).strip()
    return out, applied


def count_words(text):
    """Words of the DISPLAY text.  Whitespace and dashes separate words; a hyphenated
    compound (follow-up) and an abbreviation (ERP) each count as one word."""
    toks = re.split(u"[\\s\u2014\u2013\u2022]+", text)
    return len([t for t in toks if re.search(r"\w", t, re.U)])


def estimate_syllables(text):
    """ESTIMATE of the spoken syllables of the display text (vowel-group heuristic; letter
    names for ERP / CRM).  Only used to explain why words-per-minute differs between
    sections that are spoken at the same speed."""
    total = 0
    for tok in re.split(u"[\\s\u2014\u2013\u2022-]+", text):
        w = re.sub(r"[^A-Za-z]", "", tok.replace(u"\u2019s", "").replace("'s", ""))
        if not w:
            continue
        if w.isupper() and 2 <= len(w) <= 4:
            total += len(w)
            continue
        lw = w.lower()
        n = len(re.findall(r"[aeiouy]+", lw))
        if lw.endswith("e") and not lw.endswith(("le", "ee")) and n > 1:
            n -= 1
        if lw.endswith("ed") and len(lw) > 3 and lw[-3] not in "td" and n > 1:
            n -= 1
        if lw.endswith("es") and len(lw) > 3 and lw[-3] not in "sxzhc" and n > 1:
            n -= 1
        total += max(1, n)
    return total


def load_script(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


# --------------------------------------------------------------------------------------
# WAV helpers (wave + array only)
# --------------------------------------------------------------------------------------
def read_wav(path):
    """Returns (samples array('h'), info dict).  Raises ValueError unless PCM 16-bit."""
    w = wave.open(path, "rb")
    try:
        info = {"channels": w.getnchannels(), "sampwidth": w.getsampwidth(),
                "rate": w.getframerate(), "frames": w.getnframes()}
        raw = w.readframes(info["frames"])
    finally:
        w.close()
    if info["sampwidth"] != 2:
        raise ValueError("%s: %d-bit samples, expected 16-bit" % (path, 8 * info["sampwidth"]))
    a = array.array("h")
    a.frombytes(raw[: len(raw) - (len(raw) % 2)])
    if sys.byteorder == "big":
        a.byteswap()
    return a, info


def write_wav(path, samples):
    b = samples
    if sys.byteorder == "big":
        b = array.array("h", samples)
        b.byteswap()
    tmp = path + ".tmp"
    w = wave.open(tmp, "wb")
    try:
        w.setnchannels(CHANNELS)
        w.setsampwidth(SAMPWIDTH)
        w.setframerate(SR)
        w.writeframes(b.tobytes())
    finally:
        w.close()
    os.replace(tmp, path)


def silence(seconds):
    return array.array("h", bytes(2 * int(round(seconds * SR))))


def envelope(a):
    """Peak absolute amplitude of each 5 ms window."""
    return [max(max(a[i:i + WIN]), -min(a[i:i + WIN]))
            for i in range(0, len(a) - WIN + 1, WIN)]


def db_to_amp(db):
    return 32768.0 * (10.0 ** (db / 20.0))


def amp_to_db(amp):
    return -120.0 if amp <= 0 else 20.0 * math.log10(amp / 32768.0)


def speech_bounds(env, thr):
    first = None
    for i, v in enumerate(env):
        if v > thr:
            first = i
            break
    if first is None:
        return None, None
    last = first
    for i in range(len(env) - 1, -1, -1):
        if env[i] > thr:
            last = i
            break
    return first, last


def silent_runs(env, first, last, thr):
    """[(start_s, dur_s)] of stretches below thr strictly inside the speech."""
    runs, start = [], None
    for i in range(first, last + 1):
        if env[i] <= thr:
            if start is None:
                start = i
        elif start is not None:
            runs.append((start * WIN_S, (i - start) * WIN_S))
            start = None
    return runs


def trim(a, thr, head_pad_s=0.010, tail_pad_s=0.040, fade_in_s=0.004, fade_out_s=0.010):
    """Cut leading/trailing silence, keep a few ms of padding, fade the cut edges."""
    env = envelope(a)
    first, last = speech_bounds(env, thr)
    if first is None:
        return array.array("h")
    s = max(0, first * WIN - int(head_pad_s * SR))
    e = min(len(a), (last + 1) * WIN + int(tail_pad_s * SR))
    out = array.array("h", a[s:e])
    n = min(int(fade_in_s * SR), len(out) // 2)
    for i in range(n):
        out[i] = int(out[i] * i / float(n))
    n = min(int(fade_out_s * SR), len(out) // 2)
    L = len(out)
    for i in range(n):
        out[L - 1 - i] = int(out[L - 1 - i] * i / float(n))
    return out


def peak(a):
    return max(max(a), -min(a)) if len(a) else 0


def rms(a):
    if not len(a):
        return 0.0
    return math.sqrt(sum(x * x for x in a) / float(len(a)))


def apply_gain(a, g):
    if abs(g - 1.0) < 1e-6:
        return a
    return array.array("h", [max(-32768, min(32767, int(round(x * g)))) for x in a])


def clip_stats(a):
    """(number of full-scale samples, longest run of consecutive full-scale samples)."""
    n = a.count(32767) + a.count(-32768)
    if n == 0:
        return 0, 0
    longest = cur = 0
    for x in a:
        if x >= 32767 or x <= -32768:
            cur += 1
            if cur > longest:
                longest = cur
        else:
            cur = 0
    return n, longest


def afinfo(path):
    """Parse `afinfo` -> dict(channels, rate, fmt, duration, file_type)."""
    out = run(["afinfo", path])
    d = {"raw_ok": True}
    m = re.search(r"File type ID:\s+(\S+)", out)
    d["file_type"] = m.group(1) if m else None
    m = re.search(r"Data format:\s+(\d+) ch,\s+(\d+) Hz,\s+(.*)", out)
    if m:
        d["channels"] = int(m.group(1))
        d["rate"] = int(m.group(2))
        d["fmt"] = m.group(3).strip()
    m = re.search(r"estimated duration:\s+([0-9.]+) sec", out)
    d["duration"] = float(m.group(1)) if m else None
    return d


# --------------------------------------------------------------------------------------
# Synthesis
# --------------------------------------------------------------------------------------
class Synth(object):
    """say -> AIFF (native rate) -> afconvert -> WAV 48 kHz mono 16-bit, with a cache."""

    def __init__(self, workdir, jobs=1):
        self.workdir = workdir
        self.jobs = jobs
        self.mem = {}
        self.native_rates = set()
        os.makedirs(workdir, exist_ok=True)

    def _key(self, voice, rate, spoken):
        h = hashlib.sha1(("%s|%s|%s" % (voice, rate, spoken)).encode("utf-8")).hexdigest()
        return h[:20]

    def _render(self, voice, rate, spoken):
        key = self._key(voice, rate, spoken)
        txt = os.path.join(self.workdir, key + ".txt")
        aiff = os.path.join(self.workdir, key + ".aiff")
        wav = os.path.join(self.workdir, key + ".wav")
        with open(txt, "w", encoding="utf-8") as fh:
            fh.write(spoken + "\n")
        cmd = ["say", "-v", voice]
        if rate:
            cmd += ["-r", str(int(rate))]
        cmd += ["-o", aiff, "-f", txt]
        run(cmd)
        info = afinfo(aiff)
        run(["afconvert", "-f", "WAVE", "-d", "LEI16@%d" % SR, "-c", "1",
             "--src-complexity", "bats", "-r", "127", aiff, wav])
        a, winfo = read_wav(wav)
        if winfo["rate"] != SR or winfo["channels"] != 1:
            raise RuntimeError("afconvert produced %r for %s" % (winfo, wav))
        for p in (txt, aiff, wav):
            try:
                os.remove(p)
            except OSError:
                pass
        return key, a, info.get("rate")

    def get_many(self, voice, items):
        """items: [(rate, spoken)] -> [array('h') raw, untrimmed]"""
        todo = []
        for rate, spoken in items:
            k = self._key(voice, rate, spoken)
            if k not in self.mem and (rate, spoken) not in todo:
                todo.append((rate, spoken))
        if todo:
            def job(it):
                try:
                    return self._render(voice, it[0], it[1])
                except Exception:       # one retry: say occasionally fails when run in parallel
                    return self._render(voice, it[0], it[1])
            with ThreadPoolExecutor(max_workers=max(1, self.jobs)) as ex:
                for key, a, native in ex.map(job, todo):
                    self.mem[key] = a
                    if native:
                        self.native_rates.add(native)
        return [self.mem[self._key(voice, r, s)] for r, s in items]

    def get(self, voice, rate, spoken):
        return self.get_many(voice, [(rate, spoken)])[0]

    def verify(self, voice, items):
        """Render every item again, one at a time, and compare with the cached audio.
        A render that was cut short (seen when several say processes run at once) shows up
        as a difference.  On a difference the item is rendered a third time and the version
        that occurs twice wins (the longest one if all three differ).
        Returns [description of every item that was not reproducible at first]."""
        report = []
        for rate, spoken in items:
            k = self._key(voice, rate, spoken)
            first = self.mem[k]
            _, second, _ = self._render(voice, rate, spoken)
            if second == first:
                continue
            _, third, _ = self._render(voice, rate, spoken)
            if third == second:
                keep, why = second, "renders 2 and 3 agree"
            elif third == first:
                keep, why = first, "renders 1 and 3 agree"
            else:
                keep, why = max((first, second, third), key=len), "three different renders, longest kept"
            self.mem[k] = keep
            report.append({"rate": rate, "spoken": spoken, "resolution": why,
                           "raw_durations_s": [round(len(x) / float(SR), 3)
                                               for x in (first, second, third)]})
        return report


# --------------------------------------------------------------------------------------
# Building a voice
# --------------------------------------------------------------------------------------
def plan_sentences(script, voice, base_rate, section_rates):
    """[(section, n, display, spoken, rules, rate)]"""
    plan = []
    for sec in script["sections"]:
        rate = section_rates.get(sec["id"], base_rate)
        for n, text in enumerate(sec["sentences"], 1):
            spoken, rules = respell(text, voice)
            plan.append((sec, n, text, spoken, rules, rate))
    return plan


def render_sentences(synth, script, voice, base_rate, section_rates, thr):
    """Synthesise + trim every sentence.  Returns {(section_id, n): samples}."""
    plan = plan_sentences(script, voice, base_rate, section_rates)
    raws = synth.get_many(voice, [(p[5], p[3]) for p in plan])
    out = {}
    for p, raw in zip(plan, raws):
        t = trim(raw, thr)
        if not len(t):
            raise RuntimeError("voice %s produced silence for %s_%d: %r" % (
                voice, p[0]["id"], p[1], p[3]))
        out[(p[0]["id"], p[1])] = t
    return out


def pause_after(section_id, n, count, default_pause):
    if n >= count:
        return 0.0
    return float(PAUSE_AFTER.get("%s_%d" % (section_id, n), default_pause))


def section_durations(script, sent, default_pause):
    """{section_id: seconds} for sentences joined with pauses."""
    d = {}
    for sec in script["sections"]:
        cnt = len(sec["sentences"])
        tot = 0
        for n in range(1, cnt + 1):
            tot += len(sent[(sec["id"], n)])
            tot += int(round(pause_after(sec["id"], n, cnt, default_pause) * SR))
        d[sec["id"]] = tot / float(SR)
    return d


def pace(script, durations):
    """(overall wpm, {section_id: wpm}, total words, total seconds)"""
    per, tw, td = {}, 0, 0.0
    for sec in script["sections"]:
        w = sum(count_words(t) for t in sec["sentences"])
        per[sec["id"]] = w / (durations[sec["id"]] / 60.0)
        tw += w
        td += durations[sec["id"]]
    return tw / (td / 60.0), per, tw, td


def pace_metrics(script, lengths, pause, min_spare, wpm_range):
    """Pace and fit for sentence lengths (in samples) joined with `pause` seconds."""
    tw, td, per, not_fit, tight = 0, 0.0, {}, [], []
    for sec in script["sections"]:
        sid, cnt = sec["id"], len(sec["sentences"])
        d = sum(lengths[(sid, n)] for n in range(1, cnt + 1)) / float(SR)
        d += sum(pause_after(sid, n, cnt, pause) for n in range(1, cnt + 1))
        w = sum(count_words(t) for t in sec["sentences"])
        spare = (sec["slot"][1] - sec["slot"][0]) - d
        per[sid] = {"duration_s": d, "wpm": w / (d / 60.0), "spare_s": spare}
        if spare < 0:
            not_fit.append(sid)
        elif spare < min_spare:
            tight.append(sid)
        tw += w
        td += d
    wpm = tw / (td / 60.0)
    return {"wpm": wpm, "in_range": wpm_range[0] <= wpm <= wpm_range[1], "sections": per,
            "not_fitting": not_fit, "below_min_spare": tight}


def tune_rate(synth, script, voice, target, lo, hi, pause, pause_grid, thr, wpm_range,
              min_spare):
    """Find the say -r value (and, when pause_grid has several values, the pause between
    sentences) whose MEASURED pace is inside wpm_range, fits every slot, and is closest to
    target.

    say -r is not the delivered pace: for some voices the relation is a staircase (many
    rates give byte-identical audio), for others it saturates.  So the search is a
    bisection on measured audio, not a formula.  The pause is a fine adjustment that needs
    no new synthesis."""
    seen = {}

    def f(r):
        if r not in seen:
            sent = render_sentences(synth, script, voice, r, {}, thr)
            seen[r] = {k: len(v) for k, v in sent.items()}
            m = pace_metrics(script, seen[r], pause, min_spare, wpm_range)
            w = [x["wpm"] for x in m["sections"].values()]
            log("    tune  -r %3d  ->  %.1f wpm overall at pause %.2f s  (sections %.0f..%.0f wpm)" % (
                r, m["wpm"], pause, min(w), max(w)))
        return pace_metrics(script, seen[r], pause, min_spare, wpm_range)["wpm"]

    a, b = lo, hi
    fa, fb = f(a), f(b)
    if fa < target < fb:
        while b - a > 1:
            m = (a + b) // 2
            if f(m) < target:
                a = m
            else:
                b = m

    def score(rp):
        m = pace_metrics(script, seen[rp[0]], rp[1], min_spare, wpm_range)
        cost = abs(m["wpm"] - target) + 40.0 * abs(rp[1] - pause)
        return (0 if m["in_range"] else 1, len(m["not_fitting"]), len(m["below_min_spare"]),
                round(cost, 3), abs(rp[0] - 175))

    cands = [(r, p) for r in seen for p in pause_grid]
    best = min(cands, key=score)
    rate, best_pause = best

    # keep away from the edge of a staircase step: the neighbours 6 units away should give
    # exactly the same audio lengths; if one does not, move 6 units the other way
    up = (rate + 6 <= hi) and f(rate + 6) is not None and seen[rate + 6] == seen[rate]
    down = (rate - 6 >= lo) and f(rate - 6) is not None and seen[rate - 6] == seen[rate]
    if up and not down and rate + 12 <= hi and f(rate + 12) is not None and seen[rate + 12] == seen[rate]:
        rate += 6
    elif down and not up and rate - 12 >= lo and f(rate - 12) is not None and seen[rate - 12] == seen[rate]:
        rate -= 6
    same = sorted(r for r in seen if seen[r] == seen[rate])

    m = pace_metrics(script, seen[rate], best_pause, min_spare, wpm_range)
    info = {
        "target_wpm": target,
        "pause_candidates_s": pause_grid,
        "evaluated_wpm_at_pause_%.2f" % pause: {
            str(r): round(pace_metrics(script, seen[r], pause, min_spare, wpm_range)["wpm"], 2)
            for r in sorted(seen)},
        "identical_audio_seen_for_rates": [same[0], same[-1]],
        "reachable_wpm": [round(fa, 2), round(fb, 2)],
        "chosen": {"say_rate": rate, "pause_s": best_pause, "wpm": round(m["wpm"], 2),
                   "in_pace_range": m["in_range"], "not_fitting": m["not_fitting"],
                   "below_min_spare": m["below_min_spare"]},
    }
    return rate, best_pause, m["wpm"], info


def tune_section_pace(synth, script, voice, sec, lo, hi, default_pause, thr, target, wpm_range):
    """say -r value that brings ONE section closest to target wpm."""
    sid = sec["id"]
    words = sum(count_words(t) for t in sec["sentences"])
    seen = {}

    def f(r):
        if r not in seen:
            sent = render_sentences(synth, {"sections": [sec]}, voice, r, {}, thr)
            d = section_durations({"sections": [sec]}, sent, default_pause)[sid]
            seen[r] = words / (d / 60.0)
        return seen[r]

    a, b = lo, hi
    if f(a) < target < f(b):
        while b - a > 1:
            m = (a + b) // 2
            if f(m) < target:
                a = m
            else:
                b = m

    def score(r):
        inside = wpm_range[0] <= seen[r] <= wpm_range[1]
        return (0 if inside else 1, round(abs(seen[r] - target), 2), r)

    best = min(seen, key=score)
    return best, seen[best]


def tune_section_fit(synth, script, voice, sec, base_rate, hi, default_pause, thr, need_s):
    """Smallest rate >= base_rate at which one section is no longer than need_s seconds."""
    sid = sec["id"]

    def dur(r):
        sent = render_sentences(synth, {"sections": [sec]}, voice, r, {}, thr)
        return section_durations({"sections": [sec]}, sent, default_pause)[sid]

    a, b = base_rate, hi
    if dur(a) <= need_s:
        return a, dur(a)
    if dur(b) > need_s:
        return None, dur(b)
    while b - a > 1:
        m = (a + b) // 2
        if dur(m) <= need_s:
            b = m
        else:
            a = m
    return b, dur(b)


def check_wav_file(path, thr, max_inner_silence, is_sentence):
    """Format (afinfo + wave), clipping, internal silence.  Returns a dict."""
    r = {"file": path, "problems": []}
    try:
        info = afinfo(path)
    except Exception as e:          # noqa
        r["problems"].append("afinfo failed: %s" % e)
        return r
    r["afinfo"] = {"file_type": info.get("file_type"), "channels": info.get("channels"),
                   "rate": info.get("rate"), "fmt": info.get("fmt"),
                   "duration_s": info.get("duration")}
    ok = (info.get("file_type") == "WAVE" and info.get("channels") == 1 and
          info.get("rate") == SR and info.get("fmt", "").startswith("Int16"))
    r["format_ok"] = bool(ok)
    if not ok:
        r["problems"].append("format is %s ch / %s Hz / %s / %s, expected WAVE 1 ch 48000 Hz Int16" % (
            info.get("channels"), info.get("rate"), info.get("fmt"), info.get("file_type")))
    try:
        a, winfo = read_wav(path)
    except Exception as e:          # noqa
        r["problems"].append("cannot read samples: %s" % e)
        return r
    if winfo["channels"] != 1:
        a = array.array("h", a[0::winfo["channels"]])
    dur = len(a) / float(winfo["rate"])
    r["duration_s"] = round(dur, 4)
    if info.get("duration") is not None and abs(info["duration"] - dur) > 0.002:
        r["problems"].append("afinfo duration %.4f differs from sample count %.4f" % (
            info["duration"], dur))
    pk = peak(a)
    r["peak_dbfs"] = round(amp_to_db(pk), 2)
    n, run_len = clip_stats(a)
    r["full_scale_samples"] = n
    r["longest_full_scale_run"] = run_len
    if run_len >= 3:
        r["problems"].append("clipping: %d full-scale samples, longest run %d" % (n, run_len))
    if winfo["rate"] == SR:
        env = envelope(a)
        first, last = speech_bounds(env, thr)
        if first is None:
            r["problems"].append("file is silent")
        else:
            r["lead_silence_s"] = round(first * WIN_S, 3)
            r["tail_silence_s"] = round((len(env) - 1 - last) * WIN_S, 3)
            runs = silent_runs(env, first, last, thr)
            longest = max([d for _, d in runs] or [0.0])
            r["longest_inner_silence_s"] = round(longest, 3)
            if is_sentence and longest > max_inner_silence:
                r["problems"].append("silence of %.2f s inside the sentence" % longest)
    return r


def locate_by_match(section, sentence):
    """Exact sample offset of `sentence` inside `section`, or None."""
    if len(sentence) < 2 * WIN or len(section) < len(sentence):
        return None
    # probe = 50 ms around the loudest sample, so it is never a run of zeros
    pk_val = max(sentence)
    pos = sentence.index(pk_val)
    p0 = max(0, min(len(sentence) - 2400, pos - 1200))
    probe = sentence[p0:p0 + 2400].tobytes()
    hay = section.tobytes()
    start = 0
    while True:
        i = hay.find(probe, start)
        if i < 0:
            return None
        if i % 2 == 0:
            off = i // 2 - p0
            if off >= 0 and section[off:off + len(sentence)] == sentence:
                return off
        start = i + 1


def split_by_silence(a, count, thr, words):
    """Estimate `count` sentence spans in a one-take section recording.
    Returns ([(start_s, dur_s)], method)."""
    env = envelope(a)
    first, last = speech_bounds(env, thr)
    total = len(a) / float(SR)
    if first is None:
        return [(0.0, 0.0)] * count, "silent-file"
    t0, t1 = first * WIN_S, (last + 1) * WIN_S
    if count == 1:
        return [(round(t0, 3), round(t1 - t0, 3))], "silence-detect"
    runs = [r for r in silent_runs(env, first, last, thr) if r[1] >= 0.20]
    if len(runs) >= count - 1:
        cuts = sorted(sorted(runs, key=lambda r: -r[1])[:count - 1])
        spans, s = [], t0
        for cs, cd in cuts:
            spans.append((round(s, 3), round(cs - s, 3)))
            s = cs + cd
        spans.append((round(s, 3), round(t1 - s, 3)))
        return spans, "silence-detect (estimated)"
    # not enough pauses found: share the time in proportion to the word counts
    tw = float(sum(words)) or 1.0
    spans, s = [], t0
    for w in words:
        d = (t1 - t0) * w / tw
        spans.append((round(s, 3), round(d, 3)))
        s += d
    return spans, "word-proportion (rough estimate, only %d pauses found)" % len(runs)


def build_timeline(script, sections_audio, lead_in, min_gap=0.30):
    """Place every section at its slot.  Returns (samples, {section_id: start_s}, notes)."""
    total_s = float(script.get("video", {}).get("duration_s", 0)) or \
        max(s["slot"][1] for s in script["sections"])
    starts, notes, prev_end = {}, [], 0.0
    end_needed = total_s
    for sec in script["sections"]:
        sid = sec["id"]
        if sid not in sections_audio:
            continue
        dur = len(sections_audio[sid]) / float(SR)
        s0, s1 = float(sec["slot"][0]), float(sec["slot"][1])
        start = s0 + min(lead_in, max(0.0, (s1 - s0) - dur))
        if start < prev_end + (min_gap if prev_end > 0 else 0.0):
            new = prev_end + min_gap
            notes.append("%s pushed from %.2f s to %.2f s because the previous section overruns its slot" % (
                sid, start, new))
            start = new
        if start + dur > s1 + 1e-6:
            notes.append("%s ends at %.2f s, %.2f s after its slot end (%.0f s)" % (
                sid, start + dur, start + dur - s1, s1))
        starts[sid] = round(start, 3)
        prev_end = start + dur
        end_needed = max(end_needed, prev_end)
    if end_needed > total_s + 1e-6:
        notes.append("narration ends at %.2f s, after the %.0f s video length" % (end_needed, total_s))
    out = array.array("h", bytes(2 * int(math.ceil(end_needed * SR))))
    for sid, st in starts.items():
        a = sections_audio[sid]
        i = int(round(st * SR))
        out[i:i + len(a)] = a
    return out, starts, notes


def make_cues(script, voice_label, mode, sections_audio, sentence_spans, extra, args,
              timeline_starts, checks, per_section_rate=None, spoken_for=None):
    wr = script.get("video", {}).get("pace_wpm", [135, 150])
    tot_w, tot_d, tot_speech = 0, 0.0, 0.0
    secs = []
    for sec in script["sections"]:
        sid = sec["id"]
        slot_len = float(sec["slot"][1] - sec["slot"][0])
        words = [count_words(t) for t in sec["sentences"]]
        syl = sum(estimate_syllables(t) for t in sec["sentences"])
        entry = {"id": sid, "title": sec.get("title"), "file": "%s.wav" % sid,
                 "slot": sec["slot"], "slot_len_s": slot_len, "words": sum(words),
                 "syllables_estimated": syl}
        if sid not in sections_audio:
            entry.update({"present": False, "duration_s": None, "fits": None,
                          "note": "no %s.wav in this directory" % sid})
            secs.append(entry)
            continue
        dur = len(sections_audio[sid]) / float(SR)
        spans, method = sentence_spans[sid]
        speech = sum(d for _, d in spans)
        spare = slot_len - dur
        wpm = sum(words) / (dur / 60.0) if dur > 0 else 0.0
        entry.update({
            "present": True,
            "duration_s": round(dur, 3),
            "wpm_effective": round(wpm, 1),
            "wpm_speech_only": round(sum(words) / (speech / 60.0), 1) if speech > 0 else None,
            "syllables_per_s_estimated": round(syl / speech, 2) if speech > 0 else None,
            "in_pace_range": bool(wr[0] <= wpm <= wr[1]),
            "fits": bool(spare >= 0),
            "spare_s": round(spare, 3),
            "fits_with_min_spare": bool(spare >= args.min_spare),
            "sentence_timing": method,
        })
        if per_section_rate is not None:
            entry["say_rate"] = per_section_rate.get(sid)
        if sid in timeline_starts:
            entry["timeline_start_s"] = timeline_starts[sid]
            entry["timeline_end_s"] = round(timeline_starts[sid] + dur, 3)
        sl = []
        for n, text in enumerate(sec["sentences"], 1):
            st, d = spans[n - 1]
            s = {"n": n, "file": "sentences/%s_%d.wav" % (sid, n), "text": text,
                 "words": words[n - 1], "start_s": round(st, 3), "duration_s": round(d, 3),
                 "end_s": round(st + d, 3)}
            if spoken_for is not None:
                s["spoken"] = spoken_for[(sid, n)][0]
                s["respelling_rules"] = spoken_for[(sid, n)][1]
            if n < len(sec["sentences"]):
                s["pause_after_s"] = round(spans[n][0] - (st + d), 3)
            if sid in timeline_starts:
                s["timeline_start_s"] = round(timeline_starts[sid] + st, 3)
                s["timeline_end_s"] = round(timeline_starts[sid] + st + d, 3)
            sl.append(s)
        entry["sentences"] = sl
        secs.append(entry)
        tot_w += sum(words)
        tot_d += dur
        tot_speech += speech
    present = [s for s in secs if s.get("present")]
    overall = tot_w / (tot_d / 60.0) if tot_d > 0 else None
    cues = {
        "schema": "progbiz-vo-cues/1",
        "voice": voice_label,
        "mode": mode,
        "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "script": os.path.relpath(args.script, REPO_ROOT),
        "audio_format": {"container": "WAV", "encoding": "PCM signed 16-bit little-endian",
                         "sample_rate": SR, "channels": CHANNELS},
        "pace_target_wpm": wr,
        "min_spare_s": args.min_spare,
        "definitions": {
            "words": "words of the approved DISPLAY text; a hyphenated compound or an abbreviation counts as one word",
            "duration_s": "length of the section file = sentences + pauses between them, no leading or trailing silence",
            "wpm_effective": "words / duration_s * 60 (pauses between sentences included)",
            "wpm_speech_only": "words / sum of sentence durations * 60 (pauses between sentences excluded)",
            "syllables_estimated": "vowel-group ESTIMATE from the display text, letter names counted for ERP / CRM",
            "syllables_per_s_estimated": "syllables_estimated / sum of sentence durations",
            "spare_s": "slot_len_s - duration_s",
            "fits": "spare_s >= 0",
            "fits_with_min_spare": "spare_s >= min_spare_s",
            "start_s": "offset of the sentence inside its section file",
            "timeline_start_s": "position on the 0..240 s video timeline as placed in timeline.wav",
        },
        "totals": {
            "sections_present": len(present),
            "sections_expected": len(secs),
            "words": tot_w,
            "duration_s": round(tot_d, 3),
            "wpm_effective": round(overall, 1) if overall else None,
            "wpm_speech_only": round(tot_w / (tot_speech / 60.0), 1) if tot_speech > 0 else None,
            "in_pace_range": bool(overall and wr[0] <= overall <= wr[1]),
            "sections_in_pace_range": [s["id"] for s in present if s["in_pace_range"]],
            "sections_outside_pace_range": [s["id"] for s in present if not s["in_pace_range"]],
            "all_fit": all(s["fits"] for s in present) and len(present) == len(secs),
            "all_fit_with_min_spare": all(s["fits_with_min_spare"] for s in present) and len(present) == len(secs),
            "sections_not_fitting": [s["id"] for s in present if not s["fits"]],
            "sections_below_min_spare": [s["id"] for s in present if not s["fits_with_min_spare"]],
        },
    }
    cues.update(extra)
    cues["sections"] = secs
    cues["checks"] = checks
    return cues


def summarise_checks(results, root):
    probs = []
    for r in results:
        for p in r["problems"]:
            probs.append("%s: %s" % (os.path.relpath(r["file"], root), p))
    peaks = [r["peak_dbfs"] for r in results if "peak_dbfs" in r]
    inner = [(r.get("longest_inner_silence_s", 0.0), os.path.relpath(r["file"], root))
             for r in results if "/sentences/" in r["file"].replace(os.sep, "/")]
    inner.sort(reverse=True)
    return {
        "files_checked": len(results),
        "all_wave_48k_mono_int16": all(r.get("format_ok") for r in results),
        "max_peak_dbfs": max(peaks) if peaks else None,
        "full_scale_samples_total": sum(r.get("full_scale_samples", 0) for r in results),
        "longest_full_scale_run": max([r.get("longest_full_scale_run", 0) for r in results] or [0]),
        "longest_silence_inside_a_sentence_s": inner[0][0] if inner else None,
        "longest_silence_inside_a_sentence_file": inner[0][1] if inner else None,
        "max_lead_silence_s": max([r.get("lead_silence_s", 0.0) for r in results
                                   if os.path.basename(r["file"]) != "timeline.wav"] or [0.0]),
        "max_tail_silence_s": max([r.get("tail_silence_s", 0.0) for r in results
                                   if os.path.basename(r["file"]) != "timeline.wav"] or [0.0]),
        "problems": probs,
    }


def print_table(cues):
    t = cues["totals"]
    log("  %-14s %5s %6s %8s %7s %7s %6s %s" % (
        "section", "words", "slot", "duration", "spare", "wpm", "pace", "fit"))
    for s in cues["sections"]:
        if not s.get("present"):
            log("  %-14s %5d %6.1f %8s   (missing)" % (s["id"], s["words"], s["slot_len_s"], "-"))
            continue
        fit = "ok" if s["fits_with_min_spare"] else ("TIGHT (<%.1f s spare)" % cues["min_spare_s"]
                                                     if s["fits"] else "DOES NOT FIT")
        log("  %-14s %5d %6.1f %8.2f %7.2f %7.1f %6s %s" % (
            s["id"], s["words"], s["slot_len_s"], s["duration_s"], s["spare_s"],
            s["wpm_effective"], "in" if s["in_pace_range"] else "OUT", fit))
    if t["wpm_effective"] is not None:
        log("  %-14s %5d %6s %8.2f %7s %7.1f %6s" % (
            "TOTAL", t["words"], "", t["duration_s"], "", t["wpm_effective"],
            "in" if t["in_pace_range"] else "OUT"))
    c = cues["checks"]
    log("  checks: %d files, format ok=%s, max peak %.2f dBFS, full-scale samples %d, "
        "longest silence inside a sentence %.3f s" % (
            c["files_checked"], c["all_wave_48k_mono_int16"], c["max_peak_dbfs"] or 0.0,
            c["full_scale_samples_total"], c["longest_silence_inside_a_sentence_s"] or 0.0))
    for p in c["problems"]:
        log("  PROBLEM: " + p)


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, path)


def make_sample(wav, m4a):
    os.makedirs(os.path.dirname(m4a), exist_ok=True)
    run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "96000", "-q", "127", wav, m4a])
    return afinfo(m4a)


def build_voice(args, script, voice_name, locale, synth):
    thr = db_to_amp(args.silence_db)
    wr = script.get("video", {}).get("pace_wpm", [135, 150])
    vdir = os.path.join(args.out_root, safe_dir(voice_name))
    label = short_name(voice_name)
    section_rates = dict(args.section_rate_map)
    tune_info = None

    if args.rate:
        rate, how = args.rate, "--rate"
    elif label in TUNED and not args.tune:
        rate, how = TUNED[label]["rate"], "TUNED table in make_vo.py"
        if args.pause is None:
            args.pause_eff = TUNED[label].get("pause", args.pause_eff)
    else:
        log("  tuning say -r for %s (target %.1f wpm, accepted %s..%s)" % (
            label, args.target_wpm, wr[0], wr[1]))
        grid = [args.pause_eff] if args.pause is not None else PAUSE_GRID
        rate, p2, got, tune_info = tune_rate(synth, script, label, args.target_wpm,
                                             args.min_rate, args.max_rate, args.pause_eff, grid,
                                             thr, wr, args.min_spare)
        args.pause_eff = p2
        how = "--tune"
        log("  -> say -r %d with pause %.2f s gives %.1f wpm" % (rate, p2, got))

    section_tuning = {}
    if args.tune_sections:
        base = render_sentences(synth, script, label, rate, {}, thr)
        _, per, _, _ = pace(script, section_durations(script, base, args.pause_eff))
        for sec in script["sections"]:
            sid = sec["id"]
            if sid in section_rates or wr[0] <= per[sid] <= wr[1]:
                continue
            want = wr[1] - 2.0 if per[sid] > wr[1] else wr[0] + 2.0
            r2, got2 = tune_section_pace(synth, script, label, sec, args.min_rate, args.max_rate,
                                         args.pause_eff, thr, want, wr)
            section_rates[sid] = r2
            section_tuning[sid] = {"wpm_at_voice_rate": round(per[sid], 1), "say_rate": r2,
                                   "wpm": round(got2, 1)}
            log("    section %s: %.1f wpm at -r %d  ->  -r %d gives %.1f wpm" % (
                sid, per[sid], rate, r2, got2))

    log("  voice %s (%s): say -r %d (%s), pause %.2f s" % (label, locale, rate, how, args.pause_eff))
    sent = render_sentences(synth, script, label, rate, section_rates, thr)
    repro = []
    if not args.no_verify:
        plan = plan_sentences(script, label, rate, section_rates)
        repro = synth.verify(label, [(p[5], p[3]) for p in plan])
        for r in repro:
            log("  RE-RENDERED (first render was not reproducible, %s): %s" % (
                r["resolution"], r["spoken"][:60]))
        if repro:
            sent = render_sentences(synth, script, label, rate, section_rates, thr)

    # one gain for the whole voice, so the relative level of the sentences is untouched
    gain, gain_note = 1.0, "none"
    everything = array.array("h")
    for k in sorted(sent):
        everything.extend(sent[k])
    raw_peak, raw_rms = peak(everything), rms(everything)
    if not args.no_normalize and raw_rms > 0:
        g_rms = db_to_amp(args.target_rms_db) / raw_rms
        g_peak = db_to_amp(args.peak_ceiling_db) / raw_peak
        gain = min(g_rms, g_peak)
        gain_note = "rms target %.1f dBFS%s" % (
            args.target_rms_db, " (limited by the %.1f dBFS peak ceiling)" % args.peak_ceiling_db
            if g_peak < g_rms else "")
        sent = {k: apply_gain(v, gain) for k, v in sent.items()}
    del everything

    os.makedirs(os.path.join(vdir, "sentences"), exist_ok=True)
    sections_audio, spans, spoken_for, files = {}, {}, {}, []
    per_rate = {}
    for sec in script["sections"]:
        sid, cnt = sec["id"], len(sec["sentences"])
        per_rate[sid] = section_rates.get(sid, rate)
        buf, sp = array.array("h"), []
        for n in range(1, cnt + 1):
            a = sent[(sid, n)]
            p = os.path.join(vdir, "sentences", "%s_%d.wav" % (sid, n))
            write_wav(p, a)
            files.append((p, True))
            sp.append((len(buf) / float(SR), len(a) / float(SR)))
            buf.extend(a)
            buf.extend(silence(pause_after(sid, n, cnt, args.pause_eff)))
            spoken_for[(sid, n)] = respell(sec["sentences"][n - 1], label)
        p = os.path.join(vdir, "%s.wav" % sid)
        write_wav(p, buf)
        files.append((p, False))
        sections_audio[sid] = buf
        spans[sid] = (sp, "exact (assembled from the sentence files)")

    tl, tl_starts, tl_notes = build_timeline(script, sections_audio, args.lead_in)
    tl_path = os.path.join(vdir, "timeline.wav")
    write_wav(tl_path, tl)
    files.append((tl_path, False))

    results = [check_wav_file(p, thr, args.max_inner_silence, is_s) for p, is_s in files]
    checks = summarise_checks(results, vdir)
    checks["per_file"] = [{k: v for k, v in r.items() if k != "file"}
                          for r in results]
    for r, (p, _) in zip(checks["per_file"], files):
        r["file"] = os.path.relpath(p, vdir)

    extra = {
        "locale": locale,
        "synth": {
            "engine": "macOS say + afconvert",
            "voice_full_name": voice_name,
            "say_rate": rate,
            "say_rate_source": how,
            "section_rate_overrides": section_rates,
            "native_sample_rate_hz": sorted(synth.native_rates),
            "pause_between_sentences_s": args.pause_eff,
            "pause_overrides": PAUSE_AFTER,
            "trim_threshold_dbfs": args.silence_db,
            "gain_db": round(20 * math.log10(gain), 2) if gain > 0 else None,
            "gain_rule": gain_note,
            "level_before_gain": {"peak_dbfs": round(amp_to_db(raw_peak), 2),
                                  "rms_dbfs": round(amp_to_db(raw_rms), 2)},
            "respelling_rules": [{"id": r[0], "pattern": r[1], "replacement": r[2]}
                                 for r in RESPELL if r[0] not in RESPELL_SKIP.get(label, set())]
            + [{"id": r[0], "pattern": r[1], "replacement": r[2]}
               for r in RESPELL_EXTRA.get(label, [])],
        },
        "timeline": {"file": "timeline.wav", "duration_s": round(len(tl) / float(SR), 3),
                     "lead_in_s": args.lead_in, "notes": tl_notes},
    }
    extra["synth"]["render_verification"] = {
        "done": not args.no_verify,
        "method": "every sentence rendered a second time, one at a time, PCM compared bit for bit",
        "not_reproducible_at_first": repro}
    if tune_info:
        extra["synth"]["tuning"] = tune_info
    if section_tuning:
        extra["synth"]["section_tuning"] = section_tuning

    cues = make_cues(script, label, "synth", sections_audio, spans, extra, args, tl_starts,
                     checks, per_rate, spoken_for)

    # optional faster alternative for sections that miss the spare-time target
    if args.fit_alt:
        alts = []
        for sec in script["sections"]:
            s = [x for x in cues["sections"] if x["id"] == sec["id"]][0]
            if s["fits_with_min_spare"]:
                continue
            need = s["slot_len_s"] - args.min_spare
            r2, d2 = tune_section_fit(synth, script, label, sec, per_rate[sec["id"]],
                                      args.max_rate, args.pause_eff, thr, need)
            if r2 is None:
                alts.append({"id": sec["id"], "error": "even say -r %d gives %.2f s, more than %.2f s" % (
                    args.max_rate, d2, need)})
                continue
            one = render_sentences(synth, {"sections": [sec]}, label, r2, {}, thr)
            if not args.no_verify:
                bad = synth.verify(label, [(r2, respell(t, label)[0]) for t in sec["sentences"]])
                if bad:
                    repro.extend(bad)
                    one = render_sentences(synth, {"sections": [sec]}, label, r2, {}, thr)
            one = {k: apply_gain(v, gain) for k, v in one.items()}
            adir = os.path.join(vdir, "alt_fit")
            os.makedirs(os.path.join(adir, "sentences"), exist_ok=True)
            buf, sl, cnt = array.array("h"), [], len(sec["sentences"])
            for n in range(1, cnt + 1):
                a = one[(sec["id"], n)]
                write_wav(os.path.join(adir, "sentences", "%s_%d.wav" % (sec["id"], n)), a)
                sl.append({"n": n, "file": "alt_fit/sentences/%s_%d.wav" % (sec["id"], n),
                           "text": sec["sentences"][n - 1],
                           "start_s": round(len(buf) / float(SR), 3),
                           "duration_s": round(len(a) / float(SR), 3)})
                buf.extend(a)
                buf.extend(silence(pause_after(sec["id"], n, cnt, args.pause_eff)))
            ap = os.path.join(adir, "%s.wav" % sec["id"])
            write_wav(ap, buf)
            chk = check_wav_file(ap, thr, args.max_inner_silence, False)
            d = len(buf) / float(SR)
            w = s["words"] / (d / 60.0)
            alts.append({"id": sec["id"], "file": "alt_fit/%s.wav" % sec["id"], "say_rate": r2,
                         "duration_s": round(d, 3), "spare_s": round(s["slot_len_s"] - d, 3),
                         "wpm_effective": round(w, 1),
                         "in_pace_range": bool(wr[0] <= w <= wr[1]),
                         "fits_with_min_spare": bool(s["slot_len_s"] - d >= args.min_spare),
                         "format_ok": chk.get("format_ok"), "problems": chk["problems"],
                         "sentences": sl})
        cues["alt_fit"] = {
            "note": "Faster renders of the sections that miss min_spare_s at the normal rate. "
                    "They are NOT used in timeline.wav. To use one, copy it over <section_id>.wav "
                    "and its sentences, then run --measure-only --timeline.",
            "sections": alts}

    write_json(os.path.join(vdir, "cues.json"), cues)

    if args.samples:
        first = script["sections"][0]["id"]
        m4a = os.path.join(args.out_root, "samples", "%s_opening.m4a" % safe_dir(voice_name))
        info = make_sample(os.path.join(vdir, "%s.wav" % first), m4a)
        log("  sample: %s  (%s ch, %s Hz, %s, %.2f s)" % (
            os.path.relpath(m4a, REPO_ROOT), info.get("channels"), info.get("rate"),
            info.get("fmt"), info.get("duration") or 0))

    log("  written: %s" % os.path.relpath(vdir, REPO_ROOT))
    print_table(cues)
    for n in tl_notes:
        log("  timeline: " + n)
    for a in cues.get("alt_fit", {}).get("sections", []):
        if "error" in a:
            log("  alt_fit %s: %s" % (a["id"], a["error"]))
        else:
            log("  alt_fit %s: say -r %d -> %.2f s, spare %.2f s, %.1f wpm (%s the pace range)" % (
                a["id"], a["say_rate"], a["duration_s"], a["spare_s"], a["wpm_effective"],
                "inside" if a["in_pace_range"] else "OUTSIDE"))
    return cues


# --------------------------------------------------------------------------------------
# --measure-only : rebuild cues.json from whatever WAV files are present
# --------------------------------------------------------------------------------------
def measure_only(args, script, vdir, label):
    if not os.path.isdir(vdir):
        raise SystemExit("no such directory: %s" % vdir)
    sections_audio, spans, files, notes = {}, {}, [], []
    abs_thr = db_to_amp(args.silence_db)
    for sec in script["sections"]:
        sid, cnt = sec["id"], len(sec["sentences"])
        words = [count_words(t) for t in sec["sentences"]]
        spath = os.path.join(vdir, "%s.wav" % sid)
        sent_paths = [os.path.join(vdir, "sentences", "%s_%d.wav" % (sid, n))
                      for n in range(1, cnt + 1)]
        have_sent = [os.path.isfile(p) for p in sent_paths]
        sents = []
        if all(have_sent):
            for p in sent_paths:
                try:
                    a, info = read_wav(p)
                    if info["rate"] != SR or info["channels"] != 1:
                        raise ValueError("%d Hz / %d ch" % (info["rate"], info["channels"]))
                    sents.append(a)
                except Exception as e:      # noqa
                    notes.append("%s: not usable (%s)" % (os.path.relpath(p, vdir), e))
                    sents = []
                    break
        elif any(have_sent):
            notes.append("%s: only %d of %d sentence files present, they are ignored" % (
                sid, sum(have_sent), cnt))
        for p, h in zip(sent_paths, have_sent):
            if h:
                files.append((p, True))

        if not os.path.isfile(spath):
            if sents and args.assemble:
                buf, sp = array.array("h"), []
                for n, a in enumerate(sents, 1):
                    sp.append((len(buf) / float(SR), len(a) / float(SR)))
                    buf.extend(a)
                    buf.extend(silence(pause_after(sid, n, cnt, args.pause_eff)))
                write_wav(spath, buf)
                files.append((spath, False))
                sections_audio[sid] = buf
                spans[sid] = (sp, "exact (section assembled now from the sentence files)")
                notes.append("%s.wav was assembled from its sentence files" % sid)
            elif sents:
                notes.append("%s.wav is missing; sentence files exist, add --assemble to build it" % sid)
            continue

        files.append((spath, False))
        try:
            a, info = read_wav(spath)
        except Exception as e:              # noqa
            notes.append("%s.wav: cannot be read (%s)" % (sid, e))
            continue
        if info["rate"] != SR or info["channels"] != 1:
            notes.append("%s.wav is %d Hz / %d ch; convert it first: afconvert -f WAVE -d LEI16@48000 -c 1 in.wav out.wav" % (
                sid, info["rate"], info["channels"]))
            continue
        sections_audio[sid] = a
        sp, method = None, None
        if sents:
            offs = [locate_by_match(a, s) for s in sents]
            if all(o is not None for o in offs) and offs == sorted(offs):
                sp = [(o / float(SR), len(s) / float(SR)) for o, s in zip(offs, sents)]
                method = "exact (sentence files located inside the section file)"
        if sp is None:
            pk = peak(a)
            thr = max(abs_thr, pk * (10 ** (-40 / 20.0)))
            sp, method = split_by_silence(a, cnt, thr, words)
        spans[sid] = (sp, method)

    thr = abs_thr
    tl_starts, extra = {}, {}
    if args.timeline and sections_audio:
        tl, tl_starts, tl_notes = build_timeline(script, sections_audio, args.lead_in)
        tl_path = os.path.join(vdir, "timeline.wav")
        write_wav(tl_path, tl)
        files.append((tl_path, False))
        extra["timeline"] = {"file": "timeline.wav", "duration_s": round(len(tl) / float(SR), 3),
                             "lead_in_s": args.lead_in, "notes": tl_notes}
    else:
        # positions a later --timeline run would use
        _, tl_starts, tl_notes = build_timeline(script, sections_audio, args.lead_in) \
            if sections_audio else (None, {}, [])
        extra["timeline"] = {"file": None, "lead_in_s": args.lead_in, "notes": tl_notes,
                             "note": "timeline.wav was not rebuilt (add --timeline); "
                                     "timeline_start_s values are where it would place the sections"}

    results = [check_wav_file(p, thr, args.max_inner_silence, is_s) for p, is_s in files]
    checks = summarise_checks(results, vdir)
    checks["per_file"] = []
    for r, (p, _) in zip(results, files):
        d = {k: v for k, v in r.items() if k != "file"}
        d["file"] = os.path.relpath(p, vdir)
        checks["per_file"].append(d)
    checks["notes"] = notes

    old = os.path.join(vdir, "cues.json")
    if os.path.isfile(old):
        try:
            with open(old, "r", encoding="utf-8") as fh:
                prev = json.load(fh)
            if "synth" in prev:
                extra["previous_synth_settings"] = prev["synth"]
            elif "previous_synth_settings" in prev:
                extra["previous_synth_settings"] = prev["previous_synth_settings"]
            if "locale" in prev:
                extra["locale"] = prev["locale"]
        except Exception:                   # noqa
            pass

    cues = make_cues(script, label, "measure-only", sections_audio, spans, extra, args,
                     tl_starts, checks)
    write_json(old, cues)
    log("  measured: %s" % os.path.relpath(vdir, REPO_ROOT))
    print_table(cues)
    for n in notes:
        log("  note: " + n)
    for n in tl_notes:
        log("  timeline: " + n)
    return cues


# --------------------------------------------------------------------------------------
# --audit : measurable pronunciation evidence (no listening involved)
# --------------------------------------------------------------------------------------
def band_spectrum(a, f0=100, f1=3500, step=50, n=1920):
    """Average power (dB) per frequency over the middle of a short word (Goertzel)."""
    s, e = int(len(a) * 0.25), int(len(a) * 0.65)
    freqs = list(range(f0, f1 + 1, step))
    acc, frames = [0.0] * len(freqs), 0
    hann = [0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1)) for i in range(n)]
    pos = s
    while pos + n <= len(a) and (frames == 0 or pos + n <= e):
        x = [a[pos + i] * hann[i] for i in range(n)]
        for k, f in enumerate(freqs):
            c = 2 * math.cos(2 * math.pi * f / SR)
            s1 = s2 = 0.0
            for v in x:
                s0 = v + c * s1 - s2
                s2 = s1
                s1 = s0
            acc[k] += s1 * s1 + s2 * s2 - c * s1 * s2
        frames += 1
        pos += n // 2
    if frames == 0:
        return freqs, [0.0] * len(freqs)
    return freqs, [10 * math.log10(p / frames + 1e-9) for p in acc]


def formant_peaks(freqs, level):
    def pk(lo, hi):
        return max((level[i], f) for i, f in enumerate(freqs) if lo <= f <= hi)[1]
    return pk(200, 900), pk(1400, 2800)


def spec_dist(a, b):
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    return math.sqrt(sum(((x - ma) - (y - mb)) ** 2 for x, y in zip(a, b)) / len(a))


def audit_voice(args, script, voice_name, locale, synth, rate):
    thr = db_to_amp(args.silence_db)
    label = short_name(voice_name)
    rep = {"voice": label, "locale": locale, "say_rate": rate,
           "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
           "method": "Two spellings are synthesised and the trimmed PCM is compared. "
                     "'identical' = byte-identical audio. No listening is involved; "
                     "a human must still check the result by ear."}

    def tts(text):
        return trim(synth.get(label, rate, text), thr)

    # 1. marginal effect of every respelling rule on every sentence it touches
    rules = []
    for sec in script["sections"]:
        for n, text in enumerate(sec["sentences"], 1):
            full, applied = respell(text, label)
            if not applied:
                continue
            a_full = tts(full)
            for rid in applied:
                without, _ = respell(text, label, skip=(rid,))
                a_wo = tts(without)
                rules.append({"sentence": "%s_%d" % (sec["id"], n), "rule": rid,
                              "without_rule": without, "with_rule": full,
                              "identical_audio": a_wo == a_full,
                              "duration_without_s": round(len(a_wo) / float(SR), 3),
                              "duration_with_s": round(len(a_full) / float(SR), 3)})
    rep["rule_effect"] = rules

    # 2. homograph "lead": native spelling against "leed" and "led", in the real sentences
    homo = []
    for sec in script["sections"]:
        for n, text in enumerate(sec["sentences"], 1):
            if not re.search(r"\b[Ll]eads?\b", text):
                continue
            native, _ = respell(text, label, skip=("lead",))
            v_leed = re.sub(r"\b([Ll])ead(s?)\b", r"\1eed\2", native)
            v_led = re.sub(r"\b([Ll])ead(s?)\b", r"\1ed\2", native)
            a, b, c = tts(native), tts(v_leed), tts(v_led)
            verdict = ("same audio as 'leed' (long vowel, intended)" if a == b else
                       "same audio as 'led' (WRONG word, the metal)" if a == c else
                       "differs from both spellings (not decidable this way)")
            homo.append({"sentence": "%s_%d" % (sec["id"], n), "native_text": native,
                         "native_vs_leed_identical": a == b, "native_vs_led_identical": a == c,
                         "verdict_for_native_spelling": verdict,
                         "durations_s": {"native": round(len(a) / float(SR), 3),
                                         "leed": round(len(b) / float(SR), 3),
                                         "led": round(len(c) / float(SR), 3)}})
    rep["homograph_lead_in_context"] = homo

    # 3. vowel of the isolated words (formant peaks; bead/bed are the reference vowels)
    spec, vow = {}, {}
    for w in ["lead", "leed", "led", "leads", "leeds", "leds", "bead", "bed"]:
        a = tts(w)
        f, lv = band_spectrum(a)
        spec[w] = lv
        f1, f2 = formant_peaks(f, lv)
        vow[w] = {"duration_s": round(len(a) / float(SR), 3), "f1_peak_hz": f1, "f2_peak_hz": f2}
    rep["isolated_vowel"] = {
        "words": vow,
        "spectral_distance_db": {
            "lead_vs_leed": round(spec_dist(spec["lead"], spec["leed"]), 2),
            "lead_vs_led": round(spec_dist(spec["lead"], spec["led"]), 2),
            "leads_vs_leeds": round(spec_dist(spec["leads"], spec["leeds"]), 2),
            "leads_vs_leds": round(spec_dist(spec["leads"], spec["leds"]), 2),
            "bead_vs_bed": round(spec_dist(spec["bead"], spec["bed"]), 2),
        },
        "reading": "lead is closer to '%s'; leads is closer to '%s'" % (
            "leed" if spec_dist(spec["lead"], spec["leed"]) <= spec_dist(spec["lead"], spec["led"]) else "led",
            "leeds" if spec_dist(spec["leads"], spec["leeds"]) <= spec_dist(spec["leads"], spec["leds"]) else "leds"),
    }

    # 4. isolated tokens: letters or word?
    tok = {}
    for w in ["ERP", "E R P", "urp", "CRM", "C R M", "ProgBiz", "Prog Biz", "Progbiz", "prog", "biz"]:
        tok[w] = tts(w)
    rep["isolated_tokens"] = {
        "durations_s": {w: round(len(a) / float(SR), 3) for w, a in tok.items()},
        "ERP_identical_to_urp": tok["ERP"] == tok["urp"],
        "ERP_identical_to_E_R_P": tok["ERP"] == tok["E R P"],
        "CRM_identical_to_C_R_M": tok["CRM"] == tok["C R M"],
        "ProgBiz_identical_to_Prog_Biz": tok["ProgBiz"] == tok["Prog Biz"],
        "ProgBiz_identical_to_Progbiz": tok["ProgBiz"] == tok["Progbiz"],
    }

    vdir = os.path.join(args.out_root, safe_dir(voice_name))
    os.makedirs(vdir, exist_ok=True)
    write_json(os.path.join(vdir, "pronunciation_audit.json"), rep)
    log("  audit written: %s" % os.path.relpath(os.path.join(vdir, "pronunciation_audit.json"), REPO_ROOT))
    wrong = [h["sentence"] for h in homo if h["native_vs_led_identical"]]
    undec = [h["sentence"] for h in homo if not h["native_vs_led_identical"] and not h["native_vs_leed_identical"]]
    log("    'lead' as written: identical to 'led' in %s; undecidable in %s" % (wrong or "none", undec or "none"))
    log("    isolated vowel: %s   (lead F1/F2 %d/%d Hz, leed %d/%d, led %d/%d, bead %d/%d, bed %d/%d)" % (
        rep["isolated_vowel"]["reading"],
        vow["lead"]["f1_peak_hz"], vow["lead"]["f2_peak_hz"], vow["leed"]["f1_peak_hz"], vow["leed"]["f2_peak_hz"],
        vow["led"]["f1_peak_hz"], vow["led"]["f2_peak_hz"], vow["bead"]["f1_peak_hz"], vow["bead"]["f2_peak_hz"],
        vow["bed"]["f1_peak_hz"], vow["bed"]["f2_peak_hz"]))
    log("    ERP == urp: %s;  ERP %.2f s, E R P %.2f s;  CRM == C R M: %s;  ProgBiz == Prog Biz: %s (%.2f s)" % (
        rep["isolated_tokens"]["ERP_identical_to_urp"], len(tok["ERP"]) / float(SR),
        len(tok["E R P"]) / float(SR), rep["isolated_tokens"]["CRM_identical_to_C_R_M"],
        rep["isolated_tokens"]["ProgBiz_identical_to_Prog_Biz"], len(tok["Prog Biz"]) / float(SR)))
    changed = sorted(set(r["rule"] for r in rules if not r["identical_audio"]))
    noop = sorted(set(r["rule"] for r in rules) - set(changed))
    log("    rules that change the audio: %s;  rules that are no-ops for this voice: %s" % (
        changed or "none", noop or "none"))
    return rep


# --------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------
def parse_args(argv):
    ap = argparse.ArgumentParser(
        description="Draft voice-over and timing cue sheet from script.json (macOS say).")
    ap.add_argument("--voice", action="append", default=[],
                    help="voice name, may be given several times or comma separated "
                         "(default: %s)" % ", ".join(DEFAULT_VOICES))
    ap.add_argument("--rate", type=int, default=0, help="say -r value (skips tuning)")
    ap.add_argument("--tune", action="store_true",
                    help="search the say -r value whose measured pace is closest to --target-wpm")
    ap.add_argument("--target-wpm", type=float, default=147.0,
                    help="wanted effective pace of the whole narration (default 147)")
    ap.add_argument("--min-rate", type=int, default=30)
    ap.add_argument("--max-rate", type=int, default=400)
    ap.add_argument("--tune-sections", action="store_true",
                    help="give every section that is outside the pace range its own say -r "
                         "(delivery is then no longer uniform)")
    ap.add_argument("--section-rate", action="append", default=[], metavar="SECTION_ID=RATE",
                    help="say -r override for one section, e.g. 01_opening=215")
    ap.add_argument("--pause", type=float, default=None,
                    help="silence between sentences in seconds (default 0.35)")
    ap.add_argument("--lead-in", type=float, default=0.5,
                    help="silence before a section inside its slot in timeline.wav (default 0.5)")
    ap.add_argument("--min-spare", type=float, default=1.5,
                    help="spare seconds wanted in every slot (default 1.5)")
    ap.add_argument("--fit-alt", action="store_true",
                    help="also render a faster alternative of every section that misses --min-spare")
    ap.add_argument("--samples", action="store_true",
                    help="write samples/<voice>_opening.m4a (first section, AAC)")
    ap.add_argument("--audit", action="store_true",
                    help="write <voice>/pronunciation_audit.json (no section files are written)")
    ap.add_argument("--measure-only", action="store_true",
                    help="do not synthesise; rebuild cues.json from the WAV files present")
    ap.add_argument("--assemble", action="store_true",
                    help="with --measure-only: build a missing <section_id>.wav from its sentence files")
    ap.add_argument("--timeline", action="store_true",
                    help="with --measure-only: rebuild timeline.wav too")
    ap.add_argument("--dir", default=None,
                    help="with --measure-only: directory to measure (default <out-root>/<voice>)")
    ap.add_argument("--list-voices", action="store_true")
    ap.add_argument("--script", default=DEFAULT_SCRIPT)
    ap.add_argument("--out-root", default=DEFAULT_OUT_ROOT)
    ap.add_argument("--silence-db", type=float, default=-50.0,
                    help="level below which audio counts as silence (default -50 dBFS)")
    ap.add_argument("--max-inner-silence", type=float, default=0.60,
                    help="longest silence tolerated inside one sentence file (default 0.60 s)")
    ap.add_argument("--target-rms-db", type=float, default=-20.0,
                    help="speech level after the per-voice gain (default -20 dBFS RMS)")
    ap.add_argument("--peak-ceiling-db", type=float, default=-1.5,
                    help="the gain is reduced if a peak would exceed this (default -1.5 dBFS)")
    ap.add_argument("--no-normalize", action="store_true",
                    help="keep the level exactly as the synthesiser delivers it")
    ap.add_argument("--jobs", type=int, default=1,
                    help="say processes run at the same time (default 1; more than 1 has "
                         "produced truncated audio on this machine, do not raise it)")
    ap.add_argument("--no-verify", action="store_true",
                    help="skip the second render that proves every sentence is reproducible")
    ap.add_argument("--keep-work", action="store_true")
    args = ap.parse_args(argv)
    args.script = os.path.abspath(args.script)
    args.out_root = os.path.abspath(args.out_root)
    args.pause_eff = 0.35 if args.pause is None else args.pause
    args.section_rate_map = {}
    for item in args.section_rate:
        m = re.match(r"^([^=]+)=(\d+)$", item)
        if not m:
            ap.error("--section-rate wants SECTION_ID=RATE, got %r" % item)
        args.section_rate_map[m.group(1)] = int(m.group(2))
    names = []
    for v in args.voice:
        names += [x.strip() for x in v.split(",") if x.strip()]
    args.voice = names
    return args


def main(argv=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])
    script = load_script(args.script)
    known = set(s["id"] for s in script["sections"])
    for sid in args.section_rate_map:
        if sid not in known:
            raise SystemExit("unknown section id in --section-rate: %s" % sid)

    if args.list_voices:
        vs = list_voices()
        log("%d voices installed, %d English" % (len(vs), len([v for v in vs if v[1].startswith("en")])))
        log("%-28s %-7s %-9s %s" % ("name", "locale", "quality", "use"))
        for n, loc in vs:
            if not loc.startswith("en"):
                continue
            q = quality_tag(n) or "compact"
            use = "excluded (novelty / legacy / Eloquence)" if is_novelty(n) else "candidate"
            log("%-28s %-7s %-9s %s" % (n, loc, q, use))
        hi = [n for n, loc in vs if loc.startswith("en") and quality_tag(n)]
        log("Enhanced / Premium / Siri English voices: %s" % (", ".join(hi) if hi else "none installed"))
        return 0

    if args.measure_only:
        if args.dir:
            vdir = os.path.abspath(args.dir)
            measure_only(args, script, vdir, os.path.basename(vdir.rstrip(os.sep)))
            return 0
        if not args.voice:
            raise SystemExit("--measure-only needs --voice NAME (directory under %s) or --dir PATH"
                             % os.path.relpath(args.out_root, REPO_ROOT))
        for v in args.voice:
            log("== %s" % v)
            measure_only(args, script, os.path.join(args.out_root, safe_dir(v)), short_name(v))
        return 0

    installed = list_voices()
    wanted = args.voice or DEFAULT_VOICES
    work = os.path.join(args.out_root, ".work", "p%d" % os.getpid())
    os.makedirs(args.out_root, exist_ok=True)
    synth = Synth(work, args.jobs)
    rc = 0
    try:
        for v in wanted:
            hit = find_voice(v, installed)
            log("== %s" % v)
            if not hit:
                log("  NOT INSTALLED - skipped")
                rc = 1
                continue
            if is_novelty(hit[0]):
                log("  novelty / legacy voice - skipped")
                rc = 1
                continue
            base_pause = args.pause_eff
            if args.audit:
                label = short_name(hit[0])
                rate = args.rate or TUNED.get(label, {}).get("rate") or 175
                audit_voice(args, script, hit[0], hit[1], synth, rate)
            else:
                build_voice(args, script, hit[0], hit[1], synth)
            args.pause_eff = base_pause
            synth.mem.clear()
            synth.native_rates.clear()
    finally:
        if not args.keep_work:
            shutil.rmtree(work, ignore_errors=True)
            try:
                os.rmdir(os.path.dirname(work))     # only succeeds when no other run is active
            except OSError:
                pass
    return rc


if __name__ == "__main__":
    sys.exit(main())
