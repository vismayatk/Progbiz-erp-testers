'use strict';
/**
 * Checks the voice-changed parts of the Malayalam film against the guide voice they came from, sentence by sentence.
 *
 *   node scripts/video/combined/check_voice_parts.js <changed part> <changed part> ...      (any order, any format afconvert reads)
 *
 * For every file: which guide part it belongs to (by length and by the match of the loudness envelope), how much it is shifted,
 * level (loudness, peak, clipping), noise in the pauses between sentences, and for every sentence: how well its rhythm (loudness at
 * 10 ms) follows the guide's (a low value means different words, a garbled stretch or a changed rhythm), whether it starts or ends late, local timing drift, how much of the
 * sentence is voiced compared with the guide, and the pitch (median, how lively) compared with the guide.
 * Nothing here can judge how a voice SOUNDS; it finds what is measurably wrong. Writes reports/video/combined/voice_check.json.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readWav, integratedLoudness, SR } = require('../audio/lib.js');
const { envelope, corrAt, alignShift } = require('./voice_align.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUTD = path.join(ROOT, 'reports', 'video', 'combined');
const TMP = path.join(OUTD, 'build', 'check');
fs.mkdirSync(TMP, { recursive: true });
const files = process.argv.slice(2).filter(a => !a.startsWith('--')).map(f => path.resolve(f.replace(/^~/, process.env.HOME)));
if (!files.length) { console.error('give the changed audio files'); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(path.join(OUTD, 'voice_parts_ml', 'parts.json'), 'utf8'));
const sentences = JSON.parse(fs.readFileSync(path.join(OUTD, 'sentences_combo_ml.json'), 'utf8'));
const r1 = v => Math.round(v * 10) / 10;
const dbfs = v => 20 * Math.log10(Math.max(v, 1e-9));
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };

function load(f, tag) {
  const w = path.join(TMP, `${tag}.wav`);
  if (spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', f, w]).status !== 0) throw new Error(`afconvert could not read ${f}`);
  return readWav(w).chans[0];
}
/** RMS of 10 ms frames. */
function frames10(x) {
  const h = 480, n = Math.floor(x.length / h), o = new Float32Array(n);
  for (let i = 0; i < n; i++) { let a = 0; for (let j = i * h; j < (i + 1) * h; j++) a += x[j] * x[j]; o[i] = Math.sqrt(a / h); }
  return o;
}
/** Pitch track at 20 ms steps (8 kHz, normalised autocorrelation): Hz per frame, 0 = unvoiced. */
function f0(x) {
  const d = 6, m = Math.floor(x.length / d), y = new Float32Array(m);
  for (let i = 0; i < m; i++) { let a = 0; for (let j = 0; j < d; j++) a += x[i * d + j]; y[i] = a / d; }
  const N = 320, H = 160, out = [];
  for (let s = 0; s + N + 90 < m; s += H) {
    let e = 0; for (let i = 0; i < N; i++) e += y[s + i] * y[s + i];
    if (Math.sqrt(e / N) < 0.005) { out.push(0); continue; }
    let best = 0, bl = 0;
    for (let l = 20; l <= 80; l++) {
      let ab = 0, bb = 0;
      for (let i = 0; i < N; i++) { ab += y[s + i] * y[s + i + l]; bb += y[s + i + l] * y[s + i + l]; }
      const c = ab / Math.sqrt(e * bb + 1e-12);
      if (c > best) { best = c; bl = l; }
    }
    out.push(best > 0.55 ? 8000 / bl : 0);
  }
  return out;
}
const semis = hz => 12 * Math.log2(hz / 100);
function pitchStats(track) {
  const v = track.filter(h => h > 0);
  if (v.length < 10) return { med: NaN, sd: NaN, voiced: v.length };
  const med = median(v), ok = v.filter(h => Math.abs(semis(h) - semis(med)) < 12), s = ok.map(semis), mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { med: Math.round(median(ok)), sd: Math.sqrt(s.reduce((a, b) => a + (b - mean) * (b - mean), 0) / s.length), voiced: ok.length };
}

const report = { files: [] };
const used = new Set();
for (const f of files) {
  const tag = path.basename(f).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
  const ret = load(f, tag), dur = ret.length / SR;
  // which guide part
  let part = null, al = null;
  for (const m of manifest.slice().sort((a, b) => Math.abs((a.end_s - a.start_s) - dur) - Math.abs((b.end_s - b.start_s) - dur))) {
    if (used.has(m.n) || Math.abs((m.end_s - m.start_s) - dur) > 3) continue;
    const g = readWav(path.join(ROOT, m.file)).chans[0], a = alignShift(g, ret);
    if (a.corr > 0.6) { part = m; al = a; part.guide = g; break; }
  }
  if (!part) { console.log(`\n${path.basename(f)}: ${dur.toFixed(1)} s, no guide part with that length and rhythm`); report.files.push({ file: f, matched: false }); continue; }
  used.add(part.n);
  const guide = part.guide;
  const aligned = new Float32Array(guide.length);
  for (let k = 0; k < guide.length; k++) { const j = k + al.shift; if (j >= 0 && j < ret.length) aligned[k] = ret[j]; }
  const fg = frames10(guide), fr = frames10(aligned);
  const smooth = f => { const o = new Float32Array(f.length); for (let i = 0; i < f.length; i++) { let a = 0, c = 0; for (let k = -1; k <= 1; k++) if (f[i + k] != null) { a += f[i + k]; c++; } o[i] = Math.sqrt(a / c); } return o; };
  const sg = smooth(fg), sr_ = smooth(fr);
  const eg = envelope(guide), er = envelope(aligned);
  const peak = aligned.reduce((m, v) => Math.max(m, Math.abs(v)), 0), clipped = aligned.reduce((c, v) => c + (Math.abs(v) > 0.985 ? 1 : 0), 0);
  const lufs = integratedLoudness([aligned]);

  // sentence windows and pauses (part time)
  const win = sentences.filter(s => s.start_s >= part.start_s - 1e-6 && s.end_s <= part.end_s + 1e-6).map(s => ({ s, a: s.start_s - part.start_s, b: s.end_s - part.start_s }));
  const inWin = new Uint8Array(fr.length);
  for (const w of win) for (let i = Math.max(0, Math.floor((w.a - 0.15) * 100)); i < Math.min(fr.length, Math.ceil((w.b + 0.15) * 100)); i++) inWin[i] = 1;
  const gap = []; for (let i = 0; i < fr.length; i++) if (!inWin[i]) gap.push(dbfs(fr[i]));
  const gapRet = { median: r1(median(gap)), p95: r1(pct(gap, 0.95)) };
  const gapG = []; for (let i = 0; i < fg.length; i++) if (!inWin[i]) gapG.push(dbfs(fg[i]));

  const pg = f0(guide), pr = f0(aligned);
  const rows = win.map(w => {
    const i0 = Math.max(0, Math.round((w.a - 0.05) * 1000)), i1 = Math.min(eg.length, Math.round((w.b + 0.05) * 1000));
    const c = corrAt(eg, er, i0, i1, 0);
    let bc = -2, bl = 0; for (let l = -150; l <= 150; l += 2) { const v = corrAt(eg, er, i0, i1, l); if (v > bc) { bc = v; bl = l; } }
    const j0 = Math.max(0, Math.round(w.a * 100)), j1 = Math.min(fg.length, Math.round(w.b * 100));
    const thr = 10 ** (-45 / 20); let vg = 0, vr = 0, sum = 0, n = 0;
    for (let i = j0; i < j1; i++) { if (fg[i] > thr) vg++; if (fr[i] > thr) { vr++; sum += fr[i] * fr[i]; n++; } }
    const c10 = corrAt(sg, sr_, Math.max(0, j0 - 5), Math.min(sg.length, j1 + 5), 0);
    const edge = (f, a, b) => { let first = -1, last = -1; for (let i = Math.max(0, a - 30); i < Math.min(f.length, b + 30); i++) if (f[i] > thr) { if (first < 0) first = i; last = i; } return [first, last]; };
    const [g0, g1] = edge(fg, j0, j1), [r0, r1_] = edge(fr, j0, j1);
    const k0 = Math.round(w.a * 50), k1 = Math.round(w.b * 50);
    const ps = pitchStats(pr.slice(k0, k1)), pg2 = pitchStats(pg.slice(k0, k1));
    return { section: w.s.section, n: w.s.n, text: w.s.text, corr: +c10.toFixed(3), corr_1ms: +c.toFixed(3), start_diff_ms: (r0 - g0) * 10, end_diff_ms: (r1_ - g1) * 10, local_shift_ms: bl, voiced_ratio: vg ? +(vr / vg).toFixed(2) : NaN, level_dbfs: n ? r1(dbfs(Math.sqrt(sum / n))) : NaN, f0_hz: ps.med, guide_f0_hz: pg2.med, f0_sd_semitones: ps.sd, guide_f0_sd: pg2.sd };
  });
  const flagged = rows.filter(r => r.corr < 0.9 || Math.abs(r.local_shift_ms) > 60 || !(r.voiced_ratio > 0.8 && r.voiced_ratio < 1.2) || Math.abs(r.start_diff_ms) > 120 || Math.abs(r.end_diff_ms) > 120);
  const pS = pitchStats(pr), pGs = pitchStats(pg);
  // pitch contour follows the guide?
  let both = 0, sxy = 0, sxx = 0, syy = 0; const xs = [], ys = [];
  for (let i = 0; i < Math.min(pg.length, pr.length); i++) if (pg[i] > 0 && pr[i] > 0) { xs.push(semis(pg[i])); ys.push(semis(pr[i])); both++; }
  const mx = xs.reduce((a, b) => a + b, 0) / (both || 1), my = ys.reduce((a, b) => a + b, 0) / (both || 1);
  for (let i = 0; i < both; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const contour = both > 20 ? sxy / Math.sqrt(sxx * syy + 1e-12) : NaN;

  const res = { file: f, part: part.n, start_s: part.start_s, end_s: part.end_s, length_s: +dur.toFixed(3), shift_ms: al.ms, envelope_match: +al.corr.toFixed(3), lufs: r1(lufs), peak_dbfs: r1(dbfs(peak)), clipped_samples: clipped,
    pauses: { returned: gapRet, guide_median: r1(median(gapG)) }, pitch: { returned_hz: pS.med, returned_sd_semitones: +pS.sd.toFixed(2), guide_hz: pGs.med, guide_sd_semitones: +pGs.sd.toFixed(2), contour_follows_guide: +contour.toFixed(2) },
    sentences: rows.length, flagged: flagged.map(r => ({ section: r.section, n: r.n, corr: r.corr, local_shift_ms: r.local_shift_ms, voiced_ratio: r.voiced_ratio, start_diff_ms: r.start_diff_ms, end_diff_ms: r.end_diff_ms, text: r.text })),
    max_start_diff_ms: Math.max(...rows.map(r => Math.abs(r.start_diff_ms))), max_end_diff_ms: Math.max(...rows.map(r => Math.abs(r.end_diff_ms))),
    corr_median: +median(rows.map(r => r.corr)).toFixed(3), corr_min: +Math.min(...rows.map(r => r.corr)).toFixed(3), rows };
  report.files.push(res);
  console.log(`\n=== ${path.basename(f).slice(11, 30)}  ->  guide part ${part.n} (${part.start_s}-${part.end_s} s, ${part.sections[0].slice(0, 2)}-${part.sections[part.sections.length - 1].slice(0, 2)})`);
  console.log(`  length ${dur.toFixed(2)} s (guide ${(guide.length / SR).toFixed(2)} s), shifted ${al.ms >= 0 ? '+' : ''}${al.ms} ms, envelope match ${al.corr.toFixed(3)}`);
  console.log(`  level ${lufs.toFixed(1)} LUFS, peak ${r1(dbfs(peak))} dBFS, clipped samples ${clipped}`);
  console.log(`  pauses between sentences: median ${gapRet.median} dBFS, 95% ${gapRet.p95} dBFS (guide ${r1(median(gapG))})`);
  console.log(`  pitch: ${pS.med} Hz, liveliness ${pS.sd.toFixed(2)} semitones | guide ${pGs.med} Hz, ${pGs.sd.toFixed(2)} | contour follows the guide ${contour.toFixed(2)}`);
  console.log(`  sentences ${rows.length}: rhythm match (10 ms) median ${res.corr_median}, lowest ${res.corr_min}; start/end within ${res.max_start_diff_ms}/${res.max_end_diff_ms} ms of the guide; flagged ${flagged.length}`);
  for (const r of flagged) console.log(`    ${r.section} #${r.n}: match ${r.corr}, drift ${r.local_shift_ms} ms, voiced ${r.voiced_ratio}x guide, start ${r.start_diff_ms} / end ${r.end_diff_ms} ms  ${r.text.slice(0, 50)}`);
}
fs.writeFileSync(path.join(OUTD, 'voice_check.json'), JSON.stringify(report, null, 1));
