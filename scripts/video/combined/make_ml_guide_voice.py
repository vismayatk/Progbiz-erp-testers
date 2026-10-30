#!/usr/bin/env python3
"""Guide voice for the Malayalam film: every sentence of the script spoken by a neural text-to-speech voice, assembled into
one WAV per section with exact, known pauses, plus a cues.json in the progbiz-vo-cues/1 shape.

It is meant to be run through a voice changer afterwards (the changer keeps the timing, so the film built from this audio takes the
changed voice as a drop-in). Nothing is guessed: every sentence is generated on its own, so the start and end of each one is known.

  python3 scripts/video/combined/make_ml_guide_voice.py [--voice ml-IN-SobhanaNeural] [--name Sobhana] [--rate +5%]

Needs: python3, the edge-tts package (Microsoft's online read-aloud voices: the TEXT OF THE SCRIPT IS SENT to that service) and macOS afconvert.
Reads : reports/video/combined/vo_script_combined.ml.json   (written by make_video_combined.js --lang ml)
        reports/video/combined/sentences_combo.json          (the English timing: its pauses are reused, scaled)
Writes: reports/video/combined/audio_ml/<name>/NN_id.wav, cues.json, sentences/ (one mp3 per sentence, a cache: delete it to regenerate)

English-letter words are respelled in Malayalam letters for the voice only (Progbiz, ERP, CRM, AI, PDF); the script and the subtitles keep them.
"""
import argparse
import array
import asyncio
import json
import math
import os
import subprocess
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUTD = os.path.join(ROOT, 'reports', 'video', 'combined')
SR = 48000
SPOKEN = [('Progbiz Workflow', 'പ്രോഗ്ബിസ് വർക്ക്ഫ്ലോ'), ('Progbiz', 'പ്രോഗ്ബിസ്'), ('ERP', 'ഇ ആർ പി'), ('CRM', 'സി ആർ എം'),
          ('AI', 'എ ഐ'), ('PDF', 'പി ഡി എഫ്')]


def spoken(t):
    for a, b in SPOKEN:
        t = t.replace(a, b)
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


async def tts_all(jobs, voice, rate):
    import edge_tts
    sem = asyncio.Semaphore(4)

    async def one(path, text):
        if os.path.exists(path) and os.path.getsize(path) > 2000:
            return
        async with sem:
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(spoken(text), voice, rate=rate).save(path)
                    if os.path.getsize(path) > 2000:
                        return
                except Exception as e:  # network hiccup: wait and try again
                    err = e
                await asyncio.sleep(2 + attempt * 3)
            raise RuntimeError(f'text-to-speech failed for {os.path.basename(path)}: {err}')
    await asyncio.gather(*(one(p, t) for p, t in jobs))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='ml-IN-SobhanaNeural')
    ap.add_argument('--name', default='Sobhana')
    ap.add_argument('--rate', default='+5%')
    a = ap.parse_args()
    script = json.load(open(os.path.join(OUTD, 'vo_script_combined.ml.json'), encoding='utf-8'))
    en = json.load(open(os.path.join(OUTD, 'sentences_combo.json'), encoding='utf-8'))
    out = os.path.join(OUTD, 'audio_ml', a.name)
    sd = os.path.join(out, 'sentences')
    os.makedirs(sd, exist_ok=True)

    jobs = []
    for s in script['sections']:
        for k, t in enumerate(s['sentences']):
            jobs.append((os.path.join(sd, f"{s['id']}_{k + 1}.mp3"), t))
    print(f'{len(jobs)} sentences, voice {a.voice}, rate {a.rate}')
    asyncio.run(tts_all(jobs, a.voice, a.rate))

    room = array.array('h', [0]) * int(0.15 * SR)
    cues = []
    total = 0.0
    for s in script['sections']:
        eng = [x for x in en if x['section'] == s['id']]
        assert len(eng) == len(s['sentences']), s['id']
        buf = array.array('h', room)
        sents = []
        for k, t in enumerate(s['sentences']):
            mp3 = os.path.join(sd, f"{s['id']}_{k + 1}.mp3")
            wav = mp3[:-4] + '.wav'
            subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', mp3, wav], check=True)
            c = clean(read_wav(wav))
            os.remove(wav)
            if k:
                gap = min(1.2, max(0.45, (eng[k]['start_s'] - eng[k - 1]['end_s']) * 1.1))
                buf.extend(array.array('h', [0]) * int(round(gap * SR)))
            st = len(buf) / SR
            buf.extend(c)
            sents.append({'n': k + 1, 'text': t, 'chars': len(t), 'words': len(t.split()), 'start_s': round(st, 3),
                          'duration_s': round(len(c) / SR, 3), 'end_s': round(st + len(c) / SR, 3), 'timing': 'exact'})
        buf.extend(room)
        fn = f"{s['id']}.wav"
        with wave.open(os.path.join(out, fn), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(buf.tobytes())
        cues.append({'id': s['id'], 'title': s['title'], 'file': fn, 'present': True, 'duration_s': round(len(buf) / SR, 3),
                     'timing': 'exact', 'sentences': sents})
        speech = sents[-1]['end_s'] - sents[0]['start_s']
        total += speech
        print(f"  {s['id']:<15} {len(sents)} sentences  {speech:5.1f} s of narration")
    json.dump({'schema': 'progbiz-vo-cues/1', 'voice': f'{a.name} (guide)', 'mode': 'synthetic', 'tool': 'scripts/video/combined/make_ml_guide_voice.py',
               'lang': 'ml', 'totals': {'sections': len(cues), 'sentences': len(jobs)}, 'sections': cues},
              open(os.path.join(out, 'cues.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'narration {total:.1f} s in {len(cues)} sections -> {os.path.relpath(out, ROOT)}')


if __name__ == '__main__':
    main()
