'use strict';

/**
 * Leave — SRS change E5 (02→09 Nov 2026): day-level withdraw + "Request Revert".
 * Source: Z:\hrms documents\SRS\SRS-ESS-Recruitment-Changes-2026-11-09.docx
 *
 * Employee-facing: exercised on /ess/leave as the signed-in user (the global-setup
 * account). NON-DESTRUCTIVE — every revert/withdraw dialog is opened, its structure
 * and guards asserted, then dismissed with the keep/cancel choice, so no leave is
 * actually reverted or withdrawn and the suite is repeatable.
 *
 * Live behaviour captured 2026-11-10 (amit@pbhrms, who holds approved leaves):
 *   • approved leaves carry a "Request Revert" control (the E5 feature);
 *   • a leave day that is over and was not worked cannot be reverted — the app
 *     raises a "Cannot revert — Attendance shows you did not work on <date>…" guard
 *     (SRS: the Request-Revert button only works when the server allows it);
 *   • a pending-revert leave offers "Withdraw" → "Withdraw your revert request?
 *     The leave stays approved." (Yes, Withdraw / No, Keep it).
 *
 * The multi-day day-picker (tick which days to withdraw/revert) and the reason +
 * half-day form only appear for a multi-day / revertible leave; those branches are
 * guarded by data-presence so the spec stays green on any account.
 *
 * Run: npx playwright test -c hrms/playwright.config.js hrms/tests/05_leave/leave_revert_srs_2026_11.spec.js
 */
const { test, expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const content = (page) => page.locator('.app-content, .main-content, [class*="content-wrapper" i]').last();

test.describe('Leave SRS 2026-11 — E5 day-level withdraw & Request Revert', () => {

  test('E5 My Leave shows the requests grid with an Action column', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/leave`, { ready: 'table' });
    const grid = content(page).locator('table').filter({ hasText: /Leave Type|Approval Status/i }).first();
    await expect(grid, 'the My Leave Requests grid should render').toBeVisible({ timeout: 20000 });
    const heads = (await grid.locator('thead th').allInnerTexts().catch(() => [])).map(h => h.trim());
    expect(heads.join(' | '), 'the grid should carry an Action column for withdraw/revert').toMatch(/Action/i);
    expect(heads.join(' | '), 'the grid should carry an Approval Status column').toMatch(/Approval Status|Status/i);
  });

  test('E5 approved leaves expose a "Request Revert" control, guarded by revertibility', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/leave`, { ready: 'table' });
    const c = content(page);
    const revert = c.locator('button, a').filter({ hasText: /Request Revert/i });
    const n = await revert.count();
    test.skip(n === 0, 'the signed-in account holds no approved, revertible leave to exercise Request Revert');

    await revert.first().click().catch(() => {});
    await page.waitForTimeout(1800);

    // Either a revert FORM opens (revertible leave) or the revertibility GUARD pops.
    const guard = page.locator('.swal2-popup, .modal.show, [role="dialog"]').filter({ hasText: /Cannot revert|did not work|reverted only if it was worked/i }).first();
    const form  = page.locator('.modal.show, .offcanvas.show, [role="dialog"], .swal2-popup').filter({ hasText: /Request Revert|reason|which days|revert/i }).first();

    if (await waitVisible(guard, 4000)) {
      // SRS: a past, unworked leave day cannot be reverted — the guard is correct behaviour.
      await expect(guard, 'the revert guard should explain why it is blocked').toContainText(/cannot revert|did not work|only if it was worked/i);
      await guard.locator('button').filter({ hasText: /ok|understood|close|cancel/i }).first().click().catch(() => page.keyboard.press('Escape'));
    } else {
      await expect(form, 'the Request Revert form should open for a revertible leave').toBeVisible({ timeout: 8000 });
      // A reason is required — an empty submit must be blocked.
      const submit = form.locator('button').filter({ hasText: /submit|request revert|send|confirm/i }).last();
      if (await submit.count()) {
        await submit.click().catch(() => {});
        await page.waitForTimeout(1200);
        const stillOpen = await form.isVisible().catch(() => false);
        const warned = await page.locator('.swal2-container, .text-danger, .invalid-feedback').first().isVisible().catch(() => false);
        expect(stillOpen || warned, 'an empty Request Revert (no reason/day) must be blocked').toBeTruthy();
      }
      // Cancel without submitting — nothing is actually reverted.
      await form.locator('button').filter({ hasText: /cancel|close|no,/i }).first().click().catch(() => page.keyboard.press('Escape'));
    }
    await page.waitForTimeout(500);
  });

  test('E5 a pending-revert leave offers "Withdraw Revert" with a keep-it confirm', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/leave`, { ready: 'table' });
    const c = content(page);

    // A leave whose revert is pending shows a Withdraw(-Revert) control + a status line.
    const withdraw = c.locator('button, a').filter({ hasText: /^\s*Withdraw(\s*Revert)?\s*$/i });
    test.skip(!(await waitVisible(withdraw.first(), 6000)), 'no pending-revert leave to exercise Withdraw Revert');

    await withdraw.first().click().catch(() => {});
    const confirm = page.locator('.swal2-popup, .modal.show, [role="dialog"]')
      .filter({ hasText: /Withdraw your revert request|stays approved|Withdraw/i }).first();
    await expect(confirm, 'a withdraw-revert confirm should appear').toBeVisible({ timeout: 8000 });
    await expect(confirm, 'the confirm should state the leave stays approved')
      .toContainText(/stays approved|withdraw your revert request/i);
    // Keep it — do NOT withdraw (non-destructive).
    await confirm.locator('button').filter({ hasText: /no.*keep|cancel|close/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await expect(confirm, 'choosing "No, Keep it" should close the confirm, leaving the revert pending').toBeHidden({ timeout: 8000 });
  });

  test('E5 revert status text is shown on leaves with a revert in progress', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/leave`, { ready: 'table' });
    const body = (await content(page).innerText().catch(() => '')).replace(/\s+/g, ' ');
    const hasRevertSurface = /Request Revert|Reverted by|revert request|waiting for|the days are back/i.test(body);
    expect(hasRevertSurface, 'the My Leave page should surface the revert feature (controls or status text)').toBeTruthy();
  });

});
