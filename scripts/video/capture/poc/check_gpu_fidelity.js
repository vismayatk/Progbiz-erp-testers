'use strict';
/**
 * PoC: with the Metal GPU enabled, is a screencast frame still pixel-identical to page.screenshot(),
 * and how does GPU rasterisation differ from software rasterisation?
 *   node scripts/video/capture/poc/check_gpu_fidelity.js
 * Output: reports/video/poc-capture/gpu_fidelity/{sw,metal,chromium}/ (one png screencast, one jpeg q95 screencast, one still)
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const cap = require('../capture');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const outRoot = path.join(__dirname, '..', '..', '..', '..', 'reports', 'video', 'poc-capture', 'gpu_fidelity');
  const url = pathToFileURL(path.join(__dirname, '..', 'testpage', 'index.html')).href + '?sync=1';
  const jobs = [
    { name: 'sw', flavor: 'shell', gpu: 'software' },
    { name: 'metal', flavor: 'shell', gpu: 'metal' },
    { name: 'chromium', flavor: 'chromium', gpu: 'default' },
  ];
  for (const j of jobs) {
    const { browser, page } = await cap.launchForCapture({ chromium, flavor: j.flavor, dsf: 2, gpu: j.gpu });
    await page.goto(url);
    await sleep(600);
    const gpu = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; });
    for (const fmt of ['png', 'jpeg']) {
      const c = await cap.startCapture(page, { shotId: `${j.name}/${fmt}`, outRoot, format: fmt, quality: 95, keyframes: false });
      await sleep(700);
      await c.stop();
    }
    const s = await cap.still(page, path.join(outRoot, j.name, 'still.png'));
    console.log(JSON.stringify({ job: j.name, version: browser.version(), renderer: gpu, still: `${s.width}x${s.height}` }));
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
