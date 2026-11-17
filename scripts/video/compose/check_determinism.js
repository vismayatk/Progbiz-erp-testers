#!/usr/bin/env node
'use strict';
/**
 * Random-access / determinism check for the compositor.
 *
 *   node scripts/video/compose/check_determinism.js <timeline.json> <renderedFramesDir> [--samples 60] [--seed 7]
 *
 * Picks frames spread over the timeline, renders them in a SHUFFLED order in one fresh
 * page (so every frame is preceded by an unrelated one) and compares each JPEG byte for
 * byte with the file that the normal render wrote. Any stale-canvas, late-decode or
 * order-dependent state shows up as a mismatch.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const { resolveTimeline, frameName } = require('./render.js');

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

(async () => {
  const argv = process.argv.slice(2);
  const pos = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
  if (pos.length < 2) { console.log('usage: node scripts/video/compose/check_determinism.js <timeline.json> <renderedFramesDir> [--samples 60] [--seed 7]'); process.exit(2); }
  const { tl, errors } = resolveTimeline(path.resolve(pos[0]));
  if (errors.length) { errors.forEach(e => console.error('error:', e)); process.exit(1); }
  const dir = path.resolve(pos[1]);
  const total = Math.round(tl.duration * tl.fps);
  const n = Math.min(total, opt('--samples', 60));
  const rand = rng(opt('--seed', 7));
  const picks = new Set();
  for (let i = 0; i < n; i++) picks.add(Math.min(total - 1, Math.floor((i + rand()) * total / n)));
  // always include the frames right at scene starts and in the middle of transitions
  for (const sc of tl.scenes) { picks.add(Math.min(total - 1, Math.round(sc.start * tl.fps))); picks.add(Math.max(0, Math.round(sc.start * tl.fps) - 1)); }
  const order = [...picks];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars'] });
  const page = await (await browser.newContext({ viewport: { width: tl.width, height: tl.height }, deviceScaleFactor: 1 })).newPage();
  await page.goto(pathToFileURL(path.join(__dirname, 'compositor.html')).href);
  await page.evaluate(t => window.loadTimeline(t, {}), tl);
  const sha = b => crypto.createHash('sha1').update(b).digest('hex');
  const bad = [];
  let missing = 0;
  for (const k of order) {
    const f = path.join(dir, frameName(k));
    if (!fs.existsSync(f)) { missing += 1; continue; }
    await page.evaluate(t => window.renderAt(t), k / tl.fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95, scale: 'css', animations: 'allow', caret: 'initial' });
    if (sha(buf) !== sha(fs.readFileSync(f))) bad.push(k + 1);
  }
  await browser.close();
  console.log(`checked ${order.length - missing} frames in shuffled order against ${path.relative(process.cwd(), dir)}: ${bad.length} mismatch(es), ${missing} not rendered`);
  if (bad.length) console.log(`mismatching frames: ${bad.sort((a, b) => a - b).join(', ')}`);
  process.exit(bad.length || missing ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
