'use strict';
/*
 * lib.js - shared DSP helpers for the Progbiz video audio tools.
 * Pure Node (no dependencies). All audio is handled as Float32Array per
 * channel, full scale = 1.0, sample rate 48 kHz unless stated otherwise.
 *
 * Contents
 *   parseArgs, mulberry32 (seeded PRNG), db/undb
 *   readWav  (PCM 16/24/32 int, float 32/64, WAVE_FORMAT_EXTENSIBLE)
 *   writeWav16 (16-bit PCM, seeded TPDF dither, exact length)
 *   biquad (RBJ cookbook) + filterInPlace, onePole LP/HP helpers
 *   SVF (TPT state-variable filter, for time-varying cut-offs)
 *   loudness (ITU-R BS.1770-4 K-weighting + gating), segment energies
 *   truePeakEnvelope (4x oversampled inter-sample peak estimate)
 *   lookaheadLimiter (min-filter + box-smoothing + release, never overshoots)
 *   fft (radix-2, in place)
 */
const fs = require('fs');

const SR = 48000;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const k = a.slice(2);
      const nx = argv[i + 1];
      if (nx === undefined || nx.startsWith('--')) out[k] = true;
      else { out[k] = nx; i++; }
    } else out._.push(a);
  }
  return out;
}

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const undb = (d) => Math.pow(10, d / 20);
const pdb = (p) => (p > 0 ? 10 * Math.log10(p) : -Infinity); // power -> dB
const r2 = (x, n = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : (x > 0 ? 'inf' : '-inf'));

// ---------------------------------------------------------------- WAV I/O
function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(file + ': not a RIFF/WAVE file');
  }
  let pos = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const len = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      const ch = buf.readUInt16LE(body + 2), sr = buf.readUInt32LE(body + 4), bits = buf.readUInt16LE(body + 14);
      if (format === 0xFFFE && len >= 40) format = buf.readUInt16LE(body + 24);
      fmt = { format, ch, sr, bits };
    } else if (id === 'data') {
      dataOff = body;
      dataLen = (len === 0 || len === 0xFFFFFFFF || body + len > buf.length) ? buf.length - body : len;
      if (fmt) break;
    }
    pos = body + len + (len & 1);
  }
  if (!fmt || dataOff < 0) throw new Error(file + ': missing fmt or data chunk');
  const { format, ch, sr, bits } = fmt;
  const bps = bits / 8;
  const frames = Math.floor(dataLen / (bps * ch));
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(new Float32Array(frames));
  let off = dataOff;
  if (format === 1 && bits === 16) {
    for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) { chans[c][i] = buf.readInt16LE(off) / 32768; off += 2; }
  } else if (format === 1 && bits === 24) {
    for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) { chans[c][i] = buf.readIntLE(off, 3) / 8388608; off += 3; }
  } else if (format === 1 && bits === 32) {
    for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) { chans[c][i] = buf.readInt32LE(off) / 2147483648; off += 4; }
  } else if (format === 3 && bits === 32) {
    for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) { chans[c][i] = buf.readFloatLE(off); off += 4; }
  } else if (format === 3 && bits === 64) {
    for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) { chans[c][i] = buf.readDoubleLE(off); off += 8; }
  } else if (format === 1 && bits === 8) {
    for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) { chans[c][i] = (buf[off] - 128) / 128; off += 1; }
  } else {
    throw new Error(`${file}: unsupported WAV format ${format}/${bits}-bit`);
  }
  return { sr, ch, frames, chans };
}

/** Write 16-bit PCM WAV. Seeded TPDF dither (+-1 LSB) except on exact digital zero. */
function writeWav16(file, chans, sr = SR, seed = 1234) {
  const nc = chans.length, n = chans[0].length;
  const dataBytes = n * nc * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + dataBytes, 4); buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(nc, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * nc * 2, 28); buf.writeUInt16LE(nc * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii'); buf.writeUInt32LE(dataBytes, 40);
  const rnd = mulberry32(seed);
  let clipped = 0;
  const pcm = new Int16Array(n * nc);
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) {
      const x = chans[c][i];
      let v = 0;
      if (x !== 0) {
        v = Math.round(x * 32767 + (rnd() - rnd()));
        if (v > 32767) { v = 32767; clipped++; } else if (v < -32768) { v = -32768; clipped++; }
      }
      pcm[k++] = v;
    }
  }
  Buffer.from(pcm.buffer).copy(buf, 44);
  fs.writeFileSync(file, buf);
  return { clipped, frames: n, channels: nc };
}

// ---------------------------------------------------------------- filters
/** RBJ biquad coefficients. type: lp hp bp (0 dB peak) hs ls peak */
function biquad(type, f0, Q, sr = SR, gainDb = 0) {
  const w0 = 2 * Math.PI * Math.min(f0, sr * 0.49) / sr;
  const cw = Math.cos(w0), sw = Math.sin(w0), alpha = sw / (2 * Q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'ls': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'hs': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: throw new Error('biquad type ' + type);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Transposed direct form II, processes x into out (may be the same array). */
function filterInPlace(x, c, out = x, from = 0, to = x.length) {
  let z1 = 0, z2 = 0;
  const { b0, b1, b2, a1, a2 } = c;
  for (let i = from; i < to; i++) {
    const xi = x[i];
    const y = b0 * xi + z1;
    z1 = b1 * xi - a1 * y + z2;
    z2 = b2 * xi - a2 * y;
    out[i] = y;
  }
  return out;
}

/** one-pole low-pass coefficient for cut-off fc */
const onePoleCoef = (fc, sr = SR) => 1 - Math.exp(-2 * Math.PI * fc / sr);

function onePoleLP(x, fc, sr = SR) {
  const a = onePoleCoef(fc, sr); let s = 0;
  for (let i = 0; i < x.length; i++) { s += a * (x[i] - s); x[i] = s; }
  return x;
}
function onePoleHP(x, fc, sr = SR) {
  const a = onePoleCoef(fc, sr); let s = 0;
  for (let i = 0; i < x.length; i++) { s += a * (x[i] - s); x[i] = x[i] - s; }
  return x;
}

/** Topology-preserving-transform state variable filter (Zavalishin). */
class SVF {
  constructor(sr = SR) { this.sr = sr; this.ic1 = 0; this.ic2 = 0; this.set(1000, 0.707); }
  set(fc, Q) {
    const g = Math.tan(Math.PI * Math.min(fc, this.sr * 0.45) / this.sr);
    this.k = 1 / Q;
    this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  /** returns [low, band, high] via fields to avoid allocations */
  tick(v0) {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.low = v2; this.band = v1; this.high = v0 - this.k * v1 - v2;
    return v2;
  }
}

// ---------------------------------------------------------------- loudness (BS.1770-4)
/** K-weighting biquads for any sample rate (same formulas as pyloudnorm / libebur128). */
function kWeightCoeffs(sr = SR) {
  const G = 3.999843853973347, f0 = 1681.974450955533, Q = 0.7071752369554196;
  const K = Math.tan(Math.PI * f0 / sr);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  const s1 = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0,
    a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773;
  const K1 = Math.tan(Math.PI * f1 / sr);
  const d = 1 + K1 / Q1 + K1 * K1;
  const s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K1 * K1 - 1) / d, a2: (1 - K1 / Q1 + K1 * K1) / d };
  return [s1, s2];
}

/**
 * K-weighted energy per 100 ms segment, summed over channels (all G_i = 1:
 * only L/R/C style channels are used here). Returns Float64Array of
 * sum_c sum_n y_c[n]^2 per segment (segment = sr/10 samples).
 */
function kSegmentEnergies(chans, sr = SR, gain = 1) {
  const seg = Math.round(sr / 10);
  const n = chans[0].length;
  const nseg = Math.floor(n / seg);
  const e = new Float64Array(nseg);
  const [s1, s2] = kWeightCoeffs(sr);
  const tmp = new Float32Array(n);
  for (const ch of chans) {
    for (let i = 0; i < n; i++) tmp[i] = ch[i] * gain;
    filterInPlace(tmp, s1); filterInPlace(tmp, s2);
    for (let s = 0; s < nseg; s++) {
      let acc = 0; const o = s * seg;
      for (let i = 0; i < seg; i++) { const y = tmp[o + i]; acc += y * y; }
      e[s] += acc;
    }
  }
  return { e, seg };
}

/** loudness (LUFS) of a window of W segments starting at segment j */
function windowLoudness(segE, seg, j, W) {
  let acc = 0; for (let k = 0; k < W; k++) acc += segE[j + k];
  const z = acc / (W * seg);
  return z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity;
}

/** Integrated loudness with absolute (-70) and relative (-10 LU) gates. */
function integratedFromSegments(segE, seg) {
  const nb = segE.length - 3;
  if (nb <= 0) return -Infinity;
  const z = new Float64Array(nb);
  for (let j = 0; j < nb; j++) z[j] = (segE[j] + segE[j + 1] + segE[j + 2] + segE[j + 3]) / (4 * seg);
  const L = (zz) => -0.691 + 10 * Math.log10(zz);
  let s = 0, c = 0;
  for (let j = 0; j < nb; j++) if (z[j] > 0 && L(z[j]) > -70) { s += z[j]; c++; }
  if (!c) return -Infinity;
  const rel = L(s / c) - 10;
  let s2 = 0, c2 = 0;
  for (let j = 0; j < nb; j++) if (z[j] > 0 && L(z[j]) > -70 && L(z[j]) > rel) { s2 += z[j]; c2++; }
  return c2 ? L(s2 / c2) : -Infinity;
}

function integratedLoudness(chans, sr = SR) {
  const { e, seg } = kSegmentEnergies(chans, sr);
  return integratedFromSegments(e, seg);
}

/** momentary (400 ms) or short-term (3 s) loudness series at 100 ms hop. Index j = window starting at j*100ms */
function loudnessSeries(segE, seg, W) {
  const n = Math.max(0, segE.length - W + 1);
  const out = new Float64Array(n);
  let acc = 0;
  for (let k = 0; k < W && k < segE.length; k++) acc += segE[k];
  for (let j = 0; j < n; j++) {
    const z = acc / (W * seg);
    out[j] = z > 1e-20 ? -0.691 + 10 * Math.log10(z) : -200;
    if (j + W < segE.length) acc += segE[j + W] - segE[j];
  }
  return out;
}

// ---------------------------------------------------------------- peaks / limiting
/** 4x oversampling inter-sample peak interpolator taps (windowed sinc, 12 taps per phase ~ BS.1770 Annex 2 size). */
function makeTpTaps() {
  const P = 4, H = 6; // 12 taps per phase
  const phases = [];
  for (let p = 1; p < P; p++) {
    const frac = p / P, taps = new Float64Array(2 * H);
    let sum = 0;
    for (let k = -H + 1; k <= H; k++) {
      const x = k - frac; // distance from interpolation point
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos(Math.PI * x / (H + 0.5));
      taps[k + H - 1] = sinc * w; sum += sinc * w;
    }
    for (let i = 0; i < taps.length; i++) taps[i] /= sum;
    phases.push({ frac, taps, H });
  }
  return phases;
}
const TP_PHASES = makeTpTaps();

/** per-sample peak envelope = max over channels of |x[n]| and interpolated peaks between n-1 and n+1 */
function truePeakEnvelope(chans) {
  const n = chans[0].length;
  const env = new Float32Array(n);
  for (const x of chans) {
    for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > env[i]) env[i] = a; }
    // interpolated points between i and i+1
    for (const { taps, H } of TP_PHASES) {
      for (let i = H - 1; i < n - H; i++) {
        // cheap skip: interpolated value cannot exceed sum |x| * max tap, test neighbours first
        const a0 = Math.abs(x[i]), a1 = Math.abs(x[i + 1]);
        if (a0 < 0.25 && a1 < 0.25) continue; // well below any ceiling we use (overshoot is < 3.5 dB for 12 taps)
        let y = 0;
        for (let k = 0; k < 2 * H; k++) y += taps[k] * x[i - H + 1 + k];
        const ay = Math.abs(y);
        if (ay > env[i]) env[i] = ay;
        if (ay > env[i + 1]) env[i + 1] = ay;
      }
    }
  }
  return env;
}

function samplePeakEnvelope(chans) {
  const n = chans[0].length; const env = new Float32Array(n);
  for (const x of chans) for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > env[i]) env[i] = a; }
  return env;
}

/** sliding window minimum, window [i-L, i+L] (monotonic deque, O(n)) */
function slidingMinCentered(r, L) {
  const n = r.length, out = new Float32Array(n);
  const dq = new Int32Array(n + 1); let h = 0, t = 0;
  let j = 0; // next index to push
  for (let i = 0; i < n; i++) {
    const hi = Math.min(n - 1, i + L);
    while (j <= hi) { while (t > h && r[dq[t - 1]] >= r[j]) t--; dq[t++] = j; j++; }
    while (dq[h] < i - L) h++;
    out[i] = r[dq[h]];
  }
  return out;
}

/**
 * Look-ahead peak limiter (linked across channels). Guarantees
 * |out| <= ceiling on the given peak envelope. lookMs = attack/look-ahead,
 * relMs = release time constant. Modifies chans in place. Returns stats.
 */
function lookaheadLimiter(chans, ceiling, { lookMs = 3, relMs = 80, sr = SR, truePeak = true } = {}) {
  const n = chans[0].length;
  const env = truePeak ? truePeakEnvelope(chans) : samplePeakEnvelope(chans);
  const r = new Float32Array(n);
  let need = 0;
  for (let i = 0; i < n; i++) { r[i] = env[i] > ceiling ? ceiling / env[i] : 1; if (r[i] < 1) need++; }
  if (!need) return { limitedSamples: 0, maxReductionDb: 0, envPeak: maxOf(env) };
  const L = Math.max(1, Math.round(lookMs * sr / 1000));
  const h = slidingMinCentered(r, L);
  // centred box average of h (width 2L+1, padded with 1). Every h[k] in the
  // window is <= r[i], so the average is too -> no overshoot, smooth attack.
  const g = new Float32Array(n);
  const W = 2 * L + 1;
  const hv = (k) => ((k < 0 || k >= n) ? 1 : h[k]);
  let acc = 0;
  for (let k = -L; k <= L; k++) acc += hv(k);
  for (let i = 0; i < n; i++) {
    const v = acc / W;
    g[i] = v > r[i] ? r[i] : v; // edge padding safety
    acc += hv(i + L + 1) - hv(i - L);
  }
  // release: forward, only slow recovery upward
  const rc = 1 - Math.exp(-1 / (relMs * sr / 1000));
  let gr = 1, limited = 0, minG = 1;
  for (let i = 0; i < n; i++) {
    const tgt = g[i];
    gr = tgt < gr ? tgt : gr + (tgt - gr) * rc;
    if (gr < 0.99989) limited++;
    if (gr < minG) minG = gr;
    for (const x of chans) x[i] *= gr;
  }
  return { limitedSamples: limited, maxReductionDb: -db(minG), envPeak: maxOf(env) };
}

function maxOf(a) { let m = 0; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
function peakAbs(chans) { let m = 0; for (const x of chans) for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; }
function rmsRange(chans, a = 0, b = chans[0].length) {
  let s = 0; let c = 0;
  for (const x of chans) { for (let i = a; i < b; i++) s += x[i] * x[i]; c += b - a; }
  return c ? Math.sqrt(s / c) : 0;
}

// ---------------------------------------------------------------- FFT
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// ---------------------------------------------------------------- reverb / pink noise (keynote style + SFX)
/**
 * Freeverb-style stereo reverb (8 parallel damped combs + 4 series all-passes
 * per side, right side detuned by 23 samples). Works on buffers of any length
 * (default make_music.js keeps its own copy so that its output stays
 * byte-identical). Wet signal only; input is mono-summed and scaled by `gain`.
 */
function freeverb(inL, inR, outL, outR, { room = 0.78, damp = 0.5, predelay = 0.02, gain = 0.015, sr = SR } = {}) {
  const n = inL.length;
  const sc = sr / 44100;
  const CT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AT = [556, 441, 341, 225], SP = 23;
  const mk = (t) => new Float32Array(Math.round(t * sc));
  const cL = CT.map(mk), cR = CT.map((t) => mk(t + SP)), aL = AT.map(mk), aR = AT.map((t) => mk(t + SP));
  const ciL = new Int32Array(8), ciR = new Int32Array(8), aiL = new Int32Array(4), aiR = new Int32Array(4);
  const fsL = new Float64Array(8), fsR = new Float64Array(8);
  const fb = room * 0.28 + 0.7, d1 = damp * 0.4, d2 = 1 - d1;
  const pd = Math.round(predelay * sr);
  for (let i = 0; i < n; i++) {
    const j = i - pd;
    const x = j >= 0 ? (inL[j] + inR[j]) * gain : 0;
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

/** Pink noise (-3 dB/oct) by Paul Kellet's economy filter, seeded. Used as the spectral reference in analyze.js. */
function pinkNoise(n, rnd) {
  let b0 = 0, b1 = 0, b2 = 0;
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
    y[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
  }
  return y;
}

module.exports = {
  SR, parseArgs, mulberry32, db, undb, pdb, r2, readWav, writeWav16,
  biquad, filterInPlace, onePoleCoef, onePoleLP, onePoleHP, SVF,
  kWeightCoeffs, kSegmentEnergies, windowLoudness, integratedFromSegments, integratedLoudness, loudnessSeries,
  truePeakEnvelope, samplePeakEnvelope, slidingMinCentered, lookaheadLimiter, maxOf, peakAbs, rmsRange, fft,
  freeverb, pinkNoise,
};
