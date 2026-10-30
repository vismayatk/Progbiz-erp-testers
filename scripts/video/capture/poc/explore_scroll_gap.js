'use strict';
/**
 * PoC: after a run of wheel events the screencast showed one ~250 ms hole although the page kept
 * drawing. This script reproduces it and compares wheel scrolling with script-driven scrolling.
 *   node scripts/video/capture/poc/explore_scroll_gap.js [--dsf 1|2]
 */
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const cap = require('../capture');
function arg(name, def) { const i = process.argv.indexOf('--' + name); return i < 0 ? def : process.argv[i + 1]; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dsf = Number(arg('dsf', 1));
  const outRoot = path.join(__dirname, '..', '..', '..', '..', 'reports', 'video', 'poc-capture');
  const url = pathToFileURL(path.join(__dirname, '..', 'testpage', 'index.html')).href + '?sync=1';
  for (const mode of ['wheel', 'js', 'single-wheel', 'idle']) {
    const { browser, page } = await cap.launchForCapture({ chromium, flavor: 'shell', dsf, gpu: 'software' });
    await page.goto(url);
    await sleep(500);
    await page.mouse.move(1100, 640);
    const c = await cap.startCapture(page, { shotId: `scrollgap_${mode}_dsf${dsf}`, outRoot });
    await sleep(1000);
    c.mark('scroll:start');
    if (mode === 'wheel') await cap.smoothScroll(page, 1200, { durationMs: 1500 });
    else if (mode === 'js') await cap.smoothScroll(page, 1200, { durationMs: 1500, method: 'js' });
    else if (mode === 'single-wheel') await page.mouse.wheel(0, 300);
    c.mark('scroll:end');
    await sleep(1500);
    const meta = await c.stop();
    await browser.close();
    const end = meta.events.find((e) => e.label === 'scroll:end').t_ms;
    const start = meta.events.find((e) => e.label === 'scroll:start').t_ms;
    const holes = [];
    for (let i = 1; i < meta.frames.length; i++) {
      const g = meta.frames[i].t_ms - meta.frames[i - 1].t_ms;
      if (g > 50) holes.push({ from: meta.frames[i - 1].t_ms, to: meta.frames[i].t_ms, ms: g, after_scroll_end_ms: meta.frames[i - 1].t_ms - end });
    }
    console.log(JSON.stringify({ mode, dsf, frames: meta.frames.length, fps: meta.stats.fps, scroll_start: start, scroll_end: end, holes_over_50ms: holes }));
  }
})().catch((e) => { console.error(e); process.exit(1); });
