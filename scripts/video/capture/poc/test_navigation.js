'use strict';
/**
 * PoC: does the capture survive a full page navigation (new document) and a reload?
 *   node scripts/video/capture/poc/test_navigation.js
 */
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const cap = require('../capture');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const outRoot = path.join(__dirname, '..', '..', '..', '..', 'reports', 'video', 'poc-capture');
  const base = pathToFileURL(path.join(__dirname, '..', 'testpage', 'index.html')).href;
  const { browser, page } = await cap.launchForCapture({ chromium, flavor: 'shell', dsf: 2 });
  await page.goto(base + '?anim=0');
  await sleep(400);
  const c = await cap.startCapture(page, { shotId: 'nav_test', outRoot });
  await sleep(500);
  await cap.smoothClick(page, '#btn-new');
  await sleep(600);
  c.mark('goto-second-document');
  await page.goto(base + '?anim=0&second=1');     // new document: the modal must be gone in the next frames
  await sleep(500);
  await cap.smoothType(page, '#search', 'Mysuru', { cps: 10 });
  await sleep(400);
  c.mark('reload');
  await page.reload();
  await sleep(600);
  await cap.smoothScroll(page, 400, { durationMs: 600 });
  await sleep(300);
  const meta = await c.stop();
  await browser.close();
  const navs = meta.events.filter((e) => e.type === 'nav');
  const out = { frames: meta.frames.length, duration_ms: meta.duration_ms, frame: `${meta.frame_width}x${meta.frame_height}`, sizes: meta.frame_sizes_seen, navs: navs.map((n) => ({ t_ms: n.t_ms, label: n.label })) };
  for (const n of navs) {
    const after = meta.frames.filter((f) => f.t_ms > n.t_ms);
    out[`frames_after_nav_at_${n.t_ms}`] = after.length;
    out[`first_frame_after_nav_at_${n.t_ms}_ms`] = after.length ? after[0].t_ms - n.t_ms : null;
  }
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
