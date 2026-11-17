'use strict';
/**
 * Creates LOCAL test material for the compositor proof (no network, no ERP):
 *   reports/video/poc-compose/assets/still_dashboard.png   3840x2160 (1920x1080 CSS @ dsf 2)
 *   reports/video/poc-compose/assets/still_lead_detail.png 3840x2160
 *   reports/video/poc-compose/capture/sample_leads/        synthetic capture shot
 *        frames/f_000001.jpg ...  +  meta.json  (shared file contract)
 *   reports/video/poc-compose/assets/geometry.json         element boxes in CSS px
 *
 * The shot is "synthesised": the clock is scripted (t_ms is assigned, not
 * measured), frames are variable-rate, and the events log mixes two styles on
 * purpose: a dense stream of move events (first movement) and a single
 * teleporting move right before a click (second movement).
 *
 * Run from the repo root:  node scripts/video/compose/sample/make_sample_assets.js
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'reports', 'video', 'poc-compose');
const ASSETS = path.join(OUT, 'assets');
const SHOT_ID = 'sample_leads';
const SHOT = path.join(OUT, 'capture', SHOT_ID);
const FRAMES = path.join(SHOT, 'frames');
const MOCK = p => pathToFileURL(path.join(__dirname, p)).href;
const CSS_W = 1920, CSS_H = 1080, DSF = 2;

const box = async (page, sel) => {
  const b = await page.locator(sel).first().boundingBox();
  return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null;
};

(async () => {
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  for (const f of fs.readdirSync(FRAMES)) if (/^f_\d{6}\.jpg$/.test(f)) fs.unlinkSync(path.join(FRAMES, f));

  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-lcd-text'] });
  const ctx = await browser.newContext({ viewport: { width: CSS_W, height: CSS_H }, deviceScaleFactor: DSF });
  const page = await ctx.newPage();
  const geometry = {};

  // ---- still 1: dashboard -------------------------------------------------
  await page.goto(MOCK('mock_dashboard.html'));
  await page.screenshot({ path: path.join(ASSETS, 'still_dashboard.png'), type: 'png' });
  geometry.dashboard = {
    kpis: await box(page, '#kpis'), kpi_total: await box(page, '#kpi-total'), kpi_pipe: await box(page, '#kpi-pipe'),
    stages: await box(page, '#stages'), followups: await box(page, '#followups'),
    user: await box(page, '#user'), email: await box(page, '#email'),
  };

  // ---- synthetic capture shot: leads -------------------------------------
  await page.goto(MOCK('mock_leads.html'));
  const frames = [];
  const events = [];
  let n = 0;
  const snap = async t_ms => {
    n += 1;
    const file = `frames/f_${String(n).padStart(6, '0')}.jpg`;
    await page.screenshot({ path: path.join(SHOT, file), type: 'jpeg', quality: 90, caret: 'initial', animations: 'allow' });
    frames.push({ file, t_ms: Math.round(t_ms) });
  };
  const ev = (t_ms, type, x, y, label) => events.push({ t_ms: Math.round(t_ms), type, x, y, label });

  const bSearch = await page.locator('#search').boundingBox();
  const sx = Math.round(bSearch.x + 150), sy = Math.round(bSearch.y + bSearch.height / 2);
  geometry.leads = { search: await box(page, '#search'), tools: await box(page, '#tools'), table: await box(page, '#tbl') };

  let t = 0;
  ev(t, 'nav', null, null, 'leads');
  let cx = 1180, cy = 760;                       // where the pointer rests at the start
  await page.mouse.move(cx, cy);
  ev(t, 'move', cx, cy, '');
  await snap(t);

  // 1) dense movement to the search box: a move event every ~16 ms for 640 ms
  t = 900;
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    // small deterministic wobble so that the smoothing has something to do
    const wob = Math.sin(i * 1.7) * 3.2;
    const x = Math.round(cx + (sx - cx) * e + wob), y = Math.round(cy + (sy - cy) * e - wob);
    await page.mouse.move(x, y);
    ev(t + i * 16, 'move', x, y, '');
    if (i % 8 === 0) await snap(t + i * 16);   // hover states change while moving
  }
  t += steps * 16;                               // 1540
  cx = sx; cy = sy;
  await page.mouse.move(cx, cy);
  ev(t + 10, 'move', cx, cy, '');

  // 2) click the search box, type slowly
  t = 1800;
  ev(t, 'down', cx, cy, 'search');
  await page.mouse.down();
  await snap(t + 20);
  t += 90;
  ev(t, 'up', cx, cy, 'search');
  await page.mouse.up();
  await snap(t + 10);
  t = 2250;
  for (const ch of 'Demo') {
    await page.keyboard.type(ch);
    ev(t, 'key', null, null, ch);
    await snap(t + 15);
    t += 170;
  }
  await page.waitForTimeout(50);
  geometry.leads.first_row = await box(page, '#rows tr');
  geometry.leads.phone_col = await (async () => {
    const cells = await page.locator('#rows td.ph').all();
    const a = await cells[0].boundingBox(), b = await cells[cells.length - 1].boundingBox();
    return [Math.round(a.x), Math.round(a.y), Math.round(a.width), Math.round(b.y + b.height - a.y)];
  })();

  // 3) teleport + click on the first row (what a plain locator.click() logs)
  t = 3600;
  const bRow = await page.locator('#rows tr').first().boundingBox();
  const rx = Math.round(bRow.x + 210), ry = Math.round(bRow.y + bRow.height / 2);
  await page.mouse.move(rx, ry);
  ev(t, 'move', rx, ry, '');
  await snap(t + 10);                            // row hover highlight
  ev(t + 8, 'down', rx, ry, 'row: Demo Customer');
  await page.mouse.down();
  ev(t + 70, 'up', rx, ry, 'row: Demo Customer');
  await page.mouse.up();
  t += 80;
  // step the panel's CSS transition deterministically: 33 ms per frame
  await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
  const phoneTrack = [];                          // where the phone number is while the panel slides in
  const trackPhone = async t_ms => { const b = await page.locator('#p-phone').boundingBox(); phoneTrack.push({ t_ms: Math.round(t_ms), rect: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }); };
  for (let k = 0; k <= 9; k++) {
    await page.evaluate(ms => document.getAnimations().forEach(a => { a.currentTime = ms; }), k * 33);
    await snap(t + k * 33);
    await trackPhone(t + k * 33);
  }
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
  await snap(t + 340);
  await trackPhone(t + 340);
  geometry.leads_panel_phone_track = phoneTrack;
  ev(t + 340, 'mark', null, null, 'detail-open');
  geometry.leads = geometry.leads || {};
  geometry.leads.panel = await box(page, '#panel');
  geometry.leads.assign = await box(page, '#assign');
  geometry.leads.panel_phone = await box(page, '#p-phone');
  geometry.leads.click_row = [rx, ry];
  geometry.leads.click_search = [sx, sy];

  // 4) slow drift towards the assignment box, no click (dense events)
  let t2 = t + 900;
  const ax = geometry.leads.assign[0] + 250, ay = geometry.leads.assign[1] + 34;
  for (let i = 1; i <= 45; i++) {
    const u = i / 45, e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const x = Math.round(rx + (ax - rx) * e), y = Math.round(ry + (ay - ry) * e);
    await page.mouse.move(x, y);
    ev(t2 + i * 16, 'move', x, y, '');
  }
  await snap(t2 + 45 * 16);
  await snap(t2 + 45 * 16 + 1500);               // tail frame: nothing changes
  ev(t2 + 45 * 16 + 1500, 'mark', null, null, 'end');

  // ---- still 2: the lead detail (same state, PNG) -------------------------
  await page.screenshot({ path: path.join(ASSETS, 'still_lead_detail.png'), type: 'png' });

  const meta = {
    shot_id: SHOT_ID, css_width: CSS_W, css_height: CSS_H, dsf: DSF,
    frame_width: CSS_W * DSF, frame_height: CSS_H * DSF, frames, events,
  };
  fs.writeFileSync(path.join(SHOT, 'meta.json'), JSON.stringify(meta, null, 1));
  fs.writeFileSync(path.join(ASSETS, 'geometry.json'), JSON.stringify(geometry, null, 1));
  await browser.close();
  console.log(`stills: ${ASSETS}`);
  console.log(`shot:   ${SHOT}  frames=${frames.length} events=${events.length} last_t_ms=${frames[frames.length - 1].t_ms}`);
  console.log(JSON.stringify(geometry, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
