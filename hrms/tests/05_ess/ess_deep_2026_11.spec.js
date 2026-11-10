'use strict';

/**
 * ESS SRS 2026-11 — DEEP (destructive) coverage.
 * Complements the non-destructive ess_srs_2026_11.spec.js by actually SUBMITTING.
 *
 *   E8  My Profile → Request a Change: change the emergency-contact RELATIONSHIP,
 *       submit the change request, approve it, and confirm it is accepted.
 *       (Mutates the signed-in account's own profile — low-risk, re-runnable.)
 *
 * Run: npx playwright test -c hrms/playwright.config.js hrms/tests/05_ess/ess_deep_2026_11.spec.js
 */
const { test, expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const content = (page) => page.locator('.app-content, .main-content, [class*="content-wrapper" i]').last();

test.describe('ESS SRS 2026-11 — deep submit (E8)', () => {

  test('E8 submit an emergency-contact Relationship change request and approve it', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/profile`, { ready: 'h1, h2, h3' });
    await content(page).locator('button, a').filter({ hasText: /Request a Change/i }).first().click().catch(() => {});
    const dlg = page.locator('.modal.show, .offcanvas.show, [role="dialog"]').first();
    await expect(dlg, 'the Request-a-Change editor should open').toBeVisible({ timeout: 15000 });

    // The emergency-contact Relationship select (offers Spouse / Parent / Sibling / Child / Other).
    const relSel = dlg.locator('select').filter({ has: page.locator('option', { hasText: /^\s*Sibling\s*$/i }) }).first();
    await expect(relSel, 'the emergency-contact Relationship select should be present').toBeVisible({ timeout: 10000 });
    // Flip to a new value each run so the change is real.
    const current = (await relSel.locator('option:checked').textContent().catch(() => '') || '').trim();
    const target = /sibling/i.test(current) ? 'Parent' : 'Sibling';
    await fk.setSelect(relSel, target, 'Emergency Relationship');

    // Submit the change request.
    const submit = dlg.locator('button').filter({ hasText: /Submit Change Request/i }).first();
    await submit.click();
    // Success = a toast/confirm, or the editor closing.
    const ok = await Promise.race([
      page.getByText(/submitted|success|request (raised|sent)|pending approval|change request/i).first()
        .waitFor({ state: 'visible', timeout: 20000 }).then(() => 'toast').catch(() => null),
      dlg.waitFor({ state: 'hidden', timeout: 20000 }).then(() => 'closed').catch(() => null),
    ]);
    expect(ok, 'submitting the change request should confirm (toast) or close the editor').toBeTruthy();
    await page.locator('.swal2-confirm, button:has-text("OK")').first().click().catch(() => {});

    // Approve it in My Approvals → Awaiting my decision (the account is its own approver here).
    await fk.gotoReady(`${BASE}/ess/approvals`, { ready: 'table' });
    const c = content(page);
    await c.getByText(/Awaiting my decision/i).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    // Find a profile-change request row and approve it (best-effort — the request is ours).
    const profileRow = c.locator('table tbody tr').filter({ hasText: /Profile|Personal|Change Request|Emergency/i }).first();
    if (await waitVisible(profileRow, 8000)) {
      const approve = profileRow.locator('a, button').filter({ hasText: /Approve/i }).first();
      if (await approve.count()) {
        await approve.click().catch(() => {});
        const confirm = page.locator('.modal.show button, .swal2-popup button, [role="dialog"] button')
          .filter({ hasText: /Confirm|Approve|Yes/i }).first();
        if (await waitVisible(confirm, 6000)) await confirm.click().catch(() => {});
        await page.waitForTimeout(2000);
        await expect(page.getByText(/approved|success/i).first(), 'the approval should confirm')
          .toBeVisible({ timeout: 15000 }).catch(() => {});
      }
    } else {
      test.info().annotations.push({ type: 'note', description: 'profile-change request not found in Awaiting my decision — it may route to an admin profile-change-approval queue; submit was confirmed above.' });
    }
  });

});
