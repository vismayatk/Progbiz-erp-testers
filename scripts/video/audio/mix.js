#!/usr/bin/env node
'use strict';
/**
 * mix.js - voice + music (auto-ducked) + SFX mixer for the Progbiz video.
 *
 *   node scripts/video/audio/mix.js --voice <voice.wav> --music <music.wav>
 *        --sfx <events.json|none> --dur <seconds> --out <mix.wav>
 *        [--report <report.json>] [--voice-lufs -16] [--music-db <LUFS>] [--duck-db -12]
 *        [--voice-at 0] [--threshold-db -45] [--lookahead-ms 150] [--attack-ms 120]
 *        [--hold-ms 250] [--release-ms 700] [--bridge-ms 600] [--ceiling-db -1]
 *
 * Levels (all loudness values are ITU-R BS.1770-4 integrated loudness,
 * K-weighted, 400 ms blocks, -70 LUFS absolute and -10 LU relative gates,
 * measured on the signal AS PLACED in the stereo output):
 *   voice  gained so it measures --voice-lufs (default -16 LUFS). A mono voice
 *          is placed dual-mono (L = R = v), i.e. it measures 3.01 LU louder
 *          than the mono file does; the gain accounts for that.
 *   music  gained so the UNDUCKED music measures --music-db LUFS
 *          (default: voice-lufs - 7 = -23 LUFS). This is the level heard in
 *          intro/outro/pauses.
 *   duck   while the voice is active the music is lowered by --duck-db
 *          (default -12 dB -> about -35 LUFS, i.e. ~19 LU under the voice;
 *          -11 dB measured only ~18.2 dB median on the test, too close to
 *          the 18 dB floor, so the default has 1 dB of margin).
 *   sfx    events.json = [{ "file": "x.wav", "t": 12.34, "gain_db": -12, "pan": 0 }]
 *          relative paths resolve against the events.json folder; gain_db is
 *          applied to the file as is (make_sfx.js files peak at -6 dBFS);
 *          pan -1..1, constant-power law normalised to unity at centre.
 *          SFX are not ducked.
 *
 * Ducking (side-chain = the gained voice):
 *   1. 30 ms RMS envelope at 1 ms resolution; active where > --threshold-db
 *      (default -45 dBFS)
 *   2. active blips < 40 ms dropped; gaps < --bridge-ms (600 ms) bridged, so
 *      word and short sentence gaps never pump
 *   3. target = duck from (onset - lookahead 150 ms) to (offset + hold 250 ms)
 *   4. dB-domain slew limiter: full depth in attack 120 ms / release 700 ms
 *   5. zero-phase 2 x 21 ms box smoothing (no corners, no zipper noise),
 *      then per-sample interpolation
 *   => the music is fully down ~10-30 ms BEFORE each sentence starts.
 *
 * Output: 48 kHz / 16-bit / stereo WAV of exactly round(dur*48000) frames,
 * through a linked look-ahead limiter (3 ms, release 80 ms) whose detector
 * includes 4x-oversampled inter-sample peaks, ceiling --ceiling-db (-1 dBFS).
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const SR = L.SR;
const USAGE = `Usage: node scripts/video/audio/mix.js --voice <voice.wav> --music <music.wav> --sfx <events.json|none>
       --dur <seconds> --out <mix.wav> [--report <report.json>] [--voice-lufs -16] [--music-db <LUFS>]
       [--duck-db -12] [--voice-at 0] [--threshold-db -45] [--lookahead-ms 150] [--attack-ms 120]
       [--hold-ms 250] [--release-ms 700] [--bridge-ms 600] [--ceiling-db -1]`;
function die(m) { console.error('mix: ERROR: ' + m + '\n' + USAGE); process.exit(2); }
const warnings = [];
const warn = (m) => { warnings.push(m); console.error('mix: warning: ' + m); };

const A = L.parseArgs(process.argv.slice(2));
if (A.help) { console.log(USAGE); process.exit(0); }
for (const k of ['voice', 'music', 'sfx', 'dur', 'out']) if (A[k] === undefined || A[k] === true) die('--' + k + ' is required');
const num = (k, d) => { if (A[k] === undefined) return d; const v = Number(A[k]); if (!Number.isFinite(v)) die(`--${k} must be a number`); return v; };
const DUR = num('dur');
const VOICE_LUFS = num('voice-lufs', -16);
const MUSIC_LUFS = num('music-db', VOICE_LUFS - 7);
const DUCK_DB = -Math.abs(num('duck-db', -12));
const VOICE_AT = num('voice-at', 0);
const THR_DB = num('threshold-db', -45);
const LOOK = num('lookahead-ms', 150) / 1000;
const ATT = Math.max(0.005, num('attack-ms', 120) / 1000);
const HOLD = num('hold-ms', 250) / 1000;
const REL = Math.max(0.005, num('release-ms', 700) / 1000);
const BRIDGE = num('bridge-ms', 600) / 1000;
const CEIL_DB = num('ceiling-db', -1);
if (!(DUR > 0)) die('--dur must be > 0');
const N = Math.round(DUR * SR);
const t0clock = Date.now();

function load(file, what) {
  if (!fs.existsSync(file)) die(`${what} file not found: ${file}`);
  const w = L.readWav(file);
  if (w.sr !== SR) die(`${what} ${file} is ${w.sr} Hz; convert first: afconvert -f WAVE -d LEI16@48000 in out.wav`);
  return w;
}
const fadeTail = (x, end, ms) => { const n = Math.min(end, Math.round(ms / 1000 * SR)); for (let k = 0; k < n; k++) x[end - 1 - k] *= 0.5 - 0.5 * Math.cos(Math.PI * k / n); };

// ------------------------------------------------------------------ voice
const vw = load(A.voice, 'voice');
const voice = new Float32Array(N);
{
  const src = vw.chans.length === 1 ? vw.chans[0] : vw.chans[0].map((x, i) => 0.5 * (x + vw.chans[1][i]));
  const off = Math.round(VOICE_AT * SR);
  let end = 0;
  for (let i = 0; i < src.length; i++) { const j = off + i; if (j < 0) continue; if (j >= N) break; voice[j] = src[i]; end = j + 1; }
  if (off + src.length > N) { warn(`voice (${(src.length / SR).toFixed(2)} s from ${VOICE_AT} s) is longer than --dur ${DUR}: truncated with a 30 ms fade`); fadeTail(voice, end, 30); }
}
const voiceFileLufsMono = L.integratedLoudness([vw.chans.length === 1 ? vw.chans[0] : vw.chans[0].map((x, i) => 0.5 * (x + vw.chans[1][i]))]);
const voicePlacedBefore = L.integratedLoudness([voice, voice]);
if (!Number.isFinite(voicePlacedBefore)) die('voice is silent');
const voiceGainDb = VOICE_LUFS - voicePlacedBefore;
const gv = L.undb(voiceGainDb);
for (let i = 0; i < N; i++) voice[i] *= gv;

// ------------------------------------------------------------------ music
const mw = load(A.music, 'music');
const mL = new Float32Array(N), mR = new Float32Array(N);
{
  const a = mw.chans[0], b = mw.chans.length > 1 ? mw.chans[1] : mw.chans[0];
  const n = Math.min(N, a.length);
  mL.set(a.subarray(0, n)); mR.set(b.subarray(0, n));
  if (a.length > N) { warn(`music is longer (${(a.length / SR).toFixed(2)} s) than --dur: truncated with a 50 ms fade`); fadeTail(mL, N, 50); fadeTail(mR, N, 50); }
  if (a.length < N - 1) warn(`music is shorter (${(a.length / SR).toFixed(2)} s) than --dur ${DUR}: silence after`);
}
const musicLufsFile = L.integratedLoudness([mL, mR]);
if (!Number.isFinite(musicLufsFile)) die('music is silent');
const musicGainDb = MUSIC_LUFS - musicLufsFile;
const gm = L.undb(musicGainDb);
for (let i = 0; i < N; i++) { mL[i] *= gm; mR[i] *= gm; }
const musicSegUnducked = L.kSegmentEnergies([mL, mR]);

// ------------------------------------------------------------------ side-chain: voice activity
const FR = 48; // 1 ms frames
const nF = Math.ceil(N / FR);
const frameMs = new Float64Array(nF);
for (let f = 0; f < nF; f++) { let s = 0; const a = f * FR, b = Math.min(N, a + FR); for (let i = a; i < b; i++) s += voice[i] * voice[i]; frameMs[f] = s / (b - a); }
const rmsDb = new Float32Array(nF);
{ // centred 30 ms RMS via prefix sums
  const pre = new Float64Array(nF + 1);
  for (let f = 0; f < nF; f++) pre[f + 1] = pre[f] + frameMs[f];
  for (let f = 0; f < nF; f++) {
    const lo = Math.max(0, f - 15), hi = Math.min(nF, f + 15);
    rmsDb[f] = 10 * Math.log10(Math.max(1e-20, (pre[hi] - pre[lo]) / (hi - lo)));
  }
}
const rawActive = new Uint8Array(nF);
for (let f = 0; f < nF; f++) rawActive[f] = rmsDb[f] > THR_DB ? 1 : 0;
function runs(mask) { const r = []; let s = -1; for (let f = 0; f <= mask.length; f++) { const v = f < mask.length ? mask[f] : 0; if (v && s < 0) s = f; else if (!v && s >= 0) { r.push([s, f]); s = -1; } } return r; }
let speech = runs(rawActive).filter(([a, b]) => b - a >= 40);
{ // bridge gaps shorter than BRIDGE
  const merged = [];
  for (const r of speech) { const lst = merged[merged.length - 1]; if (lst && r[0] - lst[1] < BRIDGE * 1000) lst[1] = r[1]; else merged.push([r[0], r[1]]); }
  speech = merged;
}
const speechMask = new Uint8Array(nF);
for (const [a, b] of speech) speechMask.fill(1, a, b);

// ------------------------------------------------------------------ duck gain curve (dB, 1 ms frames)
const target = new Float32Array(nF);
for (const [a, b] of speech) target.fill(DUCK_DB, Math.max(0, a - Math.round(LOOK * 1000)), Math.min(nF, b + Math.round(HOLD * 1000)));
const gdb = new Float32Array(nF);
{
  const down = Math.abs(DUCK_DB) / (ATT * 1000), up = Math.abs(DUCK_DB) / (REL * 1000);
  // dB-domain slew limiter: the look-ahead already moved the target start
  // 150 ms before the onset, so a 120 ms attack is complete before speech.
  let g = target[0];
  for (let f = 0; f < nF; f++) { const t = target[f]; g = t < g ? Math.max(t, g - down) : Math.min(t, g + up); gdb[f] = g; }
  // zero-phase smoothing: 2 x centred 21 ms box
  for (let pass = 0; pass < 2; pass++) {
    const src = Float32Array.from(gdb); const h = 10; let acc = 0;
    for (let k = -h; k <= h; k++) acc += src[Math.min(nF - 1, Math.max(0, k))];
    for (let f = 0; f < nF; f++) {
      gdb[f] = acc / (2 * h + 1);
      acc += src[Math.min(nF - 1, f + h + 1)] - src[Math.max(0, f - h)];
    }
  }
}
// apply per sample (linear interpolation of the dB curve between 1 ms frames)
for (let i = 0; i < N; i++) {
  const x = i / FR - 0.5; const f0 = Math.max(0, Math.floor(x)); const f1 = Math.min(nF - 1, f0 + 1); const fr = Math.min(1, Math.max(0, x - f0));
  const g = Math.pow(10, (gdb[f0] + (gdb[f1] - gdb[f0]) * fr) / 20);
  mL[i] *= g; mR[i] *= g;
}

// ------------------------------------------------------------------ SFX
const sfxPlaced = [];
const outL = new Float32Array(N), outR = new Float32Array(N);
if (String(A.sfx).toLowerCase() !== 'none') {
  if (!fs.existsSync(A.sfx)) die('sfx events file not found: ' + A.sfx);
  let events = JSON.parse(fs.readFileSync(A.sfx, 'utf8'));
  if (!Array.isArray(events)) events = events.events || [];
  const baseDir = path.dirname(path.resolve(A.sfx));
  const cache = new Map();
  for (const e of events) {
    if (!e || typeof e.file !== 'string' || !Number.isFinite(Number(e.t))) { warn('bad sfx event ' + JSON.stringify(e)); continue; }
    const file = path.isAbsolute(e.file) ? e.file : path.resolve(baseDir, e.file);
    if (!cache.has(file)) cache.set(file, load(file, 'sfx'));
    const w = cache.get(file);
    const g = L.undb(Number(e.gain_db ?? 0));
    const pan = Math.max(-1, Math.min(1, Number(e.pan ?? 0)));
    const ang = (pan + 1) * Math.PI / 4, pl = Math.cos(ang) * Math.SQRT2, pr = Math.sin(ang) * Math.SQRT2;
    const a = w.chans[0], b = w.chans.length > 1 ? w.chans[1] : w.chans[0];
    const i0 = Math.round(Number(e.t) * SR);
    let placed = 0;
    for (let k = 0; k < a.length; k++) { const j = i0 + k; if (j < 0) continue; if (j >= N) break; outL[j] += a[k] * g * pl; outR[j] += b[k] * g * pr; placed++; }
    const truncated = placed < a.length;
    if (truncated) warn(`sfx ${e.file} at ${e.t}s truncated`);
    // loudness of this event alone, as placed (max 400 ms momentary; short files zero-padded)
    const len = Math.max(a.length, Math.round(0.4 * SR)) + Math.round(0.4 * SR);
    const el = new Float32Array(len), er = new Float32Array(len);
    for (let k = 0; k < a.length; k++) { el[k] = a[k] * g * pl; er[k] = b[k] * g * pr; }
    const es = L.kSegmentEnergies([el, er]);
    const em = L.loudnessSeries(es.e, es.seg, 4);
    sfxPlaced.push({ file: path.relative(process.cwd(), file), t: Number(e.t), gain_db: Number(e.gain_db ?? 0), pan, truncated,
      peak_momentary_lufs: L.r2(Math.max(...em)) });
  }
}

// ------------------------------------------------------------------ measurements before summing
const vSeg = L.kSegmentEnergies([voice, voice]);
const mSeg = L.kSegmentEnergies([mL, mR]);
const voiceLufsAfter = L.integratedFromSegments(vSeg.e, vSeg.seg);
const musicLufsUnducked = L.integratedFromSegments(musicSegUnducked.e, musicSegUnducked.seg);
const musicLufsDucked = L.integratedFromSegments(mSeg.e, mSeg.seg);

// ------------------------------------------------------------------ sum + limiter
for (let i = 0; i < N; i++) { const v = voice[i]; outL[i] += v + mL[i]; outR[i] += v + mR[i]; }
const preLimitPeak = L.peakAbs([outL, outR]);
const lim = L.lookaheadLimiter([outL, outR], L.undb(CEIL_DB), { lookMs: 3, relMs: 80, truePeak: true });
for (let i = 0; i < N; i++) { // hard safety (never expected to engage)
  if (outL[i] > 0.9999) outL[i] = 0.9999; else if (outL[i] < -0.9999) outL[i] = -0.9999;
  if (outR[i] > 0.9999) outR[i] = 0.9999; else if (outR[i] < -0.9999) outR[i] = -0.9999;
}
const wr = L.writeWav16(A.out, [outL, outR], SR, 777);

// ------------------------------------------------------------------ report
const median = (a) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const segMs = 100; // loudness segments are 100 ms
const vMom = L.loudnessSeries(vSeg.e, vSeg.seg, 4), mMom = L.loudnessSeries(mSeg.e, mSeg.seg, 4);
const mUnMom = L.loudnessSeries(musicSegUnducked.e, musicSegUnducked.seg, 4);
// speech windows: 400 ms blocks that are >= 75 % voiced (raw 30 ms RMS
// activity) - i.e. while someone is actually talking. For reference also
// every 400 ms block inside a bridged speech region (includes the short
// pauses between words/sentences < 600 ms, where the voice is silent).
const diffs = [], vUnder = [], mUnder = [], diffsRegion = [];
for (let j = 0; j < vMom.length; j++) {
  const a = j * segMs, b = a + 400;
  if (b > nF) break;
  let inside = true, voiced = 0;
  for (let f = a; f < b; f++) { if (!speechMask[f]) inside = false; voiced += rawActive[f]; }
  if (inside) diffsRegion.push(vMom[j] - mMom[j]);
  if (voiced < 300) continue;
  diffs.push(vMom[j] - mMom[j]); vUnder.push(vMom[j]); mUnder.push(mMom[j]);
}
// pauses: no speech for >= 1.5 s (music comes back up)
const pauses = [];
{
  const gaps = [];
  let prevEnd = 0;
  for (const [a, b] of speech) { if (a - prevEnd >= 1500) gaps.push([prevEnd, a]); prevEnd = b; }
  if (nF - prevEnd >= 1500) gaps.push([prevEnd, nF]);
  for (const [a, b] of gaps) {
    // music-up part of the pause: after hold+release, before the next look-ahead
    const ia = Math.min(b, a + (a > 0 ? Math.round((HOLD + REL) * 1000) : 0)), ib = Math.max(ia, b - Math.round(LOOK * 1000) - (b < nF ? 20 : 0));
    let acc = 0, c = 0, gmin = 0, gmax = -99, gsum = 0;
    for (let f = a; f < b; f++) { gmin = Math.min(gmin, gdb[f]); gmax = Math.max(gmax, gdb[f]); }
    for (let s = Math.floor(ia / segMs); s < Math.floor(ib / segMs) && s < mSeg.e.length; s++) { acc += mSeg.e[s]; c++; }
    for (let f = ia; f < ib; f++) gsum += gdb[f];
    const lufs = c ? -0.691 + 10 * Math.log10(acc / (c * mSeg.seg)) : null;
    pauses.push({ start_s: L.r2(a / 1000, 2), end_s: L.r2(b / 1000, 2), length_s: L.r2((b - a) / 1000, 2),
      music_up_window_s: [L.r2(ia / 1000, 2), L.r2(ib / 1000, 2)], music_lufs_in_window: c ? L.r2(lufs) : null,
      mean_duck_gain_db_in_window: ib > ia ? L.r2(gsum / (ib - ia)) : null, max_duck_gain_db: L.r2(gmax) });
  }
}
// onsets: duck lead time where the music was up before the sentence
const onsets = [];
for (const [a] of speech) {
  if (a < 400) continue;
  if (gdb[a - 400] < -1) continue; // music was not up (short gap) - not a fresh duck
  let f = a; while (f > 0 && gdb[f] < -1) f--;
  let fFull = a; while (fFull > 0 && gdb[fFull] <= DUCK_DB + 1) fFull--;
  onsets.push({ onset_s: L.r2(a / 1000, 3), duck_starts_before_ms: a - f, fully_ducked_before_ms: gdb[a] <= DUCK_DB + 1 ? a - fFull : -1, gain_at_onset_db: L.r2(gdb[a]) });
}
let ducked = 0, engaged = 0, events = 0, gMin = 0, gMax = -99;
for (let f = 0; f < nF; f++) {
  if (gdb[f] <= DUCK_DB + 1) ducked++;
  if (gdb[f] < -1) { engaged++; if (f === 0 || gdb[f - 1] >= -1) events++; }
  gMin = Math.min(gMin, gdb[f]); gMax = Math.max(gMax, gdb[f]);
}
// music level while it is up: 1 s windows where the duck gain stays > -0.5 dB
const stUn = [];
{
  const m1 = L.loudnessSeries(mSeg.e, mSeg.seg, 10);
  for (let j = 0; j < m1.length; j++) {
    let up = true; for (let f = j * segMs; f < j * segMs + 1000 && f < nF; f += 10) if (gdb[f] < -0.5) { up = false; break; }
    if (up) stUn.push(m1[j]);
  }
}
const mixLufs = L.integratedLoudness([outL, outR]);
const outTp = L.maxOf(L.truePeakEnvelope([outL, outR]));
const outSp = L.peakAbs([outL, outR]);
const lead = onsets.map((o) => o.duck_starts_before_ms);
// context for each SFX: voice and (ducked) music momentary loudness at the event
for (const e of sfxPlaced) {
  const j = Math.max(0, Math.min(vMom.length - 1, Math.floor(e.t * 10)));
  e.voice_momentary_lufs_at_t = L.r2(vMom[j] < -150 ? -Infinity : vMom[j]);
  e.music_momentary_lufs_at_t = L.r2(mMom[j]);
  e.duck_gain_db_at_t = L.r2(gdb[Math.min(nF - 1, Math.round(e.t * 1000))]);
}
const curve = [];
for (let f = 0; f < nF; f += 100) curve.push(Math.round(gdb[f] * 10) / 10);
const report = {
  tool: 'mix.js',
  inputs: { voice: A.voice, music: A.music, sfx: A.sfx, voice_at_s: VOICE_AT },
  output: { file: A.out, duration_s: DUR, frames: N, sample_rate: SR, channels: 2, bit_depth: 16 },
  settings: { voice_lufs: VOICE_LUFS, music_lufs_unducked: MUSIC_LUFS, duck_db: DUCK_DB, threshold_dbfs: THR_DB, lookahead_ms: LOOK * 1000,
    attack_ms: ATT * 1000, hold_ms: HOLD * 1000, release_ms: REL * 1000, bridge_ms: BRIDGE * 1000, ceiling_dbfs: CEIL_DB,
    loudness_method: 'ITU-R BS.1770-4 K-weighting (exact 48k coefficients), 400 ms blocks / 100 ms hop, -70 LUFS abs gate, -10 LU rel gate; voice measured as placed (dual mono)' },
  voice: { lufs_file_mono: L.r2(voiceFileLufsMono), lufs_as_placed_before: L.r2(voicePlacedBefore), gain_db: L.r2(voiceGainDb), lufs_after: L.r2(voiceLufsAfter),
    speech_regions: speech.length, speech_time_s: L.r2(speech.reduce((s, [a, b]) => s + b - a, 0) / 1000, 1) },
  music: { lufs_file: L.r2(musicLufsFile), gain_db: L.r2(musicGainDb), lufs_unducked: L.r2(musicLufsUnducked), lufs_after_ducking_whole_track: L.r2(musicLufsDucked),
    music_up_1s_lufs_median: L.r2(median(stUn)), music_up_1s_windows: stUn.length },
  speech_windows: {
    definition: '400 ms momentary-loudness blocks (100 ms hop) that are >= 75 % voiced; voice stem vs ducked music stem',
    count_400ms: diffs.length,
    voice_minus_music_db: { median: L.r2(median(diffs)), p10: L.r2(pct(diffs, 0.1)), p05: L.r2(pct(diffs, 0.05)), min: L.r2(pct(diffs, 0)), p90: L.r2(pct(diffs, 0.9)) },
    voice_momentary_lufs_median: L.r2(median(vUnder)), music_momentary_lufs_median_under_speech: L.r2(median(mUnder)),
    music_momentary_lufs_p90_under_speech: L.r2(pct(mUnder, 0.9)),
    all_blocks_in_speech_regions: { count: diffsRegion.length, median: L.r2(median(diffsRegion)), p10: L.r2(pct(diffsRegion, 0.1)),
      note: 'includes word/sentence gaps < 600 ms where the voice itself is silent, so the low tail is expected' },
  },
  pauses_ge_1_5s: pauses,
  duck: { min_gain_db: L.r2(gMin), max_gain_db: L.r2(gMax), fully_ducked_pct: L.r2(100 * ducked / nF, 1), engaged_pct: L.r2(100 * engaged / nF, 1), duck_events: events,
    fresh_onsets: onsets.length, lead_ms_min: lead.length ? Math.min(...lead) : null, lead_ms_median: median(lead),
    max_gain_at_onset_db: onsets.length ? L.r2(Math.max(...onsets.map((o) => o.gain_at_onset_db))) : null, onsets,
    speech_regions_s: speech.map(([a, b]) => [L.r2(a / 1000, 2), L.r2(b / 1000, 2)]),
    curve_100ms_db: curve },
  sfx: sfxPlaced,
  master: { pre_limiter_sample_peak_dbfs: L.r2(L.db(preLimitPeak)), samples_limited: lim.limitedSamples, max_gain_reduction_db: L.r2(lim.maxReductionDb, 3),
    sample_peak_dbfs: L.r2(L.db(outSp)), true_peak_dbtp_est: L.r2(L.db(outTp)), integrated_lufs: L.r2(mixLufs), wav_clipped_samples: wr.clipped },
  checks: {},
  warnings,
  render_seconds: L.r2((Date.now() - t0clock) / 1000, 1),
};
report.checks = {
  voice_at_target_lufs: Math.abs(voiceLufsAfter - VOICE_LUFS) < 0.2,
  speech_vs_music_median_ge_18db: median(diffs) !== null && median(diffs) >= 18,
  duck_starts_before_every_fresh_onset: onsets.every((o) => o.duck_starts_before_ms > 0),
  fully_ducked_at_every_fresh_onset: onsets.every((o) => o.gain_at_onset_db <= DUCK_DB + 1),
  true_peak_le_ceiling: L.db(outTp) <= CEIL_DB + 0.05,
  exact_length: N === Math.round(DUR * SR),
};
if (A.report && A.report !== true) fs.writeFileSync(A.report, JSON.stringify(report, null, 2));
const s = report.speech_windows.voice_minus_music_db;
console.error(`[mix] wrote ${A.out} (${N} frames). voice ${report.voice.lufs_after} LUFS (gain ${report.voice.gain_db} dB), music unducked ${report.music.lufs_unducked} LUFS ` +
  `(gain ${report.music.gain_db} dB), voice-music in speech median ${s.median} dB (p10 ${s.p10}), duck lead median ${report.duck.lead_ms_median} ms, ` +
  `peak ${report.master.true_peak_dbtp_est} dBTP, limited ${lim.limitedSamples} samples, mix ${report.master.integrated_lufs} LUFS, ${report.render_seconds}s`);
const failed = Object.entries(report.checks).filter(([, v]) => !v).map(([k]) => k);
if (failed.length) console.error('[mix] CHECKS FAILED: ' + failed.join(', '));
