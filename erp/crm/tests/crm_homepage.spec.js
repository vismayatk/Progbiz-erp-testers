'use strict';

/**
 * CRM — Homepage  (Excel "Homepage" sheet: Home_01 .. Home_26)
 *
 * On this build the "homepage" functionality is distributed across real pages:
 *   /home          — greeting, Create New, Today's Schedule, timeline/calendar icons
 *   /leads         — New / In-Follow-Up / Won / Lost tabs (#tab-lead-*) with counts
 *   /followups     — Today's / Delayed(overdue) / Upcoming / Non-Followup (#tab-followup-*)
 *   /crm-dashboard — Summary lead classification (New/Cold/Warm/Hot/Won/Lost) + Executive filter
 * Each Home_ id is mapped to the page that actually implements it.
 *
 * Run:  npx playwright test tests/crm_homepage.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { screenshot } = require('../../common/helpers');

const C = {
  company:  process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};
const BASE = process.env.BASE_URL || 'https://erptest.progbiz.in';

async function arrive(page) {
  const lp = new LoginPage(page); await lp.goto(); await lp.login(C.company, C.username, C.password);
  return lp;
}
async function go(page, slug) {
  await page.goto(`${BASE}/${slug}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(2000);
}
const tabCount = (page, id) => page.evaluate((i) => {
  const e = document.getElementById(i); if (!e) return null;
  const m = (e.textContent || '').match(/(\d+)/); return m ? Number(m[1]) : null;
}, id);

test.describe('CRM — Homepage', () => {
  test.describe.configure({ timeout: 150_000 });

  test('Home_01 | Homepage loads + welcome message + Create New (Home_01,02,24)', async ({ page }) => {
    await arrive(page);
    await go(page, 'home');
    expect(page.url()).toMatch(/home|dashboard/i);                          // Home_01
    const body = (await page.locator('body').textContent()) || '';
    expect(body).toMatch(/Hey,?\s*\w+/i);                                   // Home_02 (welcome + name)
    await expect(page.locator('#new-task, :text("Create New")').first()).toBeVisible(); // Home_24
    await screenshot(page, 'home01_loaded');
    console.log('  ✅ Homepage loads with welcome + Create New');
  });

  test('Home_03 | New Leads & lead status counts on Leads (Home_03,04)', async ({ page }) => {
    await arrive(page);
    await go(page, 'leads');
    expect(page.url()).toContain('/leads');
    for (const id of ['tab-lead-new', 'tab-lead-infollowup', 'tab-lead-won', 'tab-lead-lost']) {
      await expect(page.locator(`#${id}`), `${id} missing`).toBeVisible();
    }
    const newCount = await tabCount(page, 'tab-lead-new');
    console.log('  📊 New Leads count:', newCount);                          // Home_03
    expect(newCount, 'New Leads count did not render').not.toBeNull();
    // Home_04 drill-down: click must actually work (no swallowed failure) and open the list
    await page.locator('#tab-lead-new').click();
    await page.waitForTimeout(1500);
    const rows = await page.locator('table tbody tr').count();
    console.log('  📊 New-leads drill-down rows:', rows);
    // consistency: a positive badge must be backed by a rendered list (catches stale/stuck 0 vs broken list)
    if (newCount > 0) expect(rows, 'New badge > 0 but the leads list rendered no rows').toBeGreaterThan(0);
    await screenshot(page, 'home03_leads');
    console.log('  ✅ New Leads count shown AND the drill-down opens a populated list');
  });

  test('Home_05 | Followups Today/Overdue counts + drill-down (Home_05,06,07,08)', async ({ page }) => {
    await arrive(page);
    await go(page, 'followups');
    expect(page.url()).toContain('/followups');
    for (const id of ['tab-followup-today', 'tab-followup-overdue', 'tab-followup-upcoming']) {
      await expect(page.locator(`#${id}`), `${id} missing`).toBeVisible();
    }
    const today = await tabCount(page, 'tab-followup-today');               // Home_05
    const overdue = await tabCount(page, 'tab-followup-overdue');           // Home_07 (Delayed = overdue)
    console.log('  📊 Today followups:', today, '| Overdue (Delayed):', overdue);
    expect(today, 'Today count did not render').not.toBeNull();
    expect(overdue, 'Overdue count did not render').not.toBeNull();
    // Home_08 drill-down: click must work (no swallow) and, for a nonzero count, render rows
    await page.locator('#tab-followup-overdue').click();
    await page.waitForTimeout(1500);
    const overdueRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
    console.log('  📊 Overdue drill-down rows:', overdueRows);
    if (overdue > 0) expect(overdueRows, 'Overdue badge > 0 but the drill-down rendered no rows').toBeGreaterThan(0);
    await screenshot(page, 'home05_followups');
    console.log('  ✅ Followups Today + Overdue counts AND the drill-down opens rows');
  });

  test('Home_09 | Won/Completed leads listing (Home_09,10)', async ({ page }) => {
    await arrive(page);
    await go(page, 'leads');
    const won = await tabCount(page, 'tab-lead-won');
    console.log('  📊 Won (completed) leads:', won);
    expect(won, 'Won count did not render').not.toBeNull();               // Home_09
    // Home_10: click must work (no swallow); a nonzero Won badge must open a populated list
    await page.locator('#tab-lead-won').click();
    await page.waitForTimeout(1500);
    const rows = await page.locator('table tbody tr').count();
    console.log('  📊 Won listing rows:', rows);
    if (won > 0) expect(rows, 'Won badge > 0 but the Won listing rendered no rows').toBeGreaterThan(0);
    await screenshot(page, 'home09_won');
    console.log('  ✅ Won/Completed leads count AND listing reachable');
  });

  test('Home_11 | Today\'s Schedule section (Home_11,12)', async ({ page }) => {
    await arrive(page);
    await go(page, 'home');
    const has = await page.evaluate(() => /today'?s schedule/i.test(document.body.innerText) || !!document.getElementById('todayScheduletask'));
    await screenshot(page, 'home11_schedule');
    expect(has, 'Today\'s Schedule section not found').toBeTruthy();        // Home_11
    console.log('  ✅ Today\'s Schedule section present');
  });

  test('Home_13 | Follow-up History (Home_13,14)', async ({ page }) => {
    await arrive(page);
    await go(page, 'followups');
    // Non-Followup / history-style listing of past follow-ups.
    // The old `|| page.url().includes('followups')` was constant-true (we navigated there),
    // so it hid a missing history listing. Require the actual history section to render.
    const historyOk = await page.evaluate(() => {
      const tab = document.getElementById('tab-followup-nonfollowup');
      const bodyOk = /follow ?up history|non followup|last follow/i.test(document.body.innerText);
      return (!!tab && /\d/.test(tab.textContent || '')) || bodyOk;
    });
    await screenshot(page, 'home13_history');
    expect(historyOk, 'Non-Followup/follow-up history listing did not render').toBeTruthy(); // Home_13
    console.log('  ✅ Follow-up history/listing present');
  });

  test('Home_15 | Summary lead classification on CRM Dashboard (Home_15,16)', async ({ page }) => {
    await arrive(page);
    await go(page, 'crm-dashboard');
    const body = (await page.locator('body').textContent()) || '';
    for (const w of ['New', 'Cold', 'Warm', 'Hot', 'Won', 'Lost']) {
      expect(body, `Summary should include "${w}"`).toMatch(new RegExp('\\b' + w + '\\b'));   // Home_15
    }
    // Labels alone also appear in filter <option>s and column headers, so require COUNTS
    // rendered next to the classification labels in VISIBLE text. Builds differ on the
    // category set (TEST: New/Cold/Warm/Hot/Won/Lost; DEV: New/Won/Lost/Not Connected/…),
    // so require the core three that every build shows with counts.
    // The redesigned dashboard loads the Leads Summary counts asynchronously
    // (several seconds after the filter chips paint) — poll instead of sampling
    // once, or the labels are found without their counts.
    let withCounts = 0;
    for (let i = 0; i < 10 && withCounts < 3; i++) {
      withCounts = await page.evaluate(() => {
        const text = document.body.innerText.replace(/\s+/g, ' ');
        return ['New', 'Won', 'Lost'].filter((c) =>
          new RegExp('\\b' + c + '\\b\\s*:?\\s*\\d+', 'i').test(text)).length;
      });
      if (withCounts < 3) await page.waitForTimeout(2000);
    }
    console.log('  📊 core classification labels with counts:', withCounts, '/ 3');
    expect(withCounts, 'Leads Summary showed labels but no counts').toBe(3);
    await screenshot(page, 'home15_summary');
    console.log('  ✅ Summary shows classification labels WITH counts');
  });

  test('Home_17 | Executive filter on CRM Dashboard (Home_17,18,19)', async ({ page }) => {
    await arrive(page);
    await go(page, 'crm-dashboard');
    // open filters and look for an executive/added-by selector
    await page.locator('#btn-toggle-filter').click().catch(() => {});
    await page.waitForTimeout(1000);
    const hasExec = await page.evaluate(() => [...document.querySelectorAll('select,label')].some(e => /executive|added.?by|assignee|agent/i.test(e.textContent || e.id || '')));
    await screenshot(page, 'home17_exec');
    expect(hasExec, 'Executive/Added-By filter not found').toBeTruthy();    // Home_17 (admin sees it; Home_19 limited-user is role-based)
    console.log('  ✅ Executive/Added-By filter available for admin');
  });

  test('Home_20 | Timeline & Calendar icons on /home (Home_20,21,22,23)', async ({ page }) => {
    await arrive(page);
    await go(page, 'home');
    // The old [class*="time" i] matched any "datetime"/"task-time" label in the schedule rows,
    // so it passed even if the real Timeline/Calendar entry points were removed. Use
    // timeline-specific classes/links only.
    const icons = await page.evaluate(() => ({
      calendar: !!document.querySelector('.ri-calendar-line, .bi-calendar, [class*="calendar" i], [href*="calendar"]'),
      clock: !!document.querySelector('.ri-time-line, .bi-clock, [class*="timeline" i], [href*="timeline"]'),
    }));
    await screenshot(page, 'home20_icons');
    console.log('  🕒 icons:', JSON.stringify(icons));
    expect(icons.calendar || icons.clock, 'no timeline/calendar entry point on Home').toBeTruthy(); // Home_20/22
    console.log('  ✅ Timeline/Calendar entry points present on Home');
  });

  test('Home_25 | Create New → Enquiry and Quotation (Home_24,25,26)', async ({ page }) => {
    await arrive(page);
    await go(page, 'home');
    // open Create New and confirm Enquiry + Quotation options
    const item = page.locator('#new-task-item');
    for (let i = 0; i < 6 && !(await item.isVisible().catch(() => false)); i++) { await page.locator('#new-task, #new-lead-type').first().click().catch(() => {}); await page.waitForTimeout(600); }
    // Redesigned home dropped the ids on Enquiry/Quotation entries (plain hrefs)
    // — read every item of the dropdown containing #new-task-item instead.
    const opts = await page.evaluate(() => {
      const anchor = document.getElementById('new-task-item');
      const menu = anchor && anchor.closest('.dropdown-menu, ul');
      if (!menu) return [];
      return [...menu.querySelectorAll('a, button')]
        .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(t => t && t.length < 30);
    });
    await screenshot(page, 'home25_createnew');
    console.log('  📂 Create New options:', JSON.stringify(opts));
    expect(opts.map(s => s.toLowerCase())).toEqual(expect.arrayContaining(['enquiry', 'quotation'])); // Home_25,26
    console.log('  ✅ Create New exposes Enquiry + Quotation');
  });
});
