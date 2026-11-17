'use strict';
/**
 * capture.js — sharp, timestamped screen footage of a web page with Playwright + CDP.
 *
 * Method: Chrome DevTools Protocol `Page.startScreencast` driven from a Playwright
 * CDPSession. Every frame Chrome composites is delivered as a JPEG (or PNG), is
 * acknowledged immediately (`Page.screencastFrameAck`) and written to disk together
 * with the presentation timestamp Chrome reports for it. Mouse / keyboard / scroll
 * helpers log what they do on the SAME clock, so a compositor can draw a smooth
 * cursor and click ripples afterwards.
 *
 * Output (shared file contract):
 *   <outRoot>/<shotId>/frames/f_000001.jpg ...
 *   <outRoot>/<shotId>/meta.json = {
 *     shot_id, css_width, css_height, dsf, frame_width, frame_height,
 *     frames: [{ file, t_ms }], events: [{ t_ms, type, x, y, label }], ...extras }
 *   t_ms = milliseconds since capture start. Frames are variable-rate: a frame stays
 *   on screen from its t_ms until the next frame's t_ms (the last one until duration_ms).
 *
 * No dependencies besides Playwright. Nothing is downloaded. No credentials are read here.
 * Text typed into password fields is never written to the event log (see smoothType).
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const DEFAULT_OUT_ROOT = path.join(__dirname, '..', '..', '..', 'reports', 'video', 'capture');
const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

/** wall clock in epoch milliseconds with sub-millisecond resolution (same epoch as Chrome's frame timestamps) */
const nowMs = () => performance.timeOrigin + performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ easing */
const EASINGS = {
  linear: (t) => t,
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeOutQuint: (t) => 1 - Math.pow(1 - t, 5),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  /** fast start, long gentle landing: closest to a real hand reaching for a target */
  human: (t) => {
    const a = 1 - Math.pow(1 - t, 3);
    const b = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return 0.45 * a + 0.55 * b;
  },
};
function resolveEasing(e) {
  if (typeof e === 'function') return e;
  return EASINGS[e] || EASINGS.easeInOutCubic;
}

/* ------------------------------------------------------- per-page state */
const pageState = new WeakMap();
function st(page) {
  let s = pageState.get(page);
  if (!s) {
    s = { mouse: { x: 0, y: 0 }, mouseKnown: false, capture: null, curveSign: 1 };
    pageState.set(page, s);
  }
  return s;
}

function logEvent(page, type, x, y, label, extra) {
  const s = st(page);
  const cap = s.capture;
  if (!cap || cap.stopped) return null;
  const ev = Object.assign(
    { t_ms: Math.max(0, Math.round(nowMs() - cap.t0)), type, x: round1(x), y: round1(y), label: label == null ? '' : String(label) },
    extra || {}
  );
  cap.events.push(ev);
  return ev;
}

/* ------------------------------------------------- image header parsing */
function jpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if ((m >= 0xd0 && m <= 0xd9) || m === 0x01) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const comps = [];
      const n = buf[i + 9];
      for (let c = 0; c < n; c++) {
        const hv = buf[i + 10 + c * 3 + 1];
        comps.push(`${hv >> 4}x${hv & 15}`);
      }
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), sampling: comps.join(',') };
    }
    i += 2 + len;
  }
  return null;
}
function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function imageSize(buf) {
  return jpegSize(buf) || pngSize(buf);
}

/* ---------------------------------------------------------- startCapture */
/**
 * Start capturing the page.
 *
 * @param {import('playwright').Page} page
 * @param {object}  o
 * @param {string}  o.shotId                       shot directory name (required)
 * @param {string} [o.outRoot]                     default reports/video/capture
 * @param {'jpeg'|'png'} [o.format='jpeg']
 * @param {number} [o.quality=95]                  JPEG quality (ignored for png)
 * @param {number} [o.maxWidth]                    default css_width  * dsf
 * @param {number} [o.maxHeight]                   default css_height * dsf
 * @param {number} [o.everyNthFrame=1]
 * @param {boolean}[o.keyframes=true]              take a CDP screenshot keyframe at the start (only if the
 *                                                 screencast did not deliver one) and one at stop(), so the first
 *                                                 and the final state of the page are always in the footage
 * @returns {Promise<{mark:(label:string)=>object, stop:()=>Promise<object>, dir:string, stats:()=>object}>}
 */
async function startCapture(page, o = {}) {
  if (!o.shotId) throw new Error('startCapture: shotId is required');
  const s = st(page);
  if (s.capture && !s.capture.stopped) throw new Error('startCapture: a capture is already running on this page');

  const format = o.format === 'png' ? 'png' : 'jpeg';
  const ext = format === 'png' ? 'png' : 'jpg';
  const quality = o.quality == null ? 95 : o.quality;
  const outRoot = path.resolve(o.outRoot || DEFAULT_OUT_ROOT);
  const dir = path.join(outRoot, o.shotId);
  const framesDir = path.join(dir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  // remove only this module's own output from a previous run of the same shot
  for (const f of fs.readdirSync(framesDir)) if (/^f_\d{6}\.(jpg|png)$/.test(f)) fs.unlinkSync(path.join(framesDir, f));
  if (fs.existsSync(path.join(dir, 'meta.json'))) fs.unlinkSync(path.join(dir, 'meta.json'));

  const dims = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })).catch(() => null);
  const vp = page.viewportSize() || (dims ? { width: dims.w, height: dims.h } : DEFAULT_VIEWPORT);
  const dsf = dims ? dims.dpr : 1;
  const maxWidth = o.maxWidth || Math.round(vp.width * dsf);
  const maxHeight = o.maxHeight || Math.round(vp.height * dsf);

  const cdp = await page.context().newCDPSession(page);
  const cap = {
    shotId: o.shotId, dir, framesDir, format, ext, quality, cdp,
    t0: 0, frames: [], events: [], pending: new Set(), stopped: false,
    firstSize: null, sizes: new Set(), bytes: 0, writeErrors: [], lastArrival: 0,
    arrivalLagSum: 0, arrivalLagMax: 0, acked: 0,
  };

  function addFrame(buf, tEpochMs, source) {
    const n = cap.frames.length + 1;
    const file = `frames/f_${String(n).padStart(6, '0')}.${ext}`;
    let t = Math.round(tEpochMs - cap.t0);
    const prev = cap.frames[cap.frames.length - 1];
    if (t < 0) t = 0;
    if (prev && t <= prev.t_ms) t = prev.t_ms + 1; // keep strictly increasing
    const rec = { file, t_ms: t, arrival_ms: Math.round(nowMs() - cap.t0) };
    if (source) rec.source = source;
    cap.frames.push(rec);
    cap.bytes += buf.length;
    if (!cap.firstSize) cap.firstSize = imageSize(buf);
    if (cap.frames.length <= 3 || cap.frames.length % 50 === 0) {
      const sz = imageSize(buf);
      if (sz) cap.sizes.add(`${sz.width}x${sz.height}`);
    }
    const p = fs.promises.writeFile(path.join(dir, file), buf)
      .catch((e) => cap.writeErrors.push(`${file}: ${e.message}`))
      .finally(() => cap.pending.delete(p));
    cap.pending.add(p);
    return rec;
  }

  const onFrame = (ev) => {
    const arrival = nowMs();
    // 1) acknowledge first: Chrome keeps at most a couple of frames in flight and drops the rest
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).then(() => { cap.acked++; }).catch(() => {});
    if (cap.stopped) return;
    const ts = ev.metadata && typeof ev.metadata.timestamp === 'number' ? ev.metadata.timestamp * 1000 : arrival;
    const lag = arrival - ts;
    cap.arrivalLagSum += lag;
    if (lag > cap.arrivalLagMax) cap.arrivalLagMax = lag;
    addFrame(Buffer.from(ev.data, 'base64'), ts, null);
  };
  cdp.on('Page.screencastFrame', onFrame);

  const onNav = (frame) => {
    if (frame !== page.mainFrame()) return;
    let label = '';
    try { const u = new URL(frame.url()); label = u.protocol === 'file:' ? path.basename(u.pathname) : u.origin + u.pathname; } catch (e) { /* ignore */ }
    logEvent(page, 'nav', s.mouse.x, s.mouse.y, label); // query string and hash are dropped on purpose
  };
  page.on('framenavigated', onNav);

  async function keyframe(source) {
    const params = { format, fromSurface: true, captureBeyondViewport: false };
    if (format === 'jpeg') params.quality = quality;
    const fw = cap.firstSize ? cap.firstSize.width : Math.min(maxWidth, Math.round(vp.width * dsf));
    const scale = fw / (vp.width * dsf);
    if (Math.abs(scale - 1) > 0.001) params.clip = { x: 0, y: 0, width: vp.width, height: vp.height, scale };
    const t = nowMs();
    const r = await cdp.send('Page.captureScreenshot', params);
    addFrame(Buffer.from(r.data, 'base64'), t, source);
  }

  cap.t0 = nowMs();
  s.capture = cap;
  await cdp.send('Page.startScreencast', { format, quality, maxWidth, maxHeight, everyNthFrame: o.everyNthFrame || 1 });
  // give the screencast a moment to deliver its first frame; otherwise take a keyframe so t=0 has a picture
  const waitUntil = nowMs() + 400;
  while (cap.frames.length === 0 && nowMs() < waitUntil) await sleep(10);
  if (cap.frames.length === 0 && o.keyframes !== false) await keyframe('keyframe-start').catch(() => {});
  logEvent(page, 'mark', s.mouse.x, s.mouse.y, 'capture-start');

  function stats() {
    const dur = (cap.stopped ? cap.durationMs : nowMs() - cap.t0) / 1000;
    return {
      frames: cap.frames.length, seconds: round1(dur), fps: dur > 0 ? Math.round((cap.frames.length / dur) * 100) / 100 : 0,
      megabytes: Math.round((cap.bytes / 1048576) * 10) / 10,
      mean_arrival_lag_ms: cap.frames.length ? round1(cap.arrivalLagSum / cap.frames.length) : 0,
      max_arrival_lag_ms: round1(cap.arrivalLagMax),
    };
  }

  async function stop() {
    if (cap.stopped) return cap.meta;
    logEvent(page, 'mark', s.mouse.x, s.mouse.y, 'capture-stop');
    await sleep(60); // let the last composited frame arrive
    if (o.keyframes !== false) await keyframe('keyframe-stop').catch(() => {});
    cap.durationMs = Math.round(nowMs() - cap.t0);
    cap.stopped = true;
    page.off('framenavigated', onNav);
    await cdp.send('Page.stopScreencast').catch(() => {});
    cdp.off('Page.screencastFrame', onFrame);
    await Promise.all([...cap.pending]);
    await cdp.detach().catch(() => {});
    const size = cap.firstSize || { width: maxWidth, height: maxHeight };
    const meta = {
      shot_id: cap.shotId,
      css_width: vp.width,
      css_height: vp.height,
      dsf,
      frame_width: size.width,
      frame_height: size.height,
      frames: cap.frames.map((f) => ({ file: f.file, t_ms: f.t_ms })),
      events: cap.events,
      // ---- extras (not part of the minimum contract) ----
      duration_ms: cap.durationMs,
      started_at: new Date(cap.t0).toISOString(),
      t0_epoch_ms: Math.round(cap.t0 * 1000) / 1000,
      format, quality: format === 'jpeg' ? quality : null,
      jpeg_sampling: size.sampling || null,
      frame_sizes_seen: [...cap.sizes],
      keyframes: cap.frames.filter((f) => f.source).map((f) => ({ file: f.file, source: f.source })),
      // when Node received each frame (same order as frames[]); arrival - t_ms = encode + transport time
      frame_arrival_ms: cap.frames.map((f) => f.arrival_ms),
      stats: stats(),
      write_errors: cap.writeErrors,
      clock: 'epoch ms; frames use Chrome metadata.timestamp, events use the Node wall clock at dispatch',
    };
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
    cap.meta = meta;
    if (s.capture === cap) s.capture = null;
    return meta;
  }

  return {
    dir,
    mark: (label) => logEvent(page, 'mark', s.mouse.x, s.mouse.y, label),
    stats,
    stop,
  };
}

/* ------------------------------------------------------------ smoothMove */
/**
 * Human-like eased cursor travel. Dispatches real mouse moves (hover states react) at ~60 Hz
 * and logs each one. The path is a shallow arc, the speed follows the easing curve.
 *
 * @param {object} [o]
 * @param {number} [o.durationMs]    default: from distance (about 300 ms for short hops, 1100 ms across the screen)
 * @param {string|function} [o.easing='human']
 * @param {number} [o.curve=0.08]    arc height as a fraction of the distance (0 = straight line)
 * @param {number} [o.hz=60]
 */
async function smoothMove(page, x, y, o = {}) {
  const s = st(page);
  if (!s.mouseKnown) {
    // first move on this page: place the pointer without travel so that there is a defined start point
    const sx = o.fromX == null ? x : o.fromX, sy = o.fromY == null ? y : o.fromY;
    await page.mouse.move(sx, sy);
    s.mouse = { x: sx, y: sy };
    s.mouseKnown = true;
    logEvent(page, 'move', sx, sy, 'start');
    if (sx === x && sy === y) return { x, y };
  }
  const from = { x: s.mouse.x, y: s.mouse.y };
  const dx = x - from.x, dy = y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return { x, y };
  const durationMs = o.durationMs == null ? clamp(260 + dist * 0.55, 260, 1100) : Math.max(0, o.durationMs);
  const ease = resolveEasing(o.easing || 'human');
  const hz = o.hz || 60;
  const curve = o.curve == null ? 0.08 : o.curve;
  s.curveSign = -s.curveSign; // alternate the arc direction so repeated moves do not look mechanical
  const cx = from.x + dx / 2 + (-dy / dist) * dist * curve * s.curveSign;
  const cy = from.y + dy / 2 + (dx / dist) * dist * curve * s.curveSign;

  const start = nowMs();
  let tick = 0;
  for (;;) {
    const p = durationMs === 0 ? 1 : Math.min(1, (nowMs() - start) / durationMs);
    const e = p >= 1 ? 1 : ease(p);
    const u = 1 - e;
    const px = p >= 1 ? x : u * u * from.x + 2 * u * e * cx + e * e * x;
    const py = p >= 1 ? y : u * u * from.y + 2 * u * e * cy + e * e * y;
    logEvent(page, 'move', px, py, '');
    await page.mouse.move(px, py);
    s.mouse = { x: px, y: py };
    if (p >= 1) break;
    tick++;
    await sleep(start + tick * (1000 / hz) - nowMs());
  }
  return { x, y };
}

/* ----------------------------------------------------------- smoothClick */
async function resolvePoint(page, target, o = {}) {
  if (typeof target === 'string') target = page.locator(target).first();
  if (target && typeof target.boundingBox === 'function') {
    await target.waitFor({ state: 'visible', timeout: o.timeout || 10000 });
    if (o.scrollIntoView !== false) await target.scrollIntoViewIfNeeded({ timeout: o.timeout || 10000 }).catch(() => {});
    const box = await target.boundingBox();
    if (!box) throw new Error('smoothClick: target has no bounding box (not visible)');
    const fx = o.fx == null ? 0.5 : o.fx, fy = o.fy == null ? 0.5 : o.fy;
    return { x: box.x + box.width * fx, y: box.y + box.height * fy, box };
  }
  if (target && typeof target.x === 'number' && typeof target.y === 'number') return { x: target.x, y: target.y, box: null };
  throw new Error('smoothClick: target must be a Locator, a selector string or {x, y}');
}

/**
 * Travel to the target, settle, press, release. Logs move / down / up.
 * @param {import('playwright').Locator|string|{x:number,y:number}} locatorOrPoint
 * @param {object} [o] { durationMs, easing, settleMs=140, holdMs=80, afterMs=0, label, fx, fy }
 */
async function smoothClick(page, locatorOrPoint, o = {}) {
  const pt = await resolvePoint(page, locatorOrPoint, o);
  await smoothMove(page, pt.x, pt.y, { durationMs: o.durationMs, easing: o.easing, curve: o.curve });
  await sleep(o.settleMs == null ? 140 : o.settleMs);
  logEvent(page, 'down', pt.x, pt.y, o.label || '');
  await page.mouse.down();
  await sleep(o.holdMs == null ? 80 : o.holdMs);
  logEvent(page, 'up', pt.x, pt.y, o.label || '');
  await page.mouse.up();
  if (o.afterMs) await sleep(o.afterMs);
  return pt;
}

/* ------------------------------------------------------------ smoothType */
/**
 * Click into the field and type like a person. Logs one 'key' event per character.
 * Characters typed into a password field (or with { secret: true }) are logged as '*'.
 * @param {object} [o] { cps=9, jitter=0.3, click=true, secret=false, clear=false }
 */
async function smoothType(page, locator, text, o = {}) {
  if (typeof locator === 'string') locator = page.locator(locator).first();
  const cps = o.cps || 9;
  const jitter = o.jitter == null ? 0.3 : o.jitter;
  let pt;
  if (o.click === false) pt = await resolvePoint(page, locator, o);
  else pt = await smoothClick(page, locator, { durationMs: o.durationMs, label: 'focus' });
  const isPassword = await locator.evaluate((el) => (el.getAttribute && (el.getAttribute('type') || '').toLowerCase() === 'password')).catch(() => false);
  const secret = !!o.secret || isPassword;
  if (o.clear) {
    await locator.fill('');
    logEvent(page, 'key', pt.x, pt.y, 'clear');
  }
  await sleep(o.beforeMs == null ? 180 : o.beforeMs);
  const start = nowMs();
  let due = 0;
  for (const ch of String(text)) {
    logEvent(page, 'key', pt.x, pt.y, secret ? '*' : ch);
    await page.keyboard.type(ch);
    // deterministic-enough jitter; the schedule is absolute so that slow round trips do not accumulate
    due += (1000 / cps) * (1 + jitter * (Math.random() * 2 - 1)) * (ch === ' ' ? 1.25 : 1);
    await sleep(start + due - nowMs());
  }
  return pt;
}

/* ---------------------------------------------------------- smoothScroll */
/**
 * Eased wheel scrolling: many small wheel deltas following the easing curve. Logs 'scroll' events.
 * @param {number} dy       CSS pixels, positive = down
 * @param {object} [o] { durationMs=900, easing='easeInOutCubic', hz=60, dx=0, at:{x,y}, method='wheel'|'js' }
 *   method 'wheel' (default) sends real wheel events at the pointer position: nested scroll areas and the
 *                  page's own wheel handlers behave as for a user.
 *   method 'js'    calls scrollBy() on the scroll container under the pointer: no wheel events are fired.
 */
async function smoothScroll(page, dy, o = {}) {
  const s = st(page);
  const durationMs = o.durationMs == null ? 900 : Math.max(0, o.durationMs);
  const ease = resolveEasing(o.easing || 'easeInOutCubic');
  const hz = o.hz || 60;
  const dxTotal = o.dx || 0;
  if (o.at) await smoothMove(page, o.at.x, o.at.y, {});
  else if (!s.mouseKnown) {
    const vp = page.viewportSize() || DEFAULT_VIEWPORT;
    await smoothMove(page, Math.round(vp.width * 0.6), Math.round(vp.height * 0.55), {});
  }
  let container = null;
  if (o.method === 'js') {
    container = await page.evaluateHandle(([x, y]) => {
      let el = document.elementFromPoint(x, y);
      while (el && el !== document.documentElement && el !== document.body) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) return el;
        el = el.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    }, [s.mouse.x, s.mouse.y]);
  }
  const start = nowMs();
  let sentX = 0, sentY = 0, tick = 0;
  for (;;) {
    const p = durationMs === 0 ? 1 : Math.min(1, (nowMs() - start) / durationMs);
    const e = p >= 1 ? 1 : ease(p);
    const wantY = Math.round(dy * e), wantX = Math.round(dxTotal * e);
    const stepY = wantY - sentY, stepX = wantX - sentX;
    if (stepX !== 0 || stepY !== 0) {
      logEvent(page, 'scroll', s.mouse.x, s.mouse.y, `dy:${stepY}${stepX ? ` dx:${stepX}` : ''}`, { dx: stepX, dy: stepY });
      if (container) await container.evaluate((el, d) => el.scrollBy({ left: d[0], top: d[1], behavior: 'instant' }), [stepX, stepY]);
      else await page.mouse.wheel(stepX, stepY);
      sentX = wantX; sentY = wantY;
    }
    if (p >= 1) break;
    tick++;
    await sleep(start + tick * (1000 / hz) - nowMs());
  }
  if (container) await container.dispose().catch(() => {});
  return { dx: sentX, dy: sentY };
}

/* ------------------------------------------------------------------ still */
/**
 * PNG still of the current viewport at device resolution (3840x2160 when the page was opened
 * with a 1920x1080 viewport at deviceScaleFactor 2). Logs a 'mark' event "still:<basename>".
 * @returns {Promise<{file:string,width:number,height:number}>}
 */
async function still(page, file, o = {}) {
  const abs = path.resolve(file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const buf = await page.screenshot({ path: abs, type: 'png', scale: 'device', animations: 'allow', caret: 'initial', fullPage: false });
  const size = pngSize(buf) || { width: 0, height: 0 };
  const s = st(page);
  logEvent(page, 'mark', s.mouse.x, s.mouse.y, `still:${path.basename(abs)}`);
  if (o.expect !== false) {
    const ew = (o.expect && o.expect.width) || 3840, eh = (o.expect && o.expect.height) || 2160;
    if (size.width !== ew || size.height !== eh) {
      const msg = `still: ${path.basename(abs)} is ${size.width}x${size.height}, expected ${ew}x${eh} (open the page with viewport 1920x1080 and deviceScaleFactor 2)`;
      if (o.strict) throw new Error(msg);
      console.warn(msg);
    }
  }
  return { file: abs, width: size.width, height: size.height };
}

/* ------------------------------------------------ optional baked DOM cursor */
/**
 * OPTIONAL: bake a cursor into the footage. Not recommended for the final video (the compositor
 * draws a cleaner one from the event log) but useful for previews. Installs for future documents
 * (addInitScript) and for the current one.
 */
async function installDomCursor(page) {
  const script = () => {
    if (window.__capCursor) return;
    const make = () => {
      if (window.__capCursor || !document.documentElement) return;
      const el = document.createElement('div');
      el.id = '__cap_cursor';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;' +
        'transform:translate(-100px,-100px);will-change:transform;';
      el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">' +
        '<path d="M5 3 L5 22 L10.2 17.4 L13.6 25 L17 23.5 L13.7 16 L20.5 16 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      const ring = document.createElement('div');
      ring.style.cssText = 'position:fixed;left:0;top:0;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;z-index:2147483646;' +
        'pointer-events:none;border:2px solid rgba(47,91,234,.9);opacity:0;transform:translate(-100px,-100px) scale(.3);';
      document.documentElement.appendChild(ring);
      document.documentElement.appendChild(el);
      window.__capCursor = el;
      const place = (e) => { el.style.transform = 'translate(' + (e.clientX - 5) + 'px,' + (e.clientY - 3) + 'px)'; };
      document.addEventListener('mousemove', place, true);
      document.addEventListener('mousedown', (e) => {
        place(e);
        ring.style.transition = 'none';
        ring.style.opacity = '1';
        ring.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(.3)';
        requestAnimationFrame(() => {
          ring.style.transition = 'transform .45s ease-out, opacity .45s ease-out';
          ring.style.opacity = '0';
          ring.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(1.25)';
        });
      }, true);
    };
    if (document.documentElement && document.readyState !== 'loading') make();
    else document.addEventListener('DOMContentLoaded', make);
  };
  await page.addInitScript(script);
  await page.evaluate(script).catch(() => {});
}

/* ----------------------------------------------------- launch convenience */
/**
 * Launch a browser + context + page with the settings proven in the capture PoC.
 *
 * The important part is `--force-device-scale-factor=2` IN ADDITION to Playwright's emulated
 * deviceScaleFactor 2. With the emulated factor alone Chrome renders at 2x but the screencast
 * delivers frames that are scaled down to 1920x1080; with the forced factor the screencast
 * delivers the real 3840x2160 surface.
 *
 * @param {object} [o]
 * @param {object} [o.chromium]        default require('@playwright/test').chromium
 * @param {'shell'|'chromium'|'chrome'} [o.flavor='shell']   shell = chromium headless shell (recommended)
 * @param {number} [o.dsf=2]
 * @param {boolean}[o.forceDsf=true]   add --force-device-scale-factor=<dsf> (needed for frames larger than 1920x1080)
 * @param {{width:number,height:number}} [o.viewport]   default 1920x1080
 * @param {'metal'|'software'|'default'} [o.gpu='metal']
 *        metal    = --enable-gpu --use-angle=metal : the headless shell composites on the Apple GPU. Measured on
 *                   this machine: full-screen fades are captured at 55-64 fps at 3840x2160 (software: 17-30 fps).
 *        software = the headless shell default (SwiftShader / CPU).
 *        default  = add no GPU switch (full Chromium and Chrome in new headless mode already use Metal).
 * @param {string[]} [o.args]          extra Chromium switches
 * @param {object} [o.contextOptions]  merged into browser.newContext()
 */
async function launchForCapture(o = {}) {
  const chromium = o.chromium || require('@playwright/test').chromium;
  const flavor = o.flavor || 'shell';
  const dsf = o.dsf == null ? 2 : o.dsf;
  const viewport = o.viewport || DEFAULT_VIEWPORT;
  const args = ['--hide-scrollbars', '--force-color-profile=srgb'];
  if (o.forceDsf !== false && dsf !== 1) args.push(`--force-device-scale-factor=${dsf}`);
  // full Chromium / Chrome in new headless mode reserve 87 px of window height for (invisible) browser UI
  const chromeUi = flavor === 'shell' ? 0 : 87;
  args.push(`--window-size=${viewport.width},${viewport.height + chromeUi}`);
  const gpu = o.gpu || 'metal';
  if (gpu === 'metal' && flavor === 'shell' && process.platform === 'darwin') args.push('--enable-gpu', '--use-angle=metal');
  const launch = { headless: true, args: [...args, ...(o.args || [])] };
  if (flavor === 'chromium') launch.channel = 'chromium';
  else if (flavor === 'chrome') launch.channel = 'chrome';
  const browser = await chromium.launch(launch);
  const ctx = { colorScheme: 'light', reducedMotion: 'no-preference', locale: 'en-IN' };
  if (flavor === 'chrome') {
    // Google Chrome (tested: 154) crops the screencast to 1920x993 whenever Playwright's viewport emulation is
    // active. Without emulation the real window is used: 1920x1080 css px at the forced scale factor.
    ctx.viewport = null;
  } else {
    ctx.viewport = viewport;
    ctx.deviceScaleFactor = dsf;
  }
  const context = await browser.newContext(Object.assign(ctx, o.contextOptions || {}));
  const page = await context.newPage();
  return { browser, context, page, flavor, dsf, viewport, gpu, args: launch.args };
}

module.exports = {
  startCapture, smoothMove, smoothClick, smoothType, smoothScroll, still,
  installDomCursor, launchForCapture,
  EASINGS, nowMs, imageSize,
  _state: st, _logEvent: logEvent,
};
