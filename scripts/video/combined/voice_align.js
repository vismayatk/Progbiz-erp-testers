'use strict';
/** Shared by make_video_combined.js and check_voice_parts.js: find how much a voice-changed track is shifted against its guide. */

/** Loudness envelope (1 ms steps, compressed) of a 48 kHz mono Float32Array. */
function envelope(x) {
  const hop = 48, n = Math.floor(x.length / hop), e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let a = 0; for (let j = i * hop; j < (i + 1) * hop; j++) a += x[j] * x[j]; e[i] = Math.sqrt(Math.sqrt(a / hop)); }
  return e;
}

/** Pearson correlation of a[i0..i1) with b[i0+l ..]. */
function corrAt(a, b, i0, i1, l) {
  const lo = Math.max(i0, -l), hi = Math.min(i1, b.length - l);
  if (hi - lo < 50) return -2;
  let ma = 0, mb = 0;
  for (let i = lo; i < hi; i++) { ma += a[i]; mb += b[i + l]; }
  ma /= hi - lo; mb /= hi - lo;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = lo; i < hi; i++) { const x = a[i] - ma, y = b[i + l] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb + 1e-12);
}

/** Shift (ms and samples) with ret[i + shift] = guide[i], by normalised cross-correlation of the envelopes within +-rangeMs. */
function alignShift(guide, ret, rangeMs = 400) {
  const a = envelope(guide), b = envelope(ret);
  let best = -2, bl = 0;
  for (let l = -rangeMs; l <= rangeMs; l++) { const c = corrAt(a, b, 0, a.length, l); if (c > best) { best = c; bl = l; } }
  return { shift: bl * 48, ms: bl, corr: best };
}

module.exports = { envelope, corrAt, alignShift };
