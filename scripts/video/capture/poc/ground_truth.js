'use strict';
/**
 * PoC: ground-truth screenshots (lossless PNG from page.screenshot) of the LOCAL test page,
 * used as the reference for the sharpness comparison.
 *   node scripts/video/capture/poc/ground_truth.js
 * Output: reports/video/poc-capture/gt/gt_<flavor>_dsf<N>[_forced].png
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const cap = require('../capture');

(async () => {
  const out = path.join(__dirname, '..', '..', '..', '..', 'reports', 'video', 'poc-capture', 'gt');
  fs.mkdirSync(out, { recursive: true });
  const url = pathToFileURL(path.join(__dirname, '..', 'testpage', 'index.html')).href + '?sync=1';
  const jobs = [
    { name: 'gt_shell_dsf1', flavor: 'shell', dsf: 1 },
    { name: 'gt_shell_dsf2', flavor: 'shell', dsf: 2, forceDsf: false },
    { name: 'gt_shell_dsf2_forced', flavor: 'shell', dsf: 2, forceDsf: true },
    { name: 'gt_chromium_dsf2_forced', flavor: 'chromium', dsf: 2, forceDsf: true },
    { name: 'gt_chrome_dsf2_forced', flavor: 'chrome', dsf: 2, forceDsf: true },
  ];
  for (const j of jobs) {
    const { browser, page } = await cap.launchForCapture({ chromium, flavor: j.flavor, dsf: j.dsf, forceDsf: j.forceDsf, gpu: 'software' });
    await page.goto(url);
    await page.waitForTimeout(600);
    const r = await cap.still(page, path.join(out, j.name + '.png'), { expect: { width: 1920 * j.dsf, height: 1080 * j.dsf } });
    console.log(JSON.stringify({ name: j.name, version: browser.version(), width: r.width, height: r.height }));
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
