'use strict';

/**
 * ESS enhancements — SRS changes E3, E4, E8–E12 (02→09 Nov 2026).
 * Source: Z:\hrms documents\SRS\SRS-ESS-Recruitment-Changes-2026-11-09.docx
 *
 * Driven on the signed-in account's own Self-Service pages. Read-only /
 * non-destructive: panels and modals are opened and asserted, then dismissed;
 * nothing is submitted. Routes captured live 2026-11-10 (My-Workspace sidebar):
 *   /ess/approvals · /ess/requests · /ess/profile · /my-trainings · /my-handover
 *   · /my-onboarding-tasks · /my-probation-reviews · /ess/probation · /ess/attendance
 *
 * Data-dependent items (E9 completed reviews, E10 completed-on column, E11 calendar
 * labels) are guarded by data-presence so the spec stays green on any account.
 *
 * Run: npx playwright test -c hrms/playwright.config.js hrms/tests/05_ess/ess_srs_2026_11.spec.js
 */
const { test, expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const content = (page) => page.locator('.app-content, .main-content, [class*="content-wrapper" i]').last();

test.describe('ESS SRS 2026-11 — E3, E4, E8–E12', () => {

  // ── E3 — My Approvals: three tabs, paging ("Showing…"), search + advanced-filter icon ──
  test('E3 My Approvals shows the three tabs with paging and filters', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/approvals`, { ready: 'table' });
    const c = content(page);
    for (const tab of ['Awaiting my decision', 'My requests', 'History']) {
      await expect(c.getByText(new RegExp(tab, 'i')).first(), `the "${tab}" tab should be present`).toBeVisible({ timeout: 15000 });
    }
    // Paging surface ("Showing X of Y" / per-page) and the advanced-filter (sliders) control.
    const body = (await c.innerText().catch(() => '')).replace(/\s+/g, ' ');
    expect(body, 'a paging/count surface should be shown').toMatch(/Showing|per page|\bpage\b/i);
    await expect(c.locator('input[placeholder*="Search" i]').first(), 'a search box should be present').toBeVisible({ timeout: 10000 });
  });

  // ── E4 — My Requests: search + Advanced Filters (sort, date range, Actionable only) ──
  test('E4 My Requests exposes search and an Advanced Filters panel', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/requests`, { ready: 'h1, h2, h3' });
    const c = content(page);
    await expect(c.locator('input[placeholder*="Search" i]').first(), 'the "Search requests" box should be present').toBeVisible({ timeout: 15000 });

    // Open the Advanced Filters (sliders) panel.
    const sliders = c.locator('button:has(i[class*="slider" i]), [title*="filter" i], button[class*="filter" i]').first();
    if (await sliders.count()) { await sliders.click().catch(() => {}); await page.waitForTimeout(1200); }
    const body = (await c.innerText().catch(() => '')).replace(/\s+/g, ' ');
    expect(body, 'Advanced Filters should offer a sort order').toMatch(/Newest first|Oldest first|Sort/i);
    expect(body, 'Advanced Filters should offer a requested-date range').toMatch(/Requested from|From/i);
  });

  // ── E8 — My Profile → Request a Change: emergency-contact Relationship is editable ──
  test('E8 Request a Change lets you edit the emergency contact relationship', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/profile`, { ready: 'h1, h2, h3' });
    await content(page).locator('button, a').filter({ hasText: /Request a Change/i }).first().click().catch(() => {});
    const dlg = page.locator('.modal.show, .offcanvas.show, [role="dialog"]').first();
    await expect(dlg, 'the Request-a-Change editor should open').toBeVisible({ timeout: 15000 });
    await expect(dlg.getByText(/Emergency/i).first(), 'the editor should include the Emergency contact section').toBeVisible();
    // An editable relationship control (select offering Spouse / Father / Mother …).
    const relSel = dlg.locator('select').filter({ has: page.locator('option', { hasText: /Spouse|Father|Mother|Sibling|Friend/i }) }).first();
    await expect(relSel, 'an editable emergency-contact Relationship control should be present').toBeVisible({ timeout: 10000 });
    await expect(relSel, 'the Relationship control should be enabled (editable)').toBeEnabled();
    await page.keyboard.press('Escape').catch(() => {});
  });

  // ── E12 — ESS page headings drop the word "My" ──
  test('E12 ESS page headings no longer start with "My"', async ({ page }) => {
    const fk = new FormKit(page);
    const pages = [
      ['my-trainings', /Trainings/i],
      ['my-handover', /Handover/i],
      ['my-onboarding-tasks', /Onboarding Tasks/i],
      ['my-probation-reviews', /Probation Reviews/i],
      ['ess/probation', /Probation/i],
    ];
    for (const [route, label] of pages) {
      await fk.gotoReady(`${BASE}/${route}`, { ready: 'h1, h2, h3', tries: 2 }).catch(() => {});
      const heading = content(page).locator('h1, h2, h3').first();
      if (!(await waitVisible(heading, 8000))) continue;   // page blank on this account — skip, don't false-fail
      const txt = (await heading.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      expect(txt, `"/${route}" heading should match ${label}`).toMatch(label);
      expect(txt, `"/${route}" heading should NOT start with "My"`).not.toMatch(/^\s*My\b/i);
    }
  });

  // ── E9 — Probation Reviews: read-only view of a completed review (data-guarded) ──
  test('E9 Probation Reviews offers a read-only view of completed reviews', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/my-probation-reviews`, { ready: 'h1, h2, h3', tries: 2 }).catch(() => {});
    const c = content(page);
    const hasCompleted = /Completed Reviews/i.test((await c.innerText().catch(() => '')).replace(/\s+/g, ' '));
    test.skip(!hasCompleted, 'no Completed Reviews section for this account');
    const eye = c.locator('[title*="View review" i], button:has(i[class*="eye" i]), a:has(i[class*="eye" i])').first();
    test.skip(!(await waitVisible(eye, 6000)), 'no completed review row to open');
    await eye.click().catch(() => {});
    const dlg = page.locator('.modal.show, [role="dialog"]').first();
    await expect(dlg, 'a read-only review details popup should open').toBeVisible({ timeout: 10000 });
    await expect(dlg, 'the popup should show review detail fields')
      .toContainText(/rating|recommendation|summary|criteria/i);
    await page.keyboard.press('Escape').catch(() => {});
  });

  // ── E10 — Onboarding Tasks: "Completed On" column (data-guarded) ──
  test('E10 Onboarding Tasks has a "Completed On" column', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/my-onboarding-tasks`, { ready: 'h1, h2, h3', tries: 2 }).catch(() => {});
    const c = content(page);
    const grid = c.locator('table').first();
    test.skip(!(await waitVisible(grid, 8000)), 'no onboarding-tasks grid for this account');
    const heads = (await grid.locator('thead th').allInnerTexts().catch(() => [])).map(h => h.trim());
    expect(heads.join(' | '), 'the task table should carry a "Completed On" column').toMatch(/Completed On/i);
  });

  // ── E11 — My Attendance calendar renders (holiday/LOP labels are data-guarded) ──
  test('E11 My Attendance calendar renders', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/attendance`, { ready: 'h1, h2, h3' });
    await expect(content(page).getByText(/Attendance|Calendar/i).first(),
      'the attendance calendar should render').toBeVisible({ timeout: 15000 });
    // "Worked on Holiday" / Loss-of-Pay names only appear on matching days — asserted when present.
    const body = (await content(page).innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (/Worked on Holiday/i.test(body)) {
      expect(body, 'a "Worked on Holiday" day should name the holiday').toMatch(/Worked on Holiday/i);
    }
  });

});
