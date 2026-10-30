#!/usr/bin/env node
'use strict';
/**
 * verify_mix.js - independent check of a rendered mix (reads the WAV the
 * mixer wrote, not the mixer's internal buffers).
 *
 *   node scripts/video/audio/verify_mix.js --mix mix.wav --voice voice.wav --music music.wav
 *        --report mix.report.json [--json verify.json] [--arrangement music.arrangement.json]
 *
 * Because the mixer's limiter did not engage on the test (report:
 * master.samples_limited = 0), mix = voice*gv (dual mono) + music*gm*duck + sfx
 * exactly (plus 16-bit dither). So
 *     residual = mix - voice*gv            (= ducked music + sfx)
 *     measured duck gain(t) = residual energy / (music*gm) energy, 20 ms windows
 * Speech onsets are detected here independently (10 ms RMS > -45 dBFS after
 * >= 1.5 s below it). For each onset we print the measured music gain from
 * 400 ms before to 100 ms after, which shows whether the music is already
 * down when the sentence starts. We also recompute voice-vs-music loudness
 * (BS.1770 momentary, 400 ms) in voiced blocks from the rendered file, and the
 * same ratio restricted to 1-4 kHz (2nd-order HP 1 kHz + LP 4 kHz on both
 * signals, plain 400 ms RMS), i.e. the band where consonants live.
 * With --arrangement (keynote style) it also prints the measured music gain at
 * each landing time (build 0.5 s before, the landing, 0.25 s after), which shows
 * how much of every impact survives the ducking when speech follows closely.
 */
const fs = require('fs');
const L = require('./lib');
const SR = L.SR;
const A = L.parseArgs(process.argv.slice(2));
for (const k of ['mix', 'voice', 'music', 'report']) if (!A[k] || A[k] === true) { console.error('Usage: node verify_mix.js --mix m.wav --voice v.wav --music mu.wav --report r.json [--json out.json]'); process.exit(2); }
const rep = JSON.parse(fs.readFileSync(A.report, 'utf8'));
const mix = L.readWav(A.mix), vw = L.readWav(A.voice), mw = L.readWav(A.music);
const N = mix.frames;
const gv = L.undb(rep.voice.gain_db), gm = L.undb(rep.music.gain_db);
const off = Math.round((rep.inputs.voice_at_s || 0) * SR);
const vsrc = vw.chans.length === 1 ? vw.chans[0] : vw.chans[0].map((x, i) => 0.5 * (x + vw.chans[1][i]));
const v = new Float32Array(N);
for (let i = 0; i < vsrc.length; i++) { const j = off + i; if (j >= 0 && j < N) v[j] = vsrc[i] * gv; }
if (off + vsrc.length > N) { const n = Math.round(0.03 * SR); for (let k = 0; k < n; k++) v[N - 1 - k] *= 0.5 - 0.5 * Math.cos(Math.PI * k / n); }
const [xl, xr] = mix.chans;
const resL = new Float32Array(N), resR = new Float32Array(N);
for (let i = 0; i < N; i++) { resL[i] = xl[i] - v[i]; resR[i] = xr[i] - v[i]; }
const ml = mw.chans[0], mr = mw.chans.length > 1 ? mw.chans[1] : mw.chans[0];

// SFX busy intervals (excluded from duck measurement)
const busy = (rep.sfx || []).map((e) => { let len = 1.5; try { len = L.readWav(e.file).frames / SR; } catch (_) { /* keep default */ } return [e.t, e.t + len]; });
const isBusy = (t0, t1) => busy.some(([a, b]) => t0 < b && t1 > a);

function gainAt(tc, win = 0.02) {
  const a = Math.max(0, Math.round((tc - win / 2) * SR)), b = Math.min(N, Math.round((tc + win / 2) * SR));
  let er = 0, em = 0;
  for (let i = a; i < b; i++) { er += resL[i] * resL[i] + resR[i] * resR[i]; const p = ml[i] * gm, q = mr[i] * gm; em += p * p + q * q; }
  return em > 1e-12 ? 10 * Math.log10(er / em) : null;
}

// independent onset detection
const W = Math.round(0.01 * SR), nW = Math.floor(N / W);
const act = new Uint8Array(nW);
for (let w = 0; w < nW; w++) { let s = 0; for (let i = w * W; i < (w + 1) * W; i++) s += v[i] * v[i]; act[w] = 10 * Math.log10(s / W + 1e-20) > -45 ? 1 : 0; }
const onsets = [];
let quiet = 0;
for (let w = 0; w < nW; w++) { if (act[w]) { if (quiet >= 150 && w * W / SR > 0.5) onsets.push(w * W / SR); quiet = 0; } else quiet++; }
const offsetsMs = [-400, -300, -200, -150, -100, -50, -20, 0, 50, 100];
const rows = [];
for (const t of onsets) {
  if (isBusy(t - 0.5, t + 0.2)) { rows.push({ onset_s: L.r2(t, 3), skipped: 'sfx overlap' }); continue; }
  const g = {}; for (const o of offsetsMs) g[o] = L.r2(gainAt(t + o / 1000), 1);
  rows.push({ onset_s: L.r2(t, 3), measured_music_gain_db: g });
}
// voice vs music (from the rendered file) in voiced 400 ms blocks
const vSeg = L.kSegmentEnergies([v, v]), rSeg = L.kSegmentEnergies([resL, resR]);
const vM = L.loudnessSeries(vSeg.e, vSeg.seg, 4), rM = L.loudnessSeries(rSeg.e, rSeg.seg, 4);
const diffs = [];
for (let j = 0; j < vM.length; j++) {
  const w0 = j * 10; let voiced = 0; for (let w = w0; w < w0 + 40 && w < nW; w++) voiced += act[w];
  if (voiced < 30 || isBusy(j / 10, j / 10 + 0.4)) continue;
  diffs.push(vM[j] - rM[j]);
}
diffs.sort((a, b) => a - b);
const q = (p) => (diffs.length ? L.r2(diffs[Math.min(diffs.length - 1, Math.floor(p * diffs.length))]) : null);
// 1-4 kHz voice vs music ratio in voiced blocks
const band = (x) => { const y = Float32Array.from(x); L.filterInPlace(y, L.biquad('hp', 1000, 0.707)); L.filterInPlace(y, L.biquad('lp', 4000, 0.707)); return y; };
const vB = band(v), rB = band(Float32Array.from(resL, (x, i) => 0.5 * (x + resR[i])));
const bandDiffs = [];
for (let j = 0; j + 4 <= vM.length; j++) {
  const w0 = j * 10; let voiced = 0; for (let w = w0; w < w0 + 40 && w < nW; w++) voiced += act[w];
  if (voiced < 30 || isBusy(j / 10, j / 10 + 0.4)) continue;
  const a = j * 4800, b = a + 19200; let ev2 = 0, er2 = 0;
  for (let i = a; i < b; i++) { ev2 += vB[i] * vB[i]; er2 += rB[i] * rB[i]; }
  bandDiffs.push(10 * Math.log10((ev2 + 1e-20) / (er2 + 1e-20)));
}
bandDiffs.sort((x, y) => x - y);
const bq = (p) => (bandDiffs.length ? L.r2(bandDiffs[Math.min(bandDiffs.length - 1, Math.floor(p * bandDiffs.length))]) : null);
// landing duck depth
let landingRows = null;
if (A.arrangement && A.arrangement !== true && fs.existsSync(A.arrangement)) {
  const arr = JSON.parse(fs.readFileSync(A.arrangement, 'utf8'));
  if (Array.isArray(arr.landings)) {
    landingRows = arr.landings.map((lg) => {
      const t = lg.requested_s;
      const sp = (rep.duck.speech_regions_s || []).find(([a, b]) => t + 1.0 >= a && a >= t - 0.6);
      const nextOnset = (rep.duck.speech_regions_s || []).map(([a]) => a).filter((a) => a > t - 0.6)[0];
      const sfxNear = (rep.sfx || []).some((e) => e.t > t - 0.7 && e.t < t + 1.0);
      return { landing_s: t, type: lg.type, includes_sfx: sfxNear, music_gain_db: { '-500ms': L.r2(gainAt(t - 0.5), 1), '0': L.r2(gainAt(t), 1), '+250ms': L.r2(gainAt(t + 0.25), 1) },
        next_speech_onset_after_landing_ms: nextOnset === undefined ? null : Math.round((nextOnset - t) * 1000) };
    });
  }
}
const ok = rows.filter((r) => r.measured_music_gain_db);
const out = {
  mix: A.mix, residual_method: 'mix - voice*gain (dual mono); valid because samples_limited = ' + rep.master.samples_limited,
  onsets_detected: onsets.length,
  duck_at_onsets: rows,
  summary: {
    measured_gain_at_onset_db_max: ok.length ? Math.max(...ok.map((r) => r.measured_music_gain_db[0])) : null,
    measured_gain_150ms_before_db_median: ok.length ? L.r2(ok.map((r) => r.measured_music_gain_db[-150]).sort((a, b) => a - b)[Math.floor(ok.length / 2)], 1) : null,
    measured_gain_400ms_before_db_median: ok.length ? L.r2(ok.map((r) => r.measured_music_gain_db[-400]).sort((a, b) => a - b)[Math.floor(ok.length / 2)], 1) : null,
    voice_minus_music_voiced_blocks_db: { count: diffs.length, median: q(0.5), p10: q(0.1), p05: q(0.05), min: q(0) },
    voice_minus_music_1_4k_voiced_blocks_db: { count: bandDiffs.length, median: bq(0.5), p10: bq(0.1), p05: bq(0.05), min: bq(0) },
  },
  landings: landingRows,
};
if (A.json && A.json !== true) fs.writeFileSync(A.json, JSON.stringify(out, null, 2));
console.log('onset (s)  | measured music gain (dB) at ms relative to onset: ' + offsetsMs.join(' '));
for (const r of rows) console.log(String(r.onset_s).padEnd(10) + ' | ' + (r.skipped || offsetsMs.map((o) => String(r.measured_music_gain_db[o]).padStart(6)).join(' ')));
console.log('voice - music (voiced 400 ms blocks, from the rendered file): ' + JSON.stringify(out.summary.voice_minus_music_voiced_blocks_db));
console.log('voice - music, 1-4 kHz only (same blocks):                    ' + JSON.stringify(out.summary.voice_minus_music_1_4k_voiced_blocks_db));
if (landingRows) {
  console.log('landing (s) | measured music gain (dB) at -500 ms / landing / +250 ms | next speech onset after landing (ms)   (* = an SFX event is near: gain is inflated by it)');
  for (const r of landingRows) console.log(String(r.landing_s).padEnd(11) + ' | ' + [r.music_gain_db['-500ms'], r.music_gain_db['0'], r.music_gain_db['+250ms']].map((x) => String(x).padStart(6)).join(' ') + '   | ' + r.next_speech_onset_after_landing_ms + (r.includes_sfx ? '  *' : ''));
}
