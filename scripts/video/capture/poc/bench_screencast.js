'use strict';
/**
 * PoC (B): CDP Page.startScreencast benchmark on the LOCAL test page (file://).
 *
 *   node scripts/video/capture/poc/bench_screencast.js --id NAME [--flavor shell|chromium|chrome]
 *        [--dsf 1|2] [--format jpeg|png] [--quality 95] [--maxw N --maxh N] [--page busy|quiet]
 *        [--secs 3] [--args "--flag1 --flag2"] [--nomax] [--noforce]
 *
 * --noforce  do not add --force-device-scale-factor (frames are then limited to 1920x1080)
 *
 * busy  = index.html?sync=1          (CSS animation + sync strip: the page produces a frame every vsync)
 * quiet = index.html?anim=0          (static page: frames only when something changes)
 *
 * Writes a capture shot directory reports/video/poc-capture/<id>/ (+ bench.json) and prints one JSON line.
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const cap = require('../capture');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const id = arg('id', 'B_test');
  const flavor = arg('flavor', 'shell');
  const dsf = Number(arg('dsf', 2));
  const format = arg('format', 'jpeg');
  const quality = Number(arg('quality', 95));
  const pageKind = arg('page', 'busy');
  const secs = Number(arg('secs', 3));
  const extraArgs = String(arg('args', '') === true ? '' : arg('args', '')).split(/\s+/).filter(Boolean);
  const outRoot = path.join(__dirname, '..', '..', '..', '..', 'reports', 'video', 'poc-capture');
  const url = pathToFileURL(path.join(__dirname, '..', 'testpage', 'index.html')).href + (pageKind === 'busy' ? '?sync=1' : '?anim=0');

  const result = { id, flavor, dsf, format, quality: format === 'jpeg' ? quality : null, page: pageKind, args: extraArgs };
  let browser;
  try {
    const t0 = Date.now();
    const l = await cap.launchForCapture({ chromium, flavor, dsf, args: extraArgs, forceDsf: !arg('noforce'), gpu: 'default' });
    result.force_dsf = !arg('noforce') && dsf !== 1;
    browser = l.browser;
    const page = l.page;
    result.browser_version = browser.version();
    result.launch_ms = Date.now() - t0;
    await page.goto(url);
    await page.waitForTimeout(500);
    result.ua = await page.evaluate(() => navigator.userAgent);
    result.dpr = await page.evaluate(() => devicePixelRatio);

    const o = { shotId: id, outRoot, format, quality };
    if (arg('maxw')) o.maxWidth = Number(arg('maxw'));
    if (arg('maxh')) o.maxHeight = Number(arg('maxh'));
    if (arg('nomax')) { o.maxWidth = 100000; o.maxHeight = 100000; }
    result.maxWidth = o.maxWidth || 1920 * dsf;
    result.maxHeight = o.maxHeight || 1080 * dsf;

    const raf = () => page.evaluate(() => window.__raf || 0);
    const c = await cap.startCapture(page, o);
    const phases = [];
    async function phase(name, fn) {
      const r0 = await raf();
      const a = c.mark(name + ':start');
      await fn();
      const b = c.mark(name + ':end');
      const r1 = await raf();
      phases.push({ name, from: a.t_ms, to: b.t_ms, page_frames: r1 - r0 });
    }

    await phase(pageKind === 'busy' ? 'animation' : 'static', async () => { await sleep(secs * 1000); });
    await cap.smoothMove(page, 1100, 640, { fromX: 900, fromY: 500 });
    await phase('scroll', async () => { await cap.smoothScroll(page, 1500, { durationMs: secs * 1000 }); });
    await sleep(300);
    await cap.smoothScroll(page, -1500, { durationMs: 600 });
    await sleep(300);
    await cap.smoothClick(page, '#search');
    await phase('typing', async () => { await cap.smoothType(page, '#search', 'kochi traders and more text', { cps: 9, click: false, jitter: 0 }); });
    await phase('mouse-move', async () => {
      await cap.smoothMove(page, 600, 700, { durationMs: 1000 });
      await cap.smoothMove(page, 1500, 500, { durationMs: 1000 });
      await cap.smoothMove(page, 900, 800, { durationMs: 1000 });
    });
    const meta = await c.stop();

    for (const p of phases) {
      const fr = meta.frames.filter((f) => f.t_ms >= p.from && f.t_ms < p.to);
      p.seconds = Math.round((p.to - p.from) / 10) / 100;
      p.frames = fr.length;
      p.fps = Math.round((fr.length / ((p.to - p.from) / 1000)) * 10) / 10;
      p.page_fps = Math.round((p.page_frames / ((p.to - p.from) / 1000)) * 10) / 10;
      let maxGap = 0;
      for (let i = 1; i < fr.length; i++) maxGap = Math.max(maxGap, fr[i].t_ms - fr[i - 1].t_ms);
      p.max_gap_ms = maxGap;
    }
    result.frame_width = meta.frame_width;
    result.frame_height = meta.frame_height;
    result.frame_sizes_seen = meta.frame_sizes_seen;
    result.jpeg_sampling = meta.jpeg_sampling;
    result.total_frames = meta.frames.length;
    result.duration_ms = meta.duration_ms;
    result.stats = meta.stats;
    result.avg_frame_kb = Math.round((meta.stats.megabytes * 1024) / Math.max(1, meta.frames.length));
    result.first_frame_t_ms = meta.frames.length ? meta.frames[0].t_ms : null;
    result.keyframes = meta.keyframes;
    result.phases = phases;
    result.loadavg_1m = Math.round(require('os').loadavg()[0] * 10) / 10;
    result.ok = true;
    fs.writeFileSync(path.join(outRoot, id, 'bench.json'), JSON.stringify(result, null, 1));
  } catch (e) {
    result.ok = false;
    result.error = String(e && e.message ? e.message : e).split('\n').slice(0, 4).join(' | ');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  console.log(JSON.stringify(result));
})();
