'use strict';
/**
 * Independent playback check: open an MP4 in Google Chrome (not an Apple
 * decoder) from a local file:// page, seek to given times and read pixels.
 *
 *   node scripts/video/encode/selftest/chrome_check.js <video.mp4> <outDir> <t1> [t2 ...]
 *
 * Offline: only a file:// page written by this script is opened.
 * Uses the installed Google Chrome through Playwright (channel "chrome"),
 * because Playwright's bundled Chromium has no H.264 decoder.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const PATCHES = [
  ['grey128', 1230, 650, [128, 128, 128]],
  ['white', 1346, 650, [255, 255, 255]],
  ['near_black', 1462, 650, [16, 16, 16]],
  ['red', 1578, 650, [200, 30, 30]],
  ['green', 1694, 650, [30, 160, 60]],
  ['blue', 1810, 650, [30, 60, 200]],
];

(async () => {
  const [video, outDir, ...times] = process.argv.slice(2);
  if (!video || !outDir || !times.length) {
    console.error('usage: chrome_check.js <video.mp4> <outDir> <t1> [t2 ...]');
    process.exit(2);
  }
  const abs = path.resolve(video);
  fs.mkdirSync(outDir, { recursive: true });
  const html = path.join(path.resolve(outDir), 'chrome_check.html');
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><title>chrome_check</title>
<style>html,body{margin:0;background:#000}video{display:block;width:1920px;height:1080px}</style>
<video id="v" muted playsinline preload="auto" src="file://${encodeURI(abs)}"></video>`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'],
  });
  const result = { video: abs, chrome: browser.version(), seeks: [] };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto('file://' + encodeURI(html));
    result.meta = await page.evaluate(() => new Promise((resolve) => {
      const v = document.getElementById('v');
      const done = () => resolve({
        duration: v.duration, videoWidth: v.videoWidth, videoHeight: v.videoHeight,
        readyState: v.readyState, error: v.error ? v.error.message || String(v.error.code) : null,
        canPlayAvcHigh: v.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"'),
      });
      if (v.readyState >= 1) return done();
      v.addEventListener('loadedmetadata', done, { once: true });
      v.addEventListener('error', done, { once: true });
      setTimeout(done, 10000);
    }));

    for (const t of times.map(Number)) {
      const px = await page.evaluate(async ({ t, patches }) => {
        const v = document.getElementById('v');
        await new Promise((res) => {
          v.addEventListener('seeked', res, { once: true });
          v.currentTime = t + 0.001; // just inside the frame
          setTimeout(res, 8000);
        });
        // the frame may already be on screen, so never wait on a callback alone
        await new Promise((res) => {
          if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => res());
          setTimeout(res, 400);
        });
        const c = document.createElement('canvas');
        c.width = v.videoWidth; c.height = v.videoHeight;
        const g = c.getContext('2d', { colorSpace: 'srgb' });
        g.drawImage(v, 0, 0);
        const out = {};
        for (const [name, x, y] of patches) out[name] = Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3));
        return { currentTime: v.currentTime, pixels: out };
      }, { t, patches: PATCHES });
      const shot = path.join(outDir, `chrome_${t}.png`);
      await page.locator('#v').screenshot({ path: shot });
      result.seeks.push({ t, ...px, screenshot: shot });
    }

    // short muted playback: are both tracks really being decoded?
    result.playback = await page.evaluate(async () => {
      const v = document.getElementById('v');
      v.currentTime = 0.5;
      await Promise.race([v.play().catch((e) => e), new Promise((r) => setTimeout(r, 3000))]);
      await new Promise((r) => setTimeout(r, 2500));
      v.pause();
      const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {};
      return {
        playedTo: v.currentTime,
        audioDecodedBytes: v.webkitAudioDecodedByteCount,
        videoDecodedBytes: v.webkitVideoDecodedByteCount,
        totalVideoFrames: q.totalVideoFrames, droppedVideoFrames: q.droppedVideoFrames,
      };
    });
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, 'chrome_check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log('expected patch values: ' + PATCHES.map((p) => `${p[0]}=${p[3].join(',')}`).join('  '));
})().catch((e) => { console.error('chrome_check: FAILED: ' + (e && e.message ? e.message : e)); process.exit(1); });
