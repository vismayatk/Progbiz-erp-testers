#!/usr/bin/env python3
"""Subtitles (SRT) for a beta video from the exact narration timings.

Reads   reports/video/beta/voice_cues_<tag>.json   (start of every sentence clip, video time)
        reports/video/beta/audio_<tag>/<voice>/cues.json   (text and duration of every sentence)
Writes  reports/video/beta/Progbiz_ERP_Video_<TAG>.srt

Long sentences are split at commas / word boundaries into cues of at most two lines of 42
characters; the time of every cue is proportional to its share of the sentence, so a subtitle
appears while its words are being spoken.

Run:  python3 scripts/video/beta/11_make_srt.py [--tag v4] [--voice com_apple_voice_Tara_premium]
"""
import argparse, json, os, re, textwrap

ap = argparse.ArgumentParser()
ap.add_argument('--tag', default='v4')
ap.add_argument('--voice', default='com_apple_voice_Tara_premium')
ap.add_argument('--out', default=None)
ap.add_argument('--line', type=int, default=42)
ap.add_argument('--dir', default='reports/video/beta', help='folder with sentences_<tag>.json / voice_cues_<tag>.json')
ap.add_argument('--audio', default=None, help='audio folder name (default audio_<tag>)')
a = ap.parse_args()

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
BETA = os.path.join(ROOT, a.dir)
SENT = os.path.join(BETA, f'sentences_{a.tag}.json')
if os.path.exists(SENT):                       # written by 10_build_timeline_v4.js: text, start and end in video time
    rows = json.load(open(SENT, encoding='utf-8'))
    starts = [{'start_s': r['start_s']} for r in rows]
    sents = [{'text': r['text'], 'duration_s': r['end_s'] - r['start_s']} for r in rows]
else:
    starts = json.load(open(os.path.join(BETA, f'voice_cues_{a.tag}.json'), encoding='utf-8'))
    cues = json.load(open(os.path.join(BETA, a.audio or f'audio_{a.tag}', a.voice, 'cues.json'), encoding='utf-8'))
    sents = [x for s in cues['sections'] for x in s['sentences']]
    assert len(starts) == len(sents), (len(starts), len(sents))
MAXC = a.line * 2


def split(text):
    """pieces of at most MAXC characters, preferring breaks after commas"""
    text = text.strip()
    if len(textwrap.wrap(text, a.line)) <= 2:
        return [text]
    words = text.split(' ')
    # candidate break positions (after a word), scored: commas are best, then balance
    best = None
    for i in range(1, len(words)):
        left, right = ' '.join(words[:i]), ' '.join(words[i:])
        if len(textwrap.wrap(left, a.line)) > 2:
            continue
        score = abs(len(left) - len(right)) - (25 if words[i - 1].endswith(',') else 0)
        if best is None or score < best[0]:
            best = (score, i)
    if best is None:
        i = len(words) // 2
    else:
        i = best[1]
    return split(' '.join(words[:i])) + split(' '.join(words[i:]))


def lines(text):
    w = textwrap.wrap(text, a.line)
    if len(w) == 2 and len(text) > 30:  # balanced lines read better than a long line plus one word
        for width in range(len(text) // 2, a.line + 1):
            t = textwrap.wrap(text, width)
            if len(t) == 2 and max(map(len, t)) <= a.line:
                w = t
                break
    return w


def ts(t):
    t = max(0.0, t)
    ms = int(round(t * 1000))
    return '%02d:%02d:%02d,%03d' % (ms // 3600000, ms // 60000 % 60, ms // 1000 % 60, ms % 1000)


out = []
for st, s in zip(starts, sents):
    start, dur = float(st['start_s']), float(s['duration_s'])
    pieces = split(s['text'])
    total = sum(len(p) for p in pieces)
    t = start
    for p in pieces:
        d = dur * len(p) / total
        out.append([t, t + d, lines(p)])
        t += d
# a subtitle stays a little after its last word (up to 0.25 s), never into the next one
for i, c in enumerate(out):
    nxt = out[i + 1][0] if i + 1 < len(out) else 1e9
    c[1] = min(c[1] + 0.25, nxt - 0.04)
    if c[1] - c[0] < 0.8:
        c[1] = min(c[0] + 0.8, nxt - 0.04)

path = a.out or os.path.join(BETA, f'Progbiz_ERP_Video_{a.tag.upper()}.srt')
with open(path, 'w', encoding='utf-8', newline='') as f:
    for i, (s, e, ls) in enumerate(out, 1):
        f.write(f'{i}\r\n{ts(s)} --> {ts(e)}\r\n' + '\r\n'.join(ls) + '\r\n\r\n')
print(f'{len(out)} subtitles -> {os.path.relpath(path, ROOT)}')
