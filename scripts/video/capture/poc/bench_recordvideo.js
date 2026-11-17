'use strict';
/**
 * PoC (A): Playwright recordVideo (VP8 WebM) at 1920x1080 on the LOCAL test page, then decode the
 * WebM to PNG frames with Playwright's bundled ffmpeg.
 *
 *   node scripts/video/capture/poc/bench_recordvideo.js [--dsf 1|2]
 *
 * Output: reports/video/poc-capture/A_recordvideo_dsf<N>/ { video.webm, png/out_%06d.png, gt.png, bench.json }
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const cap = require('../capture');

const FFMPEG = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-mac');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function arg(name, def) { const i = process.argv.indexOf('--' + name); return i < 0 ? def : process.argv[i + 1]; }

(async () => {
  const dsf = Number(arg('dsf', 1));
  const id = `A_recordvideo_dsf${dsf}`;
  const out = path.join(__dirname, '..', '..', '..', '..', 'reports', 'video', 'poc-capture', id);
  fs.mkdirSync(path.join(out, 'png'), { recursive: true });
  for (const f of fs.readdirSync(path.join(out, 'png'))) if (/^out_\d+\.png$/.test(f)) fs.unlinkSync(path.join(out, 'png', f));
  const url = pathToFileURL(path.join(__dirname, '..', 'testpage', 'index.html')).href + '?sync=1';
  const result = { id, dsf };

  const browser = await chromium.launch({ headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  result.browser_version = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dsf,
    recordVideo: { dir: out, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(url);
  await sleep(500);
  // ground truth of exactly this session (mouse has not been moved yet)
  await page.screenshot({ path: path.join(out, 'gt.png'), type: 'png', scale: 'device' });
  const marks = [];
  const raf = () => page.evaluate(() => window.__raf || 0);
  async function phase(name, fn) {
    const a = Date.now() - t0, r0 = await raf();
    await fn();
    const b = Date.now() - t0, r1 = await raf();
    marks.push({ name, from_ms: a, to_ms: b, page_frames: r1 - r0 });
  }
  await phase('animation', async () => { await sleep(3000); });
  await cap.smoothMove(page, 1100, 640, { fromX: 900, fromY: 500 });
  await phase('scroll', async () => { await cap.smoothScroll(page, 1500, { durationMs: 3000 }); });
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
  result.wall_ms = Date.now() - t0;
  const video = page.video();
  await page.close();
  const tmp = await video.path();
  await context.close();
  await browser.close();
  const webm = path.join(out, 'video.webm');
  fs.renameSync(tmp, webm);
  result.webm_bytes = fs.statSync(webm).size;
  result.webm_kbps = Math.round((result.webm_bytes * 8) / (result.wall_ms / 1000) / 1000);

  // decode with the bundled ffmpeg, exactly as in the task description
  const r = spawnSync(FFMPEG, ['-y', '-i', webm, path.join(out, 'png', 'out_%06d.png')], { encoding: 'utf8' });
  const log = (r.stderr || '') + (r.stdout || '');
  fs.writeFileSync(path.join(out, 'ffmpeg_decode.log'), log);
  const dur = /Duration:\s*([\d:.]+)/.exec(log);
  const stream = /Stream #0:0.*Video:\s*([^\n]+)/.exec(log);
  result.ffmpeg_exit = r.status;
  result.container_duration = dur ? dur[1] : null;
  result.stream = stream ? stream[1].trim() : null;
  result.decoded_png_frames = fs.readdirSync(path.join(out, 'png')).filter((f) => /^out_\d+\.png$/.test(f)).length;
  result.phases = marks;
  fs.writeFileSync(path.join(out, 'bench.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result));
})().catch((e) => { console.log(JSON.stringify({ ok: false, error: String(e.message || e).split('\n')[0] })); process.exit(1); });
