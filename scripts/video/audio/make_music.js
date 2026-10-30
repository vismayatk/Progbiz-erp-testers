#!/usr/bin/env node
'use strict';
/**
 * make_music.js - deterministic procedural background music for the
 * Progbiz ERP / CRM marketing video.
 *
 *   node scripts/video/audio/make_music.js --dur <seconds> --out <file.wav>
 *        [--bpm 100] [--key D] [--seed 7] [--outro-at <seconds>]
 *        [--lift <s1,s2,...>] [--rms-db -18] [--peak-db -3] [--quiet]
 *
 * Output: 48 kHz / 16-bit / stereo WAV of exactly round(dur*48000) frames,
 * plus <out>.arrangement.json (sections, chords, snapped lift/outro times,
 * per-stem levels, normalisation/limiter stats).
 *
 * Style: light, clean, optimistic "modern SaaS" bed. Warm major-key
 * progression (I-V-vi-IV family with add9/maj7/6 colours, one chord per bar),
 * voicings re-chosen every bar with voice-leading + a seeded random term so
 * the 4-bar cycle never repeats identically. Layers:
 *   pad    - 3 detuned oscillators per note (sine + triangle + polyBLEP saw),
 *            0.8 s raised-cosine attack, 1.3 s release, slow amplitude drift,
 *            TPT state-variable low-pass 1.3-3.5 kHz automated per section,
 *            110 Hz high-pass (the bass owns the lows), -2 dB at 320 Hz (de-mud)
 *   pluck  - soft FM mallet (ratio 1, decaying index) arpeggio on 8ths,
 *            tresillo accents, dotted-8th ping-pong delay with darkened repeats
 *   keys   - soft FM electric-piano comping (fullest section only)
 *   bass   - sine + 2nd/3rd harmonic on chord roots, 8 ms attack
 *   drums  - soft pitch-drop sine kick (1 & 3), filtered-noise clap on 2 & 4
 *            (from the first lift), off-beat noise hats, 16th shaker
 *   riser  - ~1.2 s band-passed noise swell into each lift
 *   gentle kick-keyed pumping (-1.7 dB) on pad and bass
 *   Freeverb-style reverb (8 combs + 4 all-passes per side) on pad, pluck,
 *   clap and keys; pre-delay 20 ms, band-limited 220 Hz - 5 kHz input.
 * Master: 35 Hz high-pass, -1.5 dB high-shelf at 9 kHz, normalise body RMS to --rms-db (default -18 dBFS),
 * look-ahead limiter at --peak-db (default -3 dBFS, 4x inter-sample peaks),
 * outro fade that reaches digital silence exactly at --dur.
 *
 * --style keynote switches to the tech-keynote bed in keynote.js (sub pulse, glassy pad,
 * 16th FM-glass arp, section landings on the exact --sections times); it does not touch
 * anything below, so the default output stays byte-identical.
 *
 * Every envelope edge is ramped (>= 2 ms raised cosine), so no clicks.
 * The same arguments always give bit-identical output (seeded PRNGs,
 * seeded dither).
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const SR = L.SR;
const TAU = 2 * Math.PI;
const VERSION = '1.0.0';

const USAGE = `Usage: node scripts/video/audio/make_music.js --dur <seconds> --out <file.wav>
       [--bpm 100] [--key D] [--seed 7] [--outro-at <seconds>] [--lift <s1,s2,...>]
       [--rms-db -18] [--peak-db -3] [--quiet]
       [--style warm|keynote] [--sections <t1,t2,...>]
  --key      major key tonic: C C# Db D D# Eb E F F# Gb G G# Ab A A# Bb B (default D)
  --outro-at groove stops and the final tonic chord rings out from here
             (snapped to the nearest 8th note; default dur-8 s)
  --lift     comma separated times (s) where a new, slightly fuller section starts
             (snapped to the nearest bar line; default: auto every 32 bars)
  --style    warm (default, the original pad/pluck bed) or keynote (tech-keynote bed, see keynote.js;
             default 108 BPM). In keynote style --sections replaces --lift: every listed time is a
             landing (build + soft impact) and is kept exactly (not snapped to bars), --outro-at is
             not snapped either.`;

function die(msg) { console.error('make_music: ERROR: ' + msg + '\n' + USAGE); process.exit(2); }

const A = L.parseArgs(process.argv.slice(2));
if (A.help || A.h) { console.log(USAGE); process.exit(0); }
if (A.dur === undefined || !A.out || A.out === true) die('--dur and --out are required');

const DUR = Number(A.dur);
const OUT = String(A.out);
const BPM = A.bpm !== undefined ? Number(A.bpm) : 100;
const KEY = A.key !== undefined ? String(A.key) : 'D';
const SEED = A.seed !== undefined ? Math.trunc(Number(A.seed)) : 7;
const RMS_DB = A['rms-db'] !== undefined ? Number(A['rms-db']) : -18;
const PEAK_DB = A['peak-db'] !== undefined ? Number(A['peak-db']) : -3;
const QUIET = !!A.quiet;
const log = (...m) => { if (!QUIET) console.error('[make_music]', ...m); };

if (!(DUR >= 8)) die('--dur must be a number >= 8');
if (!(BPM >= 60 && BPM <= 160)) die('--bpm must be 60..160');
if (!Number.isFinite(SEED)) die('--seed must be an integer');
const KEYS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
if (!(KEY in KEYS)) die('unknown --key ' + KEY);
const keyPc = KEYS[KEY];
const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// --style keynote is a separate engine (keynote.js); the default path below is untouched.
const STYLE = A.style !== undefined ? String(A.style) : 'warm';
if (STYLE !== 'warm' && STYLE !== 'keynote') die('--style must be warm or keynote');
if (STYLE === 'keynote') {
  require('./keynote').run({ A, DUR, OUT, KEY, keyPc, SEED, RMS_DB, PEAK_DB, log, die });
  return;
}

const N = Math.round(DUR * SR);
const beat = 60 / BPM, bar = 4 * beat, e8 = beat / 2, s16 = beat / 4;

// ------------------------------------------------------------------ PRNG streams
const base = (SEED >>> 0) * 1000003;
const rArr = L.mulberry32(base + 11);   // arrangement / voicing choices
const rHum = L.mulberry32(base + 23);   // humanisation
const rNoise = L.mulberry32(base + 37); // noise sources
const rPh = L.mulberry32(base + 51);    // oscillator phases / LFOs

// ------------------------------------------------------------------ timing: outro, lifts, sections
const outroDefault = DUR - Math.min(8, Math.max(3, DUR * 0.12));
let outroReq = A['outro-at'] !== undefined ? Number(A['outro-at']) : outroDefault;
if (!Number.isFinite(outroReq)) die('--outro-at must be a number');
const outroClamped = Math.min(Math.max(outroReq, 4), DUR - 1.5);
let outroT = Math.round(outroClamped / e8) * e8;
if (outroT > DUR - 1.5) outroT -= e8;
const warnings = [];
if (outroClamped !== outroReq) warnings.push(`--outro-at ${outroReq} clamped to ${outroClamped}`);

const introBars = Math.max(1, Math.round(4 / bar));               // ~4 s pad-only intro
const arpBar = introBars;                                          // pluck enters
const grooveBar = introBars + Math.max(1, Math.round(4.8 / bar)); // bass + light percussion ~8-12 s
const nBars = Math.ceil(outroT / bar - 1e-9);                      // bars that (partly) sound before the outro

let liftReq;
if (A.lift !== undefined && A.lift !== true && String(A.lift).trim() !== '') {
  liftReq = String(A.lift).split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
} else {
  liftReq = [];
  for (let b = grooveBar + 8; b < nBars - 16; b += 32) liftReq.push(b * bar);
}
const liftBars = [];
for (const t of liftReq) {
  const b = Math.round(t / bar);
  if (b < grooveBar + 1 || b > nBars - 3) { warnings.push(`lift at ${t}s ignored (outside bars ${grooveBar + 1}..${nBars - 3})`); continue; }
  if (!liftBars.includes(b)) liftBars.push(b);
}
liftBars.sort((x, y) => x - y);

const LIFT_TYPES = new Set(['lift', 'full']);
const sections = [];
const pushSec = (type, from, to) => { if (to > from) sections.push({ type, from, to }); };
pushSec('intro', 0, Math.min(arpBar, nBars));
pushSec('arp', Math.min(arpBar, nBars), Math.min(grooveBar, nBars));
{
  let prev = Math.min(grooveBar, nBars), prevType = 'groove';
  const mid = Math.floor((liftBars.length - 1) / 2);
  liftBars.forEach((lb, k) => {
    pushSec(prevType, prev, lb);
    prev = lb;
    prevType = (k === mid || (k > mid && (k - mid) % 2 === 0)) ? 'full' : 'lift';
  });
  pushSec(prevType, prev, nBars);
}
let liftCount = 0;
sections.forEach((s, i) => {
  s.idx = i;
  if (s.type === 'full') { s.prog = 'B'; s.prog2 = 'D'; }
  else if (s.type === 'lift') { s.prog = liftCount % 2 === 0 ? 'C' : 'A'; s.prog2 = liftCount % 2 === 0 ? 'A' : 'C'; }
  else { s.prog = 'A'; s.prog2 = 'A'; }
  if (LIFT_TYPES.has(s.type)) liftCount++;
});
const secOfBar = new Array(nBars);
for (const s of sections) for (let b = s.from; b < s.to; b++) secOfBar[b] = s;

// ------------------------------------------------------------------ harmony
const DEG = {
  I: { st: 0, q: 'maj', col: ['add9', 'maj7', 'add9', 'triad', '6'] },
  ii: { st: 2, q: 'min', col: ['m7', 'm7', 'triad'] },
  iii: { st: 4, q: 'min', col: ['m7', 'triad'] },
  IV: { st: 5, q: 'maj', col: ['maj7', 'add9', 'maj7', '6'] },
  V: { st: 7, q: 'maj', col: ['triad', 'add9', '6', 'triad'] },
  vi: { st: 9, q: 'min', col: ['m7', 'madd9', 'm7', 'triad'] },
};
const PROGS = { A: ['I', 'V', 'vi', 'IV'], B: ['vi', 'IV', 'I', 'V'], C: ['I', 'vi', 'IV', 'V'], D: ['IV', 'I', 'V', 'vi'] };
const COLSUF = { triad: '', add9: 'add9', madd9: 'm(add9)', maj7: 'maj7', '6': '6', m7: 'm7' };

function chordOf(deg, colour) {
  const d = DEG[deg];
  const root = (keyPc + d.st) % 12;
  const iv = d.q === 'maj' ? [0, 4, 7] : [0, 3, 7];
  if (colour === 'add9' || colour === 'madd9') iv.push(2);
  else if (colour === 'maj7') iv.push(11);
  else if (colour === '6') iv.push(9);
  else if (colour === 'm7') iv.push(10);
  const suf = d.q === 'min' && colour === 'triad' ? 'm' : COLSUF[colour];
  return { deg, colour, root, pcs: iv.map((x) => (root + x) % 12), name: NOTE[root] + suf };
}

const PAD_LO = 50, PAD_HI = 76;
function voicingCandidates(pcs) {
  const notes = [];
  for (let m = PAD_LO; m <= PAD_HI; m++) if (pcs.includes(m % 12)) notes.push(m);
  const out = [];
  const nn = notes.length;
  for (let a = 0; a < nn; a++) for (let b = a + 1; b < nn; b++) for (let c = b + 1; c < nn; c++) for (let d = c + 1; d < nn; d++) {
    const v = [notes[a], notes[b], notes[c], notes[d]];
    const set = new Set(v.map((m) => m % 12));
    if (set.size < Math.min(4, pcs.length)) continue;
    const span = v[3] - v[0];
    if (span < 7 || span > 19) continue;
    let ok = true;
    for (let i = 1; i < 4 && ok; i++) {
      const iv = v[i] - v[i - 1];
      if (iv < 2) ok = false;
      if (v[i - 1] < 57 && iv < 3) ok = false; // no low clusters (mud)
    }
    for (let i = 0; i < 4 && ok; i++) for (let j = i + 1; j < 4; j++) {
      const iv = v[j] - v[i];
      if (iv === 1 || iv === 13 || iv === 25) { ok = false; break; } // no (compound) minor 9ths
    }
    if (ok) out.push(v);
  }
  return out;
}
function pickVoicing(ch, prev, centre) {
  const cands = voicingCandidates(ch.pcs);
  let best = null, bs = Infinity;
  for (const v of cands) {
    let s = 0;
    if (prev) for (let i = 0; i < 4; i++) s += Math.abs(v[i] - prev[i]);
    const mean = (v[0] + v[1] + v[2] + v[3]) / 4;
    s += 0.7 * Math.abs(mean - centre);
    if ((v[0] % 12) !== ch.root && (v[0] % 12) !== (ch.root + 7) % 12) s += 1.5; // mild preference: root/5th at bottom
    s += rArr() * 3.0;
    if (s < bs) { bs = s; best = v; }
  }
  if (!best) { // fallback: close root position triad (never expected)
    const r = PAD_LO + ((ch.root - PAD_LO % 12 + 12) % 12);
    best = [r, r + (ch.pcs.includes((ch.root + 4) % 12) ? 4 : 3), r + 7, r + 12];
  }
  return best;
}
function arpNotes(ch, lo, max = 6) {
  const out = [];
  for (let m = lo; m <= lo + 26 && out.length < max; m++) if (ch.pcs.includes(m % 12)) out.push(m);
  return out;
}
const bassMidi = (pc) => 36 + ((pc - 36 % 12 + 12) % 12); // root in 36..47

// ------------------------------------------------------------------ per-bar arrangement
const ARP_PATS = [
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 1, 3, 2, 4, 3, 1],
  [1, 0, 2, 1, 3, 2, 4, 2],
  [0, 1, 3, 2, 4, 2, 3, 1],
];
const TRES = [1, 0, 0, 1, 0, 0, 1, 0];
const ALL8 = [1, 1, 1, 1, 1, 1, 1, 1];
const GAPPY = [1, 1, 0, 1, 1, 1, 0, 1];

function barState(b) {
  const s = secOfBar[b];
  const li = b - s.from, len = s.to - s.from;
  const next = sections[s.idx + 1];
  const beforeLift = !!(next && LIFT_TYPES.has(next.type));
  const st = {
    b, type: s.type, li, pad: true, padLvl: 1, cutoff: 2600, energy: 1,
    arp: false, arpMask: ALL8, arpLvl: 1, arpLo: 66, arpBright: 1, arp2: false,
    bass: null, kick: null, clap: false, hat: false, shaker: false, keys: false, variant: 'main',
  };
  switch (s.type) {
    case 'intro': st.cutoff = 1500; break;
    case 'arp': st.cutoff = 2000; st.arp = true; st.arpMask = TRES; st.arpLvl = 0.85; st.arpBright = 0.8; break;
    case 'groove':
      st.cutoff = 2600; st.arp = true; st.arpMask = (Math.floor(li / 4) % 2) ? GAPPY : ALL8;
      st.bass = 'tres'; st.kick = 'soft'; st.hat = true; st.padLvl = 0.95; st.energy = 0.92; break;
    case 'lift':
      st.cutoff = 3000; st.arp = true; st.arpMask = (Math.floor(li / 8) % 2) ? GAPPY : ALL8; st.arpLo = (s.idx % 2) ? 69 : 64;
      st.bass = 'drive'; st.kick = 'lift'; st.clap = true; st.hat = true; st.shaker = true; st.padLvl = 0.92; break;
    case 'full':
      st.cutoff = 3500; st.arp = true; st.arpMask = ALL8; st.arpLo = 69; st.arp2 = true;
      st.bass = 'drive'; st.kick = 'lift'; st.clap = true; st.hat = true; st.shaker = true; st.keys = true; st.padLvl = 0.88; st.energy = 1.1; break;
    default: break;
  }
  const groovy = s.type === 'groove' || LIFT_TYPES.has(s.type);
  if (groovy && beforeLift && len >= 10 && li >= len - 2) {
    // 2-bar breakdown before a lift: drums out, darker pad, sparse arp, held bass
    Object.assign(st, { variant: 'break', cutoff: 1300, arpMask: TRES, arpLvl: 0.8, arpBright: 0.7, arp2: false,
      bass: 'whole', kick: null, clap: false, hat: li === len - 1, shaker: false, keys: false, padLvl: 0.95, energy: 0.8 });
  } else if (groovy && beforeLift && len >= 5 && li === len - 1) {
    Object.assign(st, { variant: 'halfbreak', kick: null, clap: false, bass: 'whole', cutoff: Math.min(st.cutoff, 1900) });
  } else if (groovy && len >= 24 && li % 16 === 15 && li < len - 6) {
    Object.assign(st, { variant: 'breath', kick: null, clap: false }); // one-bar "breath" in long sections
  }
  return st;
}

// chords per bar with cadence overrides
const outroBarIdx = Math.floor(outroT / bar + 1e-9);   // bar in which the final chord lands
const cadenceFrom = (outroT - outroBarIdx * bar) < beat - 1e-9 ? outroBarIdx - 1 : outroBarIdx;
const bars = [];
let prevVoicing = null;
for (let b = 0; b < nBars; b++) {
  const s = secOfBar[b];
  const st = barState(b);
  const li = b - s.from, len = s.to - s.from;
  const early = !LIFT_TYPES.has(s.type);
  const useProg2 = !early && li >= 16 && len - 16 >= 8;
  const prog = PROGS[useProg2 ? s.prog2 : s.prog];
  let deg = prog[(early ? b : (useProg2 ? li - 16 : li)) % 4];
  const next = secOfBar[b + 1];
  if (next && next !== s && LIFT_TYPES.has(next.type)) deg = 'V';     // dominant into every lift
  if (b >= cadenceFrom) deg = 'IV';                                     // plagal cadence into final I
  const cycle = Math.floor(b / 4);
  const cols = DEG[deg].col;
  let colour = cols[(cycle + DEG[deg].st) % cols.length];
  if (rArr() < 0.22) colour = cols[Math.floor(rArr() * cols.length)];
  const ch = chordOf(deg, colour);
  const centre = 62 + 2.5 * Math.sin(cycle * 0.9 + 0.4) + (s.type === 'full' ? 1.5 : 0) + (st.variant === 'break' ? -1.5 : 0);
  const voicing = pickVoicing(ch, prevVoicing, centre);
  prevVoicing = voicing;
  bars.push({ b, t0: b * bar, st, ch, voicing });
}
const finalCh = chordOf('I', 'add9');
const finalVoicing = pickVoicing(finalCh, prevVoicing, 61);

// ------------------------------------------------------------------ event lists
const ev = { pad: [], pluck: [], bass: [], kick: [], clap: [], hat: [], shaker: [], keys: [], riser: [] };
const hum = (ms) => (rHum() * 2 - 1) * ms / 1000;
const stopT = outroT - 0.01;

for (const B of bars) {
  const { st, ch, voicing, t0 } = B;
  const barEnd = Math.min(t0 + bar, outroT);
  // pad (one chord per bar; releases overlap into the next attack)
  const firstChord = B.b === 0;
  voicing.forEach((m, i) => {
    ev.pad.push({ midi: m, t0, t1: barEnd, amp: 0.1 * st.padLvl * st.energy * (i === 0 ? 0.85 : 1), pan: [-0.4, 0.15, -0.15, 0.4][i],
      attack: firstChord ? 2.2 : 0.8, release: 1.3 });
  });
  // pluck arpeggio
  if (st.arp) {
    const notes = arpNotes(ch, st.arpLo, 6);
    const pat = ARP_PATS[(B.st.type === 'arp' ? 0 : (secOfBar[B.b].idx + Math.floor(st.li / 8))) % ARP_PATS.length];
    for (let p = 0; p < 8; p++) {
      if (!st.arpMask[p]) continue;
      const t = t0 + p * e8 + (p ? hum(4) : 0);
      if (t >= stopT) continue;
      const accent = (p === 0 || p === 3 || p === 6);
      const vel = (accent ? 1.0 : 0.72) * st.arpLvl * st.energy * (0.93 + rHum() * 0.14);
      const m = notes[pat[p] % notes.length];
      ev.pluck.push({ t, midi: m, vel, pan: (p % 2 ? 0.18 : -0.18), bright: st.arpBright });
      if (st.arp2 && accent) ev.pluck.push({ t: t + 0.002, midi: m + 12, vel: vel * 0.33, pan: -0.3, bright: 0.6 });
    }
  }
  // bass
  const root = bassMidi(ch.root);
  const addBass = (bt, lenBeats, midi, vel) => { const t = t0 + bt * beat; if (t < stopT) ev.bass.push({ t, len: Math.min(lenBeats * beat, outroT - t), midi, vel: vel * st.energy }); };
  if (st.bass === 'whole') addBass(0, 3.9, root, 0.75);
  else if (st.bass === 'tres') { addBass(0, 1.4, root, 1.0); addBass(1.5, 1.4, root, 0.8); addBass(3, 0.9, root, 0.85); }
  else if (st.bass === 'drive') { addBass(0, 1.4, root, 1.0); addBass(1.5, 0.95, root, 0.8); addBass(2.5, 0.45, root, 0.7); addBass(3, 0.45, root, 0.8); addBass(3.5, 0.45, root + 7 > 50 ? root - 5 : root + 7, 0.7); }
  // drums
  const addHit = (arr, bt, vel, jitterMs) => { const t = t0 + bt * beat + (jitterMs ? hum(jitterMs) : 0); if (t < stopT) arr.push({ t, vel: vel * st.energy }); };
  if (st.kick === 'soft') { addHit(ev.kick, 0, 0.9); addHit(ev.kick, 2, 0.75); }
  else if (st.kick === 'lift') { addHit(ev.kick, 0, 0.95); addHit(ev.kick, 2, 0.8); if (st.li % 2 === 1) addHit(ev.kick, 3.5, 0.5); }
  if (st.clap) { addHit(ev.clap, 1, 0.85 + rHum() * 0.1, 3); addHit(ev.clap, 3, 0.9 + rHum() * 0.1, 3); }
  if (st.hat) {
    const startBeat = st.variant === 'break' ? 2 : 0;
    for (let p = 1; p < 8; p += 2) if (p / 2 >= startBeat) addHit(ev.hat, p / 2, 0.55 + rHum() * 0.4, 4);
  }
  if (st.shaker) for (let q = 0; q < 16; q++) addHit(ev.shaker, q / 4, (q % 2 ? 0.8 : 0.45) * (0.8 + rHum() * 0.35), 5);
  // keys (fullest section only)
  if (st.keys) {
    const kv = [...new Set(voicing.map((m) => (m < 57 ? m + 12 : m)))].sort((x, y) => x - y);
    const add = (bt, lenBeats, vel) => { const t = t0 + bt * beat; if (t < stopT) ev.keys.push({ t, len: lenBeats * beat, notes: kv, vel: vel * st.energy }); };
    add(0, 1.4, 0.8); add(1.5, 0.45, 0.55); add(3, 0.4, 0.45);
  }
}
// risers into lifts
for (const lb of liftBars) {
  const t1 = lb * bar; const t0 = t1 - Math.min(1.2, bar / 2);
  ev.riser.push({ t0, t1 });
}
// outro: final tonic chord
finalVoicing.forEach((m, i) => ev.pad.push({ midi: m, t0: outroT, t1: DUR + 10, amp: 0.1 * (i === 0 ? 0.85 : 1), pan: [-0.4, 0.15, -0.15, 0.4][i], attack: 0.3, release: 0.1 }));
arpNotes(finalCh, 64, 4).forEach((m, i) => ev.pluck.push({ t: outroT + i * 0.045, midi: m, vel: 0.65 - i * 0.05, pan: -0.3 + i * 0.2, bright: 0.7, tau: 1.3, len: DUR - outroT - i * 0.045, outro: true }));
ev.bass.push({ t: outroT, len: DUR - outroT, midi: bassMidi(finalCh.root), vel: 0.85, decay: 1.8 });
ev.kick.push({ t: outroT, vel: 0.6 });

// ------------------------------------------------------------------ synthesis helpers
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function panGains(p) { const a = (Math.max(-1, Math.min(1, p)) + 1) * Math.PI / 4; return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2]; }
function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
const rc = (k, n) => 0.5 - 0.5 * Math.cos(Math.PI * k / n); // raised-cosine ramp 0..1

function padNote(Lb, Rb, e) {
  const f = mtof(e.midi);
  const i0 = Math.max(0, Math.round(e.t0 * SR));
  const iOff = Math.min(N, Math.round(e.t1 * SR));
  const nRel = Math.max(96, Math.round(e.release * SR));
  const i1 = Math.min(N, iOff + nRel);
  const nAtt = Math.max(96, Math.round(e.attack * SR));
  const d0 = f / SR, d1 = f * Math.pow(2, 6.5 / 1200) / SR, d2 = f * Math.pow(2, -7.5 / 1200) / SR;
  const [c0l, c0r] = panGains(e.pan), [c1l, c1r] = panGains(e.pan - 0.35), [c2l, c2r] = panGains(e.pan + 0.35);
  const a0 = 1.0 * e.amp, a1 = 0.3 * e.amp, a2 = 0.24 * e.amp;
  const lfoW = TAU * (0.05 + rPh() * 0.07) / SR, lfoPh = rPh() * TAU;
  let p0 = rPh(), p1 = rPh(), p2 = rPh();
  for (let i = i0; i < i1; i++) {
    const k = i - i0;
    let env = k < nAtt ? rc(k, nAtt) : 1;
    if (i >= iOff) env *= 0.5 + 0.5 * Math.cos(Math.PI * (i - iOff) / nRel);
    const g = env * (1 + 0.08 * Math.sin(lfoPh + lfoW * k));
    const s0 = Math.sin(TAU * p0) * a0;
    const s1 = (1 - 4 * Math.abs(p1 - 0.5)) * a1;
    const s2 = (2 * p2 - 1 - polyblep(p2, d2)) * a2;
    Lb[i] += g * (c0l * s0 + c1l * s1 + c2l * s2);
    Rb[i] += g * (c0r * s0 + c1r * s1 + c2r * s2);
    p0 += d0; if (p0 >= 1) p0 -= 1;
    p1 += d1; if (p1 >= 1) p1 -= 1;
    p2 += d2; if (p2 >= 1) p2 -= 1;
  }
}

function pluckNote(Lb, Rb, e) {
  const f = mtof(e.midi);
  const i0 = Math.round(e.t * SR); if (i0 >= N || i0 < 0) return;
  const tau = e.tau || 0.3 * Math.pow(523.25 / f, 0.3);
  const len = e.len || Math.min(1.6, tau * 5.5);
  const n = Math.min(N - i0, Math.round(len * SR));
  const nAtt = Math.round(0.003 * SR), nFade = Math.max(96, Math.round(Math.min(0.08, len * 0.3) * SR));
  const w = TAU * f / SR;
  const dE = Math.exp(-1 / (tau * SR)), dI = Math.exp(-1 / (0.07 * SR)), dT = Math.exp(-1 / (0.05 * SR));
  let env = 1, I = 1.25 * e.bright * (0.6 + 0.4 * e.vel), tk = 0.14 * e.bright;
  const I0 = 0.32 * e.bright; // small steady index keeps a little 2nd/3rd harmonic (clean, not sine-dull)
  const [gL, gR] = panGains(e.pan);
  const amp = 0.12 * e.vel;
  for (let k = 0; k < n; k++) {
    const ph = w * k;
    let g = env * amp;
    if (k < nAtt) g *= rc(k, nAtt);
    if (k > n - nFade) g *= rc(n - k, nFade);
    const y = (Math.sin(ph + (I + I0) * Math.sin(ph)) + tk * Math.sin(4 * ph)) * g;
    Lb[i0 + k] += y * gL; Rb[i0 + k] += y * gR;
    env *= dE; I *= dI; tk *= dT;
  }
}

function keysNote(Lb, Rb, midi, t, len, vel, pan) {
  const f = mtof(midi);
  const i0 = Math.round(t * SR); if (i0 >= N) return;
  const nOn = Math.round(len * SR), nRel = Math.round(0.14 * SR);
  const n = Math.min(N - i0, nOn + nRel);
  const nAtt = Math.round(0.005 * SR);
  const w = TAU * f / SR;
  const dE = Math.exp(-1 / (0.9 * SR)), dI = Math.exp(-1 / (0.22 * SR)), d2 = Math.exp(-1 / (0.3 * SR));
  let env = 1, I = 0.85, h2 = 0.15;
  const [gL, gR] = panGains(pan);
  const amp = 0.05 * vel;
  for (let k = 0; k < n; k++) {
    const ph = w * k;
    let g = env * amp;
    if (k < nAtt) g *= rc(k, nAtt);
    if (k >= nOn) g *= 0.5 + 0.5 * Math.cos(Math.PI * (k - nOn) / nRel);
    const y = (Math.sin(ph + I * Math.sin(ph)) + h2 * Math.sin(2 * ph)) * g;
    Lb[i0 + k] += y * gL; Rb[i0 + k] += y * gR;
    env *= dE; I *= dI; h2 *= d2;
  }
}

function bassNote(M, e) {
  const f = mtof(e.midi);
  const i0 = Math.round(e.t * SR); if (i0 >= N) return;
  const nOn = Math.round(e.len * SR), nRel = Math.round(0.07 * SR);
  const n = Math.min(N - i0, nOn + nRel);
  const nAtt = Math.round(0.008 * SR);
  const w = TAU * f / SR;
  const dD = Math.exp(-1 / ((e.decay || 0.3) * SR));
  const sus = e.decay ? 0 : 0.7;
  let dec = 1;
  const amp = 0.2 * e.vel;
  for (let k = 0; k < n; k++) {
    const ph = w * k;
    let g = (sus + (1 - sus) * dec) * amp;
    if (k < nAtt) g *= rc(k, nAtt);
    if (k >= nOn) g *= 0.5 + 0.5 * Math.cos(Math.PI * (k - nOn) / nRel);
    M[i0 + k] += (Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph)) * g;
    dec *= dD;
  }
}

function kickHit(Lb, Rb, t, vel) {
  const i0 = Math.round(t * SR); if (i0 >= N) return;
  const n = Math.min(N - i0, Math.round(0.38 * SR));
  const nAtt = Math.round(0.002 * SR), nFade = Math.round(0.04 * SR);
  let ph = 0;
  const dP = Math.exp(-1 / (0.03 * SR)), dE = Math.exp(-1 / (0.14 * SR));
  let sweep = 1, env = 1;
  const amp = 0.5 * vel;
  for (let k = 0; k < n; k++) {
    const f = 46 + 64 * sweep;
    let g = env * amp;
    if (k < nAtt) g *= rc(k, nAtt);
    if (k > n - nFade) g *= rc(n - k, nFade);
    const y = Math.sin(ph) * g;
    Lb[i0 + k] += y; Rb[i0 + k] += y;
    ph += TAU * f / SR; sweep *= dP; env *= dE;
  }
}

/** pre-rendered noise instruments (4 variants each, peak 1) */
function noiseSample(kind, variant) {
  const rn = L.mulberry32(base + 1000 + variant * 17 + (kind === 'clap' ? 0 : kind === 'hat' ? 100 : 200));
  const len = kind === 'clap' ? 0.32 : kind === 'hat' ? 0.1 : 0.09;
  const n = Math.round(len * SR);
  const y = new Float32Array(n);
  const f = new L.SVF();
  if (kind === 'clap') f.set(1350 + variant * 60, 0.85);
  else if (kind === 'hat') f.set(6000 + variant * 150, 0.9);
  else f.set(5000 + variant * 120, 1.2);
  const att = Math.round((kind === 'shaker' ? 0.008 : 0.002) * SR);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    let env;
    if (kind === 'clap') {
      env = 0;
      const bursts = [0, 0.0095, 0.0205];
      for (let j = 0; j < 3; j++) {
        const dt = t - bursts[j]; if (dt < 0) continue;
        const a = dt < 0.002 ? rc(dt * SR, 0.002 * SR) : 1;
        env += a * (j < 2 ? 0.7 * Math.exp(-dt / 0.005) : Math.exp(-dt / 0.065));
      }
    } else {
      env = (k < att ? rc(k, att) : 1) * Math.exp(-t / (kind === 'hat' ? 0.02 : 0.028));
    }
    const fadeN = Math.round(0.01 * SR);
    if (k > n - fadeN) env *= rc(n - k, fadeN);
    f.tick(rn() * 2 - 1);
    y[k] = f.band * env;
  }
  // soften the top end
  const lp = L.biquad('lp', kind === 'clap' ? 4500 : 9000, 0.707);
  L.filterInPlace(y, lp);
  let pk = 0; for (let k = 0; k < n; k++) pk = Math.max(pk, Math.abs(y[k]));
  for (let k = 0; k < n; k++) y[k] /= pk || 1;
  return y;
}
function placeSample(Lb, Rb, smp, t, gain, pan) {
  const i0 = Math.round(t * SR); if (i0 >= N || i0 < 0) return;
  const [gL, gR] = panGains(pan);
  const n = Math.min(smp.length, N - i0);
  for (let k = 0; k < n; k++) { const y = smp[k] * gain; Lb[i0 + k] += y * gL; Rb[i0 + k] += y * gR; }
}

function riserEvent(Lb, Rb, t0, t1) {
  const i0 = Math.max(0, Math.round(t0 * SR)), i1 = Math.min(N, Math.round(t1 * SR));
  const n = i1 - i0; if (n <= 0) return;
  const fl = new L.SVF(), fr = new L.SVF();
  const nEnd = Math.round(0.04 * SR);
  for (let k = 0; k < n; k++) {
    const x = k / n;
    if ((k & 31) === 0) { const fc = 450 * Math.pow(4200 / 450, Math.pow(x, 1.3)); fl.set(fc, 1.4); fr.set(fc * 1.03, 1.4); }
    let env = Math.pow(x, 2.2);
    if (k > n - nEnd) env *= rc(n - k, nEnd);
    fl.tick(rNoise() * 2 - 1); fr.tick(rNoise() * 2 - 1);
    Lb[i0 + k] += fl.band * env * 0.1; Rb[i0 + k] += fr.band * env * 0.1;
  }
}

function pingPong(Lb, Rb, delaySec, fb, wet) {
  const D = Math.round(delaySec * SR);
  const bl = new Float32Array(D), br = new Float32Array(D);
  const aLP = L.onePoleCoef(3200), aHP = L.onePoleCoef(300);
  let idx = 0, lpL = 0, lpR = 0, hpL = 0, hpR = 0;
  for (let i = 0; i < N; i++) {
    const x = 0.5 * (Lb[i] + Rb[i]);
    const yl = bl[idx], yr = br[idx];
    lpL += aLP * (yl - lpL); hpL += aHP * (lpL - hpL); const fL = lpL - hpL;
    lpR += aLP * (yr - lpR); hpR += aHP * (lpR - hpR); const fR = lpR - hpR;
    bl[idx] = x + fb * fR;
    br[idx] = fb * fL;
    Lb[i] += wet * fL; Rb[i] += wet * fR;
    if (++idx >= D) idx = 0;
  }
}

function freeverb(inL, inR, outL, outR, { room = 0.78, damp = 0.5, predelay = 0.02 } = {}) {
  const sc = SR / 44100;
  const CT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AT = [556, 441, 341, 225], SP = 23;
  const mk = (t) => new Float32Array(Math.round(t * sc));
  const cL = CT.map(mk), cR = CT.map((t) => mk(t + SP)), aL = AT.map(mk), aR = AT.map((t) => mk(t + SP));
  const ciL = new Int32Array(8), ciR = new Int32Array(8), aiL = new Int32Array(4), aiR = new Int32Array(4);
  const fsL = new Float64Array(8), fsR = new Float64Array(8);
  const fb = room * 0.28 + 0.7, d1 = damp * 0.4, d2 = 1 - d1;
  const pd = Math.round(predelay * SR);
  for (let i = 0; i < N; i++) {
    const j = i - pd;
    const x = j >= 0 ? (inL[j] + inR[j]) * 0.015 : 0;
    let l = 0, r = 0;
    for (let c = 0; c < 8; c++) {
      let b = cL[c], k = ciL[c], y = b[k];
      fsL[c] = y * d2 + fsL[c] * d1; b[k] = x + fsL[c] * fb; ciL[c] = k + 1 === b.length ? 0 : k + 1; l += y;
      b = cR[c]; k = ciR[c]; y = b[k];
      fsR[c] = y * d2 + fsR[c] * d1; b[k] = x + fsR[c] * fb; ciR[c] = k + 1 === b.length ? 0 : k + 1; r += y;
    }
    for (let a = 0; a < 4; a++) {
      let b = aL[a], k = aiL[a], bo = b[k];
      b[k] = l + bo * 0.5; aiL[a] = k + 1 === b.length ? 0 : k + 1; l = bo - l;
      b = aR[a]; k = aiR[a]; bo = b[k];
      b[k] = r + bo * 0.5; aiR[a] = k + 1 === b.length ? 0 : k + 1; r = bo - r;
    }
    outL[i] = l; outR[i] = r;
  }
}

// ------------------------------------------------------------------ render
const t0clock = Date.now();
const mL = new Float32Array(N), mR = new Float32Array(N);   // master
const sL = new Float32Array(N), sR = new Float32Array(N);   // reverb send
const xL = new Float32Array(N), xR = new Float32Array(N);   // scratch stem
const clearX = () => { xL.fill(0); xR.fill(0); };

// bar ranges for level measurement
const barsWhere = (pred) => bars.filter((B) => pred(B.st)).map((B) => [Math.round(B.t0 * SR), Math.min(N, Math.round(Math.min(B.t0 + bar, outroT) * SR))]);
function rmsRanges(Lb, Rb, ranges) {
  let s = 0, c = 0;
  for (const [a, b] of ranges) { for (let i = a; i < b; i++) s += Lb[i] * Lb[i] + (Rb ? Rb[i] * Rb[i] : Lb[i] * Lb[i]); c += 2 * (b - a); }
  return c ? Math.sqrt(s / c) : 0;
}
const bodyRanges = barsWhere((st) => st.type !== 'intro' && st.type !== 'arp');
const stemReport = {};
let padRef = 0;
/** add scratch stem to master (+ reverb send) calibrated to targetDb relative to pad RMS */
function commitStem(name, ranges, targetDb, send) {
  const r = rmsRanges(xL, xR, ranges);
  let g = 1;
  if (name === 'pad') { padRef = r; } else if (r > 0) g = padRef * L.undb(targetDb) / r;
  for (let i = 0; i < N; i++) {
    const l = xL[i] * g, rr = xR[i] * g;
    mL[i] += l; mR[i] += rr;
    if (send) { sL[i] += l * send; sR[i] += rr * send; }
  }
  stemReport[name] = { rel_to_pad_db: L.r2(name === 'pad' ? 0 : targetDb), measured_over_s: L.r2(ranges.reduce((a, [x, y]) => a + (y - x), 0) / SR, 1), calib_gain_db: L.r2(L.db(g)) };
  return g;
}

// kick-keyed pump curve (control rate 32 samples)
const CR = 32, nC = Math.ceil(N / CR) + 2;
const pump = new Float32Array(nC).fill(1);
for (const k of ev.kick) {
  const c0 = Math.floor(k.t * SR / CR);
  for (let c = c0; c < Math.min(nC, c0 + Math.round(0.45 * SR / CR)); c++) {
    const dt = (c * CR) / SR - k.t;
    const shape = dt < 0 ? 0 : dt < 0.01 ? dt / 0.01 : Math.exp(-(dt - 0.01) / 0.12);
    const g = 1 - 0.18 * k.vel * shape;
    if (g < pump[c]) pump[c] = g;
  }
}
const pumpAt = (i) => { const c = i / CR, c0 = Math.floor(c), f = c - c0; return pump[c0] + (pump[c0 + 1] - pump[c0]) * f; };

// 1) PAD ------------------------------------------------------------
for (const e of ev.pad) padNote(xL, xR, e);
{
  // section-automated low-pass (TPT SVF, 12 dB/oct, Q 0.6), smoothed in log-frequency
  const cutAt = new Float32Array(Math.ceil(N / CR) + 1);
  let cur = Math.log(bars.length ? bars[0].st.cutoff : 1500);
  const a = 1 - Math.exp(-CR / (0.8 * SR));
  for (let c = 0; c < cutAt.length; c++) {
    const t = c * CR / SR;
    const b = Math.floor(t / bar);
    const tgt = t >= outroT ? 1800 : (bars[b] ? bars[b].st.cutoff : 1800);
    cur += a * (Math.log(tgt) - cur);
    cutAt[c] = Math.exp(cur);
  }
  const fl = new L.SVF(), fr = new L.SVF();
  for (let i = 0; i < N; i++) {
    if (i % CR === 0) { const fc = cutAt[i / CR]; fl.set(fc, 0.6); fr.set(fc, 0.6); }
    xL[i] = fl.tick(xL[i]); xR[i] = fr.tick(xR[i]);
  }
  const lp2 = L.biquad('lp', 9000, 0.707), hp2 = L.biquad('hp', 110, 0.707), mud = L.biquad('peak', 320, 0.9, SR, -2);
  for (const ch of [xL, xR]) { L.filterInPlace(ch, lp2); L.filterInPlace(ch, hp2); L.filterInPlace(ch, mud); }
  for (let i = 0; i < N; i++) { const p = pumpAt(i); xL[i] *= p; xR[i] *= p; }
}
commitStem('pad', bodyRanges, 0, 0.28);
log('pad done', ((Date.now() - t0clock) / 1000).toFixed(1) + 's');

// 2) PLUCK + ping-pong delay ------------------------------------------
clearX();
for (const e of ev.pluck) pluckNote(xL, xR, e);
pingPong(xL, xR, 0.75 * beat, 0.35, 0.24);
commitStem('pluck', barsWhere((st) => st.arp && st.type !== 'arp'), -2.5, 0.3);
log('pluck done', ((Date.now() - t0clock) / 1000).toFixed(1) + 's');

// 3) KEYS -----------------------------------------------------------
if (ev.keys.length) {
  clearX();
  for (const k of ev.keys) k.notes.forEach((m, i) => keysNote(xL, xR, m, k.t + i * 0.004, k.len, k.vel * (0.9 + rHum() * 0.2), [-0.25, 0.1, -0.1, 0.25][i % 4]));
  commitStem('keys', barsWhere((st) => st.keys), -10, 0.3);
}

// 4) BASS -----------------------------------------------------------
clearX();
for (const e of ev.bass) bassNote(xL, e);
{
  const lp = L.biquad('lp', 420, 0.707); L.filterInPlace(xL, lp);
  for (let i = 0; i < N; i++) { const v = xL[i] * pumpAt(i); xL[i] = v; xR[i] = v; }
}
commitStem('bass', barsWhere((st) => !!st.bass), -3.5, 0);

// 5) DRUMS (each part calibrated separately) ---------------------------
clearX();
for (const k of ev.kick) kickHit(xL, xR, k.t, k.vel);
commitStem('kick', barsWhere((st) => !!st.kick), -9, 0);
if (ev.clap.length) {
  clearX();
  const cl = [0, 1, 2, 3].map((v) => noiseSample('clap', v));
  ev.clap.forEach((h, i) => placeSample(xL, xR, cl[i % 4], h.t, h.vel, (rHum() - 0.5) * 0.2));
  commitStem('clap', barsWhere((st) => st.clap), -21, 0.35);
}
if (ev.hat.length) {
  clearX();
  const hs = [0, 1, 2, 3].map((v) => noiseSample('hat', v));
  ev.hat.forEach((h, i) => placeSample(xL, xR, hs[(i * 3) % 4], h.t, h.vel, 0.3));
  commitStem('hat', barsWhere((st) => st.hat), -25, 0.05);
}
if (ev.shaker.length) {
  clearX();
  const ss = [0, 1, 2, 3].map((v) => noiseSample('shaker', v));
  ev.shaker.forEach((h, i) => placeSample(xL, xR, ss[i % 4], h.t, h.vel, -0.3));
  commitStem('shaker', barsWhere((st) => st.shaker), -28, 0.05);
}
// 6) RISERS -----------------------------------------------------------
if (ev.riser.length) {
  clearX();
  for (const r of ev.riser) riserEvent(xL, xR, r.t0, r.t1);
  const ranges = ev.riser.map((r) => [Math.round(r.t0 * SR), Math.round(r.t1 * SR)]);
  commitStem('riser', ranges, -13, 0.25);
}
log('stems done', ((Date.now() - t0clock) / 1000).toFixed(1) + 's');

// 7) REVERB -----------------------------------------------------------
{
  const hp = L.biquad('hp', 220, 0.707), lp = L.biquad('lp', 5000, 0.707);
  L.filterInPlace(sL, hp); L.filterInPlace(sR, hp); L.filterInPlace(sL, lp); L.filterInPlace(sR, lp);
  clearX();
  freeverb(sL, sR, xL, xR, { room: 0.8, damp: 0.5, predelay: 0.02 });
  commitStem('reverb', bodyRanges, -10, 0);
}
log('reverb done', ((Date.now() - t0clock) / 1000).toFixed(1) + 's');

// ------------------------------------------------------------------ master
{
  const hp = L.biquad('hp', 35, 0.707);
  const shelf = L.biquad('hs', 9000, 0.707, SR, -1.5);
  for (const ch of [mL, mR]) { L.filterInPlace(ch, hp); L.filterInPlace(ch, shelf); }
}
// normalise body RMS
const bodyA = Math.round(grooveBar * bar * SR), bodyB = Math.round(outroT * SR);
const rmsBody = L.rmsRange([mL, mR], Math.min(bodyA, bodyB - SR), bodyB);
const normGain = L.undb(RMS_DB) / rmsBody;
for (let i = 0; i < N; i++) { mL[i] *= normGain; mR[i] *= normGain; }
const peakBeforeLim = L.peakAbs([mL, mR]);
const lim = L.lookaheadLimiter([mL, mR], L.undb(PEAK_DB), { lookMs: 3, relMs: 120, truePeak: true });
// start ramp + outro fade to digital silence exactly at DUR
{
  const nIn = Math.round(0.01 * SR);
  for (let i = 0; i < nIn; i++) { const g = rc(i, nIn); mL[i] *= g; mR[i] *= g; }
  const fadeStart = outroT + Math.max(0.5, 0.3 * (DUR - outroT));
  const iF = Math.round(fadeStart * SR), nF = N - iF;
  const nZ = Math.round(0.05 * SR);
  for (let i = iF; i < N; i++) {
    const x = (i - iF) / nF;
    let g = L.undb(-60 * x);
    if (i >= N - nZ) g *= rc(N - 1 - i, nZ);
    mL[i] *= g; mR[i] *= g;
  }
  mL[N - 1] = 0; mR[N - 1] = 0;
}
const finalPeak = L.peakAbs([mL, mR]);
const finalRms = L.rmsRange([mL, mR], Math.min(bodyA, bodyB - SR), bodyB);
const wr = L.writeWav16(OUT, [mL, mR], SR, base + 99);

// ------------------------------------------------------------------ sidecar report
const secOut = sections.map((s) => ({
  type: s.type, start_s: L.r2(s.from * bar, 3), end_s: L.r2(Math.min(s.to * bar, outroT), 3), bars: s.to - s.from,
  progression: s.type === 'intro' || s.type === 'arp' || s.type === 'groove' ? PROGS.A.join('-') : PROGS[s.prog].join('-') + (s.to - s.from >= 24 ? ' then ' + PROGS[s.prog2].join('-') : ''),
  chords: bars.filter((B) => B.b >= s.from && B.b < s.to).map((B) => B.ch.name + (B.st.variant !== 'main' ? `(${B.st.variant})` : '')).join(' '),
}));
const arrangement = {
  tool: 'make_music.js', version: VERSION,
  params: { dur: DUR, bpm: BPM, key: KEY + ' major', seed: SEED, rms_db: RMS_DB, peak_db: PEAK_DB },
  samples: N, sample_rate: SR, channels: 2, bit_depth: 16,
  bar_s: L.r2(bar, 4), beat_s: L.r2(beat, 4),
  outro: { requested_s: outroReq, final_chord_at_s: L.r2(outroT, 3), fade_to_silence_at_s: DUR },
  lifts: { requested_s: liftReq.map((x) => L.r2(x, 3)), snapped_s: liftBars.map((b) => L.r2(b * bar, 3)) },
  entries: { pad_s: 0, pluck_s: L.r2(arpBar * bar, 3), bass_and_percussion_s: L.r2(grooveBar * bar, 3) },
  sections: secOut,
  final_chord: finalCh.name + ' [' + finalVoicing.join(',') + ']',
  stems: stemReport,
  events: Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v.length])),
  levels: {
    body_window_s: [L.r2(Math.min(bodyA, bodyB - SR) / SR, 2), L.r2(outroT, 2)],
    body_rms_dbfs: L.r2(L.db(finalRms)), final_sample_peak_dbfs: L.r2(L.db(finalPeak)),
    normalise_gain_db: L.r2(L.db(normGain)), peak_before_limiter_dbfs: L.r2(L.db(peakBeforeLim)),
    limiter: { ceiling_dbfs: PEAK_DB, inter_sample_peaks: true, limited_samples: lim.limitedSamples, max_reduction_db: L.r2(lim.maxReductionDb, 3) },
    wav_clipped_samples: wr.clipped,
  },
  warnings,
  render_seconds: L.r2((Date.now() - t0clock) / 1000, 1),
};
const jsonPath = OUT.replace(/\.wav$/i, '') + '.arrangement.json';
fs.writeFileSync(jsonPath, JSON.stringify(arrangement, null, 2));
for (const w of warnings) console.error('make_music: warning: ' + w);
log(`wrote ${OUT} (${DUR}s, ${N} frames) body RMS ${L.r2(L.db(finalRms))} dBFS, peak ${L.r2(L.db(finalPeak))} dBFS, ` +
  `limited ${lim.limitedSamples} samples, ${arrangement.render_seconds}s`);
log('arrangement ' + jsonPath);
