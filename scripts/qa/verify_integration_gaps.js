'use strict';
/**
 * Verify the three integration failures, and cover the Projects/Workflow
 * pages the integration run could not reach.
 *
 * The failures were: the new task is missing from Calendar and Task Timeline,
 * and present in Delegated Tasks despite being self-assigned. Each has an
 * innocent explanation that must be ruled out first — a calendar renders
 * events as divs rather than table rows, a timeline may need a date range,
 * and "Delegated" may legitimately mean "tasks I created" rather than
 * "tasks I gave away".
 *
 * Read-only.
 *   node scripts/qa/verify_integration_gaps.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};
// Created by the integration run.
const TASK = 'QA_TASK_1786568893513';
const WF_ID = '16d6c78a-a07c-4915-8c5c-cf975eda980d'; // Projects workflow module

const shot = async (page, name) => {
  const p = path.join(__dirname, '..', '..', 'reports', 'qa', 'shots', 'integration', `${name}.png`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return path.relative(path.join(__dirname, '..', '..'), p);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const R = { task: TASK };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // ── 1. Calendar: is the task there in ANY form, not just a table row? ──
    await page.goto(`${BASE}/calendar`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    R.calendar = await page.evaluate((task) => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const body = clean(document.body.innerText);
      return {
        mentionsTask: body.includes(task),
        // A calendar usually renders events as elements, not rows.
        eventLikeElements: [...document.querySelectorAll(
          '.fc-event, .event, [class*="event" i], .calendar-item, li, td a'
        )].filter((e) => e.getClientRects().length > 0)
          .map((e) => clean(e.innerText)).filter(Boolean).slice(0, 25),
        hasFullCalendar: !!document.querySelector('.fc, .fullcalendar, [class*="fc-"]'),
        visibleTables: [...document.querySelectorAll('table')]
          .filter((t) => t.getClientRects().length > 0)
          .map((t) => ({
            headers: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
            rows: t.querySelectorAll('tbody tr').length,
            firstRow: clean(t.querySelector('tbody tr')?.innerText).slice(0, 90),
          })),
        bodySample: body.slice(0, 400),
      };
    }, TASK);
    R.calendarShot = await shot(page, 'V_calendar');
    console.log('=== CALENDAR ===');
    console.log('  mentions task:', R.calendar.mentionsTask, '| fullcalendar widget:', R.calendar.hasFullCalendar);
    console.log('  tables:', JSON.stringify(R.calendar.visibleTables).slice(0, 300));
    console.log('  event-ish text:', JSON.stringify(R.calendar.eventLikeElements.slice(0, 8)));

    // ── 2. Task Timeline ──────────────────────────────────────────────────
    await page.goto(`${BASE}/redirect/task-timeline`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    R.timeline = await page.evaluate((task) => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const body = clean(document.body.innerText);
      return {
        url: location.pathname,
        mentionsTask: body.includes(task),
        bodyChars: body.length,
        bodySample: body.slice(0, 500),
        controls: [...document.querySelectorAll('button, select, input')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => clean(e.innerText) || e.id || e.type).filter(Boolean).slice(0, 15),
      };
    }, TASK);
    R.timelineShot = await shot(page, 'V_timeline');
    console.log('\n=== TASK TIMELINE ===');
    console.log('  url:', R.timeline.url, '| mentions task:', R.timeline.mentionsTask, '| bodyChars:', R.timeline.bodyChars);
    console.log('  sample:', JSON.stringify(R.timeline.bodySample.slice(0, 220)));
    console.log('  controls:', JSON.stringify(R.timeline.controls.slice(0, 10)));

    // ── 3. Delegated Tasks: what does this page actually mean? ────────────
    await page.goto(`${BASE}/delegated-tasks`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    R.delegated = await page.evaluate((task) => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)[0];
      return {
        heading: clean(document.querySelector('h1,h2,.card-title,.page-title')?.innerText).slice(0, 80),
        mentionsTask: clean(document.body.innerText).includes(task),
        headers: t ? [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)) : [],
        rows: t ? [...t.querySelectorAll('tbody tr')].slice(0, 5)
          .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText).slice(0, 22))) : [],
      };
    }, TASK);
    R.delegatedShot = await shot(page, 'V_delegated');
    console.log('\n=== DELEGATED TASKS ===');
    console.log('  heading:', JSON.stringify(R.delegated.heading), '| mentions task:', R.delegated.mentionsTask);
    console.log('  headers:', JSON.stringify(R.delegated.headers));
    R.delegated.rows.forEach((r) => console.log('   row:', r.join(' | ').slice(0, 120)));

    // ── 4. Projects / Workflow pages ─────────────────────────────────────
    console.log('\n=== PROJECTS / WORKFLOW ===');
    const WF = [
      ['Projects listing',      `/workflows/${WF_ID}`],
      ['New Project form',      `/workflow/${WF_ID}`],
      ['Projects dashboard',    `/workflow-dashboard/${WF_ID}`],
      ['Project Types',         `/workflow-types/${WF_ID}`],
      ['Project Notes',         `/workflow-notes/module/${WF_ID}`],
      ['Project Attachments',   `/workflow-attachments/module/${WF_ID}`],
      ['Project Expenses',      `/workflow-expenses/module/${WF_ID}`],
      ['Project Collections',   `/workflow-collections/module/${WF_ID}`],
      ['Pending Collection',    `/workflow-collection-pending/module/${WF_ID}`],
      ['Maintenance Schedule',  `/workflow-maintenance/module/${WF_ID}`],
      ['Status Report',         `/workflow-status-report/${WF_ID}`],
      ['Work Flow Modules',     `/workflow-modules`],
      ['Work Flow Cost Types',  `/workflow-cost-types`],
    ];
    R.workflow = [];
    for (const [name, url] of WF) {
      const resp = await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(4200);
      const st = await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const on = (e) => e.getClientRects().length > 0;
        const t = [...document.querySelectorAll('table')].filter(on)[0];
        const body = clean(document.body.innerText);
        return {
          heading: clean(document.querySelector('h1,h2,.card-title,.page-title')?.innerText).slice(0, 60),
          dead: /nothing at this address|sorry, there's nothing/i.test(body),
          error: /oops|went wrong|error code|exception/i.test(body),
          bodyChars: body.length,
          gridCols: t ? [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).length : 0,
          gridRows: t ? t.querySelectorAll('tbody tr').length : null,
          emptyText: t ? clean(t.querySelector('tbody')?.innerText).slice(0, 60) : '',
        };
      }).catch(() => ({}));
      await shot(page, `V_wf_${name.replace(/\W+/g, '_')}`);
      R.workflow.push({ name, url, http: resp ? resp.status() : null, ...st });
      const flag = st.dead ? '❌ DEAD' : st.error ? '❌ ERROR' : '✅';
      console.log(`  ${flag} ${name.padEnd(22)} http=${resp ? resp.status() : '?'} cols=${st.gridCols} rows=${st.gridRows} heading=${JSON.stringify((st.heading || '').slice(0, 28))}`);
    }

    fs.writeFileSync(
      path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'integration-gaps-verify.json'),
      JSON.stringify(R, null, 2)
    );
    console.log('\n✅ wrote reports/qa/raw/integration-gaps-verify.json');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
