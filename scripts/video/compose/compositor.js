/*
 * Frame-stepped compositor (the way Remotion works, without Remotion).
 *
 *   await window.loadTimeline(resolvedTimeline)   -> { duration, fps, frames, scenes, warnings }
 *   await window.renderAt(tSeconds)               -> draws the complete frame for that instant and
 *                                                    resolves when every image it needs is decoded
 *
 * Rules kept throughout this file:
 *   - every visual value is a pure function of the timeline time t: no wall clock, no CSS
 *     transitions or animations, no requestAnimationFrame timing;
 *   - the whole frame is drawn into ONE <canvas> in immediate mode. Nothing is left to the
 *     browser's layer cache, so a frame looks the same whatever was rendered before it
 *     (random access, range previews and parallel workers all give identical pictures);
 *   - overlays are drawn in SCREEN space at output resolution, so text stays crisp at any zoom;
 *     text lives in pre-rendered sprites that are placed on whole pixels whenever they rest.
 *
 * "Resolved" timeline = the TIMELINE.md schema after render.js turned paths into file:// URLs
 * and inlined every shot's meta.json (frames + events).
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ utils
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, u) => a + (b - a) * u;
  const EASE = {
    linear: u => u,
    in: u => u * u * u,
    out: u => 1 - Math.pow(1 - u, 3),
    inOut: u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
    inOutSine: u => -(Math.cos(Math.PI * u) - 1) / 2,
    inOutQuad: u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
    inOutQuint: u => (u < 0.5 ? 16 * u * u * u * u * u : 1 - Math.pow(-2 * u + 2, 5) / 2),
    outQuart: u => 1 - Math.pow(1 - u, 4),
    minJerk: u => u * u * u * (10 - 15 * u + 6 * u * u),
    hold: u => (u >= 1 ? 1 : 0),
  };
  const ease = (name, u) => (EASE[name] || EASE.inOut)(clamp(u, 0, 1));

  function hexToRgb(hex) {
    let h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return [37, 99, 235];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };
  // visibility envelope of something shown from `start` to `end` with fades
  function envelope(lt, start, end, fin, fout) {
    if (lt < start || lt > end) return 0;
    const a = fin > 0 ? clamp((lt - start) / fin, 0, 1) : 1;
    const b = fout > 0 ? clamp((end - lt) / fout, 0, 1) : 1;
    return Math.min(a, b);
  }
  const asRect = v => (Array.isArray(v) && v.length >= 4 ? [+v[0], +v[1], +v[2], +v[3]] : Array.isArray(v) && v.length >= 2 ? [+v[0], +v[1], 0, 0] : null);
  // A rectangle that may move: `rect` (static) or `keys` = [{ t, rect, ease }] (scene-local seconds).
  // Returns a function lt -> [x, y, w, h], or null when neither is usable.
  function rectTrack(rect, keys) {
    if (Array.isArray(keys) && keys.length) {
      const K = keys.map(k => ({ t: +k.t, r: asRect(k.rect), ease: k.ease || 'linear' })).filter(k => k.r).sort((a, b) => a.t - b.t);
      if (K.length) {
        return lt => {
          if (lt <= K[0].t) return K[0].r;
          if (lt >= K[K.length - 1].t) return K[K.length - 1].r;
          let i = 0;
          while (i < K.length - 2 && lt >= K[i + 1].t) i++;
          const a = K[i], b = K[i + 1];
          const u = ease(b.ease, (lt - a.t) / Math.max(1e-9, b.t - a.t));
          return [lerp(a.r[0], b.r[0], u), lerp(a.r[1], b.r[1], u), lerp(a.r[2], b.r[2], u), lerp(a.r[3], b.r[3], u)];
        };
      }
    }
    const r = asRect(rect);
    return r ? () => r : null;
  }
  const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  // appends a rounded rectangle to the current path (no beginPath)
  function rr(ctx, x, y, w, h, r) {
    const k = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + k, y);
    ctx.arcTo(x + w, y, x + w, y + h, k);
    ctx.arcTo(x + w, y + h, x, y + h, k);
    ctx.arcTo(x, y + h, x, y, k);
    ctx.arcTo(x, y, x + w, y, k);
    ctx.closePath();
  }

  // ------------------------------------------------------------------ state
  const DEFAULT_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const ST = { tl: null, W: 1920, H: 1080, fps: 30, scenes: [], warnings: [], debug: false, cacheMax: 6, font: DEFAULT_FONT };

  // ------------------------------------------------------ image (bitmap) cache
  const cache = new Map();
  let cacheTick = 0;
  function loadBitmap(url) {
    let e = cache.get(url);
    if (!e) {
      e = { url, bmp: null, w: 0, h: 0, last: 0 };
      e.promise = (async () => {
        const img = new Image();
        img.decoding = 'sync';
        img.src = url;
        try { await img.decode(); } catch (err) { throw new Error(`cannot decode image ${url}: ${err && err.message ? err.message : err}`); }
        e.bmp = await createImageBitmap(img);
        e.w = e.bmp.width; e.h = e.bmp.height;
        return e;
      })();
      e.promise.catch(() => cache.delete(url));
      cache.set(url, e);
    }
    e.last = ++cacheTick;
    return e.promise;
  }
  function evict(keep) {
    if (cache.size <= ST.cacheMax) return;
    const victims = [...cache.values()].filter(e => e.bmp && !keep.has(e.url)).sort((a, b) => a.last - b.last);
    while (cache.size > ST.cacheMax && victims.length) {
      const v = victims.shift();
      try { v.bmp.close(); } catch (_) { /* ignore */ }
      cache.delete(v.url);
    }
  }

  // ----------------------------------------------------------------- camera
  const MAX_ZOOM = 2.5;
  function clampCam(sc, c) {
    const z = clamp(c.z, 1, MAX_ZOOM);
    const hw = sc.SW / (2 * z), hh = sc.SH / (2 * z);
    return { z, cx: clamp(c.cx, hw, sc.SW - hw), cy: clamp(c.cy, hh, sc.SH - hh) };
  }
  function normCamera(sc) {
    const out = [];
    for (const k of (sc.camera || [])) {
      let z, cx, cy;
      if (k.rect) {
        const [x, y, w, h] = k.rect;
        const pad = k.padding == null ? 80 : k.padding;
        const fit = Math.min(sc.SW / (w + 2 * pad), sc.SH / (h + 2 * pad));
        z = k.zoom == null ? fit : k.zoom;
        cx = x + w / 2; cy = y + h / 2;
      } else {
        z = k.zoom == null ? 1 : k.zoom;
        cx = k.focus ? k.focus[0] : sc.SW / 2;
        cy = k.focus ? k.focus[1] : sc.SH / 2;
      }
      if (k.zoom != null && (z < 1 - 1e-9 || z > MAX_ZOOM + 1e-9)) ST.warnings.push(`scene ${sc.id}: camera zoom ${z.toFixed(2)} at t=${k.t} clamped to [1, ${MAX_ZOOM}]`);
      const c = clampCam(sc, { z, cx, cy });
      out.push({ t: +k.t || 0, z: c.z, cx: c.cx, cy: c.cy, ease: k.ease || 'inOut' });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }
  // log-zoom + linear centre: provably stays inside the source when both ends do
  function cameraAt(sc, lt) {
    const K = sc.cam;
    if (!K.length) return { z: 1, cx: sc.SW / 2, cy: sc.SH / 2 };
    if (lt <= K[0].t) return { z: K[0].z, cx: K[0].cx, cy: K[0].cy };
    const last = K[K.length - 1];
    if (lt >= last.t) return { z: last.z, cx: last.cx, cy: last.cy };
    let i = 0;
    while (i < K.length - 2 && lt >= K[i + 1].t) i++;
    const a = K[i], b = K[i + 1];
    const u = ease(b.ease, (lt - a.t) / Math.max(1e-9, b.t - a.t));
    const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), u));
    return clampCam(sc, { z, cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u) });
  }
  function view(sc, cam) {
    const vw = sc.SW / cam.z, vh = sc.SH / cam.z;
    return { vx: cam.cx - vw / 2, vy: cam.cy - vh / 2, vw, vh, s: cam.z * ST.W / sc.SW };
  }
  const toScreen = (v, x, y) => [(x - v.vx) * v.s, (y - v.vy) * v.s];
  function screenRect(v, r, pad) {
    const p = pad || 0;
    const l = (r[0] - p - v.vx) * v.s, t = (r[1] - p - v.vy) * v.s;
    const w = (r[2] + 2 * p) * v.s, h = (r[3] + 2 * p) * v.s;
    return { l, t, w, h, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 };
  }
  function cameraMoving(sc, lt) {
    const d = 0.5 / ST.fps;
    const a = cameraAt(sc, lt - d), b = cameraAt(sc, lt + d);
    return Math.abs(a.z - b.z) > 1e-6 || Math.abs(a.cx - b.cx) > 1e-4 || Math.abs(a.cy - b.cy) > 1e-4;
  }

  // ------------------------------------------------ source time (shot scenes)
  function buildTimeMap(sc) {
    const s = sc.source, dur = sc.dur;
    let pts;
    if (Array.isArray(s.time_map) && s.time_map.length >= 2) {
      pts = s.time_map.map(p => ({ t: +p.t, src: +p.src })).sort((a, b) => a.t - b.t);
      for (let i = 1; i < pts.length; i++) if (pts[i].src < pts[i - 1].src) { ST.warnings.push(`scene ${sc.id}: time_map runs backwards at t=${pts[i].t}; clamped`); pts[i].src = pts[i - 1].src; }
    } else if (s.freeze_at != null) {
      pts = [{ t: 0, src: +s.freeze_at }, { t: dur, src: +s.freeze_at }];
    } else {
      const off = +s.offset || 0, sp = s.speed == null ? 1 : +s.speed;
      if (s.hold_from != null && +s.hold_from < dur) {
        const h = Math.max(0, +s.hold_from);
        pts = [{ t: 0, src: off }, { t: h, src: off + sp * h }, { t: dur, src: off + sp * h }];
      } else pts = [{ t: 0, src: off }, { t: dur, src: off + sp * dur }];
    }
    return pts;
  }
  function srcTimeAt(sc, lt) {
    const p = sc.tmap;
    const t = clamp(lt, 0, sc.dur);
    if (t <= p[0].t) return p[0].src;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      if (t <= b.t) return b.t === a.t ? b.src : lerp(a.src, b.src, (t - a.t) / (b.t - a.t));
    }
    return p[p.length - 1].src;
  }
  // scene-local time at which a source instant is shown; null = never shown
  function sceneTimeOf(sc, ts) {
    const p = sc.tmap;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      if (b.src > a.src && ts >= a.src && ts <= b.src) return a.t + (ts - a.src) / (b.src - a.src) * (b.t - a.t);
    }
    const first = p[0], last = p[p.length - 1];
    if (ts <= first.src) {
      let rate = 1;
      for (let i = 0; i < p.length - 1; i++) if (p[i + 1].src > p[i].src && p[i + 1].t > p[i].t) { rate = (p[i + 1].src - p[i].src) / (p[i + 1].t - p[i].t); break; }
      return first.t - (first.src - ts) / rate;
    }
    if (ts >= last.src) {
      const a = p[p.length - 2];
      const rate = last.t > a.t ? (last.src - a.src) / (last.t - a.t) : 0;
      if (rate <= 0) return ts === last.src ? last.t : null;
      return last.t + (ts - last.src) / rate;
    }
    return null;
  }
  function frameIndexAt(frames, tms) {
    let lo = 0, hi = frames.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t_ms <= tms + 1e-6) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  // ------------------------------------------------------------ cursor track
  // The events log (or the hand-authored waypoints) is read as a series of MOVEMENTS
  // separated by rests. A movement whose recorded duration is plausible for a hand is
  // kept as recorded (and only smoothed). A movement that is too quick to follow -
  // typically the single "teleport" move that Playwright logs right before a click -
  // is re-timed: the pointer leaves its resting place earlier and glides along the same
  // path with a minimum-jerk profile, arriving `settle_ms` before the click.
  function buildCursor(sc) {
    const c = sc.cursor;
    if (!c || c.mode === 'none') return null;
    const mode = c.mode || (c.points ? 'waypoints' : 'events');
    const o = {
      size: c.size == null ? 1.6 : +c.size,
      smooth: (c.smooth_ms == null ? 120 : +c.smooth_ms) / 1000,
      settle: (c.settle_ms == null ? 180 : +c.settle_ms) / 1000,
      gap: (c.gap_ms == null ? 120 : +c.gap_ms) / 1000,
      curve: c.curve == null ? 0.06 : +c.curve,
      show: Array.isArray(c.show) ? c.show : null,
      ripple: c.ripple !== false,
    };
    const samples = [], clicks = [];
    if (mode === 'waypoints') {
      for (const p of (c.points || [])) {
        samples.push({ t: +p.t, x: +p.x, y: +p.y, way: true, move: p.move, down: !!p.click });
        if (p.click) clicks.push({ t: +p.t, x: +p.x, y: +p.y });
      }
    } else {
      const evs = c.events || (sc.source && sc.source.events) || [];
      for (const e of evs) {
        if (typeof e.x !== 'number' || typeof e.y !== 'number') continue;
        if (e.type !== 'move' && e.type !== 'down' && e.type !== 'up') continue;
        const lt = sc.tmap ? sceneTimeOf(sc, e.t_ms / 1000) : e.t_ms / 1000;
        if (lt == null) continue;
        samples.push({ t: lt, x: e.x, y: e.y, down: e.type === 'down' });
        if (e.type === 'down') clicks.push({ t: lt, x: e.x, y: e.y });
      }
    }
    samples.forEach((s, i) => { s.i = i; });
    samples.sort((a, b) => a.t - b.t || a.i - b.i);
    clicks.sort((a, b) => a.t - b.t);
    if (!samples.length) return null;

    // 1. clusters = uninterrupted streams of samples
    const clusters = [];
    let cur = null;
    for (const s of samples) {
      const prev = cur && cur.pts[cur.pts.length - 1];
      let split = !cur || s.way || s.t - cur.te > o.gap;
      // a stream that opens with a jump and then keeps moving: the jump is a movement of its own
      if (!split && cur.pts.length === 1 && cur.from && Math.hypot(prev.x - cur.from.x, prev.y - cur.from.y) > 40 && Math.hypot(s.x - prev.x, s.y - prev.y) > 2) split = true;
      if (split) { cur = { pts: [s], ts: s.t, te: s.t, way: !!s.way, move: s.move, from: prev ? { x: prev.x, y: prev.y } : null }; clusters.push(cur); }
      else { cur.pts.push(s); cur.te = s.t; }
    }
    // 2. one segment per movement
    const segs = [];
    const start = { x: samples[0].x, y: samples[0].y };
    let pos = start, tFree = -Infinity;
    for (const cl of clusters) {
      const end = cl.pts[cl.pts.length - 1];
      let k = cl.pts.length - 1;                       // trim the trailing rest (move, down, up on one spot)
      while (k > 0 && Math.hypot(cl.pts[k - 1].x - end.x, cl.pts[k - 1].y - end.y) <= 2) k--;
      const tArr = cl.pts[k].t;
      const path = [{ x: pos.x, y: pos.y }].concat(cl.pts.slice(0, k + 1).map(p => ({ x: p.x, y: p.y })));
      const times = [Math.max(cl.ts - 0.016, Math.min(cl.ts, tFree))].concat(cl.pts.slice(0, k + 1).map(p => p.t));
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
      const L = cum[cum.length - 1];
      if (L >= 1) {
        const natural = tArr - cl.ts;
        const D = cl.move != null ? +cl.move : clamp(0.30 + L / 2400, 0.34, 0.95);
        const drag = cl.pts.slice(0, k).some(p => p.down);
        if (!cl.way && (drag || L < 6 || natural >= 0.7 * D)) {
          segs.push({ kind: 'rec', t0: times[0], t1: tArr, path, times, end: path[path.length - 1] });
        } else {
          const clickSoon = clicks.some(q => q.t >= tArr - 1e-6 && q.t - tArr <= 0.25);
          let t1 = tArr - (clickSoon ? o.settle : 0);
          const t0 = Math.max(t1 - D, tFree + 0.04);
          if (t1 - t0 < 0.14) t1 = Math.min(tArr, t0 + 0.14);
          if (t1 <= t0) t1 = t0 + 0.001;
          const sg = { kind: 'glide', t0, t1, path, cum, L, end: path[path.length - 1] };
          if (path.length === 2 && o.curve) {            // straight hop: give it a slight, deterministic bow
            const a = path[0], b = path[1], dx = b.x - a.x, dy = b.y - a.y;
            let nx = dy / L, ny = -dx / L;
            if (ny > 0) { nx = -nx; ny = -ny; }
            const bow = Math.min(L * o.curve, 48);
            sg.q = { x: (a.x + b.x) / 2 + nx * bow, y: (a.y + b.y) / 2 + ny * bow };
          }
          segs.push(sg);
        }
        tFree = Math.max(cl.te, segs[segs.length - 1].t1);
      } else tFree = Math.max(tFree, cl.te);
      pos = { x: end.x, y: end.y };
    }
    return { o, segs, start, clicks };
  }
  function evalTrack(tr, t) {
    const S = tr.segs;
    if (!S.length || t <= S[0].t0) return [tr.start.x, tr.start.y];
    let lo = 0, hi = S.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid].t0 <= t) lo = mid; else hi = mid - 1; }
    const s = S[lo];
    if (t >= s.t1) return [s.end.x, s.end.y];
    if (s.kind === 'glide') {
      const u = EASE.minJerk((t - s.t0) / (s.t1 - s.t0));
      if (s.q) {
        const a = s.path[0], b = s.path[1], v = 1 - u;
        return [v * v * a.x + 2 * v * u * s.q.x + u * u * b.x, v * v * a.y + 2 * v * u * s.q.y + u * u * b.y];
      }
      const d = u * s.L;
      let i = 1;
      while (i < s.cum.length - 1 && s.cum[i] < d) i++;
      const f = (d - s.cum[i - 1]) / Math.max(1e-9, s.cum[i] - s.cum[i - 1]);
      return [lerp(s.path[i - 1].x, s.path[i].x, f), lerp(s.path[i - 1].y, s.path[i].y, f)];
    }
    let i = 1;
    while (i < s.times.length - 1 && s.times[i] < t) i++;
    const f = clamp((t - s.times[i - 1]) / Math.max(1e-9, s.times[i] - s.times[i - 1]), 0, 1);
    return [lerp(s.path[i - 1].x, s.path[i].x, f), lerp(s.path[i - 1].y, s.path[i].y, f)];
  }
  function cursorAt(track, lt) {
    let w = track.o.smooth;
    for (const k of track.clicks) w = Math.min(w, 2 * Math.abs(lt - k.t));
    if (w < 0.004) return evalTrack(track, lt);
    const N = 9;
    let sx = 0, sy = 0, sw = 0;
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1) - 0.5;                   // -0.5 .. 0.5
      const wt = 1 - Math.abs(f) * 2 + 0.12;         // triangular kernel
      const p = evalTrack(track, lt + f * w);
      sx += p[0] * wt; sy += p[1] * wt; sw += wt;
    }
    return [sx / sw, sy / sw];
  }

  // ------------------------------------------------------------------- text
  // Scripts that need complex shaping (conjuncts, vowel signs that move in front of or around
  // their consonant). Rules for a text that contains such a script:
  //   - it is measured and drawn as ONE string per line (true of every text in this file);
  //   - letter tracking is zero: tracking would pull the parts of a cluster apart;
  //   - the font stack is brand.script_fonts[id] when the timeline gives one, else the normal
  //     stack (macOS then supplies its own face for the script: ".SF Malayalam", which has the
  //     same weights as the Latin system font);
  //   - lines stand further apart and the sprite leaves room for what hangs below the baseline;
  //   - the line is centred on the height of the script's letters (`ref`), not on Latin capitals.
  // A text without such characters takes none of these paths: its pixels do not change.
  const COMPLEX_SCRIPTS = [
    { id: 'mlym', name: 'Malayalam', re: /[\u0D00-\u0D7F]/, ref: '\u0D28', lineHeight: 1.24 },
  ];
  const scriptOf = str => COMPLEX_SCRIPTS.find(c => c.re.test(String(str))) || null;
  // the font to use for `str`: f itself, or a copy without tracking that names the script
  function fontFor(f, str) {
    const sc = scriptOf(Array.isArray(str) ? str.join(' ') : str);
    return sc ? Object.assign({}, f, { track: 0, script: sc }) : f;
  }
  function familyOf(f) {
    const by = f.script && ST.tl && ST.tl.brand && ST.tl.brand.script_fonts;
    return (by && by[f.script.id]) || ST.font;
  }
  function applyFont(ctx, f) {
    ctx.font = `${f.weight} ${f.size}px ${familyOf(f)}`;
    ctx.letterSpacing = `${((f.track || 0) * f.size).toFixed(3)}px`;
    ctx.fontKerning = 'normal';
    ctx.textRendering = 'geometricPrecision';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }
  function metrics(f) {
    const c = ST.mctx;
    applyFont(c, f);
    const m = c.measureText('Hxg');
    const cap = c.measureText('H').actualBoundingBoxAscent;
    // `mid`: the height that is centred on the line. Latin: the capitals. Complex script: its letters.
    const mid = f.script ? c.measureText(f.script.ref).actualBoundingBoxAscent || cap : cap;
    return { asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent, cap, mid };
  }
  // how far the ink of `s` reaches around its origin (left, right, above and below the baseline)
  function inkOf(f, s) {
    const c = ST.mctx;
    applyFont(c, f);
    const m = c.measureText(s);
    return { l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, up: m.actualBoundingBoxAscent, down: m.actualBoundingBoxDescent };
  }
  // visible width: canvas adds the letter spacing after the last glyph as well
  function textWidth(f, s) {
    const c = ST.mctx;
    applyFont(c, f);
    return c.measureText(s).width - (f.track || 0) * f.size;
  }
  // Break `tokens` (words, or whole sentences) into lines no wider than maxW, then
  // narrow the measure as far as the line count allows: balanced lines, no orphans.
  function wrapTokens(f, tokens, maxW) {
    const fit = limit => {
      const lines = [];
      let cur = '';
      for (const tk of tokens) {
        const trial = cur ? `${cur} ${tk}` : tk;
        if (cur && textWidth(f, trial) > limit) { lines.push(cur); cur = tk; } else cur = trial;
      }
      if (cur) lines.push(cur);
      return lines;
    };
    const base = fit(maxW);
    if (base.length <= 1) return base;
    let lo = Math.max(...tokens.map(tk => textWidth(f, tk))), hi = maxW, best = base;
    for (let i = 0; i < 14 && hi - lo > 2; i++) {
      const mid = (lo + hi) / 2;
      const l = fit(mid);
      if (l.length <= base.length) { best = l; hi = mid; } else lo = mid;
    }
    return best;
  }
  // A sprite is a small transparent canvas drawn once at load; `m` is the margin around the box.
  function makeSprite(w, h, m, draw) {
    const c = newCanvas(w + 2 * m, h + 2 * m);
    const x = c.getContext('2d');
    x.translate(m, m);
    draw(x);
    return { canvas: c, m, w, h };
  }
  function drawSprite(ctx, sp, x, y, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = ST.quality;
    ctx.drawImage(sp.canvas, x - sp.m, y - sp.m);
    ctx.restore();
  }
  function textSprite(f, lines, color, align, lineHeight) {
    const mt = metrics(f);
    const sc = f.script || null;
    const lh = Math.round(f.size * (sc ? Math.max(lineHeight || 1.2, sc.lineHeight) : (lineHeight || 1.2)));
    const widths = lines.map(l => textWidth(f, l));
    const w = Math.ceil(Math.max(1, ...widths)), h = lh * lines.length;
    const lift = sc ? (mt.cap - mt.mid) / 2 : 0;           // complex script: centre its letters, not the capitals
    const at = i => ({ x: Math.round(align === 'center' ? (w - widths[i]) / 2 : 0), y: Math.round(i * lh + (lh - (mt.asc + mt.desc)) / 2 + mt.asc - lift) });
    let margin = 10;
    if (sc) {                                                // room for deep conjuncts and tall vowel signs
      lines.forEach((l, i) => {
        const p = at(i), k = inkOf(f, l);
        margin = Math.max(margin, Math.ceil(Math.max(k.up - p.y, p.y + k.down - h, k.l - p.x, p.x + k.r - w)) + 3);
      });
    }
    return makeSprite(w, h, margin, x => {
      applyFont(x, f);
      x.fillStyle = color;
      lines.forEach((l, i) => {
        if (sc) { const p = at(i); x.fillText(l, p.x, p.y); return; }
        const lx = align === 'center' ? (w - widths[i]) / 2 : 0;
        const base = i * lh + (lh - (mt.asc + mt.desc)) / 2 + mt.asc;
        x.fillText(l, Math.round(lx), Math.round(base));
      });
    });
  }

  // ------------------------------------------------------------ scene set-up
  const CURSOR_PATH = 'M2 1.2 L2 21.4 L6.9 16.8 L10.3 24.7 L13.9 23.1 L10.6 15.4 L17.4 15.4 Z';
  const CURSOR_HOT = [2, 1.2];

  function prepScene(sc, idx) {
    sc.index = idx;
    sc.dur = sc.end - sc.start;
    sc.isCard = sc.source.type === 'card';
    if (sc.isCard) { prepCard(sc); return; }
    sc.isMotion = sc.source.type === 'motion';
    if (sc.isMotion) { prepMotion(sc); return; }
    sc.staged = !!ST.stage && sc.stage !== false;

    sc.SW = sc.source.css_width || 1920;
    sc.SH = sc.source.css_height || 1080;
    sc.cam = normCamera(sc);
    sc.tmap = sc.source.type === 'shot' ? buildTimeMap(sc) : null;
    sc.track = buildCursor(sc);

    sc.maskList = [];
    for (const m of (sc.masks || [])) {
      const rp = m.repeat || { count: 1 };
      const n = Math.max(1, Math.floor(rp.count || 1)), dx = +rp.dx || 0, dy = +rp.dy || 0;
      for (let i = 0; i < n; i++) {
        const shift = r => { const q = asRect(r); return q ? [q[0] + i * dx, q[1] + i * dy, q[2], q[3]] : null; };
        const at = rectTrack(shift(m.rect), (m.rect_keys || []).map(k => Object.assign({}, k, { rect: shift(k.rect) })));
        if (at) sc.maskList.push(Object.assign({}, m, { at }));
      }
    }
    sc.hlList = (sc.highlights || []).map(h => {
      const o = Object.assign({ style: 'outline', radius: 14, padding: 6, fade: 0.28, dim: 0.3 }, h);
      o.at = rectTrack(h.rect, h.rect_keys);
      o.start = h.start == null ? 0 : +h.start; o.end = h.end == null ? sc.dur : +h.end;
      o.color = h.color || ST.tl.brand.colors.primary;
      return o;
    }).filter(h => h.at);
    sc.coList = (sc.callouts || []).map(c => prepCallout(sc, c));
  }

  const CALLOUT = {
    normal: { font: { weight: 600, size: 32, track: -0.012 }, padL: 24, padR: 28, dot: 10, gap: 14, h: 68, radius: 16 },
    small: { font: { weight: 600, size: 23, track: -0.008 }, padL: 16, padR: 19, dot: 8, gap: 10, h: 48, radius: 12 },
  };
  function prepCallout(sc, c) {
    const o = Object.assign({ placement: 'auto', size: 'normal', theme: 'dark', anim: 'slide', align: 'center', fade_in: 0.36, fade_out: 0.26, margin: 64 }, c);
    const B = ST.tl.brand.colors;
    o.start = c.start == null ? 0 : +c.start; o.end = c.end == null ? sc.dur : +c.end;
    o.tat = rectTrack(c.target, c.target_keys);
    o.trect = o.tat ? o.tat(o.start) : null;
    o.isPoint = !!o.trect && o.trect[2] === 0 && o.trect[3] === 0;
    o.leader = c.leader || (o.trect ? 'line' : 'none');
    if (!o.trect) o.leader = 'none';
    o.gap = c.gap != null ? +c.gap : (o.leader === 'none' ? 20 : 46);
    o.offset = Array.isArray(c.offset) ? c.offset : [0, 0];
    o.text = String(c.text || '');
    const K = o.size === 'small' ? CALLOUT.small : CALLOUT.normal;
    const dark = o.theme !== 'light';
    const marker = c.marker !== false;
    const font = fontFor(K.font, o.text);                   // K.font itself unless the text needs complex shaping
    const tw = textWidth(font, o.text);
    const mt = metrics(font);
    o.w = Math.ceil(K.padL + (marker ? K.dot + K.gap : 0) + tw + K.padR);
    o.h = K.h;
    o.ink = dark ? '#0D1426' : B.primary;                   // leader colour
    o.sprite = makeSprite(o.w, o.h, 72, x => {
      const OFF = 6000;                                     // draw the shape far away: only its shadow lands here
      x.save();
      x.fillStyle = '#000';
      x.shadowColor = dark ? 'rgba(10, 16, 32, 0.50)' : 'rgba(10, 16, 32, 0.30)';
      x.shadowBlur = 44; x.shadowOffsetX = OFF; x.shadowOffsetY = 20;
      x.beginPath(); rr(x, 12 - OFF, 10, o.w - 24, o.h - 18, K.radius); x.fill();
      x.shadowColor = 'rgba(10, 16, 32, 0.20)';
      x.shadowBlur = 6; x.shadowOffsetY = 2;
      x.beginPath(); rr(x, 1 - OFF, 1, o.w - 2, o.h - 2, K.radius); x.fill();
      x.restore();
      x.beginPath(); rr(x, 0, 0, o.w, o.h, K.radius);
      x.fillStyle = dark ? 'rgb(14, 21, 40)' : '#FFFFFF';
      x.fill();
      if (!dark) { x.beginPath(); rr(x, 0.5, 0.5, o.w - 1, o.h - 1, K.radius - 0.5); x.strokeStyle = 'rgba(15, 23, 42, 0.10)'; x.lineWidth = 1; x.stroke(); }
      let tx = K.padL;
      if (marker) {
        x.beginPath(); x.arc(tx + K.dot / 2, o.h / 2, K.dot / 2, 0, Math.PI * 2);
        x.fillStyle = dark ? B.accent : B.primary; x.fill();
        tx += K.dot + K.gap;
      }
      applyFont(x, font);
      x.fillStyle = dark ? '#FFFFFF' : B.ink;
      x.fillText(o.text, tx, Math.round(o.h / 2 + mt.mid / 2));
    });
    const words = o.text.trim().split(/\s+/).filter(Boolean).length;
    if (words > 6 && o.size !== 'small') ST.warnings.push(`scene ${sc.id}: callout "${o.text}" has ${words} words (3 to 6 recommended)`);
    if (o.w > 0.5 * ST.W) ST.warnings.push(`scene ${sc.id}: callout "${o.text}" is ${o.w} px wide, more than half of the frame; shorten the text`);
    if (font.script) {
      const k = inkOf(font, o.text), base = Math.round(o.h / 2 + mt.mid / 2);
      if (base - k.up < 4 || base + k.down > o.h - 4) ST.warnings.push(`scene ${sc.id}: callout "${o.text}" reaches the edge of its box (ink from ${(base - k.up).toFixed(1)} to ${(base + k.down).toFixed(1)} px of ${o.h} px)`);
    }

    // choose the side ONCE (stable while the camera moves)
    if (Array.isArray(c.screen)) o.side = 'screen';
    else if (!o.trect) o.side = 'free';
    else if (o.placement !== 'auto') o.side = o.placement;
    else o.side = chooseSide(sc, o);
    return o;
  }
  function roomFor(o, T, side) {
    const m = o.margin, W = ST.W, H = ST.H;
    if (side === 'top') return T.t - m - (o.h + o.gap);
    if (side === 'bottom') return (H - m) - T.b - (o.h + o.gap);
    if (side === 'left') return T.l - m - (o.w + o.gap);
    return (W - m) - T.r - (o.w + o.gap);
  }
  function chooseSide(sc, o) {
    const times = [o.start + o.fade_in, (o.start + o.end) / 2, o.end - o.fade_out];
    const [, , w, h] = o.trect;
    const order = o.isPoint ? ['top', 'right', 'bottom', 'left'] : (w >= 1.5 * h ? ['top', 'bottom', 'right', 'left'] : ['right', 'left', 'top', 'bottom']);
    let best = null;
    for (const side of order) {
      let room = Infinity;
      for (const t of times) room = Math.min(room, roomFor(o, screenRect(view(sc, cameraAt(sc, t)), o.tat(t), 0), side));
      if (room >= 0) return side;
      if (!best || room > best.room) best = { side, room };
    }
    ST.warnings.push(`scene ${sc.id}: callout "${o.text}" has no free side around its target; using "${best.side}" (it may touch the target)`);
    return best.side;
  }
  function placeCallout(o, T) {
    const W = ST.W, H = ST.H, m = o.margin;
    let x, y, side = o.side;
    if (side === 'screen') { x = o.screen[0]; y = o.screen[1]; }
    else if (side === 'free') { x = (W - o.w) / 2; y = H - 150 - o.h; }
    else {
      const ax = o.align === 'start' ? T.l : o.align === 'end' ? T.r - o.w : T.cx - o.w / 2;
      const ay = o.align === 'start' ? T.t : o.align === 'end' ? T.b - o.h : T.cy - o.h / 2;
      if (side === 'top') { x = ax; y = T.t - o.gap - o.h; }
      else if (side === 'bottom') { x = ax; y = T.b + o.gap; }
      else if (side === 'left') { x = T.l - o.gap - o.w; y = ay; }
      else { x = T.r + o.gap; y = ay; }
    }
    if (side !== 'screen') { x += o.offset[0]; y += o.offset[1]; }
    x = clamp(x, m, W - m - o.w); y = clamp(y, m, H - m - o.h);
    if (side === 'screen' || side === 'free') {
      if (!T) side = 'none';
      else {                                           // which side of the TARGET the box sits on
        const dx = T.cx - (x + o.w / 2), dy = T.cy - (y + o.h / 2);
        const gx = Math.max(T.l - (x + o.w), x - T.r, 0), gy = Math.max(T.t - (y + o.h), y - T.b, 0);
        side = gy >= gx ? (dy > 0 ? 'top' : 'bottom') : (dx > 0 ? 'left' : 'right');
      }
    }
    return { x, y, side };
  }
  function leaderPoints(o, x, y, side, T) {
    const b = { l: x, t: y, r: x + o.w, b: y + o.h, cx: x + o.w / 2, cy: y + o.h / 2 };
    const so = o.isPoint ? 13 : 9;          // stand-off from the target
    const inset = (lo, hi, v, k) => (hi - lo < 2 * k ? (lo + hi) / 2 : clamp(v, lo + k, hi - k));
    let x1, y1, x2, y2;
    if (side === 'top' || side === 'bottom') {
      x2 = inset(T.l, T.r, b.cx, 18);
      x1 = inset(b.l, b.r, x2, 26);
      y1 = side === 'top' ? b.b : b.t;
      y2 = side === 'top' ? T.t - so : T.b + so;
    } else {
      y2 = inset(T.t, T.b, b.cy, 18);
      y1 = inset(b.t, b.b, y2, 20);
      x1 = side === 'left' ? b.r : b.l;
      x2 = side === 'left' ? T.l - so : T.r + so;
    }
    return { x1, y1, x2, y2 };
  }

  // ------------------------------------------------------------------ cards
  function prepCard(sc) {
    const s = sc.source, brand = ST.tl.brand, B = brand.colors;
    const kind = s.card || 'title';
    const dark = (s.theme || 'light') === 'dark';
    const centered = kind !== 'section';
    const ink = dark ? '#FFFFFF' : B.ink;
    const soft = dark ? 'rgba(255, 255, 255, 0.70)' : B.muted;
    const hue = dark ? B.accent : B.primary;
    const items = [];
    const words = str => String(str).trim().split(/\s+/).filter(Boolean);
    const sentences = str => (String(str).match(/[^.!?]+[.!?]*\s*/g) || [String(str)]).map(p => p.trim()).filter(Boolean);
    const left = s.left == null ? 240 : +s.left;
    const room = centered ? ST.W - 320 : ST.W - left - 160;  // the widest line a card can show
    const text = (str, f0, color, gap, maxW, lineHeight, bySentence) => {
      const f = fontFor(f0, str);                            // f0 itself unless the text needs complex shaping
      let lines;
      if (Array.isArray(str)) lines = str.map(String);
      else if (maxW) lines = wrapTokens(f, bySentence ? sentences(str) : words(str), maxW);
      else lines = [String(str)];
      // a sentence that is still too wide falls back to word wrapping
      if (maxW) lines = lines.flatMap(l => (textWidth(f, l) > maxW ? wrapTokens(f, words(l), maxW) : [l]));
      // a text that was given no measure (eyebrow, title of the end card) must still fit the frame
      else if (!Array.isArray(str) && textWidth(f, lines[0]) > room) {
        lines = wrapTokens(f, words(str), room);
        ST.warnings.push(`scene ${sc.id}: card text "${String(str)}" is wider than the frame and was wrapped into ${lines.length} lines`);
      }
      const sp = textSprite(f, lines, color, centered ? 'center' : 'left', lineHeight);
      items.push({ kind: 'sprite', sp, w: sp.w, h: sp.h, gap });
    };
    const rule = gap => items.push({ kind: 'rule', w: 76, h: 4, gap, color: hue });
    const logoUrl = s.logo_url || brand.logo_url;
    const logo = (size, gap) => {
      if (s.logo === false) return;
      if (logoUrl) {
        const img = new Image();
        img.decoding = 'sync';
        img.src = logoUrl;
        sc.images = (sc.images || []).concat([img]);
        items.push({ kind: 'image', img, h: size, w: size, gap });   // w is fixed after decode
      } else {
        const ch = String(s.monogram || (brand.name || 'P').trim().charAt(0)).toUpperCase();
        const f = { weight: 700, size: Math.round(size * 0.46), track: -0.02 };
        const sp = makeSprite(size, size, 4, x => {
          x.beginPath(); rr(x, 0, 0, size, size, size * 0.24); x.fillStyle = B.primary; x.fill();
          applyFont(x, f); x.fillStyle = '#FFFFFF';
          x.fillText(ch, Math.round((size - textWidth(f, ch)) / 2), Math.round(size / 2 + metrics(f).cap / 2));
        });
        items.push({ kind: 'sprite', sp, w: size, h: size, gap });
      }
    };

    if (kind === 'title') {
      logo(s.logo_size || 108, 46);
      text(s.title || brand.name || '', { weight: 700, size: s.title_size || 108, track: -0.028 }, ink, 30, 1600, 1.08);
      rule(34);
      const sub = s.subtitle == null ? brand.tagline : s.subtitle;
      if (sub) text(sub, { weight: 400, size: s.subtitle_size || 40, track: -0.008 }, soft, 0, 1400, 1.3);
    } else if (kind === 'section') {
      if (s.eyebrow) text(String(s.eyebrow).toUpperCase(), { weight: 650, size: 27, track: 0.14 }, hue, 22, 0, 1.2);
      text(s.title || '', { weight: 700, size: s.title_size || 100, track: -0.028 }, ink, 28, 1440, 1.08);
      rule(34);
      if (s.subtitle) text(s.subtitle, { weight: 400, size: s.subtitle_size || 38, track: -0.008 }, soft, s.points ? 40 : 0, 1300, 1.3);
      // optional bullet list (module summaries): one text block per point
      for (const p of (s.points || [])) text(`•  ${p}`, { weight: 500, size: s.points_size || 34, track: -0.004 }, ink, 16, 1400, 1.28);
    } else {
      logo(s.logo_size || 116, 26);
      if (s.title !== false) text(s.title || brand.name || '', { weight: 700, size: 50, track: -0.02 }, ink, 54, 0, 1.2);
      if (s.cta) text(s.cta, { weight: 600, size: s.cta_size || 56, track: -0.018 }, ink, 40, s.cta_width || 1320, 1.22, true);
      const foot = s.footnote == null ? brand.url : s.footnote;
      if (foot) text(foot, { weight: 500, size: 29, track: 0 }, soft, 0, 1500, 1.3);
    }
    if (items.length) items[items.length - 1].gap = 0;
    sc.card = {
      items, centered, dark, hue,
      bg: s.background || (dark ? B.ink : B.paper),
      animate: s.animate !== false,
      left,
      laid: false,
    };
  }
  function layoutCard(sc) {
    const c = sc.card;
    for (const it of c.items) if (it.kind === 'image') it.w = Math.round(it.h * (it.img.naturalWidth || 1) / (it.img.naturalHeight || 1));
    const total = c.items.reduce((s, it) => s + it.h + it.gap, 0);
    let y = Math.round((ST.H - total) / 2);
    for (const it of c.items) {
      it.x = c.centered ? Math.round((ST.W - it.w) / 2) : c.left;
      it.y = y;
      y += it.h + it.gap;
    }
    // soft background washes, pre-rendered once with ordered dithering (no banding)
    c.bgCanvas = cardBackground(c);
    c.laid = true;
  }
  const BAYER = [0, 48, 12, 60, 3, 51, 15, 63, 32, 16, 44, 28, 35, 19, 47, 31, 8, 56, 4, 52, 11, 59, 7, 55, 40, 24, 36, 20, 43, 27, 39, 23,
    2, 50, 14, 62, 1, 49, 13, 61, 34, 18, 46, 30, 33, 17, 45, 29, 10, 58, 6, 54, 9, 57, 5, 53, 42, 26, 38, 22, 41, 25, 37, 21];
  function cardBackground(c) {
    const W = ST.W, H = ST.H;
    const cv = newCanvas(W, H);
    const x = cv.getContext('2d', { alpha: false });
    const img = x.createImageData(W, H);
    const d = img.data;
    const base = cssToRgb(c.bg), tint = hexToRgb(c.hue);
    const a1 = c.dark ? 0.20 : 0.10, a2 = c.dark ? 0.12 : 0.07;
    // two elliptical washes: top right and bottom left
    const e1 = { cx: 0.88 * W, cy: -0.12 * H, rx: 1500 * 0.62, ry: 1000 * 0.62, a: a1 };
    const e2 = { cx: -0.08 * W, cy: 1.12 * H, rx: 1200 * 0.60, ry: 900 * 0.60, a: a2 };
    const fall = (e, px, py) => {
      const r = Math.hypot((px - e.cx) / e.rx, (py - e.cy) / e.ry);
      if (r >= 1) return 0;
      const k = 1 - r;
      return e.a * k * k * (3 - 2 * k);                // smooth fall-off
    };
    let p = 0;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const a = 1 - (1 - fall(e1, px, py)) * (1 - fall(e2, px, py));
        const th = (BAYER[(py & 7) * 8 + (px & 7)] + 0.5) / 64 - 0.5;   // -0.5 .. 0.5
        for (let ch = 0; ch < 3; ch++) {
          const v = base[ch] + (tint[ch] - base[ch]) * a;
          d[p + ch] = clamp(Math.floor(v + 0.5 + th), 0, 255);
        }
        d[p + 3] = 255;
        p += 4;
      }
    }
    x.putImageData(img, 0, 0);
    return cv;
  }
  function cssToRgb(v) {
    if (/^#/.test(String(v))) return hexToRgb(v);
    const c = ST.mctx;
    c.fillStyle = '#000'; c.fillStyle = v;
    return hexToRgb(c.fillStyle);
  }
  function renderCard(ctx, sc, lt) {
    const c = sc.card;
    if (!c.laid) layoutCard(sc);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(c.bgCanvas, 0, 0);
    c.items.forEach((it, i) => {
      let p = 1;
      if (c.animate) p = EASE.outQuart(clamp((lt - (0.10 + i * 0.10)) / 0.62, 0, 1));
      if (p <= 0.001) return;
      const dy = p >= 1 ? 0 : (1 - p) * 20;
      if (it.kind === 'sprite') drawSprite(ctx, it.sp, it.x, it.y + dy, p);
      else if (it.kind === 'image') {
        ctx.save();
        ctx.globalAlpha = p;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = ST.quality;
        ctx.drawImage(it.img, it.x, it.y + dy, it.w, it.h);
        ctx.restore();
      } else {
        const w = it.w * p;
        const x0 = c.centered ? it.x + (it.w - w) / 2 : it.x;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p * 1.6);
        ctx.fillStyle = it.color;
        ctx.beginPath(); rr(ctx, x0, it.y, w, it.h, 2); ctx.fill();
        ctx.restore();
      }
    });
    ctx.restore();
  }

  // ------------------------------------------------------ footage rendering
  const timed = (o, lt) => lt >= (o.start == null ? -Infinity : +o.start) && lt <= (o.end == null ? Infinity : +o.end);
  let cursorPath = null;

  async function renderFootage(ctx, sc, lt, info, keep) {
    const src = sc.source;
    let url, next = null;
    if (src.type === 'still') url = src.url;
    else {
      const ts = srcTimeAt(sc, lt);
      const fi = frameIndexAt(src.frames, ts * 1000);
      url = src.frames[fi].url;
      if (fi + 1 < src.frames.length) next = src.frames[fi + 1].url;
      info.src_t = +ts.toFixed(4); info.src_frame = fi + 1;
    }
    const ent = await loadBitmap(url);
    if (next) loadBitmap(next).catch(() => {});            // read-ahead, never awaited
    info.image = url.slice(url.lastIndexOf('/') + 1);
    keep.add(url); if (next) keep.add(next);

    const B = ST.tl.brand.colors;
    const cam = cameraAt(sc, lt);
    const v = view(sc, cam);
    const W = ST.W, H = ST.H;
    const kx = ent.w / sc.SW, ky = ent.h / sc.SH;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = ST.quality;
    ctx.drawImage(ent.bmp, v.vx * kx, v.vy * ky, v.vw * kx, v.vh * ky, 0, 0, W, H);
    info.camera = { zoom: +cam.z.toFixed(4), cx: +cam.cx.toFixed(2), cy: +cam.cy.toFixed(2) };
    info.view = [+v.vx.toFixed(2), +v.vy.toFixed(2), +v.vw.toFixed(2), +v.vh.toFixed(2)];
    info.inside = v.vx >= -1e-6 && v.vy >= -1e-6 && v.vx + v.vw <= sc.SW + 1e-6 && v.vy + v.vh <= sc.SH + 1e-6;

    // privacy masks: part of the picture, so they follow the camera exactly.
    // Built on a scratch canvas first (opaque), then stamped through a rounded clip:
    // that way the anti-aliased edge blends picture -> mask only, with no grey fringe.
    const ltMask = clamp(lt, 0, sc.dur);                   // masks never drop out during a transition
    const stamps = [];
    const sx = ST.sctx;
    for (const m of sc.maskList) {                          // pass 1: build every mask on the scratch canvas
      if (!timed(m, ltMask)) continue;
      const [x, y, w, h] = m.at(ltMask);
      const R = screenRect(v, [x, y, w, h], 0);
      if (R.r < 0 || R.b < 0 || R.l > W || R.t > H || R.w <= 0 || R.h <= 0) continue;
      const bl = Math.max(0, Math.floor(R.l) - 2), bt = Math.max(0, Math.floor(R.t) - 2);
      const br = Math.min(W, Math.ceil(R.r) + 2), bb = Math.min(H, Math.ceil(R.b) + 2);
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.globalAlpha = 1; sx.filter = 'none';
      sx.fillStyle = m.color || '#E3E7EE';
      sx.fillRect(bl, bt, br - bl, bb - bt);
      if ((m.style || 'blur') === 'blur') {
        const rad = m.radius == null ? 9 : +m.radius;      // source CSS px
        const mg = rad * 3;
        const x0 = Math.max(0, x - mg), y0 = Math.max(0, y - mg);
        const x1 = Math.min(sc.SW, x + w + mg), y1 = Math.min(sc.SH, y + h + mg);
        sx.save();
        sx.beginPath(); sx.rect(bl, bt, br - bl, bb - bt); sx.clip();
        sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = ST.quality;
        sx.filter = `blur(${(rad * v.s).toFixed(2)}px)`;
        sx.drawImage(ent.bmp, x0 * kx, y0 * ky, (x1 - x0) * kx, (y1 - y0) * ky,
          (x0 - v.vx) * v.s, (y0 - v.vy) * v.s, (x1 - x0) * v.s, (y1 - y0) * v.s);
        sx.restore();
      }
      stamps.push({ R, bl, bt, br, bb, corner: (m.corner == null ? 6 : m.corner) * v.s });
    }
    for (const q of stamps) {                               // pass 2: stamp them through rounded clips
      ctx.save();
      ctx.beginPath(); rr(ctx, q.R.l, q.R.t, q.R.w, q.R.h, q.corner);
      ctx.clip();
      ctx.drawImage(ST.scratch, q.bl, q.bt, q.br - q.bl, q.bb - q.bt, q.bl, q.bt, q.br - q.bl, q.bb - q.bt);
      ctx.restore();
    }
    info.masks = stamps.length;

    const still = !cameraMoving(sc, lt);
    const snap = x => (still ? Math.round(x) : x);

    // focus highlights
    for (const h of sc.hlList) {
      const a = envelope(lt, h.start, h.end, h.fade, h.fade);
      if (a <= 0) continue;
      const R = screenRect(v, h.at(lt), h.padding);
      const e = EASE.out(a);
      const x = snap(R.l), y = snap(R.t), w = snap(R.w), hh = snap(R.h);
      ctx.save();
      ctx.globalAlpha = e;
      if (h.style === 'spotlight') {
        ctx.fillStyle = `rgba(10, 16, 32, ${h.dim})`;
        ctx.beginPath(); ctx.rect(0, 0, W, H); rr(ctx, x, y, w, hh, h.radius);
        ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); rr(ctx, x + 1, y + 1, w - 2, hh - 2, Math.max(0, h.radius - 1)); ctx.stroke();
      } else {
        const g = (1 - e) * 10;                              // settles inwards while it fades in
        const ox = x - g, oy = y - g, ow = w + 2 * g, oh = hh + 2 * g, r = h.radius + g;
        ctx.save();                                          // soft shadow, outside the box only
        ctx.beginPath(); ctx.rect(-50, -50, W + 100, H + 100); rr(ctx, ox, oy, ow, oh, r);
        ctx.clip('evenodd');
        ctx.shadowColor = 'rgba(15, 23, 42, 0.30)'; ctx.shadowBlur = 28; ctx.shadowOffsetX = 6000; ctx.shadowOffsetY = 10;
        ctx.fillStyle = '#000';
        ctx.beginPath(); rr(ctx, ox + 8 - 6000, oy + 8, ow - 16, oh - 16, r); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = rgba(h.color, 0.16); ctx.lineWidth = 5;
        ctx.beginPath(); rr(ctx, ox - 2.5, oy - 2.5, ow + 5, oh + 5, r + 2.5); ctx.stroke();
        ctx.strokeStyle = h.color; ctx.lineWidth = 3;
        ctx.beginPath(); rr(ctx, ox + 1.5, oy + 1.5, ow - 3, oh - 3, Math.max(0, r - 1.5)); ctx.stroke();
      }
      ctx.restore();
    }

    // click ripples and cursor
    if (sc.track) {
      const tr = sc.track;
      const p = cursorAt(tr, lt);
      const [cxs, cys] = toScreen(v, p[0], p[1]);
      let vis = 1;
      if (tr.o.show) vis = envelope(lt, tr.o.show[0], tr.o.show[1], 0.2, 0.2);
      let press = 1;
      for (const k of tr.clicks) {
        const u = (lt - k.t) / 0.6;
        if (tr.o.ripple && u >= 0 && u <= 1) {
          const [rx, ry] = toScreen(v, k.x, k.y);
          const rad = lerp(9, 40, EASE.out(u));
          ctx.save();
          ctx.globalAlpha = Math.pow(1 - u, 1.4) * 0.95;
          ctx.beginPath(); ctx.arc(rx, ry, rad - 1.5, 0, Math.PI * 2);
          ctx.fillStyle = rgba(B.primary, 0.14); ctx.fill();
          ctx.strokeStyle = B.primary; ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
        }
        const d = lt - k.t;
        if (d > -0.07 && d <= 0.03) press = Math.min(press, lerp(1, 0.84, EASE.inOutQuad((d + 0.07) / 0.10)));
        else if (d > 0.03 && d < 0.26) press = Math.min(press, lerp(0.84, 1, EASE.inOutQuad((d - 0.03) / 0.23)));
      }
      if (vis > 0.001) {
        const k = tr.o.size * press;
        if (!cursorPath) cursorPath = new Path2D(CURSOR_PATH);
        ctx.save();
        ctx.globalAlpha = vis;
        ctx.translate(cxs - CURSOR_HOT[0] * k, cys - CURSOR_HOT[1] * k);
        ctx.scale(k, k);
        ctx.lineJoin = 'round'; ctx.lineWidth = 1.7;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.34)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2.5;
        ctx.fillStyle = '#0B0B0F'; ctx.strokeStyle = '#FFFFFF';
        ctx.stroke(cursorPath);
        ctx.restore();
        ctx.strokeStyle = '#FFFFFF'; ctx.stroke(cursorPath);
        ctx.fillStyle = '#0B0B0F'; ctx.fill(cursorPath);
        ctx.restore();
      }
      info.cursor = [+p[0].toFixed(1), +p[1].toFixed(1)];
      info.cursor_screen = [+cxs.toFixed(1), +cys.toFixed(1)];
    }

    // callouts
    info.callouts = [];
    for (const c of sc.coList) {
      const a = envelope(lt, c.start, c.end, c.fade_in, c.fade_out);
      if (a <= 0) continue;
      const entering = lt - c.start < c.fade_in;
      const T = c.tat ? screenRect(v, c.tat(lt), c.isPoint ? 0 : (c.target_padding == null ? 6 : c.target_padding)) : null;
      const pos = placeCallout(c, T);
      const e = entering ? EASE.outQuart(a) : EASE.inOutQuad(a);
      let dx = 0, dy = 0;
      if (c.anim === 'slide') {
        const d = (1 - e) * 16;
        if (pos.side === 'top') dy = -d; else if (pos.side === 'bottom') dy = d;
        else if (pos.side === 'left') dx = -d; else if (pos.side === 'right') dx = d; else dy = d;
      }
      const rest = still && a >= 1;
      const bx = rest ? Math.round(pos.x) : pos.x + dx, by = rest ? Math.round(pos.y) : pos.y + dy;
      const rec = { text: c.text, box: [Math.round(pos.x), Math.round(pos.y), c.w, c.h], side: pos.side, opacity: +e.toFixed(3) };
      if (T) {
        rec.target = [Math.round(T.l), Math.round(T.t), Math.round(T.w), Math.round(T.h)];
        const ix = Math.min(pos.x + c.w, T.r) - Math.max(pos.x, T.l), iy = Math.min(pos.y + c.h, T.b) - Math.max(pos.y, T.t);
        rec.covers_target = !c.isPoint && ix > 1 && iy > 1;
        rec.target_visible = T.r > 0 && T.b > 0 && T.l < W && T.t < H;
      }
      rec.clipped = pos.x < 0 || pos.y < 0 || pos.x + c.w > W || pos.y + c.h > H;
      info.callouts.push(rec);

      if (c.leader !== 'none' && T && pos.side !== 'none') {
        const L = leaderPoints(c, bx, by, pos.side, T);
        // the line grows from the box to the target a little after the box appears
        const g = entering ? EASE.inOut(clamp((lt - c.start - c.fade_in * 0.35) / (c.fade_in * 1.1), 0, 1)) : 1;
        if (g > 0.001) {
          const ex = lerp(L.x1, L.x2, g), ey = lerp(L.y1, L.y2, g);
          ctx.save();
          ctx.globalAlpha = entering ? 1 : e;
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(L.x1, L.y1); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.strokeStyle = c.ink; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(L.x1, L.y1); ctx.lineTo(ex, ey); ctx.stroke();
          const k = clamp(g * 1.5, 0, 1);
          if (c.leader === 'arrow') {
            const ang = Math.atan2(L.y2 - L.y1, L.x2 - L.x1), s = 16 * k;
            ctx.beginPath();
            ctx.moveTo(ex + Math.cos(ang) * 5, ey + Math.sin(ang) * 5);
            ctx.lineTo(ex - Math.cos(ang - 0.44) * s, ey - Math.sin(ang - 0.44) * s);
            ctx.lineTo(ex - Math.cos(ang + 0.44) * s, ey - Math.sin(ang + 0.44) * s);
            ctx.closePath();
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = c.ink; ctx.fill();
          } else {
            ctx.beginPath(); ctx.arc(ex, ey, 6 * k, 0, Math.PI * 2);
            ctx.fillStyle = B.primary; ctx.fill();
            ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5; ctx.stroke();
          }
          ctx.restore();
        }
      }
      drawSprite(ctx, c.sprite, bx, by, e);
    }
    for (const o of (sc.overlays || [])) drawOverlay(ctx, sc, o, lt);
    ctx.restore();
  }

  // ------------------------------------------------------------ stage (framed look)
  // Opt-in with timeline.stage = { scale, radius, base, glows, pan, period }: every still/shot scene
  // is drawn into a rounded window that floats on a softly lit, slowly drifting background.
  // A scene opts out with "stage": false. Cards are never staged.
  function prepStage(s) {
    const W = ST.W, H = ST.H;
    const k = s.scale || 0.9;
    const w = Math.round(W * k), h = Math.round(H * k);
    const x = s.x != null ? +s.x : Math.round((W - w) / 2), y = s.y != null ? +s.y : Math.round((H - h) / 2);
    const pan = s.pan || [48, 28];
    const cw = W + 2 * pan[0], ch = H + 2 * pan[1];
    const cv = newCanvas(cw, ch);
    const cx = cv.getContext('2d', { alpha: false });
    const img = cx.createImageData(cw, ch);
    const d = img.data;
    const base = hexToRgb(s.base || '#06101F');
    const glows = (s.glows || [
      { x: 0.10, y: 0.02, rx: 0.78, ry: 0.95, color: '#0068EE', a: 0.36 },
      { x: 0.96, y: 1.02, rx: 0.72, ry: 0.90, color: '#2F7BFF', a: 0.24 },
      { x: 0.62, y: 0.40, rx: 0.95, ry: 1.00, color: '#0D2C5C', a: 0.40 },
    ]).map(g => ({ cx: g.x * cw, cy: g.y * ch, rx: g.rx * cw, ry: g.ry * ch, c: hexToRgb(g.color), a: g.a }));
    let p = 0;
    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        let r = base[0], g = base[1], b = base[2];
        for (const e of glows) {
          const q = Math.hypot((px - e.cx) / e.rx, (py - e.cy) / e.ry);
          if (q >= 1) continue;
          const kk = 1 - q, a = e.a * kk * kk * (3 - 2 * kk);
          r += (e.c[0] - r) * a; g += (e.c[1] - g) * a; b += (e.c[2] - b) * a;
        }
        const th = (BAYER[(py & 7) * 8 + (px & 7)] + 0.5) / 64 - 0.5;
        d[p] = clamp(Math.floor(r + 0.5 + th), 0, 255);
        d[p + 1] = clamp(Math.floor(g + 0.5 + th), 0, 255);
        d[p + 2] = clamp(Math.floor(b + 0.5 + th), 0, 255);
        d[p + 3] = 255;
        p += 4;
      }
    }
    cx.putImageData(img, 0, 0);
    return { rect: [x, y, w, h], radius: s.radius == null ? 22 : +s.radius, bg: cv, pan, period: s.period || [41, 53] };
  }
  // the background drifts on whole pixels (keeps the dither crisp; 1 px steps are invisible on it)
  function drawStageBg(ctx, T) {
    const s = ST.stage;
    const ox = Math.round(s.pan[0] * (1 + Math.sin(2 * Math.PI * T / s.period[0])));
    const oy = Math.round(s.pan[1] * (1 + Math.cos(2 * Math.PI * T / s.period[1])));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(s.bg, -ox, -oy);
    ctx.restore();
  }
  // a rounded window with a soft drop shadow; `content(ctx, x, y, w, h)` paints inside its clip
  function drawWindow(ctx, R, radius, content, alpha) {
    const [x, y, w, h] = R;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = alpha == null ? 1 : clamp(alpha, 0, 1);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 4, 16, 0.55)'; ctx.shadowBlur = 70; ctx.shadowOffsetX = 6000; ctx.shadowOffsetY = 26;
    ctx.fillStyle = '#000';
    ctx.beginPath(); rr(ctx, x - 6000, y, w, h, radius); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); rr(ctx, x, y, w, h, radius); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = ST.quality;
    content(ctx, x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); rr(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, Math.max(0, radius - 0.75)); ctx.stroke();
    ctx.restore();
  }
  function drawStaged(ctx, T, content) {
    drawStageBg(ctx, T);
    drawWindow(ctx, ST.stage.rect, ST.stage.radius, (c, x, y, w, h) => c.drawImage(content, 0, 0, ST.W, ST.H, x, y, w, h));
  }

  // ------------------------------------------- captions and chapter bar (screen space)
  // Opt-in, drawn on top of everything in screen space, so they never move with the camera:
  //   timeline.captions    = { cues: [{ start, end, text }], y, size, max_width, color, fade }
  //                          y = centre of the caption block; each cue is wrapped to at most max_width
  //   timeline.chapter_bar = { y, size, x_left, x_right, items: [{ start, end, left, right }] }
  //                          left / right = short labels at the two ends of a line (e.g. above the stage)
  function prepGlobalOverlays(tl) {
    ST.caps = null; ST.bar = null;
    const c = tl.captions;
    if (c && Array.isArray(c.cues) && c.cues.length) {
      const f0 = { weight: 500, size: c.size || 32, track: -0.004 };
      const maxW = c.max_width || 1400;
      ST.caps = {
        y: c.y == null ? ST.H - 52 : +c.y, fade: c.fade == null ? 0.12 : +c.fade,
        cues: c.cues.map(q => {
          const f = fontFor(f0, q.text);
          const lines = wrapTokens(f, String(q.text).split(/\s+/).filter(Boolean), maxW);
          return { start: +q.start, end: +q.end, sp: textSprite(f, lines, c.color || 'rgba(255, 255, 255, 0.94)', 'center', 1.22) };
        }).sort((a, b) => a.start - b.start),
      };
    }
    const b = tl.chapter_bar;
    if (b && Array.isArray(b.items) && b.items.length) {
      const fl = { weight: 600, size: b.size || 22, track: 0.06 }, fr = { weight: 500, size: b.size || 22, track: 0.02 };
      const B = tl.brand.colors;
      ST.bar = {
        y: b.y == null ? 30 : +b.y, xl: b.x_left == null ? 144 : +b.x_left, xr: b.x_right == null ? ST.W - 144 : +b.x_right, fade: 0.3,
        items: b.items.map(it => ({
          start: +it.start, end: +it.end,
          l: it.left ? textSprite(fontFor(fl, it.left), [String(it.left)], B.accent, 'left', 1.2) : null,
          r: it.right ? textSprite(fontFor(fr, it.right), [String(it.right)], 'rgba(255, 255, 255, 0.62)', 'left', 1.2) : null,
        })),
      };
    }
  }
  function drawGlobalOverlays(ctx, T) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    if (ST.bar) {
      for (const it of ST.bar.items) {
        const a = envelope(T, it.start, it.end, ST.bar.fade, ST.bar.fade);
        if (a <= 0) continue;
        if (it.l) {
          ctx.globalAlpha = a; ctx.fillStyle = ST.tl.brand.colors.accent;
          ctx.beginPath(); ctx.arc(ST.bar.xl + 5, ST.bar.y, 5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          drawSprite(ctx, it.l, ST.bar.xl + 20, Math.round(ST.bar.y - it.l.h / 2), a);
        }
        if (it.r) drawSprite(ctx, it.r, Math.round(ST.bar.xr - it.r.w), Math.round(ST.bar.y - it.r.h / 2), a);
      }
    }
    if (ST.caps) {
      for (const q of ST.caps.cues) {
        if (q.start > T) break;
        const a = envelope(T, q.start, q.end, ST.caps.fade, ST.caps.fade);
        if (a <= 0) continue;
        drawSprite(ctx, q.sp, Math.round((ST.W - q.sp.w) / 2), Math.round(ST.caps.y - q.sp.h / 2), a);
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ line icons
  // Simple geometric icons, drawn with strokes inside a box of size s centred on (cx, cy).
  function drawIcon(x, name, cx, cy, s, color) {
    x.save();
    x.strokeStyle = color || '#FFFFFF'; x.fillStyle = color || '#FFFFFF';
    x.lineWidth = Math.max(2, s * 0.09); x.lineCap = 'round'; x.lineJoin = 'round';
    const u = s / 2;
    const person = (px, py, k) => {
      x.beginPath(); x.arc(px, py - u * 0.36 * k, u * 0.34 * k, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.arc(px, py + u * 0.95 * k, u * 0.78 * k, Math.PI * 1.16, Math.PI * 1.84); x.stroke();
    };
    x.beginPath();
    if (name === 'user') person(cx, cy, 1);
    else if (name === 'users') { person(cx - u * 0.36, cy, 0.82); person(cx + u * 0.42, cy + u * 0.02, 0.72); }
    else if (name === 'chart') {
      [[-0.55, 0.15], [-0.05, -0.25], [0.45, -0.6]].forEach(([dx, top]) => { x.moveTo(cx + dx * u + u * 0.1, cy + u * 0.7); x.lineTo(cx + dx * u + u * 0.1, cy + top * u); });
      x.stroke();
    } else if (name === 'calendar') {
      rr(x, cx - u * 0.78, cy - u * 0.6, u * 1.56, u * 1.38, u * 0.18); x.moveTo(cx - u * 0.78, cy - u * 0.18); x.lineTo(cx + u * 0.78, cy - u * 0.18);
      x.moveTo(cx - u * 0.38, cy - u * 0.82); x.lineTo(cx - u * 0.38, cy - u * 0.42); x.moveTo(cx + u * 0.38, cy - u * 0.82); x.lineTo(cx + u * 0.38, cy - u * 0.42);
      x.stroke();
      x.beginPath(); x.arc(cx - u * 0.3, cy + u * 0.28, u * 0.09, 0, Math.PI * 2); x.arc(cx + u * 0.3, cy + u * 0.28, u * 0.09, 0, Math.PI * 2); x.fill();
    } else if (name === 'chat') {
      x.moveTo(cx - u * 0.45, cy + u * 0.42); x.lineTo(cx - u * 0.62, cy + u * 0.78); x.lineTo(cx - u * 0.12, cy + u * 0.42);
      x.stroke(); x.beginPath(); rr(x, cx - u * 0.82, cy - u * 0.62, u * 1.64, u * 1.06, u * 0.3); x.stroke();
      x.beginPath(); [-0.38, 0, 0.38].forEach(dx => x.arc(cx + dx * u, cy - u * 0.09, u * 0.08, 0, Math.PI * 2)); x.fill();
    } else if (name === 'phone') {
      rr(x, cx - u * 0.42, cy - u * 0.78, u * 0.84, u * 1.56, u * 0.18); x.moveTo(cx - u * 0.12, cy + u * 0.52); x.lineTo(cx + u * 0.12, cy + u * 0.52); x.stroke();
    } else if (name === 'grid') {
      rr(x, cx - u * 0.78, cy - u * 0.62, u * 1.56, u * 1.24, u * 0.14);
      x.moveTo(cx - u * 0.78, cy - u * 0.2); x.lineTo(cx + u * 0.78, cy - u * 0.2); x.moveTo(cx - u * 0.78, cy + u * 0.2); x.lineTo(cx + u * 0.78, cy + u * 0.2);
      x.moveTo(cx - u * 0.2, cy - u * 0.62); x.lineTo(cx - u * 0.2, cy + u * 0.62); x.stroke();
    } else if (name === 'mail') {
      rr(x, cx - u * 0.8, cy - u * 0.56, u * 1.6, u * 1.12, u * 0.14); x.moveTo(cx - u * 0.72, cy - u * 0.46); x.lineTo(cx, cy + u * 0.1); x.lineTo(cx + u * 0.72, cy - u * 0.46); x.stroke();
    } else if (name === 'note') {
      x.moveTo(cx + u * 0.62, cy + u * 0.2); x.lineTo(cx + u * 0.62, cy - u * 0.78); x.lineTo(cx - u * 0.62, cy - u * 0.78); x.lineTo(cx - u * 0.62, cy + u * 0.78);
      x.lineTo(cx + u * 0.04, cy + u * 0.78); x.lineTo(cx + u * 0.62, cy + u * 0.2); x.lineTo(cx + u * 0.04, cy + u * 0.2); x.lineTo(cx + u * 0.04, cy + u * 0.78);
      x.moveTo(cx - u * 0.34, cy - u * 0.4); x.lineTo(cx + u * 0.34, cy - u * 0.4); x.moveTo(cx - u * 0.34, cy - u * 0.08); x.lineTo(cx + u * 0.1, cy - u * 0.08); x.stroke();
    } else if (name === 'bell') {
      x.moveTo(cx - u * 0.66, cy + u * 0.42); x.lineTo(cx + u * 0.66, cy + u * 0.42);
      x.moveTo(cx - u * 0.5, cy + u * 0.42); x.lineTo(cx - u * 0.5, cy - u * 0.1); x.arc(cx, cy - u * 0.1, u * 0.5, Math.PI, 0); x.lineTo(cx + u * 0.5, cy + u * 0.42);
      x.moveTo(cx - u * 0.16, cy + u * 0.68); x.lineTo(cx + u * 0.16, cy + u * 0.68); x.stroke();
    } else if (name === 'check') {
      x.moveTo(cx - u * 0.5, cy + u * 0.02); x.lineTo(cx - u * 0.12, cy + u * 0.4); x.lineTo(cx + u * 0.56, cy - u * 0.36); x.stroke();
    } else if (name === 'spark') {
      x.moveTo(cx, cy - u * 0.8); x.quadraticCurveTo(cx + u * 0.12, cy - u * 0.12, cx + u * 0.8, cy); x.quadraticCurveTo(cx + u * 0.12, cy + u * 0.12, cx, cy + u * 0.8);
      x.quadraticCurveTo(cx - u * 0.12, cy + u * 0.12, cx - u * 0.8, cy); x.quadraticCurveTo(cx - u * 0.12, cy - u * 0.12, cx, cy - u * 0.8); x.fill();
    }
    x.restore();
  }

  // ------------------------------------------------------------ motion scenes
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // a white "activity card": icon disc, title, subtitle
  function activitySprite(c) {
    const B = ST.tl.brand.colors;
    const ft = { weight: 650, size: 26, track: -0.01 }, fs = { weight: 450, size: 20, track: 0 };
    const tw = Math.max(textWidth(ft, c.title || ''), c.sub ? textWidth(fs, c.sub) : 0);
    const w = Math.ceil(26 + 56 + 18 + tw + 32), h = c.sub ? 96 : 80;
    const mt = metrics(ft), ms = metrics(fs);
    return makeSprite(w, h, 70, x => {
      x.save();
      x.shadowColor = 'rgba(0, 6, 20, 0.45)'; x.shadowBlur = 40; x.shadowOffsetX = 6000; x.shadowOffsetY = 16;
      x.fillStyle = '#000'; x.beginPath(); rr(x, -6000, 0, w, h, 22); x.fill();
      x.restore();
      x.beginPath(); rr(x, 0, 0, w, h, 22); x.fillStyle = 'rgba(255, 255, 255, 0.97)'; x.fill();
      x.beginPath(); x.arc(26 + 28, h / 2, 28, 0, Math.PI * 2); x.fillStyle = c.color || B.primary; x.fill();
      drawIcon(x, c.icon || 'spark', 26 + 28, h / 2, 30, '#FFFFFF');
      applyFont(x, ft); x.fillStyle = B.ink;
      const tx = 26 + 56 + 18;
      if (c.sub) {
        x.fillText(c.title, tx, Math.round(h / 2 - 6));
        applyFont(x, fs); x.fillStyle = B.muted;
        x.fillText(c.sub, tx, Math.round(h / 2 + 6 + ms.cap + 6));
      } else x.fillText(c.title, tx, Math.round(h / 2 + mt.cap / 2));
    });
  }
  function prepMotion(sc) {
    const s = sc.source;
    sc.SW = ST.W; sc.SH = ST.H;
    if (s.preset !== 'intro') throw new Error(`scene ${sc.id}: unknown motion preset "${s.preset}"`);
    const rng = mulberry(s.seed || 11);
    const m = sc.motion = {};
    m.cards = (s.cards || []).map(c => Object.assign({}, c, { sp: activitySprite(c), ph: rng() }));
    m.texts = (s.questions || []).map(q => Object.assign({}, q, { sp: textSprite({ weight: 700, size: s.question_size || 64, track: -0.022 }, [q.text], '#FFFFFF', 'center', 1.1) }));
    m.tag = s.tagline ? textSprite({ weight: 500, size: s.tagline_size || 38, track: -0.005 }, [s.tagline], 'rgba(255, 255, 255, 0.82)', 'center', 1.2) : null;
    m.particles = Array.from({ length: 64 }, () => ({ x: rng() * ST.W, y: rng() * ST.H, v: 5 + rng() * 12, r: 1 + rng() * 1.7, a: 0.07 + rng() * 0.2, ph: rng() }));
    m.pings = Array.from({ length: 16 }, (_, i) => ({ t: 0.2 + i * 0.5 + rng() * 0.3, x: 200 + rng() * (ST.W - 400), y: 150 + rng() * (ST.H - 300) }));
  }
  async function renderMotion(ctx, sc, lt, T, info, keep) {
    const s = sc.source, m = sc.motion, W = ST.W, H = ST.H, B = ST.tl.brand.colors;
    const imgs = {};
    for (const [k, u] of Object.entries(s.image_urls || {})) { imgs[k] = await loadBitmap(u); keep.add(u); }
    info.image = 'motion:' + s.preset;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    if (ST.stage) drawStageBg(ctx, T); else { ctx.fillStyle = ST.bg; ctx.fillRect(0, 0, W, H); }
    const span = (v, a) => (Array.isArray(v) ? v : [a, a + 1]);
    const win = span(s.window, 1e9), conv = span(s.converge, 1e9), sca = span(s.scatter, 1e9), dim = span(s.dim, 1e9);
    const uw = EASE.inOutQuint(clamp((lt - win[0]) / (win[1] - win[0]), 0, 1));
    const uc = clamp((lt - conv[0]) / (conv[1] - conv[0]), 0, 1), ucE = EASE.inOutQuint(uc);
    const us = EASE.inOut(clamp((lt - sca[0]) / (sca[1] - sca[0]), 0, 1));
    let ud = EASE.inOut(clamp((lt - dim[0]) / (dim[1] - dim[0]), 0, 1));
    ud *= 1 - clamp(uc * 3, 0, 1);
    const center = s.center || [W / 2, H / 2];

    // ambient particles and activity pings (fade out as the product window opens)
    const pa = 1 - uw;
    if (pa > 0.001) {
      ctx.fillStyle = B.accent;
      for (const p of m.particles) {
        const y = (((p.y - p.v * lt) % H) + H) % H, x = p.x + 10 * Math.sin(2 * Math.PI * (lt / 9 + p.ph));
        ctx.globalAlpha = p.a * pa * (0.6 + 0.4 * Math.sin(2 * Math.PI * (lt / 3 + p.ph)));
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      const pingEnd = s.pings === false ? -1 : sca[0] + 1.0;
      for (const g of m.pings) {
        const u = (lt - g.t) / 1.7;
        if (u < 0 || u > 1 || g.t > pingEnd) continue;
        ctx.globalAlpha = 0.42 * (1 - u) * pa;
        ctx.strokeStyle = B.accent; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(g.x, g.y, 6 + 36 * EASE.out(u), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.65 * (1 - u) * pa;
        ctx.beginPath(); ctx.arc(g.x, g.y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // activity cards: appear, float, scatter, dim behind the questions, converge into the hub
    const pos = m.cards.map(c => {
      if (lt < c.t) return null;
      const ain = EASE.outQuart(clamp((lt - c.t) / 0.55, 0, 1));
      const fx = 5 * Math.sin(2 * Math.PI * (lt / 7 + c.ph)), fy = 7 * Math.sin(2 * Math.PI * (lt / 5.5 + c.ph * 1.3));
      const bx = c.sx != null ? lerp(c.x, c.sx, us) : c.x, by = c.sy != null ? lerp(c.y, c.sy, us) : c.y;
      const x = lerp(bx + fx, center[0], ucE), y = lerp(by + fy + (1 - ain) * 22, center[1], ucE);
      const rot = (c.rot || 0) * us * (1 - ucE) * Math.PI / 180;
      const k = (0.92 + 0.08 * ain) * lerp(1, 0.2, ucE) * (c.scale || 1);
      const a = ain * lerp(1, 0.3, ud) * (1 - clamp((uc - 0.55) / 0.45, 0, 1));
      return { c, x, y, rot, k, a, blur: 2.5 * ud };
    });
    const la = Math.sin(Math.PI * clamp(uc * 1.2, 0, 1));
    if (la > 0.001) {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = B.accent; ctx.setLineDash([2, 9]);
      for (const q of pos) {
        if (!q) continue;
        ctx.globalAlpha = 0.55 * la;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(center[0], center[1]); ctx.stroke();
      }
      ctx.setLineDash([]);
      const g = ctx.createRadialGradient(center[0], center[1], 0, center[0], center[1], 160);
      g.addColorStop(0, rgba(B.accent, 0.55 * la)); g.addColorStop(1, rgba(B.accent, 0));
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(center[0] - 170, center[1] - 170, 340, 340);
      ctx.restore();
    }
    for (const q of pos) {
      if (!q || q.a <= 0.002) continue;
      const sp = q.c.sp;
      ctx.save();
      ctx.globalAlpha = clamp(q.a, 0, 1);
      if (q.blur > 0.05) ctx.filter = `blur(${q.blur.toFixed(2)}px)`;
      ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(q.k, q.k);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = ST.quality;
      ctx.drawImage(sp.canvas, -sp.w / 2 - sp.m, -sp.h / 2 - sp.m);
      ctx.restore();
    }

    // the three questions
    const tOut = s.text_out != null ? +s.text_out : conv[0];
    if (ud > 0.001) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 820);
      g.addColorStop(0, `rgba(3, 9, 20, ${(0.6 * ud).toFixed(3)})`); g.addColorStop(1, 'rgba(3, 9, 20, 0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    m.texts.forEach((q, i) => {
      if (lt < q.t) return;
      const e = EASE.outQuart(clamp((lt - q.t) / 0.5, 0, 1));
      const a = e * (1 - clamp((lt - tOut) / 0.45, 0, 1));
      if (a <= 0.001) return;
      const y = (q.y != null ? q.y : 390 + i * 112) + (1 - e) * 24;
      drawSprite(ctx, q.sp, Math.round((W - q.sp.w) / 2), Math.round(y), a);
    });

    // logo and tagline
    const L = s.logo_at;
    if (L && imgs.logo && lt >= L[0]) {
      const ain = EASE.outQuart(clamp((lt - L[0]) / 0.7, 0, 1));
      const aout = 1 - EASE.inOut(clamp((lt - L[1]) / 0.45, 0, 1));
      const a = ain * aout;
      if (a > 0.001) {
        const lw0 = s.logo_width || 760, lh0 = lw0 * imgs.logo.h / imgs.logo.w;
        const k = 0.94 + 0.06 * ain, lw = lw0 * k, lh = lh0 * k;
        const y = center[1] - lh0 - 10 - (1 - aout) * 30;
        ctx.save();
        ctx.globalAlpha = a; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = ST.quality;
        ctx.drawImage(imgs.logo.bmp, W / 2 - lw / 2, y + (lh0 - lh) / 2, lw, lh);
        ctx.restore();
        if (m.tag) {
          const ta = a * EASE.outQuart(clamp((lt - (s.tagline_at != null ? +s.tagline_at : L[0] + 0.3)) / 0.6, 0, 1));
          drawSprite(ctx, m.tag, Math.round((W - m.tag.w) / 2), Math.round(y + lh0 + 40 + (1 - ta) * 10), ta);
        }
      }
    }

    // the product window grows into the stage frame
    if (lt >= win[0] && imgs.home) {
      const R1 = ST.stage ? ST.stage.rect : [0, 0, W, H];
      const r1 = ST.stage ? ST.stage.radius : 0;
      const w0 = s.window_from || [W / 2 - 280, H / 2 + 20, 560, 315];
      const R = [0, 1, 2, 3].map(i => lerp(w0[i], R1[i], uw));
      const a = EASE.out(clamp((lt - win[0]) / 0.35, 0, 1));
      const blur = 10 * (1 - uw);
      drawWindow(ctx, R, lerp(14, r1, uw), (c, x, y, w, h) => {
        if (blur > 0.05) c.filter = `blur(${blur.toFixed(2)}px)`;
        c.drawImage(imgs.home.bmp, x, y, w, h);
        c.filter = 'none';
      }, a);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ explanatory overlays
  // kind "transfer": FROM (current executive) -> a lead chip travels -> TO (new executive)
  function prepTransfer(o) {
    const B = ST.tl.brand.colors;
    const fc = { weight: 700, size: 17, track: 0.14 }, fl = { weight: 650, size: 28, track: -0.012 };
    const from = o.from || 'Current executive', to = o.to || 'New executive';
    const lw = Math.max(textWidth(fl, from), textWidth(fl, to));
    const gw = 76 + 20 + lw, gap = 150, w = Math.ceil(44 + gw + gap + gw + 44), h = 150;
    const mc = metrics(fc), ml = metrics(fl);
    const group = (x, cap, label, col) => {
      x.beginPath(); x.arc(38, h / 2, 38, 0, Math.PI * 2); x.fillStyle = col; x.fill();
      drawIcon(x, 'user', 38, h / 2 + 2, 40, '#FFFFFF');
      applyFont(x, fc); x.fillStyle = B.accent; x.fillText(cap, 96, Math.round(h / 2 - 10));
      applyFont(x, fl); x.fillStyle = '#FFFFFF'; x.fillText(label, 96, Math.round(h / 2 + 12 + ml.cap));
    };
    const panel = makeSprite(w, h, 70, x => {
      x.save();
      x.shadowColor = 'rgba(0, 4, 16, 0.5)'; x.shadowBlur = 50; x.shadowOffsetX = 6000; x.shadowOffsetY = 18;
      x.fillStyle = '#000'; x.beginPath(); rr(x, -6000, 0, w, h, 30); x.fill();
      x.restore();
      x.beginPath(); rr(x, 0, 0, w, h, 30); x.fillStyle = 'rgb(10, 19, 40)'; x.fill();
      x.strokeStyle = 'rgba(255, 255, 255, 0.12)'; x.lineWidth = 1.5; x.beginPath(); rr(x, 0.75, 0.75, w - 1.5, h - 1.5, 29); x.stroke();
      x.save(); x.translate(44, 0); group(x, 'FROM', from, '#334155'); x.restore();
      x.save(); x.translate(44 + gw + gap, 0); group(x, 'TO', to, B.primary); x.restore();
    });
    const fchip = { weight: 650, size: 21, track: 0 };
    const cw = Math.ceil(18 + 10 + 10 + textWidth(fchip, o.chip || 'Lead') + 20);
    const chip = makeSprite(cw, 40, 30, x => {
      x.save(); x.shadowColor = 'rgba(0, 4, 16, 0.45)'; x.shadowBlur = 18; x.shadowOffsetX = 6000; x.shadowOffsetY = 6;
      x.fillStyle = '#000'; x.beginPath(); rr(x, -6000, 0, cw, 40, 20); x.fill(); x.restore();
      x.beginPath(); rr(x, 0, 0, cw, 40, 20); x.fillStyle = '#FFFFFF'; x.fill();
      x.beginPath(); x.arc(18 + 5, 20, 5, 0, Math.PI * 2); x.fillStyle = '#22C55E'; x.fill();
      applyFont(x, fchip); x.fillStyle = B.ink; x.fillText(o.chip || 'Lead', 18 + 10 + 10, Math.round(20 + metrics(fchip).cap / 2));
    });
    o._sp = { panel, chip, w, h, a0: 44 + gw + 22, a1: 44 + gw + gap - 22, fromX: 44 + 38, toX: 44 + gw + gap + 38 };
  }
  function drawOverlay(ctx, sc, o, lt) {
    if (o.kind !== 'transfer') return;
    const a = envelope(lt, o.start == null ? 0 : +o.start, o.end == null ? sc.dur : +o.end, 0.45, 0.35);
    if (a <= 0) return;
    if (!o._sp) prepTransfer(o);
    const S = o._sp, B = ST.tl.brand.colors;
    const e = EASE.outQuart(a);
    const px = Math.round((o.x == null ? ST.W / 2 : +o.x) - S.w / 2), py = Math.round((o.y == null ? ST.H / 2 : +o.y) - S.h / 2 + (1 - e) * 18);
    ctx.save();                                             // quiet the page behind the graphic
    ctx.globalAlpha = 1; ctx.fillStyle = `rgba(6, 16, 31, ${(0.32 * e).toFixed(3)})`; ctx.fillRect(0, 0, ST.W, ST.H);
    ctx.restore();
    drawSprite(ctx, S.panel, px, py, e);
    const t0 = +o.start;
    const g = EASE.inOut(clamp((lt - t0 - 0.35) / 0.7, 0, 1));
    const ax0 = px + S.a0, ax1 = px + S.a1, ay = py + S.h / 2;
    ctx.save();
    ctx.globalAlpha = e; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'; ctx.lineWidth = 3; ctx.setLineDash([3, 9]);
    ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay); ctx.stroke();
    ctx.setLineDash([]);
    if (g > 0.001) {
      const ex = lerp(ax0, ax1, g);
      ctx.strokeStyle = B.accent; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ex, ay); ctx.stroke();
      const hk = clamp((g - 0.7) / 0.3, 0, 1) * 14;
      if (hk > 0.5) { ctx.beginPath(); ctx.moveTo(ex - hk, ay - hk * 0.75); ctx.lineTo(ex, ay); ctx.lineTo(ex - hk, ay + hk * 0.75); ctx.stroke(); }
    }
    const mv = o.move || [t0 + 1.0, t0 + 2.2];
    const um = EASE.inOutQuint(clamp((lt - mv[0]) / (mv[1] - mv[0]), 0, 1));
    const ca = clamp((lt - mv[0] + 0.35) / 0.3, 0, 1);
    if (ca > 0.001) {
      const cx = lerp(px + S.fromX, px + S.toX, um), cy = py - 6 - Math.sin(Math.PI * um) * 34;
      drawSprite(ctx, S.chip, Math.round(cx - S.chip.w / 2), Math.round(cy - S.chip.h / 2), e * ca);
    }
    const ga = EASE.out(clamp((lt - mv[1]) / 0.35, 0, 1));
    if (ga > 0.001) {
      const rx = px + S.toX, ry = py + S.h / 2;
      ctx.globalAlpha = e * ga;
      ctx.strokeStyle = '#22C55E'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(rx, ry, 38 + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(rx + 30, ry + 28, 15, 0, Math.PI * 2); ctx.fillStyle = '#22C55E'; ctx.fill();
      drawIcon(ctx, 'check', rx + 30, ry + 28, 20, '#FFFFFF');
    }
    ctx.restore();
  }

  // --------------------------------------------------------------- layering
  function transitionWindow(sc) {
    const tr = sc.transition;
    if (!tr || !tr.type || tr.type === 'cut' || !(tr.duration > 0) || sc.index === 0) return null;
    const d = +tr.duration, al = tr.align || 'center';
    const ws = al === 'start' ? sc.start : al === 'end' ? sc.start - d : sc.start - d / 2;
    return { ws, we: ws + d, d, type: tr.type, dir: tr.direction || 'left', color: tr.color || '#FFFFFF' };
  }
  function layersAt(T) {
    const S = ST.scenes;
    for (let i = 1; i < S.length; i++) {
      const w = S[i].win;
      if (w && T >= w.ws && T < w.we) return { out: S[i - 1], inc: S[i], w, u: (T - w.ws) / w.d };
    }
    let cur = null;
    for (const sc of S) if (T >= sc.start && T < sc.end) cur = sc;
    if (!cur && S.length && T >= S[S.length - 1].end) cur = S[S.length - 1];
    return { solo: cur };
  }
  async function renderScene(ctx, sc, T, infos, keep) {
    const lt = T - sc.start;
    const info = { scene: sc.id, lt: +lt.toFixed(4) };
    infos.push(info);
    if (sc.isCard) {
      if (sc.images) await Promise.all(sc.images.map(im => im.decode()));
      renderCard(ctx, sc, lt);
    } else if (sc.isMotion) await renderMotion(ctx, sc, lt, T, info, keep);
    else if (sc.staged) {
      await renderFootage(ST.fctx, sc, lt, info, keep);
      drawStaged(ctx, T, ST.f);
    } else await renderFootage(ctx, sc, lt, info, keep);
  }

  async function renderAt(T) {
    if (!ST.tl) throw new Error('renderAt called before loadTimeline');
    const W = ST.W, H = ST.H, ctx = ST.ctx;
    const L = layersAt(T);
    const infos = [], keep = new Set();
    let transition = null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = 'transparent';
    if (L.solo) {
      await renderScene(ctx, L.solo, T, infos, keep);
    } else if (L.out && L.w.type === 'stage_push' && L.out.staged && L.inc.staged) {
      // content slides inside the fixed window; the background and frame stay put
      const io = { scene: L.out.id, lt: +(T - L.out.start).toFixed(4) }, ii = { scene: L.inc.id, lt: +(T - L.inc.start).toFixed(4) };
      infos.push(io, ii);
      await renderFootage(ST.actx, L.out, T - L.out.start, io, keep);
      await renderFootage(ST.bctx, L.inc, T - L.inc.start, ii, keep);
      const u = EASE.inOutQuint(L.u), sign = (L.w.dir === 'right') ? -1 : 1;
      drawStageBg(ctx, T);
      drawWindow(ctx, ST.stage.rect, ST.stage.radius, (c, x, y, w, h) => {
        const o = u * w;
        c.drawImage(ST.a, 0, 0, W, H, x - sign * o, y, w, h);
        c.drawImage(ST.b, 0, 0, W, H, x + sign * (w - o), y, w, h);
      });
      transition = { type: L.w.type, u: +L.u.toFixed(4) };
    } else if (L.out) {
      await renderScene(ST.actx, L.out, T, infos, keep);
      await renderScene(ST.bctx, L.inc, T, infos, keep);
      const w = L.w;
      const horiz = w.dir === 'left' || w.dir === 'right';
      const sign = (w.dir === 'left' || w.dir === 'up') ? 1 : -1;
      const span = horiz ? W : H;
      const put = (cv, d) => { const o = Math.round(d); ctx.drawImage(cv, horiz ? o : 0, horiz ? 0 : o); };
      ctx.fillStyle = ST.bg; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      if (w.type === 'crossfade') {
        ctx.drawImage(ST.a, 0, 0);
        ctx.globalAlpha = EASE.inOutSine(L.u);
        ctx.drawImage(ST.b, 0, 0);
        ctx.globalAlpha = 1;
      } else if (w.type === 'push') {
        const u = EASE.inOut(L.u);
        put(ST.a, -sign * u * span);
        put(ST.b, sign * (1 - u) * span);
      } else if (w.type === 'slide') {
        const u = EASE.inOut(L.u);
        put(ST.a, -sign * u * span * 0.18);
        ctx.fillStyle = `rgba(0, 0, 0, ${(u * 0.35).toFixed(4)})`; ctx.fillRect(0, 0, W, H);
        const o = Math.round(sign * (1 - u) * span);
        ctx.save();                                           // soft shadow on the leading edge
        ctx.shadowColor = 'rgba(5, 10, 25, 0.45)'; ctx.shadowBlur = 80;
        ctx.shadowOffsetX = (horiz ? o : 0) + 6000; ctx.shadowOffsetY = horiz ? 0 : o;
        ctx.fillStyle = '#000'; ctx.fillRect(-6000, 0, W, H);
        ctx.restore();
        ctx.drawImage(ST.b, horiz ? o : 0, horiz ? 0 : o);
      } else if (w.type === 'dip') {
        const u = L.u;
        ctx.drawImage(u < 0.5 ? ST.a : ST.b, 0, 0);
        ctx.globalAlpha = EASE.inOutSine(u < 0.5 ? u * 2 : (1 - u) * 2);
        ctx.fillStyle = w.color; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      } else ctx.drawImage(L.u < 0.5 ? ST.a : ST.b, 0, 0);
      ctx.imageSmoothingEnabled = true;
      transition = { type: w.type, u: +L.u.toFixed(4) };
    } else {
      ctx.fillStyle = ST.bg; ctx.fillRect(0, 0, W, H);        // gap: background only
    }
    evict(keep);
    drawGlobalOverlays(ctx, T);
    if (ST.debug) {
      const label = `${T.toFixed(3)}s  f${Math.round(T * ST.fps) + 1}  ${infos.map(i => `${i.scene}@${i.lt.toFixed(2)}`).join(' + ')}`;
      ctx.save();
      ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255, 0, 128, 0.6)'; ctx.lineWidth = 1;
      ctx.strokeRect(64.5, 64.5, W - 129, H - 129);
      ctx.setLineDash([]);
      ctx.font = '600 15px Menlo, monospace'; ctx.letterSpacing = '0px'; ctx.textBaseline = 'alphabetic';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'; ctx.beginPath(); rr(ctx, 12, 10, tw + 18, 28, 6); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.fillText(label, 21, 29);
      ctx.restore();
    }
    return { t: T, layers: infos, transition };
  }

  // ------------------------------------------------------------------- load
  async function loadTimeline(tl, opts) {
    opts = opts || {};
    ST.tl = tl; ST.warnings = [];
    ST.W = tl.width || 1920; ST.H = tl.height || 1080; ST.fps = tl.fps || 30;
    ST.debug = !!opts.debug;
    if (opts.cacheMax) ST.cacheMax = opts.cacheMax;
    ST.quality = opts.quality || 'high';                   // canvas resampling: high | medium | low
    tl.brand = tl.brand || {};
    tl.brand.colors = Object.assign({ primary: '#2563EB', accent: '#7AA7FF', ink: '#0F172A', paper: '#FFFFFF', muted: '#5B667A' }, tl.brand.colors || {});
    ST.font = tl.brand.font || DEFAULT_FONT;
    ST.bg = tl.background || '#0B1020';

    const frame = document.getElementById('frame');
    frame.innerHTML = '';
    frame.style.width = `${ST.W}px`; frame.style.height = `${ST.H}px`;
    frame.style.background = ST.bg;
    const out = newCanvas(ST.W, ST.H);
    out.id = 'out';
    out.style.width = `${ST.W}px`; out.style.height = `${ST.H}px`;
    frame.appendChild(out);
    ST.out = out;
    ST.ctx = out.getContext('2d', { alpha: false, desynchronized: false });
    ST.a = newCanvas(ST.W, ST.H); ST.actx = ST.a.getContext('2d', { alpha: false });
    ST.b = newCanvas(ST.W, ST.H); ST.bctx = ST.b.getContext('2d', { alpha: false });
    ST.scratch = newCanvas(ST.W, ST.H); ST.sctx = ST.scratch.getContext('2d', { alpha: false });
    ST.mctx = newCanvas(16, 16).getContext('2d');
    ST.stage = tl.stage ? prepStage(tl.stage) : null;
    if (ST.stage) { ST.f = newCanvas(ST.W, ST.H); ST.fctx = ST.f.getContext('2d', { alpha: false }); }

    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    prepGlobalOverlays(tl);
    ST.scenes = (tl.scenes || []).slice().sort((a, b) => a.start - b.start);
    ST.scenes.forEach(prepScene);
    ST.scenes.forEach(sc => { sc.win = transitionWindow(sc); });
    // card images must be decodable before the first frame
    for (const sc of ST.scenes) {
      if (sc.images) await Promise.all(sc.images.map(im => im.decode().catch(e => { throw new Error(`scene ${sc.id}: cannot decode logo ${im.src}: ${e.message || e}`); })));
      if (sc.isCard) layoutCard(sc);
    }
    ST.ctx.fillStyle = ST.bg; ST.ctx.fillRect(0, 0, ST.W, ST.H);
    const duration = tl.duration != null ? +tl.duration : (ST.scenes.length ? ST.scenes[ST.scenes.length - 1].end : 0);
    return {
      duration, fps: ST.fps, frames: Math.round(duration * ST.fps), width: ST.W, height: ST.H,
      scenes: ST.scenes.map(s => ({
        id: s.id, start: s.start, end: s.end, type: s.source.type,
        cursor_moves: s.track ? s.track.segs.map(g => ({ kind: g.kind, from: +g.t0.toFixed(3), to: +g.t1.toFixed(3), to_xy: [Math.round(g.end.x), Math.round(g.end.y)] })) : [],
        clicks: s.track ? s.track.clicks.map(k => +k.t.toFixed(3)) : [],
        callouts: (s.coList || []).map(c => ({ text: c.text, side: c.side, w: c.w, h: c.h })),
        transition: s.win ? { type: s.win.type, from: +s.win.ws.toFixed(4), to: +s.win.we.toFixed(4) } : null,
      })),
      warnings: ST.warnings.slice(),
    };
  }

  window.loadTimeline = loadTimeline;
  window.renderAt = renderAt;
  window.__compositor = { ST, cameraAt, cursorAt, evalTrack, srcTimeAt, sceneTimeOf, EASE };
})();
