#!/usr/bin/env python3
"""Narration for the KT videos: every sentence spoken on its own by a neural text-to-speech voice,
trimmed, levelled to -20 dBFS RMS and saved as one 48 kHz mono WAV per sentence, plus durations.json.
The video builder places each sentence itself, so the timing of every sentence is exact.

  python3 scripts/video/kt/make_voice.py --lang en [--voice en-IN-NeerjaExpressiveNeural] [--rate +0%]
  python3 scripts/video/kt/make_voice.py --lang ml [--voice ml-IN-SobhanaNeural]

Reads : reports/video/kt/script_<lang>.json   ({"sentences": [{"id", "text"}]}, written by build_kt.js --script-only)
Writes: reports/video/kt/voice/<lang>/<id>.wav, durations.json; mp3/ = cache of the raw TTS (delete to regenerate)

Uses the edge-tts package (Microsoft's online read-aloud voices): the TEXT OF THE SCRIPT IS SENT to that service.
English-letter terms are respelled for the Malayalam voice only (SPOKEN_ML); scripts and subtitles keep them.
"""
import argparse
import array
import asyncio
import json
import math
import os
import re
import subprocess
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
KT = os.path.join(ROOT, 'reports', 'video', 'kt')
SR = 48000
VOICES = {'en': 'en-IN-NeerjaExpressiveNeural', 'ml': 'ml-IN-SobhanaNeural'}
# the Malayalam voice reads Latin letters badly: say these the way a Kerala trainer would
SPOKEN_ML = [('Progbiz', 'പ്രോഗ്ബിസ്'), ('ERP', 'ഇ ആർ പി'), ('GSTR-3B', 'ജി എസ് ടി ആർ ത്രീ ബി'), ('GSTR-1', 'ജി എസ് ടി ആർ വൺ'),
             ('GST', 'ജി എസ് ടി'), ('P&L', 'പി ആൻഡ് എൽ'), ('KT', 'കെ ടി'), ('HSN', 'എച്ച് എസ് എൻ'), ('SKU', 'എസ് കെ യു'),
             ('RFQ', 'ആർ എഫ് ക്യു'), ('PDF', 'പി ഡി എഫ്'), ('ITC', 'ഐ ടി സി'), ('CGST', 'സി ജി എസ് ടി'), ('SGST', 'എസ് ജി എസ് ടി'),
             ('IGST', 'ഐ ജി എസ് ടി'), ('B2B', 'ബി ടു ബി'), ('B2C', 'ബി ടു സി'), ('UOM', 'യു ഒ എം'), ('KSEB', 'കെ എസ് ഇ ബി')]
SPOKEN_EN = [('P&L', 'P and L'), ('GSTR-3B', 'G S T R 3 B'), ('GSTR-1', 'G S T R 1'), ('e.g.', 'for example')]


def spoken(t, lang):
    for a, b in (SPOKEN_ML if lang == 'ml' else SPOKEN_EN):
        t = re.sub(r'(?<![A-Za-z])' + re.escape(a) + r'(?![A-Za-z])', b, t)
    return t


def db(x):
    return 20 * math.log10(max(x, 1e-9))


def read_wav(path):
    with wave.open(path) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2
        a = array.array('h')
        a.frombytes(w.readframes(w.getnframes()))
    return a


def clean(a):
    """Trim the silence at both ends, bring the speech to -20 dBFS RMS (at most +9/-6 dB, peaks below -3 dBFS), short fades."""
    hop = SR // 100
    fr = [math.sqrt(sum(x * x for x in a[i:i + hop]) / max(1, len(a[i:i + hop]))) / 32768 for i in range(0, len(a), hop)]
    thr = 10 ** (-48 / 20)
    on = [i for i, v in enumerate(fr) if v > thr]
    if not on:
        raise RuntimeError('a sentence came out silent')
    i0 = max(0, on[0] * hop - int(0.02 * SR))
    i1 = min(len(a), (on[-1] + 1) * hop + int(0.04 * SR))
    b = a[i0:i1]
    voiced = [v for v in fr[on[0]:on[-1] + 1] if v > thr]
    rms = math.sqrt(sum(v * v for v in voiced) / len(voiced))
    g = min(9.0, max(-6.0, -20 - db(rms)))
    peak = max(max(b), -min(b)) / 32768
    g = min(g, -3 - db(peak))
    k = 10 ** (g / 20)
    out = array.array('h', (max(-32768, min(32767, int(round(x * k)))) for x in b))
    fi, fo = int(0.005 * SR), int(0.025 * SR)
    for i in range(min(fi, len(out))):
        out[i] = int(out[i] * i / fi)
    for i in range(min(fo, len(out))):
        out[len(out) - 1 - i] = int(out[len(out) - 1 - i] * i / fo)
    return out


async def tts_all(jobs, voice, rate, pitch):
    import edge_tts
    sem = asyncio.Semaphore(4)

    async def one(path, text):
        if os.path.exists(path) and os.path.getsize(path) > 2000:
            return
        async with sem:
            err = None
            for attempt in range(5):
                try:
                    await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(path)
                    if os.path.getsize(path) > 2000:
                        return
                except Exception as e:  # network hiccup: wait and try again
                    err = e
                await asyncio.sleep(2 + attempt * 3)
            raise RuntimeError(f'text-to-speech failed for {os.path.basename(path)}: {err}')
    await asyncio.gather(*(one(p, t) for p, t in jobs))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lang', required=True, choices=['en', 'ml'])
    ap.add_argument('--voice', default=None)
    ap.add_argument('--rate', default='+0%')
    ap.add_argument('--pitch', default='+0Hz')
    a = ap.parse_args()
    voice = a.voice or VOICES[a.lang]
    script = json.load(open(os.path.join(KT, f'script_{a.lang}.json'), encoding='utf-8'))
    out = os.path.join(KT, 'voice', a.lang)
    md = os.path.join(out, 'mp3')
    os.makedirs(md, exist_ok=True)
    # the cache key includes the text, so an edited sentence is spoken again
    tag = re.sub(r'[^A-Za-z0-9]', '', voice + a.rate + a.pitch)[-24:]
    jobs, names = [], {}
    for s in script['sentences']:
        h = format(abs(hash_text(s['text'])) % (1 << 40), '010x')
        p = os.path.join(md, f"{s['id']}_{tag}_{h}.mp3")
        names[s['id']] = p
        jobs.append((p, spoken(s['text'], a.lang)))
    print(f'{len(jobs)} sentences, voice {voice}, rate {a.rate}')
    asyncio.run(tts_all(jobs, voice, a.rate, a.pitch))
    dur = {}
    for s in script['sentences']:
        mp3 = names[s['id']]
        wav = os.path.join(out, f"{s['id']}.wav")
        tmp = wav + '.raw.wav'
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', mp3, tmp], check=True)
        c = clean(read_wav(tmp))
        os.remove(tmp)
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(c.tobytes())
        dur[s['id']] = round(len(c) / SR, 3)
    json.dump({'voice': voice, 'rate': a.rate, 'lang': a.lang, 'durations': dur}, open(os.path.join(out, 'durations.json'), 'w'), indent=1)
    print(f'narration {sum(dur.values()):.1f} s in {len(dur)} sentences -> {os.path.relpath(out, ROOT)}')


def hash_text(t):
    h = 1469598103934665603
    for ch in t.encode('utf-8'):
        h = ((h ^ ch) * 1099511628211) & ((1 << 64) - 1)
    return h


if __name__ == '__main__':
    main()
