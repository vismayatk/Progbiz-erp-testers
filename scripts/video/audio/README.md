# scripts/video/audio: music bed, UI sound effects, ducking mixer

These are dependency-free Node tools (Node v24, no npm packages, no network) for the Progbiz ERP / CRM marketing video.
Nobody can listen during production, so each tool is designed from sound-design rules and then checked by measurement.
The analysis scripts in this folder produce the proof.

```
make_music.js ─┐
make_sfx.js ───┼─> mix.js ──> mix.wav (48 kHz / 16-bit / stereo) ──> afconvert AAC for listening
voice.wav ─────┘      │
                      └─> report.json   (loudness, ducking, peaks, checks)
keynote.js     the "tech keynote" music engine, used by make_music.js --style keynote (section 1b)
analyze.js     objective checks for any WAV (music bed or mix); pink-noise reference, landing accuracy
verify_mix.js  independent duck/level check on the rendered mix WAV (1-4 kHz ratio, duck depth at landings)
run_test.sh          regenerates the warm-style proof set in reports/video/beta/audio_v4/music/test/
run_test_keynote.sh  regenerates the keynote proof set in reports/video/beta/audio_v4/music/test_keynote/
lib.js         shared DSP: WAV I/O, biquads/SVF, BS.1770 loudness, inter-sample peak, limiter, FFT, reverb, pink noise
```

The tools are deterministic: the same arguments always give byte-identical files, because the PRNGs and the dither are seeded.
This was verified with md5 over two renders.

---

## 1. make_music.js: procedural background music

```
node scripts/video/audio/make_music.js --dur <seconds> --out <file.wav>
     [--bpm 100] [--key D] [--seed 7] [--outro-at <seconds>] [--lift <s1,s2,...>]
     [--rms-db -18] [--peak-db -3] [--quiet] [--style warm|keynote] [--sections <t1,t2,...>]
```

`--style warm` (the default) is the original bed described below. `--style keynote` switches to the tech-keynote bed (section 1b).
The default output is **byte-identical** to before the keynote style was added. `run_test_keynote.sh` checks the md5 (`3d0149b6...`) every time it runs.

| option | default | meaning |
|---|---|---|
| `--dur` | required | Exact length. The output has exactly `round(dur*48000)` frames. |
| `--bpm` | 100 | Tempo (60-160). Section timings scale with the bar length. |
| `--key` | D | Major-key tonic: `C C# Db D D# Eb E F F# Gb G G# Ab A A# Bb B`. |
| `--seed` | 7 | Changes voicing/colour choices, humanisation, noise and phases. The arrangement stays the same. |
| `--outro-at` | dur-8 s | At this time the groove stops and the final tonic chord (I add9) rings out. It fades to digital silence exactly at `--dur`. The time is snapped to the nearest 8th note (+/-0.15 s at 100 BPM). |
| `--lift` | auto, every 32 bars | Times where a new, slightly fuller section starts. Each one is snapped to the nearest bar line (+/-1.2 s at 100 BPM). Before each lift there is a 2-bar breakdown (only if the section is at least 10 bars long, otherwise a 1-bar half-break), a dominant (V) chord and a ~1.2 s quiet noise riser. |
| `--rms-db` | -18 | Body RMS in dBFS (stereo mean power, groove entry to outro). |
| `--peak-db` | -3 | Look-ahead limiter ceiling, applied to 4x inter-sample peaks. |
| `--style` | warm | `warm` or `keynote`. |
| `--sections` | keynote only | Times where a new section starts (see 1b). Not snapped. |

Besides the WAV, the tool writes `<out>.arrangement.json`. It records the sections with their chords, the requested and snapped lift and outro times, the entry times, per-stem calibration, and the normalisation and limiter statistics.
Read the snapped times there when you align visuals.

### Musical design

- **Harmony.** One chord per bar, drawn from the I-V-vi-IV family.
  - Intro and first groove use I-V-vi-IV.
  - A `lift` section uses I-vi-IV-V, switching to I-V-vi-IV after 16 bars.
  - A `full` section (the middle lift) uses vi-IV-I-V, then IV-I-V-vi.
  - Colours change every cycle: add9, maj7 and 6 on I/IV, m7 and m(add9) on vi, add9 and 6 on V.
  - Pad voicings are re-chosen every bar by voice-leading plus a seeded random term. There are no minor 9ths and no low clusters, and the register drifts slowly. The 4-bar cycle therefore never repeats identically.
  - The last bar before the outro is IV, so the ending is a plagal cadence into I.
- **Arrangement at 100 BPM.**
  - 0-4.8 s: pad only (2.2 s fade-in attack).
  - 4.8 s: pluck arpeggio enters on a sparse 3-3-2 rhythm.
  - 9.6 s: bass, soft kick and off-beat hats enter.
  - First lift: adds clap on 2 and 4, a 16th-note shaker and a moving bass line.
  - Middle lift (`full`): adds a soft electric-piano comp, an octave-up pluck on accents and a brighter pad.
  - Long sections have a one-bar "breath" (kick and clap out) every 16 bars.
- **Layers.**
  - Pad: sine + triangle + polyBLEP saw, detuned by +/-7 cents and spread in stereo. It has a 0.8 s raised-cosine attack and 1.3 s release, runs through a TPT SVF low-pass automated per section (1.3-3.5 kHz), a 110 Hz high-pass, -2 dB at 320 Hz, and gentle kick-keyed pumping (-1.7 dB).
  - Pluck: soft FM mallet with a dotted-8th ping-pong delay whose repeats are band-limited to 300 Hz-3.2 kHz.
  - Bass: sine plus 2nd and 3rd harmonic.
  - Kick: pitch-drop sine with a 2 ms ramp.
  - Clap, hat and shaker: band-passed noise with ramped envelopes.
  - Reverb: Freeverb-style on pad, pluck, keys and clap, with a band-limited send.
- **Stem balance by measurement.** Each stem is scaled to a target RMS relative to the pad, measured over the bars where that stem plays.

  | stem | target relative to pad |
  |---|---|
  | pluck | -2.5 dB |
  | bass | -3.5 dB |
  | kick | -9 dB |
  | keys | -10 dB |
  | reverb return | -10 dB |
  | riser | -13 dB |
  | clap | -21 dB |
  | hat | -25 dB |
  | shaker | -28 dB |

  To change the balance, edit the `commitStem(...)` targets in `make_music.js`.
- **Master.** 35 Hz high-pass, then a -1.5 dB high shelf at 9 kHz. The body RMS is normalised to -18 dBFS, then a look-ahead limiter sets a -3 dBFS true-peak ceiling. The file starts with a 10 ms ramp. The outro is a dB-linear fade to -60 dB followed by a 50 ms cosine to exact zero.

### 1b. `--style keynote`: tech-keynote bed

```
node scripts/video/audio/make_music.js --style keynote --dur 226 --out music.wav \
     --outro-at 219.5 --sections 25.6,40.3,60.1,81.8,99.5,117.2,143.9,164.7,179.9,206.5 [--bpm 108] [--key D] [--seed 7]
```

The idea is a modern product-launch bed: minimal, clean, slightly futuristic, confident and forward-moving, never epic. The keynote engine lives in `keynote.js`.
The other options keep their meaning. Differences: default tempo **108 BPM**, `--sections` replaces `--lift` (`--lift` still works as an alias, with a warning), and `--outro-at` is **not snapped**.

**Sound.**

- **Sub:** a soft sine pulse on the chord root, 46-82 Hz, with a tiny 2nd harmonic so laptops can hear it, and gentle pumping keyed on kicks and impacts.
- **Pad:** glassy and airy. Sine + two detuned saws + a quiet octave-up sine, in open 4-note voicings (root or fifth at the bottom) with sus2 / sus4 / add9 / maj7 / m7 colours. A state-variable low-pass moves slowly (11 s) and opens from 0.85 to 2.4 kHz over the video.
- **Arp:** a tight 16th-note sequenced pulse in an FM "glass" bell/pluck timbre, with a dotted-8th ping-pong delay.
  - Density grows with the video: 8ths, then gapped 16ths, then full 16ths with a quiet octave sparkle.
  - Its low-pass opens from 1.3 to 4 kHz and its level rises about 4 dB.
  - The pattern is a repeating pendulum through the chord tones. It is not a melody.
- **Kick and texture:**
  - Kick: a very soft sine "lub-dub" heartbeat, later soft quarter pulses.
  - Ticks: tick-tock noise ticks (6.2 / 4.7 kHz) on the off-beat 8ths.
  - Shaker: a quiet 16th shaker in the fullest level.
- **Harmony:** Lydian / major-sus colours over a minor-tinged, optimistic axis: `vi-IV-I-V`, `I-II-vi-IV` (Lydian II), `IV-I-V-vi`, `I-bVII-IV-I`, `I-V-IV-V`. Each section takes the next progression.
- **Voice pocket:** a -6 dB peak filter at 2.4 kHz (Q 0.6) on the music master, about -3 dB at 1.2 and 4.8 kHz. The mixer then ducks the bed another 12 dB under speech.
- **Master:** the same as the warm style. 35 Hz high-pass, -3 dB high shelf at 8 kHz, body RMS -18 dBFS, -3 dBFS true-peak limiter, fade to exact silence at `--dur`.

**Sections and landings: how the music "breathes" with the edit.**

- **Flexible grid.** Every section is stretched locally to a *whole number of beats*.
  - For a section of T seconds, `beats = round(T / nominal_beat)` and the beat length is `T / beats`.
  - The section therefore ends exactly on a beat, and the next one starts exactly on the requested time (error under 0.01 ms, which is sample rounding).
  - The tempo moves by at most half a beat per section. In the test the effective tempo stayed between **106.1 and 109.1 BPM** (at most ±1.8 %).
  - The remainder beats (`beats mod 4`) are absorbed by the *last bar* of the section, which is 4-7 beats of a held dominant sus chord, so the rhythm never restarts oddly.
  - The tempo-synced delay uses the nominal tempo. That is at most 1.8 % off the local beat, a few milliseconds.
- **Build (about 1.3 s before every landing).**
  - A noise sweep rises from 250 Hz to 6 kHz and ends in a tiny clean 8 ms cut.
  - A reversed-shimmer riser plays the *next* chord's bells through a big reverb with the tail reversed, so it swells into the coming harmony.
  - The arp low-pass closes briefly, then opens to 1.3x, and the ticks roll into 16ths.
  - Kick and sub drop out, and the sub is cut 90 ms before the hit.
  - Pad and arp dip 5 dB over the last 0.2 s ("breath in").
- **Landing (exactly on the requested time).**
  - A soft impact: a sub thump (sine 85 -> 46 Hz, 0.9 s) plus an "air release" (5-7 kHz noise, about 0.4 s decay) through the reverb, with the pad ducking under it.
  - A new progression and voicing, with the register 2 semitones higher.
  - A pad hi-cut that opens 1.55x and relaxes over about 1 s, and an arp hi-cut that opens 1.5x and relaxes over about 1.2 s.
- **Section 0** (the intro) has no impact. It ramps instead: pad only for 0-4.5 s, sub and ticks from 4.5 s, arp from 9 s, heartbeat from 15 s. Later sections use fixed levels 1-3 that grow with the video's progress and dip again before the outro.
- **Outro.** The last section builds into a final resolving Iadd9 chord at exactly `--outro-at`. It has a softer impact, a slow glass arpeggio and a sub note, and rings out to silence at `--dur`.
- **Section limits.** Sections earlier than 3 s, closer than 4 s to the previous one, or closer than 4 s to the outro are dropped with a warning.
- **Sidecar.** `<out>.arrangement.json` gives every section (start, end, beats, bars, effective BPM, stretch %, level, chords) and every landing with `requested_s`, `actual_s` and `error_ms`.

### Common changes

- **Other key or tempo:** `--key F --bpm 96`. All timings follow the bar length. Intro, pluck entry and groove entry stay at about 4.8 / 9.6 s.
- **Different but similar track:** `--seed 11`.
- **Louder or softer bed file:** `--rms-db`. Usually you should leave this alone and set the level in the mixer (`--music-db`).
- **Sparser or busier sections:** edit `barState()`. It sets the flags per section type: `intro`, `arp`, `groove`, `lift`, `full`, plus the `break`, `halfbreak` and `breath` variants.

---

## 2. make_sfx.js: subtle UI sound effects

```
node scripts/video/audio/make_sfx.js --outdir <folder> [--seed 7]
```

The tool writes 48 kHz / 16-bit / mono WAVs, each peak-normalised to **-6 dBFS**. It also writes `sfx_manifest.json`, which gives each file's length, loudest point and the suggested mixer gain.

| file | length | design | suggested `gain_db` |
|---|---|---|---|
| `whoosh.wav` | 0.55 s | Tilted noise band-passed 320 Hz -> 1.6 kHz -> 500 Hz, sin²/cos² envelope peaking at 0.21 s, 4.5 kHz low-pass | -12 (about -27 LUFS momentary) |
| `click.wav` | 0.05 s | 3 ms band-passed noise transient + 1.35->1.15 kHz body + 420 Hz "thock", 1.5 ms attack, 7 kHz low-pass | -12 (-18 dBFS peak) |
| `notify.wav` | 0.55 s | Two soft mallet notes, A5 then C#6 120 ms later (a rising major third in D major, the music's key) | -15 (about -29 LUFS momentary) |
| `pop.wav` | 0.12 s | Sine gliding 300 -> 950 Hz in ~45 ms, 22 ms decay, 4 kHz low-pass | -14 (-20 dBFS peak) |
| `riser.wav` | 1.5 s | Noise band-pass sweeping 350 Hz -> 3 kHz + quiet D/A/D sine shimmer, peak at ~1.33-1.38 s, 120 ms release | -13 (about -27 LUFS momentary). Start the file ~1.38 s before the moment it should land on. |

The tech-keynote set below is generated by the same command, from a separate PRNG stream after the five files above.
The five files above are **byte-identical** to before (md5 checked).

| file | length | design | suggested `gain_db` |
|---|---|---|---|
| `impact.wav` | 0.8 s | Soft sub thump (sine 90 -> 46 Hz + 22 % 2nd harmonic, 4 ms attack, 0.2 / 0.38 s decays) + airy 5.5 kHz noise tail, 18 dB below the thump, 120 ms fade | -12 (about -27 LUFS momentary). Sub-heavy: check on small speakers. |
| `sweep.wav` | 1.2 s | Rising band-passed noise 300 Hz -> 4.2 kHz (Q 1.2), t² envelope, 5.5 kHz low-pass, ends with a tiny clean 6 ms cut | -13 (about -28.5 LUFS). End the file exactly on the cut. |
| `tick.wav` | 30 ms | Very soft UI tick: 2.6 kHz + 1.3 kHz decaying sines, 1.2 ms attack, 6 kHz low-pass | -14 (peak -20 dBFS) |
| `glass.wav` | 0.9 s | Glassy two-note ping, D6 then A6 (a fifth) 90 ms later, partials 1 / 2.76 / 5.4 with fast decays, 6.5 kHz low-pass | -15 (about -27 LUFS) |
| `shimmer.wav` | 2.0 s | Reversed reverb of D5/A5/D6/E6 bells (swells in, loudest at about 1.84 s, faded out by 2.0 s) + quiet rising noise band | -14 (about -28 LUFS). Place it so the file *ends* on the moment it should land. |

`sfx_manifest.json` lists lengths, loudest points and these gain suggestions for all ten files.

---

## 3. mix.js: voice + auto-ducked music + SFX

```
node scripts/video/audio/mix.js --voice <voice.wav> --music <music.wav> --sfx <events.json|none>
     --dur <seconds> --out <mix.wav> [--report <report.json>]
     [--voice-lufs -16] [--music-db <LUFS>] [--duck-db -12] [--voice-at 0]
     [--threshold-db -45] [--lookahead-ms 150] [--attack-ms 120] [--hold-ms 250]
     [--release-ms 700] [--bridge-ms 600] [--ceiling-db -1]
```

- All inputs must be **48 kHz**. The mixer exits with an `afconvert` hint otherwise.
- A voice may be mono or stereo (stereo is downmixed and placed centred). Music may be mono or stereo.
- `events.json` is `[{ "file": "sfx/whoosh.wav", "t": 34.1, "gain_db": -12, "pan": 0 }]`.
  - Relative paths resolve against the folder that contains `events.json`.
  - `pan` runs from -1 to 1 and uses a constant-power law, unity at centre.
  - SFX are not ducked.
- The output is 48 kHz / 16-bit / stereo, exactly `round(dur*48000)` frames. A voice or music file longer than `--dur` is cut with a short fade, and the report warns about it.

### Level scheme

Loudness is measured with ITU-R BS.1770-4, implemented in `lib.js`:

- K-weighting uses the exact 48 kHz coefficients.
- Blocks are 400 ms with a 100 ms hop.
- Gates are -70 LUFS absolute and -10 LU relative.
- Self-test: a 997 Hz stereo sine at -20 dBFS measures -20.00 LUFS, as it should.

Everything is measured **as placed in the stereo output**. A mono voice placed L=R measures +3.01 LU louder than the mono file on its own, and the gain accounts for that.

| quantity | default | why |
|---|---|---|
| voice | **-16 LUFS** integrated | Common web/podcast delivery level; the voice sets the programme loudness. |
| music, not ducked (intro, outro, pauses) | **-23 LUFS** (= `voice-lufs - 7` unless `--music-db` is given) | Clearly present when nobody talks, but a bed, never a foreground. |
| music under speech | **-35 LUFS** (`--duck-db -12`) | About 19 LU under the voice. With -11 dB the test measured only 18.2 dB median, so -12 dB keeps a 1 dB margin over the 18 dB requirement. |
| final ceiling | **-1 dBFS true peak** (4x inter-sample) | Safe for AAC encoding. |

`--music-db` is an **absolute** LUFS target for the unducked music. For example, `--music-db -21` makes the music 2 LU louder everywhere. It then sits only about 17 LU under the voice, and the report flags that.

### Ducking

The side-chain is the gained voice.

1. Compute a 30 ms RMS envelope at 1 ms resolution. The voice is active where it is above -45 dBFS.
2. Drop blips shorter than 40 ms and bridge gaps shorter than 600 ms, so it never pumps between words or between close sentences.
3. Set the duck target from 150 ms before each speech onset (look-ahead) to 250 ms after its end (hold).
4. Limit the gain change rate in dB: full depth in 120 ms going down, 700 ms coming back up.
5. Smooth the curve with a zero-phase 2 x 21 ms box filter, then interpolate it per sample. This gives no corners and no zipper noise.

### Report (`--report`)

- **Voice:** LUFS of the mono file, LUFS as placed, gain, and LUFS after gain.
- **Music:** file LUFS, gain, unducked LUFS, and median level while "up".
- **Speech windows:** voice minus music, from 400 ms momentary blocks that are at least 75 % voiced. Gives the median, p10, p05 and minimum, plus the same over all blocks inside speech regions.
- **Pauses of 1.5 s or longer:** music loudness once it is back up.
- **Duck:** min and max gain, percentage of time ducked, number of duck events, lead time before each fresh speech onset, the speech regions, and the duck curve every 100 ms.
- **SFX:** each event's own momentary loudness, plus the voice and music level at that moment.
- **Master:** pre-limiter peak, samples limited, maximum gain reduction, sample and true peak, and mix LUFS.
- **Checks:** a set of pass/fail flags.

---

## 4. Proof: measurements on the test set

`sh scripts/video/audio/run_test.sh` regenerates the whole set in about 12 s. It uses these inputs:

- Music: 240 s, `--outro-at 232 --lift 25,110,190`, seed 7, D major, 100 BPM.
- All SFX, with 8 events (`events_test.json`).
- Voice: `reports/video/beta/build/voice_v3.wav` (48 kHz mono, 290 s, speech from 0.79 s).

Outputs are written to `reports/video/beta/audio_v4/music/test/`:

- `music_test.wav` / `.m4a`, `music_test.arrangement.json`, `music_test.analysis.json`
- `sfx/*.wav`, `sfx/sfx_manifest.json`, `sfx/*.analysis.json`
- `mix_test.wav`, **`mix_test.m4a`** (AAC 192 kb/s, for listening), `mix_test.report.json`, `mix_test.analysis.json`, `mix_test.verify.json`

### Music bed (`analyze.js`)

| check | result | target |
|---|---|---|
| length | 11,520,000 frames = 240.000 s | exact |
| body RMS (9.6-231.9 s) | -18.0 dBFS (median of seconds -18.2) | about -18 |
| peak | -3.00 dBFS sample, -3.00 dBTP inter-sample (limiter touched 2.2 s in total, at most 0.65 dB) | <= -3 |
| integrated loudness | -15.9 LUFS | (info) |
| largest 1 s RMS change inside the body | 3.1 dB (the breakdown before the 190 s lift) | < 6 dB |
| jumps > 6 dB | only 0->1 s (fade-in) and 235-240 s (ending), both intended | none unintended |
| dropouts / digital silence runs | 0 / 0 | 0 |
| DC offset | -136 dBFS | negligible |
| clipped samples | 0 | 0 |
| max sample-to-sample step | 0.157 FS (-16 dBFS) | no steps |
| click detector (2nd difference vs local RMS) | max 9.3, 0 flagged (threshold 12) | 0 |
| ending: last 8 s, RMS per second | -17.3, -20.2, -22.9, -32.5, -43.1, -52.8, -63.5, **-73.9** dBFS | last 1 s < -50 |
| last sample | 0, 0 | silence at `--dur` |
| stereo correlation | 0.87 | mono-safe |

Spectral balance, in dB relative to total power:

| sub < 60 Hz | low 60-250 Hz | mid 250 Hz-2 kHz | presence 2-6 kHz | air > 6 kHz |
|---|---|---|---|---|
| -16.8 | -5.4 | -1.7 | -22.1 | -30.5 |

Air sits **28.8 dB below mid**. The octave profile, relative, is:

| octave (Hz) | 31 | 63 | 125 | 250 | 500 | 1k | 2k | 4k | 8k | 16k |
|---|---|---|---|---|---|---|---|---|---|---|
| dB | -27 | -11 | -8 | -7 | -4 | -9 | -16 | -26 | -30 | -45 |

Section levels, as the mean of per-second RMS in dBFS:

| section | time | level |
|---|---|---|
| intro | 0-5 s | -24.6 (includes the fade-in) |
| pluck entry | 5-10 s | -19.8 |
| groove | 10-24 s | -18.8 |
| lift | 24-106 s | -18.4 |
| break | 106-110 s | -20.8 |
| full | 110-185 s | -17.2 |
| break | 185-190 s | -21.2 |
| lift | 190-232 s | -18.3 |
| outro | 232-240 s | ring-out to silence |

The dynamics are deliberately gentle.

The snapped times from `music_test.arrangement.json` are:

- Lifts: 25 -> **24.0**, 110 -> **110.4**, 190 -> **189.6** s.
- Final chord: **231.9** s.

### Mix (`mix_test.report.json`, cross-checked by `verify_mix.js` on the rendered WAV)

| check | result | target |
|---|---|---|
| voice | file -20.6 LUFS mono -> placed -17.6 -> gain +1.57 dB -> **-16.00 LUFS** | -16 |
| music unducked | file -15.9 LUFS -> gain -7.12 dB -> **-23.0 LUFS** | about -23 |
| music under speech (median momentary) | **-35.2 LUFS** | about -34/-35 |
| **voice - music in voiced windows** | median **19.6 dB**, p10 17.4, p05 16.8, min 13.4 (1,633 blocks). `verify_mix.js` on the WAV gives the same: 19.59 / 17.42 / 16.75 / 13.38 | >= 18 dB median |
| music back up in the 8 pauses (2.7-2.9 s long) | -23.3, -23.4, -23.0, -21.8, -21.7, -21.9, -23.1, -23.6 LUFS; 1 s windows fully up: median -23.1 LUFS | audible, about -23 |
| duck lead before each of the 9 fresh sentence onsets | gain drops below -1 dB **142 ms** before the onset, and is fully down (-12 dB) **~41 ms** before it; gain at every onset = -12.0 dB | ducked before speech |
| verify (rendered WAV, residual = mix - voice) | measured music gain at onset -400 / -150 / -100 / -50 / -20 / 0 ms: 0 / -0.9 / -5.7 / -10.6 / -12 / -12 dB (typical onset) | same |
| duck statistics | 9 duck events, engaged 93.7 % of the time (the narration is almost continuous), no pumping inside speech regions | no pumping |
| SFX as placed (momentary max) | whoosh -27.1, riser -26.7, notify -28.6, click -37.6, pop -36/-37 LUFS; voice around -14 to -22 and music-up -22/-23 at those moments | subtle |
| true peak / sample peak | -3.48 dBTP / -3.50 dBFS; limiter did not engage (0 samples) | <= -1 |
| mix integrated | -16.2 LUFS | (info) |
| clicks | detector max 11.9 at 221.3 s. This comes from the TTS voice file itself (same value when the voice alone is analysed). | none added |
| length | 11,520,000 frames | exact |

Limiter stress test: with `--voice-lufs -9`, the output true peak is exactly -1.00 dBTP, with no clipping and no clicks.

### 4b. Keynote proof (`run_test_keynote.sh`)

Inputs:

- Music: 226 s, `--style keynote --outro-at 219.5 --sections 25.6,40.3,60.1,81.8,99.5,117.2,143.9,164.7,179.9,206.5`, seed 7, D, 108 BPM.
- Voice: `reports/video/beta/build/voice_v4.wav` (226 s mono, narration from 2.4 s).
- 8 SFX events (`events_keynote.json`), using the new files.

Outputs are in `reports/video/beta/audio_v4/music/test_keynote/`:

- `music_keynote.wav` / `.m4a`, `music_keynote.arrangement.json`
- `sfx/` (all ten files)
- `mix_keynote.wav`, **`mix_keynote.m4a`** (AAC 192 kb/s, for listening)
- reports: `mix_keynote.report.json`, `mix_keynote.verify.json`, `music_keynote.analysis.json`, `mix_keynote.analysis.json`, `mix_keynote_duck13.report.json`

**Music bed**

| check | result | target |
|---|---|---|
| length | 10,848,000 frames = 226.000 s | exact |
| determinism | two renders give the same md5 (`a3b90bca...`) | identical |
| default style regression | md5 `3d0149b6...` = the earlier test | byte-identical |
| body RMS (9-219.5 s) | -18.0 dBFS (median of seconds -18.1) | about -18 |
| peak | -3.59 dBFS sample, -3.57 dBTP; limiter never engaged | <= -3 |
| integrated loudness | -16.2 LUFS | (info) |
| largest 1 s RMS change in the body | 2.65 dB; the same away from every mark | < 6 dB |
| jumps > 6 dB | only the fade-in (0-1 s) and the ending (222-226 s), both intended | none unintended |
| section mean RMS | -20.4 (intro ramp), then -18.7 -> -17.4 dBFS; every second between -20.5 and -16.0 | stable, gently growing |
| dropouts / digital silence runs | 0 / 0 | 0 |
| DC offset / clipped samples | -171 dBFS / 0 | negligible / 0 |
| max sample step | 0.13 FS (-17.6 dBFS) | no steps |
| click detector (threshold 12) | max 12.3, 2 flagged; one moment at 73.18 s where a tick and an arp note attack on the same sample | see note |
| ending | last 8 s RMS per second: -18.7, -15.8, -14.9, -18.0, -30.1, -43.8, -57.6, **-71.0** dBFS; last 1 s -71.0, last sample 0 | last 1 s < -50 |
| stereo correlation | 0.86 | mono-safe |

The click detector compares the biggest 2nd-difference sample with the local RMS of the 2nd difference. Ticks and arp attacks are percussive, so it sits right at its threshold. The first version's 1 ms tick attack gave 97 flags at ratio 12.9. Lengthening the attack to 3.5 ms removed them.

Spectral balance, in dB relative to total power:

| sub < 60 Hz | low 60-250 Hz | mid 250 Hz-2 kHz | presence 2-6 kHz | air > 6 kHz |
|---|---|---|---|---|
| -10.2 | -4.7 | -2.5 | -30.4 | -31.7 |

Air is **29.3 dB below mid**. The bass is heavier than the warm bed, as intended for a sub pulse.

Octave levels **versus a pink-noise reference of the same total power** (negative = less energy than pink):

| octave (Hz) | 31 | 63 | 125 | 250 | 500 | 1k | 2k | 4k | 8k | 16k |
|---|---|---|---|---|---|---|---|---|---|---|
| dB vs pink | -12.7 | +3.1 | +1.2 | +6.3 | +6.1 | -6.8 | **-18.6** | **-21.6** | -21.1 | -28.0 |

The voice pocket (the 1k / 2k / 4k octaves, 707 Hz-5.6 kHz) is **15.7 dB below pink**, and **20.2 dB below the 125-500 Hz octaves** (which are +4.5 dB above pink). The 8k / 16k octaves are 24.5 dB below pink.

**Opening up with the video.** Steady-state windows, excluding 2 s before and 2.5 s after each landing:

- The ratio of 1.5-6 kHz to 250 Hz-1.5 kHz energy rises from **-35.2 dB in the first section to about -27 dB by the last third** (-31.8 dB at 40 s, -27.9 dB at 82 s, -26.8 dB at 165 s), about +8 dB.
- Arp level rises about 4 dB over the same span.
- Spectral centroid within 800 Hz-8 kHz: 1.1 kHz at the start, 1.2-1.3 kHz later.

**Landings and builds.** Measured from the rendered WAV. The onset is the first sample of the zero-phase 30-110 Hz band that rises above the pre-landing residue plus 6 % of the rise to the peak.

| landing (requested s) | onset error (ms) | 4-9 kHz rise into the hit | 30-110 Hz in build vs before it | thump over build |
|---|---|---|---|---|
| 25.6 | -0.40 | +16.4 dB | -16.8 dB | +19.0 dB |
| 40.3 | -0.69 | +18.5 | -17.1 | +18.4 |
| 60.1 | -0.31 | +17.9 | -2.0 | +5.1 |
| 81.8 | -1.35 | +16.1 | -14.1 | +17.1 |
| 99.5 | -0.58 | +10.9 | -2.7 | +7.3 |
| 117.2 | -0.60 | +10.2 | -3.0 | +7.6 |
| 143.9 | -0.46 | +10.8 | -2.5 | +6.7 |
| 164.7 | -1.27 | +14.8 | -4.3 | +9.1 |
| 179.9 | -0.58 | +10.8 | -16.2 | +20.3 |
| 206.5 | -0.69 | +10.4 | -3.0 | +7.5 |
| 219.5 (final chord) | -0.77 | +13.1 | -26.4 | +29.4 |

- **Landing accuracy:** the worst error is **1.35 ms**, against the required +-30 ms. The arrangement JSON gives `error_ms` 0 for all 11: the landing is placed on the sample nearest the requested time. The small negative numbers come from the zero-phase measurement smoothing the attack by about a millisecond.
- **Tempo:** effective tempo stayed between 106.1 and 109.1 BPM (at most +-1.8 % of 108).
- **Where the 30-110 Hz drop-out is small (-2 to -4 dB):** the sub pulse keeps playing until 90 ms before the hit in those sections, and only the kick drops out. Where a section's last bar starts inside the build, the sub note falls in the window.
- **Shape around a landing** (200 ms RMS steps, full band): -19, then a -22 dip in the last 200 ms, then -16 on the hit, back to -19 within about 1 s.

**Mix with the v4 narration** (`mix_keynote.report.json`, cross-checked by `verify_mix.js` on the rendered WAV)

| check | result | target |
|---|---|---|
| voice | file -20.6 LUFS mono -> placed -17.6 -> gain +1.62 dB -> **-16.00 LUFS** | -16 |
| music unducked | gain -6.84 dB -> **-23.0 LUFS**; median level while up -23.3 LUFS | about -23 |
| music under speech (median momentary) | **-35.1 LUFS** | about -34/-35 |
| **voice - music in voiced windows** | median **19.05 dB**, p10 16.4, p05 15.8, min 10.6 (1,415 blocks). `verify_mix.js` on the WAV gives the same. | >= 18 dB median |
| voice - music, **1-4 kHz only** | median **23.3 dB**, p10 17.3, p05 16.1, min 7.3 | (info) |
| same mix with `--duck-db -13` | median **20.05 dB**, p10 17.4, min 11.6; all checks still pass | recommended for this bed |
| music back up in the 10 pauses of 2.9-4.7 s | -23.3, -24.0, -23.8, -23.8, -23.4, -22.6, -22.3, -22.7, -21.9, -22.8 LUFS | audible, about -23 |
| duck lead before the 11 fresh sentence onsets | gain drops below -1 dB **142 ms** before every onset; every onset is fully ducked (-12 dB) | ducked before speech |
| true peak / limiter | -1.49 dBTP (the v4 voice itself peaks at -3.1 dBFS before gain); limiter did not engage | <= -1 |
| length | 10,848,000 frames | exact |

The worst voiced blocks are the low-level tails of speech, not landings. They are the last syllables of the closing line at 221.1-221.2 s and soft consonants. Blocks within 0.4 s before to 1.6 s after a landing have a *higher* median (20.9 dB) than the rest (18.9 dB).

**Integration note (important): the landings and the ducker.** The v4 narration starts between -20 ms and +280 ms after nearly every section time. The mixer ducks music from 150 ms before each sentence onset, so most landings hit the music at its ducked level. Measured music gain at the landing (`verify_mix.js` table, rows with an SFX event near are marked *):

| landing (s) | 25.6 | 40.3 | 60.1* | 81.8 | 99.5 | 117.2 | 143.9 | 164.7* | 179.9 | 206.5* | 219.5 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| speech starts (ms after landing) | 40 | 280 | 190 | 190 | 120 | 120 | 110 | 30 | -20 | 40 | 770 |
| music gain at the landing (dB) | -11.5 | 0 | (SFX) | 0 | -3.6 | -3.8 | -4.6 | (SFX) | -12 | (SFX) | -12 |

At 25.6, 164.7, 179.9 and 206.5 s the music's impact is essentially fully ducked. The builds are unaffected, because they sit in the pauses at -22 to -24 LUFS.
Options: (a) start the narration at least 0.3 s after the landing (the test mix does not do this); (b) place `impact.wav` at -12 dB as an SFX event on the landing, because SFX are not ducked. The test mix does this at 60.1, 164.7 and 206.5 s. Or (c) lower `--lookahead-ms` for the mixer.
At 219.5 s the music is ducked because the final chord starts under the last speech region (speech resumes at 220.25 s).

### Things we could not verify by measurement

- **Taste, keynote style.** The numbers show the bed is clean, level-stable, dark and never competing with the voice. Whether it sounds "keynote" enough needs a human listen to `music_keynote.m4a` and `mix_keynote.m4a`.
  - Glassy and airy is reached mainly with the pad, the FM bells and the shimmer/air at landings. The steady-state top end is dark on purpose: the 1.5-6 kHz to 250 Hz-1.5 kHz ratio sits between -35 and -27 dB.
  - If it sounds dull, raise the pad and arp low-pass ranges in `keynote.js` (`padCut` / `arpCut`).
  - The impacts are sub-heavy (46-90 Hz). Laptop speakers reproduce mostly the 2nd harmonic, so the hit may sound softer than the numbers suggest.

Warm style and shared limits (unchanged from the first test):

- **Taste, warm style.** The numbers show the music is clean, level-stable, darker than the voice and never competing with it. Whether it sounds "premium/optimistic" enough needs a human listen to `music_test.m4a` / `mix_test.m4a`.
- **The warm test mix is not the final timeline.**
  - The v3 narration file is 290 s. In the 240 s test it is cut at 240 s, with a fade, and it still talks over the outro (232-238 s).
  - Speech starts at 0.79 s, so the pad intro is ducked from the start.
  - For the real edit, generate music at the final video length. Place the outro and lifts on actual pauses. If the intro should breathe, pass `--voice-at` to delay the voice.
- **Snapping (warm style only).** A lift lands on a bar line, up to +/-1.2 s from the requested time at 100 BPM. The final chord lands on the nearest 8th note. Align the visuals to the snapped times in the arrangement JSON, or choose request times that are multiples of 2.4 s. The keynote style does not snap.
- **Approximations.** The true-peak detector uses 12 taps per phase, the size of BS.1770 Annex 2. It is a good estimate, not a certified meter. Loudness gating follows BS.1770-4 exactly, but it only handles mono and stereo, with no surround weighting.
- **Landing detector.** The onset measure is a threshold on a zero-phase 30-110 Hz band. It reads about 0.3-1.4 ms *early* because zero-phase filtering smooths the attack slightly. The true start is the requested sample.
