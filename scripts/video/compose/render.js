#!/usr/bin/env node
'use strict';
/**
 * Frame-stepping render driver for scripts/video/compose/compositor.html
 *
 *   node scripts/video/compose/render.js <timeline.json> <outFramesDir>
 *        [--from s] [--to s] [--workers N] [--quality 95] [--chunk 15]
 *        [--clean] [--no-verify] [--debug] [--capture playwright|cdp] [--report file.json]
 *
 * Output: <outFramesDir>/r_000001.jpg ... at a constant fps (timeline.fps, default 30),
 * exactly <width>x<height> (default 1920x1080), JPEG quality 95.
 * File r_(k+1) always shows t = k / fps, also for range renders, so a preview of
 * 12 s to 14 s drops into the same numbering as the full render.
 *
 * Local only: the page is loaded from file:// and every image is a local file.
 * Nothing is downloaded. Paths in the timeline are resolved against
 * timeline.assets_root (default: the current working directory = repo root).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const TRANSITIONS = ['cut', 'crossfade', 'push', 'slide', 'dip', 'stage_push'];
const pad6 = n => String(n).padStart(6, '0');
const frameName = k => `r_${pad6(k + 1)}.jpg`;

// ------------------------------------------------------------------ args
function parseArgs(argv) {
  const a = { pos: [], from: null, to: null, workers: null, quality: 95, chunk: 15, clean: false, verify: true, debug: false, capture: 'playwright', report: null, cache: 6 };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const num = () => { const n = Number(argv[++i]); if (!Number.isFinite(n)) throw new Error(`${v} needs a number`); return n; };
    if (v === '--from') a.from = num();
    else if (v === '--to') a.to = num();
    else if (v === '--workers') a.workers = Math.max(1, Math.floor(num()));
    else if (v === '--quality') a.quality = clampInt(num(), 1, 100);
    else if (v === '--chunk') a.chunk = Math.max(1, Math.floor(num()));
    else if (v === '--cache') a.cache = Math.max(3, Math.floor(num()));
    else if (v === '--clean') a.clean = true;
    else if (v === '--no-verify') a.verify = false;
    else if (v === '--debug') a.debug = true;
    else if (v === '--capture') a.capture = argv[++i];
    else if (v === '--report') a.report = argv[++i];
    else if (v === '-h' || v === '--help') a.help = true;
    else if (v.startsWith('--')) throw new Error(`unknown option ${v}`);
    else a.pos.push(v);
  }
  return a;
}
const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n)));

// Default worker count: measured on the 10-core (4P + 6E) Apple Silicon machine,
// see TIMELINE.md "Render speed". Beyond the performance cores the gain flattens.
function defaultWorkers() {
  const n = os.cpus().length;
  return Math.max(1, Math.min(4, n - 2));
}

// ------------------------------------------------------- image file headers
function imageSize(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(32);
    fs.readSync(fd, head, 0, 32, 0);
    if (head.readUInt32BE(0) === 0x89504e47) return { width: head.readUInt32BE(16), height: head.readUInt32BE(20), type: 'png' };
    if (head[0] === 0xff && head[1] === 0xd8) return Object.assign(jpegSize(fd), { type: 'jpeg' });
    return null;
  } finally { fs.closeSync(fd); }
}
function jpegSize(fd) {
  const size = fs.fstatSync(fd).size;
  const b = Buffer.alloc(4);
  let pos = 2;
  while (pos + 9 < size) {
    fs.readSync(fd, b, 0, 4, pos);
    if (b[0] !== 0xff) { pos += 1; continue; }
    const m = b[1];
    if (m === 0xff) { pos += 1; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { pos += 2; continue; }
    const len = b.readUInt16BE(2);
    if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const s = Buffer.alloc(5);
      fs.readSync(fd, s, 0, 5, pos + 4);
      return { height: s.readUInt16BE(1), width: s.readUInt16BE(3) };
    }
    pos += 2 + len;
  }
  throw new Error('no SOF marker found');
}

// ------------------------------------------------------ timeline resolution
function resolveTimeline(file) {
  const errors = [], warnings = [];
  const tl = JSON.parse(fs.readFileSync(file, 'utf8'));
  const root = path.resolve(process.cwd(), tl.assets_root || '.');
  const abs = p => (path.isAbsolute(p) ? p : path.resolve(root, p));
  const url = p => pathToFileURL(abs(p)).href;
  const W = tl.width || 1920, H = tl.height || 1080, fps = tl.fps || 30;
  tl.width = W; tl.height = H; tl.fps = fps;
  tl.brand = tl.brand || {};
  if (tl.brand.logo) {
    if (!fs.existsSync(abs(tl.brand.logo))) errors.push(`brand.logo not found: ${tl.brand.logo}`);
    else tl.brand.logo_url = url(tl.brand.logo);
  }
  if (!Array.isArray(tl.scenes) || !tl.scenes.length) errors.push('timeline has no scenes');
  const scenes = (tl.scenes || []).slice().sort((a, b) => a.start - b.start);
  const ids = new Set();
  scenes.forEach((sc, i) => {
    const tag = `scene[${i}] "${sc.id}"`;
    if (!sc.id) { sc.id = `scene_${i + 1}`; }
    if (ids.has(sc.id)) errors.push(`${tag}: duplicate id`);
    ids.add(sc.id);
    if (!(typeof sc.start === 'number' && typeof sc.end === 'number' && sc.end > sc.start)) { errors.push(`${tag}: needs numeric start < end`); return; }
    if (i > 0) {
      const prev = scenes[i - 1];
      if (sc.start < prev.end - 1e-9) errors.push(`${tag}: starts at ${sc.start} before "${prev.id}" ends at ${prev.end} (scenes must not overlap; use a transition)`);
      else if (sc.start > prev.end + 1e-9) warnings.push(`${tag}: gap of ${(sc.start - prev.end).toFixed(3)} s after "${prev.id}" (background colour is shown)`);
    } else if (sc.start > 1e-9) warnings.push(`${tag}: first scene starts at ${sc.start}; background colour is shown before it`);
    const src = sc.source;
    if (!src || !src.type) { errors.push(`${tag}: source.type missing`); return; }
    if (src.type === 'still') {
      if (!src.path) { errors.push(`${tag}: still needs source.path`); return; }
      if (!fs.existsSync(abs(src.path))) { errors.push(`${tag}: still not found: ${src.path}`); return; }
      const sz = imageSize(abs(src.path));
      if (!sz) { errors.push(`${tag}: ${src.path} is neither PNG nor JPEG`); return; }
      src.url = url(src.path);
      src.px_width = sz.width; src.px_height = sz.height;
      src.css_width = src.css_width || W;
      src.css_height = src.css_height || Math.round(src.css_width * sz.height / sz.width);
    } else if (src.type === 'shot') {
      if (!src.dir) { errors.push(`${tag}: shot needs source.dir`); return; }
      const metaFile = path.join(abs(src.dir), 'meta.json');
      if (!fs.existsSync(metaFile)) { errors.push(`${tag}: ${path.join(src.dir, 'meta.json')} not found`); return; }
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      if (!Array.isArray(meta.frames) || !meta.frames.length) { errors.push(`${tag}: meta.json has no frames`); return; }
      const frames = meta.frames.slice().sort((a, b) => a.t_ms - b.t_ms);
      const missing = frames.filter(f => !fs.existsSync(path.join(abs(src.dir), f.file)));
      if (missing.length) { errors.push(`${tag}: ${missing.length} frame file(s) missing, first: ${missing[0].file}`); return; }
      src.frames = frames.map(f => ({ url: pathToFileURL(path.join(abs(src.dir), f.file)).href, t_ms: f.t_ms }));
      src.events = (meta.events || []).slice().sort((a, b) => a.t_ms - b.t_ms);
      src.css_width = meta.css_width || W; src.css_height = meta.css_height || H;
      src.px_width = meta.frame_width; src.px_height = meta.frame_height; src.dsf = meta.dsf;
      src.shot_id = meta.shot_id;
      src.source_duration = frames[frames.length - 1].t_ms / 1000;
      const need = (src.offset || 0) + (src.speed == null ? 1 : src.speed) * (src.hold_from != null ? Math.min(src.hold_from, sc.end - sc.start) : (sc.end - sc.start));
      if (src.freeze_at == null && !src.time_map && need > src.source_duration + 0.5) {
        warnings.push(`${tag}: plays the shot up to ${need.toFixed(2)} s but its last frame is at ${src.source_duration.toFixed(2)} s (the last frame is held)`);
      }
    } else if (src.type === 'card') {
      if (!['title', 'section', 'end'].includes(src.card || 'title')) errors.push(`${tag}: card must be title, section or end`);
      if (src.logo && typeof src.logo === 'string') {
        if (!fs.existsSync(abs(src.logo))) errors.push(`${tag}: logo not found: ${src.logo}`);
        else src.logo_url = url(src.logo);
      }
    } else if (src.type === 'motion') {
      if (!src.preset) errors.push(`${tag}: motion needs source.preset`);
      src.image_urls = {};
      for (const [k, p] of Object.entries(src.images || {})) {
        if (!fs.existsSync(abs(p))) errors.push(`${tag}: motion image "${k}" not found: ${p}`);
        else src.image_urls[k] = url(p);
      }
    } else errors.push(`${tag}: unknown source.type "${src.type}"`);

    if (src.type !== 'card' && src.type !== 'motion') {
      const ar = src.css_width / src.css_height;
      if (Math.abs(ar - W / H) > 0.01) errors.push(`${tag}: source is ${src.css_width}x${src.css_height} CSS px; its aspect ratio must match the ${W}x${H} output`);
      if (src.px_width && src.px_width < W) warnings.push(`${tag}: source is only ${src.px_width} px wide; zooms will look soft (3840 px recommended)`);
      for (const k of (sc.camera || [])) {
        if (k.zoom != null && (k.zoom < 1 || k.zoom > 2.5)) warnings.push(`${tag}: camera zoom ${k.zoom} is outside 1.0 to 2.5 and will be clamped`);
        if (src.px_width && k.zoom != null && k.zoom * W > src.px_width * 1.3) warnings.push(`${tag}: zoom ${k.zoom} upscales the ${src.px_width} px source by ${(k.zoom * W / src.px_width).toFixed(2)}x`);
      }
    }
    const tr = sc.transition;
    if (tr) {
      if (!TRANSITIONS.includes(tr.type)) errors.push(`${tag}: transition.type must be one of ${TRANSITIONS.join(', ')}`);
      else if (tr.type !== 'cut') {
        const d = tr.duration;
        if (!(d > 0)) errors.push(`${tag}: transition.duration missing`);
        else {
          if (d < 0.2 || d > 0.5) warnings.push(`${tag}: transition of ${d} s is outside the 200 to 500 ms house range`);
          if (i === 0) warnings.push(`${tag}: a transition on the first scene is ignored`);
          else if (d >= Math.min(sc.end - sc.start, scenes[i - 1].end - scenes[i - 1].start)) errors.push(`${tag}: transition (${d} s) is longer than a neighbouring scene`);
        }
      }
    }
  });
  tl.scenes = scenes;
  const last = scenes.length ? scenes[scenes.length - 1].end : 0;
  if (tl.duration == null) tl.duration = last;
  if (tl.duration > last + 1e-9) warnings.push(`duration ${tl.duration} s is longer than the last scene end ${last} s (the last scene is held)`);
  return { tl, errors, warnings };
}

// ------------------------------------------------------------------ worker
async function startWorker(id, tl, args, pageUrl) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const context = await browser.newContext({ viewport: { width: tl.width, height: tl.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  await page.goto(pageUrl);
  const summary = await page.evaluate(([t, o]) => window.loadTimeline(t, o), [tl, { debug: args.debug, cacheMax: args.cache }]);
  const cdp = args.capture === 'cdp' ? await context.newCDPSession(page) : null;
  return { id, browser, page, cdp, summary, problems, frames: 0, msLayout: 0, msShot: 0, msWrite: 0 };
}

async function grab(w, args) {
  if (w.cdp) {
    const r = await w.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: args.quality, fromSurface: true, captureBeyondViewport: false });
    return Buffer.from(r.data, 'base64');
  }
  return w.page.screenshot({ type: 'jpeg', quality: args.quality, scale: 'css', animations: 'allow', caret: 'initial' });
}

// -------------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.pos.length < 2) {
    console.log('usage: node scripts/video/compose/render.js <timeline.json> <outFramesDir> [--from s] [--to s] [--workers N] [--quality 95] [--chunk 15] [--clean] [--no-verify] [--debug] [--capture playwright|cdp] [--report file.json]');
    process.exit(args.help ? 0 : 2);
  }
  const [tlFile, outArg] = args.pos;
  const outDir = path.resolve(process.cwd(), outArg);
  const { tl, errors, warnings } = resolveTimeline(path.resolve(process.cwd(), tlFile));
  for (const w of warnings) console.log(`warning: ${w}`);
  if (errors.length) { for (const e of errors) console.error(`error: ${e}`); process.exit(1); }

  const fps = tl.fps;
  const total = Math.round(tl.duration * fps);
  const k0 = args.from == null ? 0 : Math.max(0, Math.ceil(args.from * fps - 1e-9));
  const k1 = args.to == null ? total : Math.min(total, Math.ceil(args.to * fps - 1e-9));
  if (k1 <= k0) { console.error(`error: empty frame range (${k0}..${k1})`); process.exit(1); }
  const isFull = k0 === 0 && k1 === total;
  const count = k1 - k0;
  const workers = Math.min(args.workers || defaultWorkers(), Math.max(1, Math.ceil(count / args.chunk)));

  fs.mkdirSync(outDir, { recursive: true });
  const existing = fs.readdirSync(outDir).filter(f => /^r_\d{6}\.jpg$/.test(f));
  if (args.clean) for (const f of existing) fs.unlinkSync(path.join(outDir, f));

  console.log(`timeline: ${tlFile}  ${tl.width}x${tl.height} @ ${fps} fps  duration ${tl.duration} s = ${total} frames`);
  console.log(`render:   frames ${k0 + 1}..${k1} (${count})  workers ${workers}  chunk ${args.chunk}  jpeg q${args.quality}  capture ${args.capture}`);

  const pageUrl = pathToFileURL(path.join(__dirname, 'compositor.html')).href;
  const tStart = Date.now();
  const ws = await Promise.all(Array.from({ length: workers }, (_, i) => startWorker(i + 1, tl, args, pageUrl)));
  const tReady = Date.now();
  for (const w of ws[0].summary.warnings) console.log(`warning: ${w}`);

  // dynamic queue of contiguous chunks: keeps each worker's image cache warm
  const chunks = [];
  for (let k = k0; k < k1; k += args.chunk) chunks.push([k, Math.min(k1, k + args.chunk)]);
  let next = 0, done = 0, lastLog = Date.now();
  const issues = [];
  const runWorker = async w => {
    for (;;) {
      const c = chunks[next++];
      if (!c) return;
      for (let k = c[0]; k < c[1]; k++) {
        const a = performance.now();
        const info = await w.page.evaluate(t => window.renderAt(t), k / fps);
        const b = performance.now();
        const buf = await grab(w, args);
        const d = performance.now();
        await fs.promises.writeFile(path.join(outDir, frameName(k)), buf);
        const e = performance.now();
        w.msLayout += b - a; w.msShot += d - b; w.msWrite += e - d; w.frames += 1;
        for (const L of info.layers) {
          if (L.inside === false) issues.push({ frame: k + 1, scene: L.scene, issue: 'camera shows outside the source', view: L.view });
          for (const co of (L.callouts || [])) {
            if (co.covers_target) issues.push({ frame: k + 1, scene: L.scene, issue: `callout "${co.text}" covers its target` });
            if (co.clipped) issues.push({ frame: k + 1, scene: L.scene, issue: `callout "${co.text}" leaves the frame` });
            if (co.target_visible === false) issues.push({ frame: k + 1, scene: L.scene, issue: `callout "${co.text}" points at a target outside the view` });
          }
        }
        done += 1;
        if (Date.now() - lastLog > 5000) { lastLog = Date.now(); console.log(`  ${done}/${count} frames  ${(done / ((Date.now() - tReady) / 1000)).toFixed(1)} fps`); }
      }
    }
  };
  let failure = null;
  await Promise.all(ws.map(w => runWorker(w).catch(e => { failure = failure || e; next = chunks.length; })));
  const tEnd = Date.now();
  const problems = ws.flatMap(w => w.problems.map(p => `worker ${w.id}: ${p}`));
  await Promise.all(ws.map(w => w.browser.close().catch(() => {})));
  if (failure) { console.error(`error: render failed: ${failure.message}`); for (const p of problems) console.error(p); process.exit(1); }

  const wall = tEnd - tReady;
  const sum = k => ws.reduce((s, w) => s + w[k], 0);
  const report = {
    timeline: tlFile, out_dir: outDir, width: tl.width, height: tl.height, fps, duration_s: tl.duration,
    frames_total: total, frames_rendered: count, first_frame: k0 + 1, last_frame: k1,
    workers, chunk: args.chunk, quality: args.quality, capture: args.capture,
    startup_ms: tReady - tStart, wall_ms: wall,
    ms_per_frame_wall: +(wall / count).toFixed(2), frames_per_second: +(count / (wall / 1000)).toFixed(2),
    per_worker_ms_per_frame: { layout_and_decode: +(sum('msLayout') / count).toFixed(2), screenshot: +(sum('msShot') / count).toFixed(2), write: +(sum('msWrite') / count).toFixed(2) },
    layout_issues: issues.length, layout_issue_samples: summarise(issues), page_problems: problems,
    scenes: ws[0].summary.scenes, warnings: warnings.concat(ws[0].summary.warnings),
  };

  console.log(`done:     ${count} frames in ${(wall / 1000).toFixed(2)} s  =  ${report.ms_per_frame_wall} ms/frame wall (${report.frames_per_second} fps), start-up ${report.startup_ms} ms`);
  console.log(`          per worker: layout+decode ${report.per_worker_ms_per_frame.layout_and_decode} ms, screenshot ${report.per_worker_ms_per_frame.screenshot} ms, write ${report.per_worker_ms_per_frame.write} ms`);
  if (issues.length) { console.log(`layout:   ${issues.length} frame-level issue(s):`); for (const s of report.layout_issue_samples) console.log(`          ${s.issue} [${s.scene}] frames ${s.first}..${s.last} (${s.count})`); }
  else console.log('layout:   camera always inside the source; no callout covers its target or leaves the frame');
  for (const p of problems) console.log(`page:     ${p}`);

  let ok = !problems.length;
  if (args.verify) {
    const v = verify(outDir, k0, k1, tl.width, tl.height, isFull);
    report.verify = v;
    console.log(`verify:   ${v.checked} files checked, ${v.missing.length} missing, ${v.wrong_size.length} wrong size, ${v.stale.length} stale extra file(s)  ->  ${v.ok ? 'OK' : 'FAILED'}`);
    if (v.missing.length) console.log(`          missing: ${v.missing.slice(0, 5).join(', ')}`);
    if (v.wrong_size.length) console.log(`          wrong size: ${v.wrong_size.slice(0, 5).map(x => `${x.file} ${x.width}x${x.height}`).join(', ')}`);
    if (v.stale.length) console.log(`          stale: ${v.stale.slice(0, 5).join(', ')}${v.stale.length > 5 ? ' ...' : ''}  (re-run with --clean)`);
    ok = ok && v.ok;
  }
  const reportFile = args.report ? path.resolve(process.cwd(), args.report) : path.join(path.dirname(outDir), `${path.basename(outDir)}.render_report.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 1));
  console.log(`report:   ${path.relative(process.cwd(), reportFile)}`);
  process.exit(ok ? 0 : 1);
}

function summarise(issues) {
  const m = new Map();
  for (const i of issues) {
    const key = `${i.scene}|${i.issue}`;
    const e = m.get(key) || { scene: i.scene, issue: i.issue, first: i.frame, last: i.frame, count: 0 };
    e.first = Math.min(e.first, i.frame); e.last = Math.max(e.last, i.frame); e.count += 1;
    m.set(key, e);
  }
  return [...m.values()];
}

function verify(outDir, k0, k1, W, H, isFull) {
  const missing = [], wrong = [];
  let checked = 0;
  for (let k = k0; k < k1; k++) {
    const f = path.join(outDir, frameName(k));
    if (!fs.existsSync(f)) { missing.push(frameName(k)); continue; }
    try {
      const s = imageSize(f);
      checked += 1;
      if (!s || s.width !== W || s.height !== H) wrong.push({ file: frameName(k), width: s && s.width, height: s && s.height });
    } catch (e) { wrong.push({ file: frameName(k), error: e.message }); }
  }
  // a full render must leave exactly frames 1..N in the directory
  const stale = isFull ? fs.readdirSync(outDir).filter(f => /^r_\d{6}\.jpg$/.test(f) && Number(f.slice(2, 8)) > k1) : [];
  return { ok: !missing.length && !wrong.length && !stale.length, checked, expected: k1 - k0, missing, wrong_size: wrong, stale };
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { resolveTimeline, imageSize, frameName, defaultWorkers };
