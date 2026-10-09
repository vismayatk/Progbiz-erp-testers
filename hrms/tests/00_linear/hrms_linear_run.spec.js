'use strict';

/**
 * HRMS — linear positive run over EVERY HRMS page, in sidebar order, in ONE browser tab.
 *
 * ONE test, one step per page (data/hrmsPages.js, top to bottom):
 *   1. open the page once and run the generic positive check (flows/pageCheck.js) — it loads, has a
 *      heading, lists render, no error;
 *   2. if the page's main job is adding something, do it ONCE (flows/linearActions.js) — all for the
 *      run's ONE employee, created on the Employee page.
 * Payroll, Attendance and Resignation & Exit are base-only (page checks) — teammates own them.
 *
 * One tab, start to finish: it is a single test, so the browser is never closed between pages. A
 * failing page is recorded (screenshot of that page + the error) and the walk carries on in the same
 * tab; the run is marked failed at the end. The whole session is one continuous video, kept with the
 * evidence. The employee's own session (self-service leave) opens a second window only while they act.
 *
 * Read-only walk (checks only, adds nothing):  HRMS_LINEAR_READONLY=1
 * Only some pages (substring of label/route):  HRMS_PAGES="Leave Approval,Offers"
 * Start from a page number (e.g. resume):      HRMS_FROM=52
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const pages = require('../../data/hrmsPages');
const { checkPage } = require('../../flows/pageCheck');
const actions = require('../../flows/linearActions');

const READONLY = !!process.env.HRMS_LINEAR_READONLY;
const ONLY = (process.env.HRMS_PAGES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const FROM = Number(process.env.HRMS_FROM || 1);
const SESSIONS = path.join(__dirname, '..', '..', '..', 'test-results', 'hrms', '_sessions');
const STATE = path.join(__dirname, '..', '..', '.auth', 'state.json');
const safe = s => s.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();

test('HRMS linear run — every page in sidebar order, one tab', async ({ browser }, testInfo) => {
  test.setTimeout(4 * 60 * 60 * 1000);   // the whole walk is one test
  fs.mkdirSync(SESSIONS, { recursive: true });
  const context = await browser.newContext({
    storageState: STATE,
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: SESSIONS, size: { width: 1600, height: 900 } },
  });
  const page = await context.newPage();
  const results = [];

  try {
    for (const [i, entry] of pages.entries()) {
      const n = String(i + 1).padStart(3, '0');
      if (i + 1 < FROM) continue;
      if (ONLY.length && !ONLY.some(o => entry.label.toLowerCase().includes(o) || entry.route.toLowerCase().includes(o))) continue;
      const doAdd = entry.add && !READONLY;
      await test.step(`${n} [${entry.section}] ${entry.label}${doAdd ? ` + ${entry.add}` : ''}`, async () => {
        const started = Date.now();
        try {
          const s = await checkPage(page, entry);
          console.log(`  ✅ ${n} [${entry.section}] ${entry.label} — "${s.heading}"${s.tables ? ` · ${s.tables} table(s), ${s.rows} row(s)${s.empty ? `, ${s.empty} empty list` : ''}` : ''}`);
          if (doAdd) {
            expect(actions[entry.add], `action "${entry.add}" should exist`).toBeTruthy();
            await actions[entry.add]({ page, browser, testInfo, entry });
            console.log(`  ✅ ${n} ${entry.label} — ${entry.add} done`);
          }
          results.push({ n, entry, ok: true, secs: Math.round((Date.now() - started) / 1000) });
        } catch (e) {
          // Record this page's failure and keep walking in the same tab.
          const shot = testInfo.outputPath(`${n} ${safe(entry.label)} — failure.png`);
          await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
          if (fs.existsSync(shot)) await testInfo.attach(`${n} ${entry.label} — page at failure`, { path: shot, contentType: 'image/png' });
          const msg = String(e && e.message || e).split('\n').slice(0, 6).join(' ').replace(/\x1b\[[0-9;]*m/g, '');
          console.log(`  ❌ ${n} [${entry.section}] ${entry.label} — ${msg.slice(0, 300)}  | URL: ${page.url()}`);
          results.push({ n, entry, ok: false, error: msg });
          expect.soft(false, `${n} ${entry.label}: ${msg}`).toBe(true);
        }
      });
    }
  } finally {
    const video = page.video();
    await context.close();
    if (video) {
      const d = new Date();
      const pad = x => String(x).padStart(2, '0');
      await video.saveAs(path.join(SESSIONS, `linear-run ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.webm`)).catch(() => {});
      await video.delete().catch(() => {});
    }
    const failed = results.filter(r => !r.ok);
    console.log(`\n  📋 Linear run: ${results.length} pages · ${results.length - failed.length} passed · ${failed.length} failed`);
    for (const f of failed) console.log(`     ❌ ${f.n} [${f.entry.section}] ${f.entry.label} — ${f.error.slice(0, 160)}`);
    fs.writeFileSync(testInfo.outputPath('page-results.json'), JSON.stringify(results.map(r => ({ n: r.n, section: r.entry.section, page: r.entry.label, route: r.entry.route, action: r.entry.add || '', ok: r.ok, error: r.error || '' })), null, 2));
    await testInfo.attach('page-results', { path: testInfo.outputPath('page-results.json'), contentType: 'application/json' });
  }
});
