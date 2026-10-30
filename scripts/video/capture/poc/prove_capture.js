'use strict';
/**
 * PROOF: a ~15 second scripted interaction on the LOCAL test page, captured with capture.js.
 *   node scripts/video/capture/poc/prove_capture.js [--page anim|static] [--cursor baked] [--id NAME] [--flavor shell]
 *
 * move -> click "New lead" (modal opens) -> still -> close the modal -> type in the search box -> scroll.
 * Output: reports/video/poc-capture/<id>/ (capture shot directory) + proof.json
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const cap = require('../capture');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i < 0 ? def : process.argv[i + 1]; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const pageKind = arg('page', 'anim');
  const baked = arg('cursor', '') === 'baked';
  const flavor = arg('flavor', 'shell');
  const id = arg('id', `proof_15s_${pageKind}${baked ? '_bakedcursor' : ''}`);
  const outRoot = path.join(__dirname, '..', '..', '..', '..', 'reports', 'video', 'poc-capture');
  const url = pathToFileURL(path.join(__dirname, '..', 'testpage', 'index.html')).href + (pageKind === 'static' ? '?anim=0' : '');

  const { browser, page } = await cap.launchForCapture({ chromium, flavor, dsf: 2 });
  if (baked) await cap.installDomCursor(page);
  await page.goto(url);
  await sleep(600);

  const c = await cap.startCapture(page, { shotId: id, outRoot });
  c.mark('page-ready');
  await sleep(900);
  await cap.smoothMove(page, 1420, 150, { fromX: 1000, fromY: 620 });       // glance at a KPI card
  await sleep(500);
  c.mark('open-modal');
  await cap.smoothClick(page, page.locator('#btn-new'), { label: 'New lead' });
  await sleep(1100);
  const st = await cap.still(page, path.join(outRoot, id, 'stills', 'modal_open.png'));
  await sleep(300);
  c.mark('close-modal');
  await cap.smoothClick(page, page.locator('#modal-close'), { label: 'Close' });
  await sleep(800);
  c.mark('search');
  await cap.smoothType(page, page.locator('#search'), 'Kochi', { cps: 7 });
  await sleep(1200);
  c.mark('scroll');
  await cap.smoothMove(page, 1080, 640, {});
  await cap.smoothScroll(page, 700, { durationMs: 1800 });
  await sleep(700);
  await cap.smoothScroll(page, -700, { durationMs: 1400 });
  const left = 15000 - c.stats().seconds * 1000;
  if (left > 0) await sleep(left);
  const meta = await c.stop();
  await browser.close();

  // ---- report ----
  const frames = meta.frames, events = meta.events;
  const gaps = [];
  for (let i = 1; i < frames.length; i++) gaps.push(frames[i].t_ms - frames[i - 1].t_ms);
  gaps.push(meta.duration_ms - frames[frames.length - 1].t_ms);
  const sorted = [...gaps].sort((a, b) => a - b);
  const bySecond = new Array(Math.ceil(meta.duration_ms / 1000)).fill(0);
  frames.forEach((f) => { bySecond[Math.min(bySecond.length - 1, Math.floor(f.t_ms / 1000))]++; });
  // latency from an input event to the next frame Chrome composited (only meaningful on the static page)
  const lat = {};
  for (const e of events) {
    if (!['up', 'key', 'scroll'].includes(e.type)) continue;
    const nxt = frames.find((f) => f.t_ms >= e.t_ms);
    if (!nxt) continue;
    (lat[e.type] = lat[e.type] || []).push(nxt.t_ms - e.t_ms);
  }
  const latency = {};
  for (const k of Object.keys(lat)) {
    const a = lat[k].sort((x, y) => x - y);
    latency[k] = { n: a.length, median_ms: a[Math.floor(a.length / 2)], max_ms: a[a.length - 1] };
  }
  const counts = {};
  events.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
  const report = {
    id, flavor, page: pageKind, baked_cursor: baked,
    frame_size: `${meta.frame_width}x${meta.frame_height}`, dsf: meta.dsf,
    frames: frames.length, duration_ms: meta.duration_ms,
    effective_fps: Math.round((frames.length / (meta.duration_ms / 1000)) * 100) / 100,
    frames_per_second_of_capture: bySecond,
    gap_ms: { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1] },
    gaps_over_100ms: gaps.filter((g) => g > 100).length,
    event_counts: counts,
    input_to_next_frame_latency: latency,
    megabytes: meta.stats.megabytes,
    arrival_lag: { mean_ms: meta.stats.mean_arrival_lag_ms, max_ms: meta.stats.max_arrival_lag_ms },
    still: { file: path.relative(outRoot, st.file), width: st.width, height: st.height },
    loadavg_1m: Math.round(require('os').loadavg()[0] * 10) / 10,
    write_errors: meta.write_errors,
  };
  fs.writeFileSync(path.join(outRoot, id, 'proof.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
