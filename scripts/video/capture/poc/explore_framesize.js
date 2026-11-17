'use strict';
/**
 * PoC: which combination of browser flavor / device scale / emulation gives which screencast frame size?
 *   node scripts/video/capture/poc/explore_framesize.js
 * Prints one line per experiment: layout size seen by the page, devicePixelRatio, screencast frame size,
 * page.screenshot size. Local file:// page only.
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const { imageSize } = require('../capture');

const URL_ = pathToFileURL(path.join(__dirname, '..', 'testpage', 'index.html')).href + '?sync=1';
const OUT = path.join(__dirname, '..', '..', '..', '..', 'reports', 'video', 'poc-capture', 'framesize');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function firstFrames(page, params, n = 5, saveAs) {
  const cdp = await page.context().newCDPSession(page);
  const sizes = [];
  let saved = false;
  const done = new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    cdp.on('Page.screencastFrame', (ev) => {
      cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
      const buf = Buffer.from(ev.data, 'base64');
      const s = imageSize(buf);
      sizes.push({ w: s && s.width, h: s && s.height, kb: Math.round(buf.length / 1024), meta: ev.metadata });
      if (!saved && saveAs && sizes.length === 3) { fs.writeFileSync(saveAs, buf); saved = true; }
      if (sizes.length >= n) { clearTimeout(timer); resolve(); }
    });
  });
  await cdp.send('Page.startScreencast', params);
  await done;
  await cdp.send('Page.stopScreencast').catch(() => {});
  await cdp.detach().catch(() => {});
  return sizes;
}

async function run(name, launch, ctxOpts, screencast, prepare) {
  const out = { name };
  let browser;
  try {
    browser = await chromium.launch(Object.assign({ headless: true }, launch));
    out.version = browser.version();
    const context = await browser.newContext(ctxOpts);
    const page = await context.newPage();
    if (prepare) await prepare(page, context);
    await page.goto(URL_);
    await sleep(400);
    out.page = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, sw: screen.width, sh: screen.height, ow: outerWidth, oh: outerHeight }));
    const frames = await firstFrames(page, screencast, 5, path.join(OUT, name + '.' + (screencast.format === 'png' ? 'png' : 'jpg')));
    out.frames_received = frames.length;
    out.frame = frames.length ? `${frames[0].w}x${frames[0].h}` : 'none';
    out.frame_kb = frames.length ? frames[frames.length - 1].kb : 0;
    out.metadata = frames.length ? frames[frames.length - 1].meta : null;
    const shot = await page.screenshot({ type: 'png', scale: 'device' }).catch((e) => null);
    const ss = shot && imageSize(shot);
    out.screenshot = ss ? `${ss.width}x${ss.height}` : 'failed';
  } catch (e) {
    out.error = String(e.message || e).split('\n')[0];
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  console.log(JSON.stringify(out));
  return out;
}

(async () => {
  const flavors = { shell: {}, chromium: { channel: 'chromium' }, chrome: { channel: 'chrome' } };
  const only = process.argv[2];
  const results = [];
  const J = (extra) => Object.assign({ format: 'jpeg', quality: 95, everyNthFrame: 1 }, extra);
  if (only === 'extra') {
    const F = ['--force-device-scale-factor=2', '--hide-scrollbars'];
    // 8. forced scale factor 2 TOGETHER with Playwright's emulated viewport
    results.push(await run('shell_forcedsf2_emulated_dsf2', { args: [...F, '--window-size=1920,1080'] }, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }, J({ maxWidth: 3840, maxHeight: 2160 })));
    results.push(await run('shell_forcedsf2_emulated_dsf1', { args: [...F, '--window-size=1920,1080'] }, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, J({ maxWidth: 3840, maxHeight: 2160 })));
    // 9. new headless has 87 px of (invisible) browser UI: make the window taller
    results.push(await run('chromium_forcedsf2_noviewport_win1167', { channel: 'chromium', args: [...F, '--window-size=1920,1167'] }, { viewport: null }, J({ maxWidth: 3840, maxHeight: 2160 })));
    results.push(await run('chrome_forcedsf2_noviewport_win1167', { channel: 'chrome', args: [...F, '--window-size=1920,1167'] }, { viewport: null }, J({ maxWidth: 3840, maxHeight: 2160 })));
    results.push(await run('chrome_emulated_dsf2_win1167', { channel: 'chrome', args: ['--hide-scrollbars', '--window-size=1920,1167'] }, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }, J({ maxWidth: 3840, maxHeight: 2160 })));
    // 10. png frames at 4k
    results.push(await run('shell_forcedsf2_noviewport_png', { args: [...F, '--window-size=1920,1080'] }, { viewport: null }, { format: 'png', maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 }));
    // 11. forced scale, limited by maxWidth/maxHeight to 1920x1080
    results.push(await run('shell_forcedsf2_noviewport_max1920', { args: [...F, '--window-size=1920,1080'] }, { viewport: null }, J({ maxWidth: 1920, maxHeight: 1080 })));
    fs.writeFileSync(path.join(OUT, 'framesize_extra.json'), JSON.stringify(results, null, 1));
    return;
  }
  for (const [fname, launch] of Object.entries(flavors)) {
    if (only && only !== fname) continue;
    // 1. deviceScaleFactor 1, plain
    results.push(await run(`${fname}_dsf1`, launch, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, J({ maxWidth: 1920, maxHeight: 1080 })));
    // 2. deviceScaleFactor 2, maxWidth/maxHeight = 3840x2160
    results.push(await run(`${fname}_dsf2_max3840`, launch, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }, J({ maxWidth: 3840, maxHeight: 2160 })));
    // 3. deviceScaleFactor 2, no max at all
    results.push(await run(`${fname}_dsf2_nomax`, launch, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }, J({})));
    // 4. deviceScaleFactor 2, maxWidth/maxHeight = 1920x1080
    results.push(await run(`${fname}_dsf2_max1920`, launch, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }, J({ maxWidth: 1920, maxHeight: 1080 })));
    // 5. 3840x2160 DIP view + emulation scale 2 (layout stays 1920x1080 css px)
    results.push(await run(`${fname}_view3840_emuscale2`, launch, { viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 }, J({ maxWidth: 3840, maxHeight: 2160 }),
      async (page) => {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false, scale: 2 });
      }));
    // 6. same, but the emulated device reports dpr 2
    results.push(await run(`${fname}_view3840_emuscale2_dpr2`, launch, { viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 }, J({ maxWidth: 3840, maxHeight: 2160 }),
      async (page) => {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false, scale: 2 });
      }));
    // 7. no emulation at all: real window with forced device scale factor 2
    results.push(await run(`${fname}_forcedsf2_noviewport`, Object.assign({ args: ['--force-device-scale-factor=2', '--window-size=1920,1080', '--hide-scrollbars'] }, launch),
      { viewport: null }, J({ maxWidth: 3840, maxHeight: 2160 })));
  }
  fs.writeFileSync(path.join(OUT, `framesize_${only || 'all'}.json`), JSON.stringify(results, null, 1));
})();
