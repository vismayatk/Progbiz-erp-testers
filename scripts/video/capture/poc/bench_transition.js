'use strict';
/**
 * PoC: frames per second DURING a CSS transition on an otherwise static page (the modal of the local
 * test page fades in over a full-screen backdrop in 220 ms). This is the hard case for the capture:
 * the whole 3840x2160 surface changes every frame and nothing else keeps the pipeline warm.
 *
 *   node scripts/video/capture/poc/bench_transition.js [--flavor shell] [--dsf 2] [--format jpeg] [--quality 95]
 *        [--args "--enable-gpu --use-angle=metal"] [--id NAME]
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const cap = require('../capture');
function arg(name, def) { const i = process.argv.indexOf('--' + name); if (i < 0) return def; const v = process.argv[i + 1]; return v === undefined ? true : v; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const flavor = arg('flavor', 'shell');
  const dsf = Number(arg('dsf', 2));
  const format = arg('format', 'jpeg');
  const quality = Number(arg('quality', 95));
  const extra = String(arg('args', '')).split(/\s+/).filter((a) => a && a !== 'true');
  const id = arg('id', `T_${flavor}_dsf${dsf}_${format}${format === 'jpeg' ? quality : ''}${extra.length ? '_' + extra.join('').replace(/[^a-z0-9]+/gi, '') : ''}`);
  const outRoot = path.join(__dirname, '..', '..', '..', '..', 'reports', 'video', 'poc-capture');
  const url = pathToFileURL(path.join(__dirname, '..', 'testpage', 'index.html')).href + '?anim=0';
  const res = { id, flavor, dsf, format, args: extra };
  let browser;
  try {
    const l = await cap.launchForCapture({ chromium, flavor, dsf, args: extra, gpu: 'default' });
    browser = l.browser;
    const page = l.page;
    res.version = browser.version();
    await page.goto(url);
    await sleep(500);
    res.gl = await page.evaluate(() => {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl');
        if (!gl) return 'no webgl';
        const e = gl.getExtension('WEBGL_debug_renderer_info');
        return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl without renderer info';
      } catch (err) { return 'error ' + err.message; }
    });
    const open = await page.locator('#btn-new').boundingBox();
    const close = { x: 1214, y: 0 };
    await page.mouse.move(open.x + open.width / 2, open.y + open.height / 2);
    const c = await cap.startCapture(page, { shotId: id, outRoot, format, quality });
    await sleep(500);
    const windows = [];
    for (let i = 0; i < 4; i++) {
      const a = c.mark('open:' + i).t_ms;
      await page.evaluate(() => document.getElementById('btn-new').click());
      await sleep(700);
      const b = c.mark('close:' + i).t_ms;
      await page.evaluate(() => document.getElementById('modal-close').click());
      await sleep(700);
      windows.push([a, a + 260], [b, b + 260]);
    }
    const meta = await c.stop();
    const per = windows.map(([a, b]) => meta.frames.filter((f) => f.t_ms >= a && f.t_ms < b && !/keyframe/.test(f.source || '')).length);
    const lag = meta.frame_arrival_ms.map((v, i) => v - meta.frames[i].t_ms);
    res.frame = `${meta.frame_width}x${meta.frame_height}`;
    res.frames_per_transition = per;
    res.mean_frames_per_transition = Math.round((per.reduce((x, y) => x + y, 0) / per.length) * 10) / 10;
    res.ideal_frames_per_transition = 13; // 220 ms at 60 Hz
    res.fps_during_transition = Math.round((res.mean_frames_per_transition / 0.22) * 10) / 10;
    res.mean_arrival_lag_ms = Math.round(lag.reduce((x, y) => x + y, 0) / lag.length);
    res.total_frames = meta.frames.length;
    res.loadavg_1m = Math.round(require('os').loadavg()[0] * 10) / 10;
    res.ok = true;
  } catch (e) {
    res.ok = false;
    res.error = String(e.message || e).split('\n')[0];
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  console.log(JSON.stringify(res));
  fs.appendFileSync(path.join(outRoot, 'transition_results.jsonl'), JSON.stringify(res) + '\n');
})();
