#!/usr/bin/env node
'use strict';
/**
 * make_sfx.js - subtle UI sound effects for the Progbiz video.
 *
 *   node scripts/video/audio/make_sfx.js --outdir <folder> [--seed 7]
 *
 * Writes 48 kHz / 16-bit / mono WAVs, each peak-normalised to -6 dBFS
 * (the mixer applies per-event gain), plus sfx_manifest.json with the
 * length and the time of the loudest point of each file (use it to align,
 * e.g. place riser.wav so that its peak lands on the visual moment).
 *
 *   whoosh.wav  0.55 s  band-passed tilted noise, centre 320 Hz -> 1.6 kHz -> 500 Hz,
 *                       smooth sin^2/cos^2 envelope (peak at 42 %), 4.5 kHz low-pass
 *   click.wav   0.05 s  soft UI tick: 3 ms band-passed noise transient (3.2 kHz)
 *                       + tiny pitched body (1.35->1.15 kHz) + low "thock" (420 Hz),
 *                       1.5 ms raised-cosine attack, 7 kHz low-pass
 *   notify.wav  0.55 s  two soft mallet notes A5 (880 Hz) then C#6 (1109 Hz)
 *                       120 ms later (rising major third, in D major like the music)
 *   pop.wav     0.12 s  bubble pop: sine gliding 300 -> 950 Hz in 45 ms, 22 ms decay
 *   riser.wav   1.5 s   airy swell: noise band-pass 350 Hz -> 3 kHz + quiet
 *                       D/A/D sine shimmer, peak at ~1.38 s, soft 120 ms release
 *
 * Tech-keynote set (added later; own PRNG stream, generated after the five above, so
 * the five files above are byte-identical to before):
 *   impact.wav  0.8 s   soft sub thump (sine 90 -> 46 Hz + 22 % 2nd harmonic, 4 ms attack, 0.2/0.38 s decays)
 *                       + airy 5.5 kHz band noise tail (-18 dB re thump, 0.26 s decay), 120 ms fade
 *   sweep.wav   1.2 s   rising band-passed noise swell 300 Hz -> 4.2 kHz (Q 1.2), 5.5 kHz low-pass, t^2 envelope,
 *                       ends with a tiny clean 6 ms cosine cut (a lead-in that stops on the beat)
 *   tick.wav    30 ms   very soft UI tick: 2.6 kHz + 1.3 kHz decaying sines, 1.2 ms attack,
 *                       5 ms fade, 6 kHz low-pass
 *   glass.wav   0.9 s   soft glassy two-note ping D6 then A6 (a fifth, 90 ms later),
 *                       partials 1 / 2.76 / 5.4 with fast decays, 6.5 kHz low-pass
 *   shimmer.wav 2.0 s   airy reversed shimmer: D5/A5/D6/E6 bells through a big reverb,
 *                       tail reversed (swells in, peak at ~1.97 s, 20 ms fade-out) + a
 *                       quiet rising noise band; for the intro
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const SR = L.SR, TAU = 2 * Math.PI;
const A = L.parseArgs(process.argv.slice(2));
if (!A.outdir || A.outdir === true) { console.error('Usage: node scripts/video/audio/make_sfx.js --outdir <folder> [--seed 7]'); process.exit(2); }
const OUTDIR = String(A.outdir);
const SEED = A.seed !== undefined ? Math.trunc(Number(A.seed)) : 7;
fs.mkdirSync(OUTDIR, { recursive: true });
const rnd = L.mulberry32((SEED >>> 0) * 7919 + 3);
const noise = () => rnd() * 2 - 1;
const rc = (k, n) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k / n)));
const PEAK = L.undb(-6);

function finish(name, y, extra = {}) {
  // de-DC, fade the very last 3 ms, peak-normalise to -6 dBFS
  let mean = 0; for (let i = 0; i < y.length; i++) mean += y[i]; mean /= y.length;
  for (let i = 0; i < y.length; i++) y[i] -= mean * rc(i, 96) * rc(y.length - 1 - i, 96);
  const nf = Math.round(0.003 * SR);
  for (let i = 0; i < nf; i++) y[y.length - 1 - i] *= rc(i, nf);
  y[y.length - 1] = 0; y[0] = 0;
  let pk = 0, at = 0; for (let i = 0; i < y.length; i++) if (Math.abs(y[i]) > pk) { pk = Math.abs(y[i]); at = i; }
  for (let i = 0; i < y.length; i++) y[i] *= PEAK / pk;
  // RMS-envelope peak (10 ms) is more useful for alignment than the sample peak
  let best = 0, bestAt = 0; const W = Math.round(0.01 * SR);
  for (let i = 0; i + W <= y.length; i += W / 2) { let s = 0; for (let k = i; k < i + W; k++) s += y[k] * y[k]; if (s > best) { best = s; bestAt = i + W / 2; } }
  const file = path.join(OUTDIR, name);
  L.writeWav16(file, [y], SR, 4242 + name.length);
  return { file: name, duration_s: L.r2(y.length / SR, 3), peak_dbfs: -6, loudest_10ms_at_s: L.r2(bestAt / SR, 3), sample_peak_at_s: L.r2(at / SR, 4), ...extra };
}

const manifest = [];

// ------------------------------------------------------------ whoosh
{
  const n = Math.round(0.55 * SR), y = new Float32Array(n);
  const f1 = new L.SVF(), f2 = new L.SVF();
  let pink = 0;
  for (let k = 0; k < n; k++) {
    const x = k / n, pk = 0.42;
    // centre: 350 -> 2400 Hz (exp) until the peak, then down to 600 Hz
    const fc = x < pk ? 320 * Math.pow(1600 / 320, Math.sin(0.5 * Math.PI * x / pk)) : 1600 * Math.pow(500 / 1600, (x - pk) / (1 - pk));
    if ((k & 15) === 0) { f1.set(fc, 1.0); f2.set(fc * 1.6, 1.6); }
    const env = x < pk ? Math.pow(Math.sin(0.5 * Math.PI * x / pk), 2) : Math.pow(Math.cos(0.5 * Math.PI * (x - pk) / (1 - pk)), 2);
    const w = noise(); pink += 0.25 * (w - pink); // softer (tilted) noise
    f1.tick(0.6 * w + pink); f2.tick(w);
    y[k] = (f1.band + 0.35 * f2.band) * env;
  }
  L.filterInPlace(y, L.biquad('lp', 4500, 0.707)); L.filterInPlace(y, L.biquad('hp', 120, 0.707));
  manifest.push(finish('whoosh.wav', y, { use: 'scene/card transitions; gain -10..-14 dB (-12 dB = about -27 LUFS momentary, just under the music-up level)' }));
}

// ------------------------------------------------------------ click
{
  const n = Math.round(0.05 * SR), y = new Float32Array(n);
  const bp = new L.SVF(); bp.set(3200, 0.9);
  const nA = Math.round(0.0015 * SR);
  let ph1 = 0, ph2 = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR, a = rc(k, nA);
    bp.tick(noise());
    const trans = bp.band * Math.exp(-t / 0.0012) * 0.9;
    const f = 1150 + 200 * Math.exp(-t / 0.006);
    ph1 += TAU * f / SR; ph2 += TAU * 420 / SR;
    const body = 0.6 * Math.sin(ph1) * Math.exp(-t / 0.009) + 0.35 * Math.sin(ph2) * Math.exp(-t / 0.012);
    y[k] = (trans + body) * a * rc(n - 1 - k, Math.round(0.005 * SR));
  }
  L.filterInPlace(y, L.biquad('lp', 7000, 0.707));
  manifest.push(finish('click.wav', y, { use: 'cursor clicks / button presses; gain -10..-14 dB (-12 dB = -18 dBFS peak, soft tick under the voice)' }));
}

// ------------------------------------------------------------ notify
function mallet(y, t0, f, amp) {
  const i0 = Math.round(t0 * SR), nA = Math.round(0.002 * SR);
  let ph = 0;
  for (let k = 0; i0 + k < y.length; k++) {
    const t = k / SR;
    ph += TAU * f / SR;
    const I = 0.5 * Math.exp(-t / 0.025);
    const s = Math.sin(ph + I * Math.sin(ph)) * Math.exp(-t / 0.16)
      + 0.08 * Math.sin(2 * ph) * Math.exp(-t / 0.08)
      + 0.1 * Math.sin(3.98 * ph) * Math.exp(-t / 0.03);
    y[i0 + k] += amp * s * rc(k, nA);
  }
}
{
  const n = Math.round(0.55 * SR), y = new Float32Array(n);
  mallet(y, 0, 880, 0.8);
  mallet(y, 0.12, 1108.73, 1.0);
  const nf = Math.round(0.03 * SR);
  for (let k = 0; k < nf; k++) y[n - 1 - k] *= rc(k, nf);
  L.filterInPlace(y, L.biquad('lp', 6000, 0.707));
  manifest.push(finish('notify.wav', y, { use: 'notification / success moments; gain -13..-17 dB (-15 dB = about -29 LUFS momentary)' }));
}

// ------------------------------------------------------------ pop
{
  const n = Math.round(0.12 * SR), y = new Float32Array(n);
  const nA = Math.round(0.002 * SR);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const f = 300 * Math.pow(950 / 300, Math.min(1, 1 - Math.exp(-t / 0.018)));
    ph += TAU * f / SR;
    const env = rc(k, nA) * Math.exp(-t / 0.022) * rc(n - 1 - k, Math.round(0.015 * SR));
    y[k] = (Math.sin(ph) + 0.15 * Math.sin(2 * ph)) * env;
  }
  L.filterInPlace(y, L.biquad('lp', 4000, 0.707));
  manifest.push(finish('pop.wav', y, { use: 'small cards / chips appearing; gain -12..-16 dB (-14 dB = -20 dBFS peak)' }));
}

// ------------------------------------------------------------ riser
{
  const n = Math.round(1.5 * SR), y = new Float32Array(n);
  const bp = new L.SVF();
  let body = 0;
  const tones = [587.33, 880, 1174.66].map((f, i) => ({ f, ph: rnd(), vib: 4.5 + i * 0.7, amp: [0.5, 0.35, 0.22][i] }));
  const peakX = 0.92, nRel = n * (1 - peakX);
  for (let k = 0; k < n; k++) {
    const x = k / n, t = k / SR;
    const fc = 350 * Math.pow(3000 / 350, Math.pow(Math.min(1, x / peakX), 1.2));
    if ((k & 15) === 0) bp.set(fc, 1.0);
    const w = noise();
    bp.tick(w);
    body += L.onePoleCoef(800) * (w - body);
    const env = x < peakX ? Math.pow(x / peakX, 2.2) : 0.5 + 0.5 * Math.cos(Math.PI * (k - peakX * n) / nRel);
    let tone = 0;
    for (const o of tones) { o.ph += o.f * (1 + 0.002 * Math.sin(TAU * o.vib * t)) / SR; tone += o.amp * Math.sin(TAU * o.ph); }
    y[k] = (bp.band + 0.6 * body + 0.12 * tone * Math.pow(Math.min(1, x / peakX), 1.5)) * env;
  }
  L.filterInPlace(y, L.biquad('lp', 6000, 0.707)); L.filterInPlace(y, L.biquad('hp', 150, 0.707));
  manifest.push(finish('riser.wav', y, { use: 'intro converging into the product window: start the file ~1.38 s before the moment; gain -11..-15 dB (-13 dB = about -27 LUFS momentary)' }));
}

// ============================================================ tech-keynote set (separate PRNG stream)
const rnd2 = L.mulberry32((SEED >>> 0) * 104729 + 17);
const noise2 = () => rnd2() * 2 - 1;

// ------------------------------------------------------------ impact
{
  const n = Math.round(0.8 * SR), thump = new Float32Array(n), air = new Float32Array(n);
  const nAtt = Math.round(0.004 * SR), nAir = Math.round(0.015 * SR);
  const bp = new L.SVF(); bp.set(5500, 0.8);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    ph += TAU * (46 + 44 * Math.exp(-t / 0.06)) / SR;
    thump[k] = (Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph)) * (0.7 * Math.exp(-t / 0.2) + 0.3 * Math.exp(-t / 0.38)) * rc(k, nAtt);
    bp.tick(noise2());
    air[k] = bp.band * rc(k, nAir) * Math.exp(-t / 0.26);
  }
  let pt = 0, pa = 0; for (let k = 0; k < n; k++) { pt = Math.max(pt, Math.abs(thump[k])); pa = Math.max(pa, Math.abs(air[k])); }
  const y = new Float32Array(n), ga = 0.125 * pt / (pa || 1);     // air peak = -18 dB re thump peak
  const nf = Math.round(0.12 * SR);
  for (let k = 0; k < n; k++) y[k] = (thump[k] + air[k] * ga) * (k > n - nf ? rc(n - 1 - k, nf) : 1);
  L.filterInPlace(y, L.biquad('lp', 9000, 0.707));
  manifest.push(finish('impact.wav', y, { use: 'landing on a scene cut / title; gain -12 dB (about -27 LUFS momentary; sub-heavy, check on small speakers)' }));
}

// ------------------------------------------------------------ sweep
{
  const n = Math.round(1.2 * SR), y = new Float32Array(n);
  const f1 = new L.SVF(), f2 = new L.SVF(); const nEnd = Math.round(0.006 * SR);
  for (let k = 0; k < n; k++) {
    const x = k / n;
    if ((k & 15) === 0) { const fc = 300 * Math.pow(4200 / 300, Math.pow(x, 1.5)); f1.set(fc, 1.2); f2.set(fc * 1.05, 1.2); }
    let env = Math.pow(x, 2.0); if (k > n - nEnd) env *= rc(n - 1 - k, nEnd);
    f1.tick(noise2()); f2.tick(noise2());
    y[k] = (f1.band + 0.5 * f2.band) * env;
  }
  L.filterInPlace(y, L.biquad('lp', 5500, 0.707)); L.filterInPlace(y, L.biquad('hp', 150, 0.707));
  manifest.push(finish('sweep.wav', y, { use: 'lead-in to a scene change; end the file exactly on the cut; gain -13 dB (about -28.5 LUFS momentary)' }));
}

// ------------------------------------------------------------ tick
{
  const n = Math.round(0.03 * SR), y = new Float32Array(n), nA = Math.round(0.0012 * SR), nf = Math.round(0.005 * SR);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    y[k] = (0.8 * Math.sin(TAU * 2600 * t) * Math.exp(-t / 0.004) + 0.4 * Math.sin(TAU * 1300 * t) * Math.exp(-t / 0.007)) * rc(k, nA) * (k > n - nf ? rc(n - 1 - k, nf) : 1);
  }
  L.filterInPlace(y, L.biquad('lp', 6000, 0.707));
  manifest.push(finish('tick.wav', y, { use: 'small on-screen text appearing; gain -14 dB (peak -20 dBFS, very soft)' }));
}

// ------------------------------------------------------------ glass
{
  const n = Math.round(0.9 * SR), y = new Float32Array(n);
  const ping = (t0, f, amp) => {
    const i0 = Math.round(t0 * SR), nA = Math.round(0.002 * SR);
    for (let k = 0; i0 + k < n; k++) {
      const t = k / SR, ph = TAU * f * t;
      y[i0 + k] += amp * (Math.sin(ph) * Math.exp(-t / 0.28) + 0.22 * Math.sin(2.756 * ph) * Math.exp(-t / 0.1) + 0.08 * Math.sin(5.404 * ph) * Math.exp(-t / 0.05)) * rc(k, nA);
    }
  };
  ping(0, 1174.66, 0.9); ping(0.09, 1760, 0.8);
  const nf = Math.round(0.06 * SR); for (let k = 0; k < nf; k++) y[n - 1 - k] *= rc(k, nf);
  L.filterInPlace(y, L.biquad('lp', 6500, 0.707));
  manifest.push(finish('glass.wav', y, { use: 'highlight / emphasis on a UI element; gain -15 dB (about -27 LUFS momentary)' }));
}

// ------------------------------------------------------------ shimmer (reversed reverb)
{
  const m = Math.round(2.0 * SR), n = m + Math.round(0.15 * SR);
  const sL = new Float32Array(n), sR = new Float32Array(n), oL = new Float32Array(n), oR = new Float32Array(n);
  [587.33, 880, 1174.66, 1318.51].forEach((f, i) => {
    const w = TAU * f / SR, i0 = Math.round(i * 0.02 * SR), nn = Math.round(0.3 * SR), pl = Math.cos((0.15 + i * 0.23) * Math.PI / 2), pr = Math.sin((0.15 + i * 0.23) * Math.PI / 2);
    for (let k = 0; k < nn; k++) {
      const t = k / SR;
      const v = (Math.sin(w * k + 0.9 * Math.exp(-t / 0.05) * Math.sin(2 * w * k)) + 0.15 * Math.sin(3 * w * k)) * Math.exp(-t / 0.12) * (k < 48 ? rc(k, 48) : 1);
      sL[i0 + k] += v * pl; sR[i0 + k] += v * pr;
    }
  });
  for (const ch of [sL, sR]) { L.filterInPlace(ch, L.biquad('hp', 250, 0.707)); L.filterInPlace(ch, L.biquad('lp', 5500, 0.707)); }
  L.freeverb(sL, sR, oL, oR, { room: 0.92, damp: 0.28, predelay: 0.03, gain: 0.04 });
  const y = new Float32Array(m), nIn = Math.round(0.6 * m), nOut = Math.round(0.02 * SR);
  for (let k = 0; k < m; k++) {
    let g = Math.pow(rc(k, nIn), 1.6); if (k > m - nOut) g *= rc(m - 1 - k, nOut);
    y[k] = 0.5 * (oL[m - 1 - k] + oR[m - 1 - k]) * g;
  }
  // quiet rising noise band under it (-16 dB re the reversed tail RMS)
  let er = 0; for (let k = 0; k < m; k++) er += y[k] * y[k];
  const bp = new L.SVF(), an = new Float32Array(m); let ea = 0;
  for (let k = 0; k < m; k++) {
    const x = k / m; if ((k & 15) === 0) bp.set(1500 * Math.pow(7000 / 1500, x), 1.0);
    bp.tick(noise2()); an[k] = bp.band * Math.pow(x, 2.0) * (k > m - nOut ? rc(m - 1 - k, nOut) : 1); ea += an[k] * an[k];
  }
  const gn = Math.sqrt(er / (ea || 1)) * L.undb(-16);
  for (let k = 0; k < m; k++) y[k] += an[k] * gn;
  L.filterInPlace(y, L.biquad('lp', 7000, 0.707));
  manifest.push(finish('shimmer.wav', y, { use: 'intro: place so the file ends on the moment it should land (loudest at ~1.84 s, faded out by 2.0 s); gain -14 dB (about -28 LUFS momentary)' }));
}

fs.writeFileSync(path.join(OUTDIR, 'sfx_manifest.json'), JSON.stringify({ tool: 'make_sfx.js', seed: SEED, sample_rate: SR, channels: 1, bit_depth: 16, files: manifest }, null, 2));
for (const m of manifest) console.error(`[make_sfx] ${m.file.padEnd(11)} ${m.duration_s}s  loudest at ${m.loudest_10ms_at_s}s`);
