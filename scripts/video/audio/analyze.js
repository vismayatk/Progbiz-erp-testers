#!/usr/bin/env node
'use strict';
/**
 * analyze.js - objective checks for a music bed or a final mix (we cannot
 * listen during production, so we measure).
 *
 *   node scripts/video/audio/analyze.js --in <file.wav> [--arrangement <x.arrangement.json>]
 *        [--outro-at <s>] [--json <report.json>] [--jump-db 6] [--speech]
 *
 *   --speech  the file contains narration (a mix): level jumps and "dropouts"
 *             are expected at speech pauses, so they are listed but not judged.
 *
 * Measures
 *   - per-second RMS (dBFS, stereo power mean) + jumps > --jump-db between
 *     consecutive seconds, each tagged "intended" when it is within 1.5 s of
 *     a section boundary / entry / lift / outro from the arrangement file,
 *     or inside the first 2 s (fade-in) or after the outro
 *   - dropouts: seconds inside the body > 10 dB below the body median, and
 *     digital-silence runs > 20 ms
 *   - spectral balance (Welch, 8192-pt Hann): sub <60, low 60-250,
 *     mid 250-2k, presence 2-6k, air >6k Hz, dB relative to total
 *   - DC offset, clipped samples (|x| >= 32767), max sample-to-sample jump,
 *     click detector (2nd-difference spike vs. local RMS of the 2nd difference)
 *   - ending: RMS of the last 1 s / 100 ms, RMS per second of the last 8 s,
 *     final sample values
 *   - integrated loudness (BS.1770-4), sample peak, 4x inter-sample peak,
 *     stereo correlation
 *   - octave levels versus a pink-noise reference of the same total power
 *     (Paul Kellet filter, seeded); "voice pocket" = mean of the 1k/2k/4k octaves
 *     (707 Hz - 5.6 kHz) vs pink, and vs the 125/250/500 Hz octaves
 *   - keynote landings (when the arrangement JSON has "landings"): onset time of
 *     the impact in the 30-110 Hz band versus the requested time, and the
 *     build/land contrast (4-9 kHz riser rise, 30-110 Hz drop-out before, thump after)
 */
const fs = require('fs');
const L = require('./lib');

const A = L.parseArgs(process.argv.slice(2));
if (!A.in || A.in === true) { console.error('Usage: node analyze.js --in <file.wav> [--arrangement x.json] [--outro-at s] [--json out.json]'); process.exit(2); }
const JUMP_DB = A['jump-db'] !== undefined ? Number(A['jump-db']) : 6;
const w = L.readWav(A.in);
if (w.sr !== 48000) console.error('analyze: note: sample rate ' + w.sr);
const SR = w.sr;
const chans = w.chans.length === 1 ? [w.chans[0], w.chans[0]] : w.chans.slice(0, 2);
const [xl, xr] = chans;
const n = w.frames, dur = n / SR;

let arr = null;
if (A.arrangement && fs.existsSync(A.arrangement)) arr = JSON.parse(fs.readFileSync(A.arrangement, 'utf8'));
const outroAt = A['outro-at'] !== undefined ? Number(A['outro-at']) : (arr ? arr.outro.final_chord_at_s : dur);
const marks = [];
if (arr) {
  for (const s of arr.sections) { marks.push(s.start_s, s.end_s); }
  for (const t of arr.lifts.snapped_s) { marks.push(t, t - 1.2); }
  marks.push(arr.entries.pluck_s, arr.entries.bass_and_percussion_s, outroAt);
}
const nearMark = (t) => marks.some((m) => Math.abs(m - t) <= 1.5);

// ---------------------------------------------------------------- per-second RMS
const secs = Math.floor(n / SR);
const perSec = [];
for (let s = 0; s < secs; s++) perSec.push(L.db(L.rmsRange(chans, s * SR, (s + 1) * SR)));
const bodyFrom = 2, bodyTo = Math.min(secs, Math.floor(outroAt));
const body = perSec.slice(bodyFrom, bodyTo).filter(Number.isFinite).sort((a, b) => a - b);
const bodyMedian = body.length ? body[Math.floor(body.length / 2)] : -Infinity;
const jumps = [];
for (let s = 1; s < secs; s++) {
  const d = perSec[s] - perSec[s - 1];
  if (Math.abs(d) > JUMP_DB) {
    const intended = A.speech ? 'n/a (speech)' : (s <= 2 || s >= Math.floor(outroAt) || nearMark(s));
    jumps.push({ at_s: s, delta_db: L.r2(d), from_db: L.r2(perSec[s - 1]), to_db: L.r2(perSec[s]), intended });
  }
}
let maxBodyJump = 0, maxBodyJumpAt = null, maxAway = 0, maxAwayAt = null;
for (let s = bodyFrom + 1; s < bodyTo; s++) {
  const d = Math.abs(perSec[s] - perSec[s - 1]);
  if (d > maxBodyJump) { maxBodyJump = d; maxBodyJumpAt = s; }
  if (marks.length && !nearMark(s) && d > maxAway) { maxAway = d; maxAwayAt = s; }
}
const dropouts = [];
for (let s = bodyFrom; s < bodyTo; s++) if (perSec[s] < bodyMedian - 10) dropouts.push({ at_s: s, rms_db: L.r2(perSec[s]) });
// digital silence runs inside the body
const silenceRuns = [];
{
  let run = 0, start = 0;
  const a = bodyFrom * SR, b = bodyTo * SR;
  for (let i = a; i < b; i++) {
    if (Math.abs(xl[i]) < 1.5 / 32768 && Math.abs(xr[i]) < 1.5 / 32768) { if (!run) start = i; run++; }
    else { if (run > 0.02 * SR) silenceRuns.push({ at_s: L.r2(start / SR, 3), len_ms: L.r2(run / SR * 1000, 1) }); run = 0; }
  }
}

// ---------------------------------------------------------------- spectrum
const NFFT = 8192;
const bands = [['sub_lt60', 0, 60], ['low_60_250', 60, 250], ['mid_250_2k', 250, 2000], ['presence_2k_6k', 2000, 6000], ['air_gt6k', 6000, SR / 2]];
const psd = new Float64Array(NFFT / 2 + 1);
{
  const win = new Float64Array(NFFT);
  for (let i = 0; i < NFFT; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NFFT);
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
  const short = n < NFFT; // short files (SFX): one zero-padded, unwindowed frame
  for (let off = 0; short ? off === 0 : off + NFFT <= n; off += NFFT) {
    for (const x of chans) {
      for (let i = 0; i < NFFT; i++) { re[i] = short ? (i < n ? x[i] : 0) : x[off + i] * win[i]; im[i] = 0; }
      L.fft(re, im);
      for (let k = 0; k <= NFFT / 2; k++) psd[k] += re[k] * re[k] + im[k] * im[k];
    }
  }
}
let tot = 0; for (let k = 1; k <= NFFT / 2; k++) tot += psd[k];
const bandDb = {};
for (const [name, lo, hi] of bands) {
  let s = 0;
  for (let k = 1; k <= NFFT / 2; k++) { const f = k * SR / NFFT; if (f >= lo && f < hi) s += psd[k]; }
  bandDb[name] = L.r2(L.pdb(s / tot));
}
// 1/3-octave-ish coarse profile for peaks/resonances (relative dB)
const octaves = [];
for (let fc = 31.25; fc < 20000; fc *= 2) {
  let s = 0; const lo = fc / Math.SQRT2, hi = fc * Math.SQRT2;
  for (let k = 1; k <= NFFT / 2; k++) { const f = k * SR / NFFT; if (f >= lo && f < hi) s += psd[k]; }
  octaves.push({ hz: Math.round(fc), rel_db: L.r2(L.pdb(s / tot)) });
}
// pink-noise reference through the same analysis (equal energy per octave, same total power)
let pinkOct = null, pocket = null;
if (n >= NFFT * 4) {
  const pn = L.pinkNoise(SR * 30, L.mulberry32(20260930));
  const ppsd = new Float64Array(NFFT / 2 + 1);
  const win = new Float64Array(NFFT); for (let i = 0; i < NFFT; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NFFT);
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
  for (let off = 0; off + NFFT <= pn.length; off += NFFT) {
    for (let i = 0; i < NFFT; i++) { re[i] = pn[off + i] * win[i]; im[i] = 0; }
    L.fft(re, im); for (let k = 0; k <= NFFT / 2; k++) ppsd[k] += re[k] * re[k] + im[k] * im[k];
  }
  let ptot = 0; for (let k = 1; k <= NFFT / 2; k++) ptot += ppsd[k];
  pinkOct = [];
  for (let fc = 31.25; fc < 20000; fc *= 2) {
    let sp = 0; const lo = fc / Math.SQRT2, hi = fc * Math.SQRT2;
    for (let k = 1; k <= NFFT / 2; k++) { const f = k * SR / NFFT; if (f >= lo && f < hi) sp += ppsd[k]; }
    pinkOct.push(L.pdb(sp / ptot));
  }
  const vs = octaves.map((o, i) => L.r2(o.rel_db - pinkOct[i]));
  const hz = octaves.map((o) => o.hz);
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const pick = (list) => mean(hz.map((h, i) => (list.includes(h) ? vs[i] : null)).filter((x) => x !== null));
  pocket = { octave_vs_pink_db: octaves.map((o, i) => ({ hz: o.hz, vs_pink_db: vs[i] })),
    voice_pocket_1k_2k_4k_vs_pink_db: L.r2(pick([1000, 2000, 4000])), lowmid_125_250_500_vs_pink_db: L.r2(pick([125, 250, 500])),
    air_8k_16k_vs_pink_db: L.r2(pick([8000, 16000])),
    pocket_below_lowmid_db: L.r2(pick([1000, 2000, 4000]) - pick([125, 250, 500])),
    note: 'each octave band level (dB re total power) minus the same band of pink noise of equal total power; negative = less energy than pink there' };
}

// ---------------------------------------------------------------- sample-level checks
let dcL = 0, dcR = 0;
for (let i = 0; i < n; i++) { dcL += xl[i]; dcR += xr[i]; }
dcL /= n; dcR /= n;
let clipped = 0, maxJump = 0, maxJumpAt = 0;
for (const x of chans) {
  for (let i = 0; i < n; i++) {
    if (Math.abs(x[i]) >= 32767 / 32768) clipped++;
    if (i) { const j = Math.abs(x[i] - x[i - 1]); if (j > maxJump) { maxJump = j; maxJumpAt = i; } }
  }
}
// click detector on the 2nd difference, 5 ms blocks, local context 105 ms
const clicks = [];
let maxClickRatio = 0, maxClickAt = 0;
{
  const B = Math.round(0.005 * SR), nb = Math.floor(n / B);
  for (const x of chans) {
    const e = new Float64Array(nb), mx = new Float64Array(nb), mxAt = new Int32Array(nb);
    for (let b = 0; b < nb; b++) {
      let s = 0, m = 0, at = 0;
      for (let i = Math.max(2, b * B); i < (b + 1) * B; i++) {
        const d = x[i] - 2 * x[i - 1] + x[i - 2];
        s += d * d; if (Math.abs(d) > m) { m = Math.abs(d); at = i; }
      }
      e[b] = s; mx[b] = m; mxAt[b] = at;
    }
    const H = 10;
    for (let b = H; b < nb - H; b++) {
      let s = 0; for (let k = b - H; k <= b + H; k++) s += e[k];
      const rms = Math.sqrt(s / ((2 * H + 1) * B));
      if (mx[b] < 2e-4 || rms <= 0) continue; // ignore sub-LSB-level activity
      const ratio = mx[b] / rms;
      if (ratio > maxClickRatio) { maxClickRatio = ratio; maxClickAt = mxAt[b]; }
      if (ratio > 12) clicks.push({ at_s: L.r2(mxAt[b] / SR, 4), ratio: L.r2(ratio, 1) });
    }
  }
}

// ---------------------------------------------------------------- ending
const last = (sec) => L.db(L.rmsRange(chans, Math.max(0, n - Math.round(sec * SR)), n));
const tailPerSec = [];
for (let s = Math.max(0, secs - 8); s < secs; s++) tailPerSec.push({ second: `${s}-${s + 1}`, rms_dbfs: L.r2(perSec[s]) });

// ---------------------------------------------------------------- loudness, peaks, stereo
const lufs = L.integratedLoudness(chans, SR);
const sPeak = L.peakAbs(chans);
const tpEnv = L.truePeakEnvelope(chans);
const tPeak = L.maxOf(tpEnv);
let sLR = 0, sLL = 0, sRR = 0;
for (let i = 0; i < n; i++) { sLR += xl[i] * xr[i]; sLL += xl[i] * xl[i]; sRR += xr[i] * xr[i]; }
const corr = sLR / Math.sqrt(sLL * sRR || 1);

// ---------------------------------------------------------------- keynote landings
let landingsRep = null;
if (arr && Array.isArray(arr.landings) && arr.landings.length) {
  const mono = new Float32Array(n); for (let i = 0; i < n; i++) mono[i] = 0.5 * (xl[i] + xr[i]);
  // zero-phase (forward + backward) 30-110 Hz band, so the detector adds no filter delay
  const zp = (x, c) => { L.filterInPlace(x, c); x.reverse(); L.filterInPlace(x, c); x.reverse(); };
  const bpLo = Float32Array.from(mono);
  zp(bpLo, L.biquad('hp', 30, 0.707)); zp(bpLo, L.biquad('lp', 110, 0.707));
  const bpHi = Float32Array.from(mono);
  L.filterInPlace(bpHi, L.biquad('hp', 4000, 0.707)); L.filterInPlace(bpHi, L.biquad('hp', 4000, 0.707));
  L.filterInPlace(bpHi, L.biquad('lp', 9000, 0.707));
  const rmsDbw = (x, a, b) => { const i0 = Math.max(0, Math.round(a * SR)), i1 = Math.min(n, Math.round(b * SR)); let e = 0; for (let i = i0; i < i1; i++) e += x[i] * x[i]; return L.pdb(e / Math.max(1, i1 - i0)); };
  const rows = [];
  for (const lg of arr.landings) {
    const t = lg.requested_s;
    // (a) direct onset: first sample whose |30-110 Hz| exceeds the pre-landing residue + 6 % of the rise to the following peak
    const a0 = Math.round((t - 0.07) * SR), a1 = Math.round((t - 0.01) * SR), b1 = Math.round((t + 0.25) * SR);
    let base = 0, peak = 0;
    for (let i = a0; i < a1; i++) base = Math.max(base, Math.abs(bpLo[i]));
    for (let i = Math.round((t - 0.01) * SR); i < b1; i++) peak = Math.max(peak, Math.abs(bpLo[i]));
    const thr = base + 0.06 * Math.max(0, peak - base);   // floor-compensated 6 % of the rise
    let onset = null;
    for (let i = Math.round((t - 0.01) * SR); i < b1; i++) if (Math.abs(bpLo[i]) > thr) { onset = i; break; }
    const preLow = rmsDbw(bpLo, t - 1.2, t - 0.15), farLow = rmsDbw(bpLo, t - 4, t - 2.5), postLow = rmsDbw(bpLo, t, t + 0.5);
    const riseHi = rmsDbw(bpHi, t - 1.2, t - 0.1) - rmsDbw(bpHi, t - 4, t - 2.2);
    rows.push({ requested_s: t, type: lg.type,
      onset_error_ms: onset === null ? null : L.r2((onset / SR - t) * 1000, 2),
      build_hi_4_9k_rise_db: L.r2(riseHi, 1), low_30_110_before_build_db: L.r2(farLow, 1), low_30_110_in_build_db: L.r2(preLow, 1),
      low_30_110_after_landing_db: L.r2(postLow, 1), low_drop_in_build_db: L.r2(preLow - farLow, 1), low_thump_over_build_db: L.r2(postLow - preLow, 1) });
  }
  const errs = rows.map((r) => r.onset_error_ms).filter((x) => x !== null);
  landingsRep = { rows, max_abs_onset_error_ms: errs.length ? L.r2(Math.max(...errs.map(Math.abs)), 2) : null, missing_onsets: rows.length - errs.length,
    note: 'onset = first sample of the zero-phase 30-110 Hz band above (residue max in [t-70,t-10] ms) + 6 % of the rise to the peak in [t-10,t+250] ms; error is measured versus the REQUESTED time' };
}

const report = {
  file: A.in, duration_s: L.r2(dur, 4), frames: n, sample_rate: SR, channels: w.ch,
  integrated_lufs: L.r2(lufs), sample_peak_dbfs: L.r2(L.db(sPeak)), true_peak_dbtp_est: L.r2(L.db(tPeak)),
  body: { from_s: bodyFrom, to_s: bodyTo, median_rms_dbfs: L.r2(bodyMedian), overall_rms_dbfs: L.r2(L.db(L.rmsRange(chans, bodyFrom * SR, bodyTo * SR))),
    max_second_to_second_change_db: L.r2(maxBodyJump), at_s: maxBodyJumpAt,
    max_change_away_from_marks_db: marks.length ? L.r2(maxAway) : null, max_change_away_from_marks_at_s: maxAwayAt },
  jumps_gt_threshold: jumps, jump_threshold_db: JUMP_DB,
  unintended_jumps: A.speech ? 'n/a (speech)' : jumps.filter((j) => j.intended === false).length,
  dropouts, digital_silence_runs_in_body: silenceRuns,
  spectrum_band_rel_db: bandDb,
  air_minus_mid_db: L.r2(bandDb.air_gt6k - bandDb.mid_250_2k),
  octave_profile_rel_db: octaves,
  pink_reference: pocket,
  landings: landingsRep,
  dc_offset: { left: L.r2(dcL, 7), right: L.r2(dcR, 7), left_dbfs: L.r2(L.db(Math.abs(dcL))), right_dbfs: L.r2(L.db(Math.abs(dcR))) },
  clipped_samples: clipped,
  max_sample_step: { value: L.r2(maxJump, 5), dbfs: L.r2(L.db(maxJump)), at_s: L.r2(maxJumpAt / SR, 4) },
  click_detector: { max_ratio: L.r2(maxClickRatio, 1), at_s: L.r2(maxClickAt / SR, 4), threshold: 12, flagged: clicks.length, first: clicks.slice(0, 10),
    note: 'ratio = biggest 2nd-difference sample / local RMS of the 2nd difference (105 ms). Smooth material ~3-6; a step/click gives >> 12.' },
  ending: { last_1s_rms_dbfs: L.r2(last(1)), last_100ms_rms_dbfs: L.r2(last(0.1)), last_sample_int16: [Math.round(xl[n - 1] * 32768), Math.round(xr[n - 1] * 32768)], last_8_seconds: tailPerSec },
  stereo_correlation: L.r2(corr, 3),
  per_second_rms_dbfs: perSec.map((v) => L.r2(v, 1)),
};
if (A.json && A.json !== true) fs.writeFileSync(A.json, JSON.stringify(report, null, 2));

// human summary
const p = (k, v) => console.log(k.padEnd(34) + v);
console.log('== ' + A.in);
p('duration / frames', `${report.duration_s} s / ${n}`);
p('integrated loudness', `${report.integrated_lufs} LUFS`);
p('sample peak / inter-sample peak', `${report.sample_peak_dbfs} dBFS / ${report.true_peak_dbtp_est} dBTP`);
p('body RMS (median of seconds)', `${report.body.median_rms_dbfs} dBFS (overall ${report.body.overall_rms_dbfs})`);
p('max 1-s RMS change in body', `${report.body.max_second_to_second_change_db} dB at ${maxBodyJumpAt}s`);
p(`jumps > ${JUMP_DB} dB`, A.speech ? `${jumps.length} (speech mix: pauses, not judged)` : jumps.length ? jumps.map((j) => `${j.at_s}s ${j.delta_db > 0 ? '+' : ''}${j.delta_db}${j.intended ? ' (intended)' : ' (UNINTENDED)'}`).join(', ') : 'none');
p('dropouts / silence runs', `${dropouts.length} / ${silenceRuns.length}`);
p('bands rel. total (dB)', Object.entries(bandDb).map(([k, v]) => `${k} ${v}`).join(' | '));
p('air - mid', `${report.air_minus_mid_db} dB`);
if (pocket) {
  p('octaves vs pink (dB)', pocket.octave_vs_pink_db.map((o) => `${o.hz}:${o.vs_pink_db}`).join(' '));
  p('voice pocket 1k/2k/4k vs pink', `${pocket.voice_pocket_1k_2k_4k_vs_pink_db} dB (low-mid 125-500: ${pocket.lowmid_125_250_500_vs_pink_db}, air 8k/16k: ${pocket.air_8k_16k_vs_pink_db}; pocket below low-mid by ${-pocket.pocket_below_lowmid_db})`);
}
if (marks.length) p('max 1-s change away from marks', `${report.body.max_change_away_from_marks_db} dB at ${maxAwayAt}s`);
if (landingsRep) {
  p('landings: max |onset error|', `${landingsRep.max_abs_onset_error_ms} ms over ${landingsRep.rows.length} (missing ${landingsRep.missing_onsets})`);
  for (const r of landingsRep.rows) p('  landing ' + r.requested_s + ' s (' + r.type + ')', `onset ${r.onset_error_ms} ms | 4-9k build +${r.build_hi_4_9k_rise_db} dB | low in build ${r.low_drop_in_build_db} dB | thump ${r.low_thump_over_build_db} dB over build`);
}
p('DC offset L/R', `${report.dc_offset.left_dbfs} / ${report.dc_offset.right_dbfs} dBFS`);
p('clipped samples', clipped);
p('max sample step', `${report.max_sample_step.value} (${report.max_sample_step.dbfs} dBFS) at ${report.max_sample_step.at_s}s`);
p('click detector max ratio', `${report.click_detector.max_ratio} at ${report.click_detector.at_s}s, flagged ${clicks.length}`);
p('last 1 s / last 100 ms RMS', `${report.ending.last_1s_rms_dbfs} / ${report.ending.last_100ms_rms_dbfs} dBFS`);
p('last sample (int16 L,R)', report.ending.last_sample_int16.join(', '));
p('stereo correlation', report.stereo_correlation);
