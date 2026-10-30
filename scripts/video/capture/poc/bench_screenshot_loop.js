'use strict';
/**
 * PoC (C): a tight screenshot loop at deviceScaleFactor 2 (3840x2160) on the LOCAL test page.
 *
 *   node scripts/video/capture/poc/bench_screenshot_loop.js [--secs 5]
 *
 * Variants: Playwright page.screenshot() png / jpeg q95, and raw CDP Page.captureScreenshot
 * png / jpeg q95 (with and without optimizeForSpeed). Frames are written to disk like a real capture.
 * Output: reports/video/poc-capture/C_screenshot_loop/<variant>/f_%06d.(png|jpg) + bench.json
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const cap = require('../capture');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i < 0 ? def : process.argv[i + 1]; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const secs = Number(arg('secs', 5));
  const out = path.join(__dirname, '..', '..', '..', '..', 'reports', 'video', 'poc-capture', 'C_screenshot_loop');
  const url = pathToFileURL(path.join(__dirname, '..', 'testpage', 'index.html')).href + '?sync=1';
  const { browser, page } = await cap.launchForCapture({ chromium, flavor: 'shell', dsf: 2, gpu: 'software' });
  await page.goto(url);
  await sleep(500);
  const cdp = await page.context().newCDPSession(page);
  const results = [];

  const variants = [
    { name: 'pw_png', ext: 'png', shot: () => page.screenshot({ type: 'png', scale: 'device', animations: 'allow', caret: 'initial' }) },
    { name: 'pw_jpeg95', ext: 'jpg', shot: () => page.screenshot({ type: 'jpeg', quality: 95, scale: 'device', animations: 'allow', caret: 'initial' }) },
    { name: 'cdp_png', ext: 'png', shot: async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64') },
    { name: 'cdp_png_fast', ext: 'png', shot: async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64') },
    { name: 'cdp_jpeg95', ext: 'jpg', shot: async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 })).data, 'base64') },
    { name: 'cdp_jpeg95_fast', ext: 'jpg', shot: async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, optimizeForSpeed: true })).data, 'base64') },
  ];

  for (const v of variants) {
    const dir = path.join(out, v.name);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (/^f_\d{6}\.(png|jpg)$/.test(f)) fs.unlinkSync(path.join(dir, f));
    const r0 = await page.evaluate(() => window.__raf);
    const t0 = Date.now();
    let n = 0, bytes = 0, size = null;
    const gaps = [];
    let last = t0;
    const writes = [];
    while (Date.now() - t0 < secs * 1000) {
      const buf = await v.shot();
      const now = Date.now();
      gaps.push(now - last); last = now;
      n++; bytes += buf.length;
      if (!size) size = cap.imageSize(buf);
      writes.push(fs.promises.writeFile(path.join(dir, `f_${String(n).padStart(6, '0')}.${v.ext}`), buf));
    }
    const el = (Date.now() - t0) / 1000;
    await Promise.all(writes);
    const r1 = await page.evaluate(() => window.__raf);
    gaps.sort((a, b) => a - b);
    const res = {
      variant: v.name, frames: n, seconds: Math.round(el * 100) / 100, fps: Math.round((n / el) * 100) / 100,
      frame: size ? `${size.width}x${size.height}` : null, avg_kb: Math.round(bytes / n / 1024),
      median_ms: gaps[Math.floor(gaps.length / 2)], max_ms: gaps[gaps.length - 1],
      page_fps_meanwhile: Math.round(((r1 - r0) / el) * 10) / 10,
    };
    results.push(res);
    console.log(JSON.stringify(res));
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'bench.json'), JSON.stringify(results, null, 1));
})().catch((e) => { console.log(JSON.stringify({ ok: false, error: String(e.message || e).split('\n')[0] })); process.exit(1); });
