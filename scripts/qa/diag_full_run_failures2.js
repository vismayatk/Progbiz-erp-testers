'use strict';
/**
 * Follow-up read-only probe, single session:
 *
 *  1) /whatsapp-expenses — redo the load-timing check. The first probe broke
 *     out of its polling loop after 145ms because the body was still EMPTY
 *     (Blazor hadn't hydrated yet) — an empty string doesn't match /loading/i,
 *     so the loop's "not loading" exit condition fired on a false read. This
 *     version requires a NON-EMPTY body before it will call the page settled.
 *  2) Task Details ⋮ menu — dump the exact item labels. TM-25 (Edit Task) and
 *     TM-26 (Reschedule Task) failed on an exact-text getByText() match while
 *     TM-27 (Add Lead), using the same menu-opening code, passed moments
 *     later against the same task — so the menu itself opens fine; the
 *     suspect is the "Edit Task" / "Reschedule Task" label text.
 *
 * Run:  node scripts/qa/diag_full_run_failures2.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { TaskManagementPage } = require('../../erp/task-management/pages/TaskManagementPage');

const C = {
  company: process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD || '123',
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // ── 1) /whatsapp-expenses, proper polling ─────────────────────────
    console.log('\n=== /whatsapp-expenses load timing (fixed probe) ===');
    const t0 = Date.now();
    await page.goto(`${process.env.BASE_URL}/whatsapp-expenses`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    for (let i = 0; i <= 15; i++) {
      const state = await page.evaluate(() => {
        const body = document.body.innerText || '';
        const clean = body.replace(/\s+/g, ' ').trim();
        return {
          empty: clean.length === 0,
          loadingText: /loading/i.test(clean),
          hasError: /oops|went wrong|error code|exception|too many/i.test(clean),
          hasTable: !!document.querySelector('table'),
          rows: document.querySelectorAll('table tbody tr').length,
          bodyLen: clean.length,
          snippet: clean.slice(0, 80),
        };
      });
      console.log(`  t=${Date.now() - t0}ms`, JSON.stringify(state));
      if (!state.empty && !state.loadingText) break;
      await page.waitForTimeout(1000);
    }

    // ── 2) Task Details ⋮ menu labels ─────────────────────────────────
    console.log('\n=== Task Details ⋮ menu labels ===');
    const tm = new TaskManagementPage(page);
    await tm.gotoMyTasks();
    const name = await tm.openFirstOpenableTask();
    console.log('  opened task:', name);
    if (name) {
      await page.locator('.fe-more-vertical').first().click().catch((e) => console.log('  ⋮ click error:', e.message.slice(0, 60)));
      await page.waitForTimeout(1000);
      const items = await page.evaluate(() => {
        // Find visible menu-like items near a "more vertical" trigger.
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const candidates = [...document.querySelectorAll('a, button, li, .dropdown-item')]
          .filter((e) => e.getClientRects().length && clean(e.textContent).length && clean(e.textContent).length < 40);
        return candidates.map((e) => clean(e.textContent)).filter((t, i, arr) => arr.indexOf(t) === i);
      });
      console.log('  visible short-text items on screen:', JSON.stringify(items));
    }
  } catch (e) {
    console.log('ERROR', e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
})();
