'use strict';

/**
 * Leave — assign policy → apply & approve on behalf (SERIAL, on the RUN EMPLOYEE).
 *
 *   LV6 Assign a leave pattern (Standard Staff) to the run employee   (LEV setup)  /leave-assignment-list
 *   LV7 Apply + approve a 1-day leave on their behalf (admin)          (LEV-002/5)  /leave-request-on-behalf
 *
 * One employee per run: the employee is the one Core HR Step 1 created (flows/runEmployee.js);
 * this spec creates nobody. The HR "Apply Leave for Employee" page submits with "Apply and
 * Approve" — the admin raises AND approves in one action (applicant = employee, approver = admin).
 * Standard Staff grants Casual Leave on assignment, so a 1-day apply on CASUAL is within balance.
 *
 * Positive-only, mandatory fields only. Every step asserts.
 *   LV6 verifies functionally (the employee gains selectable leave types with balance).
 *   LV7 verifies with a success signal AND a balance decrement after reload.
 */
const { test, expect } = require('@playwright/test');
const { FormKit } = require('../../pages/FormKit');
const { BASE, futureWeekdayISO, selectOnBehalfEmployee, leaveTypeSelect, assignLeavePattern } = require('../../flows/leaveFlow');
const { requireRunEmployee } = require('../../flows/runEmployee');

test.describe.configure({ mode: 'serial' });

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe('Leave — assign → apply & approve (run employee)', () => {
  const run = {};
  const useRunEmployee = () => {
    if (run.code) return;
    const e = requireRunEmployee();
    Object.assign(run, { code: e.code, first: e.first, display: e.display });
    console.log(`  🔁 Leave on behalf for this run's employee ${run.display} (${run.code})`);
  };

  test('LV6 — assign a leave pattern (Standard Staff) to the employee', async ({ page }) => {
    test.setTimeout(150_000);
    useRunEmployee();
    const { via, types } = await assignLeavePattern(page, run.code);   // picks the employee by unique code
    run.ltOpts = types;
    console.log(`  ✅ LV6 leave pattern assigned to "${run.display}" (${via}) — persisted, leave types: ${JSON.stringify(types)}`);
  });

  test('LV7 — apply & approve a 1-day leave on the employee\'s behalf', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    useRunEmployee();
    const fk = new FormKit(page);
    const nameRe = new RegExp(`\\[${run.code}\\]`);   // pick by unique employee code, not name

    await page.goto(`${BASE}/leave-request-on-behalf`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await selectOnBehalfEmployee(page, nameRe);

    // Choose a leave type and record its starting available-day count.
    const lt = leaveTypeSelect(page);
    await expect(lt, 'Leave Type select should be present').toBeVisible({ timeout: 20000 });
    const casual = (await lt.locator('option').allTextContents()).find(t => /Casual Leave/i.test(t))
      || (await lt.locator('option').allTextContents()).find(t => /available/i.test(t));
    expect(casual, 'a leave type with an available balance').toBeTruthy();
    const beforeAvail = Number((casual.match(/(\d+)\s*d available/i) || [])[1] ?? NaN);
    await test.step(`Select Leave Type "${casual}"`, async () => {
      await lt.selectOption({ label: casual });
      await page.waitForTimeout(2000);
    });

    // Dates (native date inputs) — a single future weekday = 1 working day, within balance.
    const day = futureWeekdayISO(14);
    await fk.setInput(page.getByText(/Start Date \*/i).first().locator('xpath=following::input[@type="date"][1]'), day, 'Start Date');
    await fk.setInput(page.getByText(/End Date \*/i).first().locator('xpath=following::input[@type="date"][1]'), day, 'End Date');
    await fk.setInput(page.locator('#onbehalf-reason'), 'QA automated positive leave request', 'Reason');

    // Submit: "Apply and Approve" raises + approves in one admin action.
    const applyBtn = page.locator('button, a.btn').filter({ hasText: /Apply and Approve/i }).first();
    await expect(applyBtn, 'the "Apply and Approve" button should be present').toBeVisible({ timeout: 15000 });
    await applyBtn.scrollIntoViewIfNeeded().catch(() => {});
    await applyBtn.click();

    // The app answers with a SweetAlert (a confirm and/or the result). Poll ~25s: accept any
    // confirm dialog, capture the app's explicit confirmation, and fail loudly on a rejection.
    // (Previously this checked `isVisible({timeout})`, which does NOT wait — the confirm was
    // never clicked, so the leave never committed, and a loose /approved/ regex falsely passed.)
    let confirmation = '';
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline && !confirmation) {
      const txt = (await page.locator('.swal2-popup, .toast, .toast-body, [role="alert"]').allInnerTexts().catch(() => []))
        .join(' | ').replace(/\s+/g, ' ').trim();
      if (/balance is updated|applied for .* and approved/i.test(txt)) { confirmation = txt; break; }
      if (/conflict|overlap|insufficient|exceed|not enough/i.test(txt)) {
        await page.screenshot({ path: testInfo.outputPath('lv7-rejected.png') }).catch(() => {});
        throw new Error(`"Apply and Approve" was rejected by the app: "${txt}"`);
      }
      const ok = page.locator('.swal2-confirm');
      if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: testInfo.outputPath('lv7-after-submit.png') }).catch(() => {});
    console.log(`  ✅ LV7 submitted for "${run.display}" on ${day} (was ${beforeAvail} d) — app said: ${confirmation || '(no confirmation text captured; gating on balance)'}`);

    // Persisted check (HARD gate): the approved day is deducted from the available balance.
    // Re-open the page and re-select the employee on EVERY poll so the options are re-fetched
    // from the server (re-reading an already-loaded <select> never changes).
    expect(Number.isNaN(beforeAvail), 'the chosen leave type should expose an available count').toBe(false);
    let afterAvail = NaN;
    await expect.poll(async () => {
      try {
        await page.goto(`${BASE}/leave-request-on-behalf`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await selectOnBehalfEmployee(page, nameRe);
        const casual2 = (await leaveTypeSelect(page).locator('option').allTextContents()).find(t => /Casual Leave/i.test(t)) || '';
        afterAvail = Number((casual2.match(/(\d+)\s*d available/i) || [])[1] ?? NaN);
      } catch { afterAvail = NaN; }
      return afterAvail;
    }, { timeout: 120000, intervals: [2000, 5000, 10000],
      message: `Casual Leave available should drop from ${beforeAvail} to ${beforeAvail - 1} after the approved 1-day leave` })
      .toBe(beforeAvail - 1);
    console.log(`  ✅ LV7 persisted — Casual Leave balance ${beforeAvail} → ${afterAvail} after the approved leave`);
  });
});
