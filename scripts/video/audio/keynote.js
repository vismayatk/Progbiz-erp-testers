'use strict';
/**
 * keynote.js - "tech keynote" style engine for make_music.js (--style keynote).
 * Not a CLI: run it through
 *   node scripts/video/audio/make_music.js --style keynote --dur S --out f.wav
 *        [--sections t1,t2,...] [--outro-at S] [--bpm 108] [--key D] [--seed 7]
 *
 * The default (warm) style lives untouched in make_music.js; this file only
 * runs when --style keynote is given, so the default output stays byte-identical.
 *
 * SOUND
 *   sub      soft sine sub-bass pulse on the chord root (46-82 Hz, tiny 2nd harmonic
 *            so laptops can hear it), gentle kick/impact-keyed pumping
 *   pad      glassy/airy: sine + 2 detuned polyBLEP saws + quiet octave-up sine,
 *            open 4-note voicings (root/5th at the bottom, sus2/sus4/add9/maj7/m7
 *            colours), TPT state-variable low-pass 0.85 -> 2.4 kHz that opens with
 *            the video's progress plus a slow (11 s) movement
 *   arp      tight 16th-note sequenced pulse, FM "glass" bell/pluck (modulator
 *            ratio 2, decaying index, inharmonic 4.01x sparkle), dotted-8th
 *            ping-pong delay (darkened repeats). Density grows with the video:
 *            8ths -> gapped 16ths -> full 16ths (+ quiet octave sparkle);
 *            low-pass 1.3 -> 4 kHz and level +4 dB open up with the progress
 *   kick     very soft sine kick: "lub-dub" heartbeat (level 2), soft quarter pulse (level 3)
 *   texture  tick-tock band-passed noise ticks (6.2 kHz / 4.7 kHz alternating on the
 *            off-beat 8ths, 3.5 ms attack, 6.5 kHz low-pass), quiet 16th shaker in the fullest level
 *   MID DIP  master peak filter -6 dB at 2.4 kHz, Q 0.6 (about -3 dB at 1.2 and 4.8 kHz)
 *            keeps the 1-4 kHz voice band free; the mixer ducks the bed a further 12 dB
 *
 * SECTIONS AND LANDINGS (the bed "breathes" with the edit)
 *   --sections gives the times where a new section must start. The musical grid is
 *   flexible: EACH SECTION IS STRETCHED LOCALLY TO A WHOLE NUMBER OF BEATS. For a
 *   section of T seconds, beats = round(T / nominal_beat) and the beat length is
 *   T / beats, so the section ends exactly on a beat and the next one starts exactly
 *   on the requested time (error < 0.01 ms = sample rounding). The tempo therefore
 *   moves by at most half a beat per section (about +-2 % for T > 14 s at 108 BPM).
 *   The remainder beats (beats mod 4) are absorbed by the LAST bar of the section
 *   (4..7 beats, one held dominant sus chord), so the rhythm never restarts oddly.
 *   Every section has its own progression, so a landing also changes the chord/voicing.
 *
 *   Build (last ~1.3 s before every landing):
 *     - noise sweep rising 250 Hz -> 6 kHz, ends with a tiny clean 8 ms cut
 *     - reversed-shimmer riser: the NEXT chord's bells through a big reverb, tail
 *       reversed, so the swell sucks into the coming harmony
 *     - the arp low-pass closes briefly then opens to 1.3x, ticks roll into 16ths
 *     - kick and sub drop out; pad + arp dip 5 dB in the last 0.2 s ("breath in")
 *   Landing (exactly on the requested time):
 *     - soft impact: sub thump (85 -> 46 Hz sine drop, 0.9 s) + "air release" noise
 *       burst (5-7 kHz band, 0.4 s decay) through the reverb, pad ducks under it
 *     - new progression/voicing (register +2 semitones), pad hi-cut opens 1.55x
 *       and relaxes over ~1 s, arp hi-cut opens 1.5x and relaxes over ~1.2 s
 *   --outro-at (NOT snapped): the last section builds into a final resolving Iadd9
 *   chord at exactly that time (softer impact, glass arpeggio, sub) which rings out
 *   and fades to digital silence exactly at --dur.
 */
const fs = require('fs');
const L = require('./lib');

const SR = L.SR;
const TAU = 2 * Math.PI;
const VERSION = '1.0.0';
const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const rc = (k, n) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k / n)));
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function panGains(p) { const a = (Math.max(-1, Math.min(1, p)) + 1) * Math.PI / 4; return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2]; }
function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// ------------------------------------------------------------------ harmony
const DEG = {
  I: { st: 0, opts: [['sus2', [0, 2, 7]], ['add9', [0, 4, 7, 14]], ['maj7', [0, 4, 7, 11]], ['sus2', [0, 2, 7]]] },
  II: { st: 2, opts: [['', [0, 4, 7]], ['add9', [0, 4, 7, 14]]] },        // Lydian II
  IV: { st: 5, opts: [['maj7', [0, 4, 7, 11]], ['sus2', [0, 2, 7]], ['add9', [0, 4, 7, 14]]] },
  V: { st: 7, opts: [['sus4', [0, 5, 7]], ['sus2', [0, 2, 7]], ['', [0, 4, 7]]] },
  vi: { st: 9, opts: [['m7', [0, 3, 7, 10]], ['m(add9)', [0, 3, 7, 14]], ['m(add11)', [0, 3, 5, 7]], ['m7', [0, 3, 7, 10]]] },
  bVII: { st: 10, opts: [['add9', [0, 4, 7, 14]], ['', [0, 4, 7]]] },
};
const PROGS = {
  A: ['vi', 'IV', 'I', 'V'],      // minor-tinged, optimistic
  B: ['I', 'II', 'vi', 'IV'],     // Lydian brightness
  C: ['I', 'V', 'IV', 'V'],       // airy sus
  D: ['IV', 'I', 'V', 'vi'],
  E: ['I', 'bVII', 'IV', 'I'],    // mixolydian lift
};
const PROG_ORDER = ['A', 'B', 'D', 'A', 'E', 'B', 'C', 'D'];
const PAD_LO = 47, PAD_HI = 79;

function makeChord(keyPc, deg, opt) {
  const d = DEG[deg];
  const root = (keyPc + d.st) % 12;
  const [suf, iv] = opt;
  const pcs = [...new Set(iv.map((x) => (root + x) % 12))];
  return { deg, root, pcs, name: NOTE[root] + suf, suffix: suf };
}
function voicingCandidates(pcs) {
  const notes = [];
  for (let m = PAD_LO; m <= PAD_HI; m++) if (pcs.includes(m % 12)) notes.push(m);
  const out = []; const nn = notes.length;
  for (let a = 0; a < nn; a++) for (let b = a + 1; b < nn; b++) for (let c = b + 1; c < nn; c++) for (let d = c + 1; d < nn; d++) {
    const v = [notes[a], notes[b], notes[c], notes[d]];
    if (new Set(v.map((m) => m % 12)).size < Math.min(3, pcs.length)) continue;
    const span = v[3] - v[0];
    if (span < 12 || span > 26) continue;
    if (v[1] - v[0] < 5) continue;                       // open bottom
    let ok = true;
    for (let i = 1; i < 4 && ok; i++) { const iv = v[i] - v[i - 1]; if (iv < 2 || (v[i - 1] < 60 && iv < 4)) ok = false; }
    for (let i = 0; i < 4 && ok; i++) for (let j = i + 1; j < 4; j++) { const iv = v[j] - v[i]; if (iv === 1 || iv === 13 || iv === 25) { ok = false; break; } }
    if (ok) out.push(v);
  }
  return out;
}
function pickVoicing(ch, prev, centre, rnd) {
  const cands = voicingCandidates(ch.pcs);
  let best = null, bs = Infinity;
  for (const v of cands) {
    let s = 0;
    if (prev) for (let i = 0; i < 4; i++) s += Math.abs(v[i] - prev[i]);
    s += 0.8 * Math.abs((v[0] + v[1] + v[2] + v[3]) / 4 - centre);
    const bp = v[0] % 12;
    if (bp !== ch.root && bp !== (ch.root + 7) % 12) s += 2.5;   // root or fifth at the bottom
    s += rnd() * 2.5;
    if (s < bs) { bs = s; best = v; }
  }
  if (!best) { const r = 48 + ((ch.root - 48 % 12 + 12) % 12); best = [r, r + 7, r + 12, r + 16]; }
  return best;
}
const subMidi = (pc) => 30 + (((pc - 6) % 12) + 12) % 12;      // 30..41 (46-82 Hz)
function arpPool(ch, lo, n = 6) {
  const out = [];
  for (let m = lo; m <= lo + 30 && out.length < n; m++) if (ch.pcs.includes(m % 12)) out.push(m);
  return out;
}

const PATS = [
  [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 2, 0, 1, 2],
  [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 2, 1, 3, 5, 3],
  [0, 3, 1, 4, 2, 5, 3, 4, 1, 3, 0, 2, 4, 2, 3, 1],
];
const MASK2 = [1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1];

function run(ctx) {
  const { A, DUR, OUT, KEY, keyPc, SEED, RMS_DB, PEAK_DB, log, die } = ctx;
  const BPM = A.bpm !== undefined ? Number(A.bpm) : 108;
  if (!(BPM >= 60 && BPM <= 160)) die('--bpm must be 60..160');
  const N = Math.round(DUR * SR);
  const beat = 60 / BPM;
  const base = (SEED >>> 0) * 1000003 + 424243;
  const rArr = L.mulberry32(base + 11), rHum = L.mulberry32(base + 23), rNoise = L.mulberry32(base + 37), rPh = L.mulberry32(base + 51);
  const t0clock = Date.now();
  const warnings = [];

  // ---------------------------------------------------------------- outro + sections
  const outroDefault = DUR - Math.min(8, Math.max(3, DUR * 0.12));
  const outroReq = A['outro-at'] !== undefined ? Number(A['outro-at']) : outroDefault;
  if (!Number.isFinite(outroReq)) die('--outro-at must be a number');
  const outroT = Math.min(Math.max(outroReq, 8), DUR - 1.5);
  if (outroT !== outroReq) warnings.push(`--outro-at ${outroReq} clamped to ${outroT}`);

  let secRaw = null;
  if (A.sections !== undefined && A.sections !== true) secRaw = String(A.sections);
  else if (A.lift !== undefined && A.lift !== true) { secRaw = String(A.lift); warnings.push('--lift used as an alias of --sections in keynote style'); }
  let secReq;
  if (secRaw !== null && secRaw.trim() !== '') secReq = secRaw.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
  else { secReq = []; for (let t = 32 * beat; t < outroT - 8; t += 32 * beat) secReq.push(t); }   // every 8 bars
  secReq.sort((x, y) => x - y);
  const starts = [0];
  for (const t of secReq) {
    if (t < 3) warnings.push(`section at ${t}s ignored (< 3 s)`);
    else if (t > outroT - 4) warnings.push(`section at ${t}s ignored (needs >= 4 s before the outro at ${outroT}s)`);
    else if (t - starts[starts.length - 1] < 4) warnings.push(`section at ${t}s ignored (< 4 s after the previous one)`);
    else starts.push(t);
  }
  const K = starts.length;
  const BUILD = 1.3;   // seconds of build before each landing

  const sections = starts.map((t0, k) => {
    const t1 = k + 1 < K ? starts[k + 1] : outroT;
    const T = t1 - t0;
    const beats = Math.max(4, Math.round(T / beat));
    const beatSec = T / beats;
    const nb = Math.max(1, Math.floor(beats / 4));
    const f = t0 / outroT;
    let level = Math.round(1 + 2.4 * Math.min(1, f / 0.4)) - (k % 4 === 3 ? 1 : 0);
    level = Math.min(3, Math.max(1, level));
    if (k === K - 1 && K > 2) level = Math.max(1, level - 1);
    return { k, t0, t1, T, beats, beatSec, nb, level, build: Math.min(BUILD, 0.4 * T),
      bpmEff: 60 / beatSec, stretchPct: (beatSec / beat - 1) * 100, prog: PROG_ORDER[k % PROG_ORDER.length], bars: [] };
  });
  const landT = sections.slice(1).map((s) => s.t0).concat([outroT]);   // landings incl. the final chord

  // ---------------------------------------------------------------- chords and voicings
  let prevV = null;
  for (const S of sections) {
    const prog = PROGS[S.prog];
    for (let i = 0; i < S.nb; i++) {
      const last = i === S.nb - 1;
      const deg = last ? 'V' : prog[i % 4];
      let opts = DEG[deg].opts;
      if (last) opts = opts.slice(0, 2);   // sus4 / sus2 only: keeps the dominant unresolved
      const opt = opts[Math.floor(rArr() * opts.length)];
      const ch = makeChord(keyPc, deg, opt);
      const p = (S.t0 + i * 4 * S.beatSec) / outroT;
      const centre = 55 + 8 * Math.min(1, p) + (S.k % 2 ? 1.5 : 0) + (i === 0 && S.k > 0 ? 2 : 0) + rArr() * 1.5;
      const voicing = pickVoicing(ch, prevV, centre, rArr);
      prevV = voicing;
      S.bars.push({ i, startBeat: 4 * i, len: last ? S.beats - 4 * (S.nb - 1) : 4, ch, voicing });
    }
  }
  const finalCh = makeChord(keyPc, 'I', ['add9', [0, 4, 7, 14]]);
  const finalV = pickVoicing(finalCh, prevV, 60, rArr);

  // ---------------------------------------------------------------- control curves
  const CR = 32, nC = Math.ceil(N / CR) + 2;
  const landing = (t) => { let tp = -1e9, tn = 1e9; for (const x of landT) { if (x <= t) tp = x; else { tn = x; break; } } return [tp, tn]; };
  const padCut = new Float32Array(nC), arpCut = new Float32Array(nC), dip = new Float32Array(nC).fill(1);
  {
    let cp = 0, ca = 0;
    const a = 1 - Math.exp(-CR / (0.02 * SR));
    for (let c = 0; c < nC; c++) {
      const t = c * CR / SR, pr = Math.min(1, t / outroT);
      const [tp, tn] = landing(t);
      let fp = (850 + 1550 * smooth(pr / 0.75)) * (1 + 0.16 * Math.sin(TAU * t / 11.3 + 0.7));
      fp *= 1 + 0.55 * Math.exp(-Math.max(0, t - tp) / 0.9) * (tp > 0 ? 1 : 0);
      let fa = (1300 + 2700 * smooth(pr / 0.8));
      fa *= 1 + 0.5 * Math.exp(-Math.max(0, t - tp) / 1.2) * (tp > 0 ? 1 : 0);
      const dtn = tn - t;
      if (dtn < BUILD && tn < 1e8) {
        const u = 1 - dtn / BUILD, cf = 0.18;
        fa *= u < cf ? 1 - 0.6 * (0.5 - 0.5 * Math.cos(Math.PI * u / cf)) : 0.4 + 0.9 * Math.pow((u - cf) / (1 - cf), 1.6);
      }
      if (c === 0) { cp = Math.log(fp); ca = Math.log(fa); } else { cp += a * (Math.log(fp) - cp); ca += a * (Math.log(fa) - ca); }
      padCut[c] = Math.exp(cp); arpCut[c] = Math.exp(ca);
    }
    // pre-landing "breath in": -5 dB (0.56) from 0.2 s before to the landing, out again over 60 ms
    for (const tl of landT) {
      const c0 = Math.floor((tl - 0.25) * SR / CR), c1 = Math.ceil((tl + 0.07) * SR / CR);
      for (let c = Math.max(0, c0); c < Math.min(nC, c1); c++) {
        const dt = c * CR / SR - tl;
        let w = 0;
        if (dt >= -0.2 && dt < -0.09) w = 0.5 - 0.5 * Math.cos(Math.PI * (dt + 0.2) / 0.11);
        else if (dt >= -0.09 && dt < 0) w = 1;
        else if (dt >= 0 && dt < 0.06) w = 0.5 + 0.5 * Math.cos(Math.PI * dt / 0.06);
        dip[c] = Math.min(dip[c], 1 - 0.44 * w);
      }
    }
  }
  const at = (arr, i) => { const c = i / CR, c0 = Math.floor(c), f = c - c0; return arr[c0] + (arr[c0 + 1] - arr[c0]) * f; };
  const arpGainAt = (t) => { const pr = Math.min(1, t / outroT); return 0.63 + 0.37 * smooth(pr / 0.8); };

  // ---------------------------------------------------------------- event scheduling
  const ev = { pad: [], arp: [], sub: [], kick: [], tick: [], shaker: [], sweep: [], shimmer: [], impact: [] };
  const act = { pad: [], arp: [], sub: [], kick: [], tick: [], shaker: [], sweep: [], shimmer: [], thump: [], air: [] };
  const win = (arr, a, b) => { const x = Math.round(a * SR), y = Math.min(N, Math.round(b * SR)); if (y > x) arr.push([Math.max(0, x), y]); };
  const stopT = outroT - 0.01;
  const lvl0 = (t, S) => (t < 4.5 ? 0 : t < 9 ? 0.5 : t < 15 ? 1 : (S.T >= 20 ? 2 : 1));
  const barInfo = [];
  for (const S of sections) {
    const tl = S.t1, bStart = tl - S.build;
    for (const B of S.bars) {
      const tb = S.t0 + B.startBeat * S.beatSec, lenSec = B.len * S.beatSec, tEnd = tb + lenSec;
      let lvl = S.k === 0 ? lvl0(tb, S) : S.level;
      const breath = S.nb >= 9 && B.i % 8 === 7 && B.i < S.nb - 1;
      if (breath && lvl > 1) lvl = 1;
      const firstAfterLanding = B.i === 0 && S.k > 0;
      // pad
      B.voicing.forEach((m, i) => ev.pad.push({ midi: m, t0: tb, t1: tEnd, amp: 0.09 * (i === 0 ? 0.85 : 1), pan: [-0.4, 0.15, -0.15, 0.4][i],
        attack: S.k === 0 && B.i === 0 ? 2.4 : firstAfterLanding ? 0.3 : 0.6, release: 1.4 }));
      win(act.pad, tb, tEnd);
      // sub pulse (softer on the landing bar: the impact carries the weight)
      if (lvl >= 0.5) {
        const hits = [[0, 1.5, firstAfterLanding ? 0.5 : 1.0], [2.5, 0.9, 0.65]];
        for (const [bt, lb, vel] of hits) {
          if (bt >= B.len) continue;
          const t = tb + bt * S.beatSec; let len = lb * S.beatSec;
          len = Math.min(len, tl - 0.09 - 0.07 - t);       // clear space before the landing
          if (len < 0.06 || t >= stopT) continue;
          ev.sub.push({ t, len, midi: subMidi(B.ch.root), vel });
          win(act.sub, t, t + len + 0.07);
        }
      }
      // kick: heartbeat (level 2) / soft quarters (level 3); none in the build, none on the landing beat
      if (lvl >= 2) {
        const pat = lvl >= 3 ? [[0, 1], [1, 0.55], [2, 0.85], [3, 0.55]] : [[0, 1], [0.75, 0.55], [2, 0.8], [2.75, 0.45]];
        for (const [bt, vel] of pat) {
          if (bt >= B.len) continue;
          const t = tb + bt * S.beatSec;
          if (t >= bStart - 0.02 || t >= stopT) continue;
          if (firstAfterLanding && bt === 0) continue;
          ev.kick.push({ t, vel }); win(act.kick, t, t + 0.3);
        }
      }
      // tick-tock texture (off-beat 8ths); rolls into 16ths in the build
      if (lvl >= 0.5) {
        const n8 = B.len * 2;
        for (let e = 0; e < n8; e++) {
          const t = tb + e * S.beatSec / 2;
          if (t >= stopT || t > tl - 0.06) continue;
          if (t >= bStart) continue;                              // handled by the roll below
          if (e % 2 === 1) { ev.tick.push({ t, tock: e % 4 === 3, vel: (0.55 + 0.4 * rHum()) }); win(act.tick, t, t + 0.05); }
        }
        if (lvl >= 3) for (let s = 0; s < B.len * 4; s++) {
          const t = tb + s * S.beatSec / 4;
          if (t >= bStart || t >= stopT) continue;
          ev.shaker.push({ t, vel: (s % 2 ? 0.8 : 0.45) * (0.8 + rHum() * 0.35) }); win(act.shaker, t, t + 0.09);
        }
      }
      // arp
      if (lvl >= 1) {
        const pool = arpPool(B.ch, 57, 6);
        const pat = PATS[(S.k + Math.floor(B.i / 2)) % PATS.length];
        const nSteps = B.len * 4;
        for (let s = 0; s < nSteps; s++) {
          const t = tb + s * S.beatSec / 4;
          if (t >= stopT || t > tl - 0.05) continue;
          const inBuild = t >= bStart;
          let on;
          if (inBuild && lvl >= 2) on = 1;
          else if (lvl >= 3 && !breath) on = 1;
          else if (lvl >= 2 && !breath) on = MASK2[s % 16];
          else on = (s % 2 === 0) ? 1 : 0;
          if (!on) continue;
          const acc = (s % 4 === 0) ? 1 : 0.62;
          const vel = acc * arpGainAt(t) * (inBuild ? 1 + 0.25 * (t - bStart) / S.build : 1) * (0.94 + rHum() * 0.12);
          const m = pool[pat[s % 16] % pool.length];
          ev.arp.push({ t, midi: m, vel, pan: (s % 2 ? 0.22 : -0.22), bright: 0.85 });
          if (lvl >= 3 && [0, 6, 10].includes(s % 16) && !inBuild) ev.arp.push({ t: t + 0.001, midi: m + 12, vel: vel * 0.28, pan: -0.35, bright: 0.6 });
        }
        win(act.arp, tb, tEnd);
      }
      barInfo.push({ k: S.k, i: B.i, tb, lvl, breath });
    }
  }
  // builds + landings
  const landings = [];
  const nextVoicing = (k) => (k + 1 < K ? sections[k + 1].bars[0].voicing : finalV);
  sections.forEach((S, k) => {
    const tl = S.t1, final = k === K - 1;
    const p = Math.min(1, tl / outroT);
    ev.sweep.push({ t0: tl - S.build, t1: tl - 0.004 }); win(act.sweep, tl - S.build, tl);
    ev.shimmer.push({ tEnd: tl - 0.006, dur: S.build + 0.15, notes: nextVoicing(k).map((m) => m + 12) }); win(act.shimmer, tl - S.build, tl);
    // 16th tick roll in the last beat-ish of the build
    const nr = Math.round(S.build / (S.beatSec / 4));
    for (let r = 0; r < nr; r++) {
      const t = tl - 0.06 - (nr - 1 - r) * S.beatSec / 4;
      if (t < tl - S.build) continue;
      ev.tick.push({ t, tock: r % 2 === 1, vel: 0.35 + 0.65 * (r / Math.max(1, nr - 1)) }); win(act.tick, t, t + 0.05);
    }
    ev.impact.push({ t: tl, vel: final ? 0.8 : 0.75 + 0.35 * p, final });
    win(act.thump, tl, tl + 0.6); win(act.air, tl, tl + 0.9);
    landings.push({ requested_s: final ? outroReq : tl, t: tl, type: final ? 'final' : 'impact', chord: final ? finalCh.name : sections[k + 1].bars[0].ch.name });
  });
  // final chord
  finalV.forEach((m, i) => ev.pad.push({ midi: m, t0: outroT, t1: DUR + 10, amp: 0.09 * (i === 0 ? 0.85 : 1), pan: [-0.4, 0.15, -0.15, 0.4][i], attack: 0.25, release: 0.1 }));
  arpPool(finalCh, 64, 5).forEach((m, i) => ev.arp.push({ t: outroT + 0.04 + i * 0.09, midi: m, vel: 0.62 - i * 0.05, pan: -0.35 + i * 0.18, bright: 0.65, tau: 1.5, len: DUR - outroT - 0.2 }));
  ev.sub.push({ t: outroT, len: DUR - outroT, midi: subMidi(finalCh.root), vel: 0.8, decay: 1.8 });

  // ---------------------------------------------------------------- synthesis
  const pumpCurve = new Float32Array(nC).fill(1);
  const addPump = (t, depth, tau, len) => {
    const c0 = Math.floor(t * SR / CR);
    for (let c = c0; c < Math.min(nC, c0 + Math.round(len * SR / CR)); c++) {
      const dt = (c * CR) / SR - t;
      const shape = dt < 0 ? 0 : dt < 0.01 ? dt / 0.01 : Math.exp(-(dt - 0.01) / tau);
      const g = 1 - depth * shape; if (g < pumpCurve[c]) pumpCurve[c] = g;
    }
  };
  for (const k of ev.kick) addPump(k.t, 0.16 * k.vel, 0.12, 0.45);
  for (const im of ev.impact) addPump(im.t, 0.3 * im.vel, 0.35, 1.6);

  function padNote(Lb, Rb, e) {
    const f = mtof(e.midi);
    const i0 = Math.max(0, Math.round(e.t0 * SR)), iOff = Math.min(N, Math.round(e.t1 * SR));
    const nRel = Math.max(96, Math.round(e.release * SR)), i1 = Math.min(N, iOff + nRel);
    const nAtt = Math.max(96, Math.round(e.attack * SR));
    const d0 = f / SR, d1 = f * Math.pow(2, 7 / 1200) / SR, d2 = f * Math.pow(2, -8 / 1200) / SR, d3 = 2 * f / SR;
    const [c0l, c0r] = panGains(e.pan), [c1l, c1r] = panGains(e.pan - 0.4), [c2l, c2r] = panGains(e.pan + 0.4), [c3l, c3r] = panGains(-e.pan);
    const a0 = 1.0 * e.amp, a1 = 0.2 * e.amp, a2 = 0.2 * e.amp, a3 = 0.13 * e.amp;
    const lfoW = TAU * (0.05 + rPh() * 0.07) / SR, lfoPh = rPh() * TAU;
    let p0 = rPh(), p1 = rPh(), p2 = rPh(), p3 = rPh();
    for (let i = i0; i < i1; i++) {
      const k = i - i0;
      let env = k < nAtt ? rc(k, nAtt) : 1;
      if (i >= iOff) env *= 0.5 + 0.5 * Math.cos(Math.PI * (i - iOff) / nRel);
      const g = env * (1 + 0.1 * Math.sin(lfoPh + lfoW * k));
      const s0 = Math.sin(TAU * p0) * a0;
      const s1 = (2 * p1 - 1 - polyblep(p1, d1)) * a1;
      const s2 = (2 * p2 - 1 - polyblep(p2, d2)) * a2;
      const s3 = Math.sin(TAU * p3) * a3 * (0.6 + 0.4 * Math.sin(lfoPh * 1.7 + lfoW * 2.3 * k));
      Lb[i] += g * (c0l * s0 + c1l * s1 + c2l * s2 + c3l * s3);
      Rb[i] += g * (c0r * s0 + c1r * s1 + c2r * s2 + c3r * s3);
      p0 += d0; if (p0 >= 1) p0 -= 1; p1 += d1; if (p1 >= 1) p1 -= 1; p2 += d2; if (p2 >= 1) p2 -= 1; p3 += d3; if (p3 >= 1) p3 -= 1;
    }
  }
  function arpNote(Lb, Rb, e) {
    const f = mtof(e.midi);
    const i0 = Math.round(e.t * SR); if (i0 >= N || i0 < 0) return;
    const tau = e.tau || 0.16 * Math.pow(523.25 / f, 0.25);
    const len = e.len || Math.min(0.9, tau * 5.5);
    const n = Math.min(N - i0, Math.round(len * SR));
    const nAtt = Math.round(0.002 * SR), nFade = Math.max(96, Math.round(Math.min(0.08, len * 0.3) * SR));
    const w = TAU * f / SR;
    const dE = Math.exp(-1 / (tau * SR)), dI = Math.exp(-1 / (0.06 * SR)), dG = Math.exp(-1 / (0.03 * SR));
    let env = 1, I = 1.1 * e.bright * (0.6 + 0.4 * Math.min(1, e.vel)), gl = 0.12 * e.bright;
    const I0 = 0.28 * e.bright;
    const [gL, gR] = panGains(e.pan); const amp = 0.12 * e.vel;
    for (let k = 0; k < n; k++) {
      const ph = w * k;
      let g = env * amp;
      if (k < nAtt) g *= rc(k, nAtt);
      if (k > n - nFade) g *= rc(n - k, nFade);
      const y = (Math.sin(ph + (I + I0) * Math.sin(2 * ph)) + gl * Math.sin(4.01 * ph)) * g;
      Lb[i0 + k] += y * gL; Rb[i0 + k] += y * gR;
      env *= dE; I *= dI; gl *= dG;
    }
  }
  function subNote(M, e) {
    const f = mtof(e.midi);
    const i0 = Math.round(e.t * SR); if (i0 >= N) return;
    const nOn = Math.round(e.len * SR), nRel = Math.round(0.07 * SR);
    const n = Math.min(N - i0, nOn + nRel), nAtt = Math.round(0.01 * SR);
    const w = TAU * f / SR, dD = Math.exp(-1 / ((e.decay || 0.3) * SR)), sus = e.decay ? 0 : 0.75;
    let dec = 1; const amp = 0.2 * e.vel;
    for (let k = 0; k < n; k++) {
      const ph = w * k;
      let g = (sus + (1 - sus) * dec) * amp;
      if (k < nAtt) g *= rc(k, nAtt);
      if (k >= nOn) g *= 0.5 + 0.5 * Math.cos(Math.PI * (k - nOn) / nRel);
      M[i0 + k] += (Math.sin(ph) + 0.18 * Math.sin(2 * ph) + 0.04 * Math.sin(3 * ph)) * g;
      dec *= dD;
    }
  }
  function kickHit(Lb, Rb, t, vel) {
    const i0 = Math.round(t * SR); if (i0 >= N) return;
    const n = Math.min(N - i0, Math.round(0.34 * SR)), nAtt = Math.round(0.003 * SR), nFade = Math.round(0.04 * SR);
    let ph = 0; const dP = Math.exp(-1 / (0.03 * SR)), dE = Math.exp(-1 / (0.12 * SR)); let sw = 1, env = 1;
    const amp = 0.5 * vel;
    for (let k = 0; k < n; k++) {
      let g = env * amp; if (k < nAtt) g *= rc(k, nAtt); if (k > n - nFade) g *= rc(n - k, nFade);
      const y = Math.sin(ph) * g; Lb[i0 + k] += y; Rb[i0 + k] += y;
      ph += TAU * (42 + 58 * sw) / SR; sw *= dP; env *= dE;
    }
  }
  function thumpHit(Lb, Rb, t, vel) {
    const i0 = Math.round(t * SR); if (i0 >= N) return;
    const n = Math.min(N - i0, Math.round(0.95 * SR)), nAtt = Math.round(0.004 * SR), nFade = Math.round(0.12 * SR);
    let ph = 0; const dP = Math.exp(-1 / (0.06 * SR)), dE = Math.exp(-1 / (0.22 * SR)), dE2 = Math.exp(-1 / (0.4 * SR));
    let sw = 1, e1 = 1, e2 = 1; const amp = 0.5 * vel;
    for (let k = 0; k < n; k++) {
      let g = (0.7 * e1 + 0.3 * e2) * amp; if (k < nAtt) g *= rc(k, nAtt); if (k > n - nFade) g *= rc(n - k, nFade);
      const y = (Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph)) * g; Lb[i0 + k] += y; Rb[i0 + k] += y;
      ph += TAU * (46 + 39 * sw) / SR; sw *= dP; e1 *= dE; e2 *= dE2;
    }
  }
  function airBurst(Lb, Rb, t, vel) {
    const i0 = Math.round(t * SR); if (i0 >= N) return;
    const n = Math.min(N - i0, Math.round(1.5 * SR)), nAtt = Math.round(0.015 * SR), nFade = Math.round(0.2 * SR);
    const fl = new L.SVF(), fr = new L.SVF(); fl.set(5200, 0.8); fr.set(6800, 0.8);
    const dE = Math.exp(-1 / (0.4 * SR)); let env = 1;
    for (let k = 0; k < n; k++) {
      let g = env * vel; if (k < nAtt) g *= rc(k, nAtt); if (k > n - nFade) g *= rc(n - k, nFade);
      fl.tick(rNoise() * 2 - 1); fr.tick(rNoise() * 2 - 1);
      Lb[i0 + k] += fl.band * g; Rb[i0 + k] += fr.band * g; env *= dE;
    }
  }
  function noiseHit(f0, q, len, att, tau, lpHz, seedOff) {
    const rn = L.mulberry32(base + 3000 + seedOff);
    const n = Math.round(len * SR), y = new Float32Array(n), f = new L.SVF(); f.set(f0, q);
    const nA = Math.max(24, Math.round(att * SR)), nF = Math.round(0.008 * SR);
    for (let k = 0; k < n; k++) {
      let env = (k < nA ? rc(k, nA) : 1) * Math.exp(-(k / SR) / tau);
      if (k > n - nF) env *= rc(n - k, nF);
      f.tick(rn() * 2 - 1); y[k] = f.band * env;
    }
    L.filterInPlace(y, L.biquad('lp', lpHz, 0.707));
    let pk = 0; for (let k = 0; k < n; k++) pk = Math.max(pk, Math.abs(y[k]));
    for (let k = 0; k < n; k++) y[k] /= pk || 1;
    return y;
  }
  function place(Lb, Rb, smp, t, gain, pan) {
    const i0 = Math.round(t * SR); if (i0 >= N || i0 < 0) return;
    const [gL, gR] = panGains(pan); const n = Math.min(smp.length, N - i0);
    for (let k = 0; k < n; k++) { const y = smp[k] * gain; Lb[i0 + k] += y * gL; Rb[i0 + k] += y * gR; }
  }
  function sweepEvent(Lb, Rb, t0, t1) {
    const i0 = Math.max(0, Math.round(t0 * SR)), i1 = Math.min(N, Math.round(t1 * SR)), n = i1 - i0; if (n <= 0) return;
    const fl = new L.SVF(), fr = new L.SVF(), nEnd = Math.round(0.008 * SR);
    for (let k = 0; k < n; k++) {
      const x = k / n;
      if ((k & 31) === 0) { const fc = 250 * Math.pow(6000 / 250, Math.pow(x, 1.4)); fl.set(fc, 1.3); fr.set(fc * 1.04, 1.3); }
      let env = Math.pow(x, 2.1); if (k > n - nEnd) env *= rc(n - k, nEnd);
      fl.tick(rNoise() * 2 - 1); fr.tick(rNoise() * 2 - 1);
      Lb[i0 + k] += fl.band * env; Rb[i0 + k] += fr.band * env;
    }
  }
  function shimmerEvent(Lb, Rb, tEnd, dur, notes) {
    const m = Math.round(dur * SR), n = m + Math.round(0.1 * SR);
    const sL = new Float32Array(n), sR = new Float32Array(n), oL = new Float32Array(n), oR = new Float32Array(n);
    notes.forEach((mi, i) => {
      const f = mtof(mi), w = TAU * f / SR, i0 = Math.round(i * 0.014 * SR), nn = Math.round(0.3 * SR);
      const [gL, gR] = panGains(-0.5 + i * 0.33);
      for (let k = 0; k < nn && i0 + k < n; k++) {
        const t = k / SR;
        const y = (Math.sin(w * k + 0.9 * Math.exp(-t / 0.05) * Math.sin(2 * w * k)) + 0.15 * Math.sin(3 * w * k)) * Math.exp(-t / 0.12) * (k < 48 ? rc(k, 48) : 1);
        sL[i0 + k] += y * gL; sR[i0 + k] += y * gR;
      }
    });
    const hp = L.biquad('hp', 250, 0.707), lp = L.biquad('lp', 5500, 0.707);
    for (const ch of [sL, sR]) { L.filterInPlace(ch, hp); L.filterInPlace(ch, lp); }
    L.freeverb(sL, sR, oL, oR, { room: 0.9, damp: 0.3, predelay: 0.03, gain: 0.04 });
    const start = Math.round(tEnd * SR) - m;
    const nIn = Math.round(0.55 * m), nOut = Math.round(0.02 * SR);
    for (let k = 0; k < m; k++) {
      const j = start + k; if (j < 0 || j >= N) continue;
      let g = Math.pow(rc(k, nIn), 1.6); if (k > m - nOut) g *= rc(m - k, nOut);
      Lb[j] += oL[m - 1 - k] * g; Rb[j] += oR[m - 1 - k] * g;
    }
  }

  // ---------------------------------------------------------------- render + calibrate
  const mL = new Float32Array(N), mR = new Float32Array(N), sL = new Float32Array(N), sR = new Float32Array(N);
  const xL = new Float32Array(N), xR = new Float32Array(N);
  const clearX = () => { xL.fill(0); xR.fill(0); };
  const bodyA = Math.min(9, outroT * 0.4), bodyB = outroT;
  const bodyRanges = [[Math.round(bodyA * SR), Math.round(bodyB * SR)]];
  const rmsRanges = (ranges) => { let s = 0, c = 0; for (const [a, b] of ranges) { for (let i = a; i < b; i++) s += xL[i] * xL[i] + xR[i] * xR[i]; c += 2 * (b - a); } return c ? Math.sqrt(s / c) : 0; };
  const stemReport = {}; let padRef = 0;
  function commit(name, ranges, targetDb, send) {
    const r = rmsRanges(ranges);
    let g = 1;
    if (name === 'pad') padRef = r; else if (r > 0) g = padRef * L.undb(targetDb) / r;
    for (let i = 0; i < N; i++) { const l = xL[i] * g, rr = xR[i] * g; mL[i] += l; mR[i] += rr; if (send) { sL[i] += l * send; sR[i] += rr * send; } }
    stemReport[name] = { rel_to_pad_db: name === 'pad' ? 0 : targetDb, active_s: L.r2(ranges.reduce((a, [x, y]) => a + (y - x), 0) / SR, 1), calib_gain_db: L.r2(L.db(g)) };
  }

  for (const e of ev.pad) padNote(xL, xR, e);
  {
    const fl = new L.SVF(), fr = new L.SVF();
    for (let i = 0; i < N; i++) {
      if (i % CR === 0) { const fc = padCut[i / CR]; fl.set(fc, 0.6); fr.set(fc, 0.6); }
      xL[i] = fl.tick(xL[i]); xR[i] = fr.tick(xR[i]);
    }
    const lp2 = L.biquad('lp', 9000, 0.707), hp2 = L.biquad('hp', 100, 0.707), mud = L.biquad('peak', 300, 0.9, SR, -2);
    for (const ch of [xL, xR]) { L.filterInPlace(ch, lp2); L.filterInPlace(ch, hp2); L.filterInPlace(ch, mud); }
    for (let i = 0; i < N; i++) { const g = at(pumpCurve, i) * at(dip, i); xL[i] *= g; xR[i] *= g; }
  }
  commit('pad', bodyRanges, 0, 0.3);

  clearX();
  for (const e of ev.arp) arpNote(xL, xR, e);
  {
    const fl = new L.SVF(), fr = new L.SVF();
    for (let i = 0; i < N; i++) {
      if (i % CR === 0) { const fc = arpCut[i / CR]; fl.set(fc, 0.7); fr.set(fc, 0.7); }
      xL[i] = fl.tick(xL[i]); xR[i] = fr.tick(xR[i]);
    }
    // tempo-synced ping-pong delay (dotted 8th of the nominal tempo), darkened repeats
    const D = Math.round(0.75 * beat * SR), bl = new Float32Array(D), br = new Float32Array(D);
    const aLP = L.onePoleCoef(3000), aHP = L.onePoleCoef(320);
    let idx = 0, lpL = 0, lpR = 0, hpL = 0, hpR = 0;
    for (let i = 0; i < N; i++) {
      const x = 0.5 * (xL[i] + xR[i]);
      const yl = bl[idx], yr = br[idx];
      lpL += aLP * (yl - lpL); hpL += aHP * (lpL - hpL); const fL = lpL - hpL;
      lpR += aLP * (yr - lpR); hpR += aHP * (lpR - hpR); const fR = lpR - hpR;
      bl[idx] = x + 0.36 * fR; br[idx] = 0.36 * fL;
      xL[i] += 0.26 * fL; xR[i] += 0.26 * fR;
      if (++idx >= D) idx = 0;
    }
    for (let i = 0; i < N; i++) { const g = at(dip, i); xL[i] *= g; xR[i] *= g; }
  }
  commit('arp', act.arp, -5, 0.3);
  log('pad + arp done', ((Date.now() - t0clock) / 1000).toFixed(1) + 's');

  clearX();
  for (const e of ev.sub) subNote(xL, e);
  { L.filterInPlace(xL, L.biquad('lp', 320, 0.707)); for (let i = 0; i < N; i++) { const v = xL[i] * at(pumpCurve, i); xL[i] = v; xR[i] = v; } }
  commit('sub', act.sub, -4, 0);

  if (ev.kick.length) { clearX(); for (const k of ev.kick) kickHit(xL, xR, k.t, k.vel); commit('kick', act.kick, -10, 0); }
  clearX(); for (const im of ev.impact) thumpHit(xL, xR, im.t, im.vel * (im.final ? 0.85 : 1)); commit('thump', act.thump, -2.5, 0);
  clearX(); for (const im of ev.impact) airBurst(xL, xR, im.t, im.vel * (im.final ? 0.9 : 1)); commit('air', act.air, -15, 0.5);
  if (ev.tick.length) {
    clearX();
    const tk = [0, 1].map((v) => noiseHit(6200 + v * 200, 1.3, 0.04, 0.0035, 0.009, 6500, v));
    const tc = [0, 1].map((v) => noiseHit(4700 + v * 150, 1.3, 0.05, 0.0035, 0.012, 6500, 10 + v));
    ev.tick.forEach((h, i) => place(xL, xR, (h.tock ? tc : tk)[i % 2], h.t, h.vel, h.tock ? -0.3 : 0.3));
    commit('tick', act.tick, -26, 0.05);
  }
  if (ev.shaker.length) {
    clearX();
    const ss = [0, 1, 2, 3].map((v) => noiseHit(5200 + v * 120, 1.2, 0.09, 0.008, 0.028, 8000, 20 + v));
    ev.shaker.forEach((h, i) => place(xL, xR, ss[i % 4], h.t, h.vel, -0.25));
    commit('shaker', act.shaker, -31, 0.05);
  }
  clearX(); for (const s of ev.sweep) sweepEvent(xL, xR, s.t0, s.t1); commit('sweep', act.sweep, -13, 0.2);
  clearX(); for (const s of ev.shimmer) shimmerEvent(xL, xR, s.tEnd, s.dur, s.notes); commit('shimmer', act.shimmer, -11, 0);
  log('stems done', ((Date.now() - t0clock) / 1000).toFixed(1) + 's');

  {
    const hp = L.biquad('hp', 220, 0.707), lp = L.biquad('lp', 5000, 0.707);
    for (const ch of [sL, sR]) { L.filterInPlace(ch, hp); L.filterInPlace(ch, lp); }
    clearX(); L.freeverb(sL, sR, xL, xR, { room: 0.8, damp: 0.5, predelay: 0.02, gain: 0.015 });
    commit('reverb', bodyRanges, -10, 0);
  }

  // ---------------------------------------------------------------- master
  {
    const hp = L.biquad('hp', 35, 0.707);
    const pocket = L.biquad('peak', 2400, 0.6, SR, -6);      // the voice pocket
    const shelf = L.biquad('hs', 8000, 0.707, SR, -3);
    for (const ch of [mL, mR]) { L.filterInPlace(ch, hp); L.filterInPlace(ch, pocket); L.filterInPlace(ch, shelf); }
  }
  const rmsA = Math.round(bodyA * SR), rmsB = Math.round(bodyB * SR);
  const rmsBody = L.rmsRange([mL, mR], Math.min(rmsA, rmsB - SR), rmsB);
  const normGain = L.undb(RMS_DB) / rmsBody;
  for (let i = 0; i < N; i++) { mL[i] *= normGain; mR[i] *= normGain; }
  const peakBefore = L.peakAbs([mL, mR]);
  const lim = L.lookaheadLimiter([mL, mR], L.undb(PEAK_DB), { lookMs: 3, relMs: 120, truePeak: true });
  {
    const nIn = Math.round(0.01 * SR);
    for (let i = 0; i < nIn; i++) { const g = rc(i, nIn); mL[i] *= g; mR[i] *= g; }
    const fadeStart = outroT + Math.max(0.5, 0.3 * (DUR - outroT));
    const iF = Math.round(fadeStart * SR), nF = N - iF, nZ = Math.round(0.05 * SR);
    for (let i = iF; i < N; i++) {
      let g = L.undb(-60 * (i - iF) / nF); if (i >= N - nZ) g *= rc(N - 1 - i, nZ);
      mL[i] *= g; mR[i] *= g;
    }
    mL[N - 1] = 0; mR[N - 1] = 0;
  }
  const finalPeak = L.peakAbs([mL, mR]);
  const finalRms = L.rmsRange([mL, mR], Math.min(rmsA, rmsB - SR), rmsB);
  const wr = L.writeWav16(OUT, [mL, mR], SR, base + 99);

  // ---------------------------------------------------------------- arrangement sidecar
  const r3 = (x) => L.r2(x, 3);
  const arrangement = {
    tool: 'make_music.js', style: 'keynote', version: VERSION,
    params: { dur: DUR, bpm: BPM, key: ctx.KEY + ' (Lydian / major-sus colours)', seed: SEED, rms_db: RMS_DB, peak_db: PEAK_DB, sections_requested_s: secReq },
    samples: N, sample_rate: SR, channels: 2, bit_depth: 16,
    grid: { method: 'each section is stretched locally to a whole number of beats; the last bar (4..7 beats) absorbs the remainder; sections start exactly on the requested time', nominal_bpm: BPM, nominal_beat_s: r3(beat), build_s: BUILD },
    sections: sections.map((S) => ({
      idx: S.k, start_s: r3(S.t0), end_s: r3(S.t1), length_s: r3(S.T), beats: S.beats, bars: S.nb, last_bar_beats: S.bars[S.nb - 1].len,
      effective_bpm: L.r2(S.bpmEff, 2), stretch_pct: L.r2(S.stretchPct, 2), level: S.level, progression: PROGS[S.prog].join('-'),
      chords: S.bars.map((B) => B.ch.name).join(' '),
    })),
    landings: landings.map((x, i) => ({ idx: i + 1, type: x.type, requested_s: x.requested_s, actual_s: L.r2(Math.round(x.t * SR) / SR, 5),
      error_ms: L.r2((Math.round(x.t * SR) / SR - x.requested_s) * 1000, 3), chord: x.chord })),
    outro: { requested_s: outroReq, final_chord_at_s: r3(outroT), fade_to_silence_at_s: DUR },
    lifts: { requested_s: secReq.map(r3), snapped_s: starts.slice(1).map(r3) },
    entries: { pluck_s: 9, bass_and_percussion_s: 4.5, note: 'first section ramps: pad 0-4.5 s, sub+ticks 4.5 s, arp 9 s, heartbeat 15 s' },
    final_chord: finalCh.name + ' [' + finalV.join(',') + ']',
    stems: stemReport,
    events: Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v.length])),
    levels: {
      body_window_s: [L.r2(Math.min(rmsA, rmsB - SR) / SR, 2), r3(outroT)], body_rms_dbfs: L.r2(L.db(finalRms)), final_sample_peak_dbfs: L.r2(L.db(finalPeak)),
      normalise_gain_db: L.r2(L.db(normGain)), peak_before_limiter_dbfs: L.r2(L.db(peakBefore)),
      limiter: { ceiling_dbfs: PEAK_DB, inter_sample_peaks: true, limited_samples: lim.limitedSamples, max_reduction_db: L.r2(lim.maxReductionDb, 3) },
      wav_clipped_samples: wr.clipped,
    },
    warnings, render_seconds: L.r2((Date.now() - t0clock) / 1000, 1),
  };
  const jsonPath = OUT.replace(/\.wav$/i, '') + '.arrangement.json';
  fs.writeFileSync(jsonPath, JSON.stringify(arrangement, null, 2));
  for (const w of warnings) console.error('make_music: warning: ' + w);
  log(`wrote ${OUT} (${DUR}s, ${N} frames, keynote) body RMS ${L.r2(L.db(finalRms))} dBFS, peak ${L.r2(L.db(finalPeak))} dBFS, limited ${lim.limitedSamples} samples, ${arrangement.render_seconds}s`);
  log('arrangement ' + jsonPath);
}

module.exports = { run };
