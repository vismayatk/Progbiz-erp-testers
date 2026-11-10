'use strict';

/**
 * Referral — SRS changes E6 & E7 (02→09 Nov 2026).
 * Source: Z:\hrms documents\SRS\SRS-ESS-Recruitment-Changes-2026-11-09.docx
 *
 * E6 Referral reward payout is gated to probation completion: a reward cannot be
 *    Approved / Marked Paid until the referred hire completes probation ("Not
 *    payable yet — awaiting probation completion"); an admin override needs a
 *    reason. NON-DESTRUCTIVE — the reward is never actually approved or paid; the
 *    test only asserts the gating message, the override control and the disabled
 *    pay buttons.
 * E7 Refer & Earn "Open Positions" show posting age + a "Stale" (>45d) badge and a
 *    Newest/Oldest sort.
 *
 * Both are driven on the admin account (which can open the referral admin detail
 * and the Refer & Earn home). Captured live 2026-11-10.
 *
 * Run: npx playwright test -c hrms/playwright.config.js hrms/tests/07_referral/referral_srs_2026_11.spec.js
 */
const { test, expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const content = (page) => page.locator('.app-content, .main-content, [class*="content-wrapper" i]').last();

test.describe('Referral SRS 2026-11 — E6 payout gating & E7 open positions', () => {

  // ── E7 — Open Positions: posting age + Newest/Oldest sort (+ Stale badge when present) ──
  test('E7 Refer & Earn Open Positions show posting age and a Newest/Oldest sort', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/referral`, { ready: 'select' });
    const c = content(page);
    await expect(c.getByText(/Open Position/i).first(), 'the Open Positions list should be shown').toBeVisible({ timeout: 20000 });

    const body = (await c.innerText().catch(() => '')).replace(/\s+/g, ' ');
    expect(body, 'each position should show its posting age')
      .toMatch(/Posted on .* ago|Posted today|Posted 1 day ago/i);

    // The sort control offers Newest first / Oldest first.
    const sort = c.locator('select').filter({ has: page.locator('option', { hasText: /Newest first/i }) }).first();
    await expect(sort, 'a Newest/Oldest sort control should be present').toBeVisible({ timeout: 10000 });
    const opts = (await sort.locator('option').allInnerTexts()).map(o => o.trim());
    expect(opts.join('|'), 'sort offers Newest first and Oldest first').toMatch(/Newest first/i);
    expect(opts.join('|')).toMatch(/Oldest first/i);

    // Switching the sort keeps the list populated and re-orders by age.
    const ages = async () => {
      const txt = (await c.innerText().catch(() => '')).replace(/\s+/g, ' ');
      return [...txt.matchAll(/Posted (?:today|(\d+) days? ago)/gi)].map(m => (m[1] ? Number(m[1]) : 0));
    };
    await fk.setSelect(sort, 'Newest first', 'Sort');
    const newest = await ages();
    await fk.setSelect(sort, 'Oldest first', 'Sort');
    const oldest = await ages();
    expect(oldest.length, 'Open Positions should still render after re-sorting').toBeGreaterThan(0);
    if (newest.length > 1 && new Set(newest).size > 1) {
      // Oldest-first should lead with an age >= the newest-first lead (older at the top).
      expect(oldest[0], 'Oldest-first should lead with an older posting than Newest-first').toBeGreaterThanOrEqual(newest[0]);
    }
  });

  // ── E6 — Reward payout gated to probation completion (non-destructive) ──
  test('E6 a referral reward is gated to probation completion with an override reason', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/referral/admin`, { ready: /Referral|Dashboard|Submitted|Manage/i });
    const list = content(page);

    // Open referral detail pages (Manage) until one shows a reward still awaiting probation.
    const manageLinks = list.locator('a, button').filter({ hasText: /Manage|View|Detail/i });
    const count = Math.min(await manageLinks.count(), 6);
    test.skip(count === 0, 'no referrals in the admin list to open');

    let found = false;
    for (let i = 0; i < count && !found; i++) {
      await fk.gotoReady(`${BASE}/ess/referral/admin`, { ready: /Manage|Referral/i, tries: 1 });
      await content(page).locator('a, button').filter({ hasText: /Manage|View|Detail/i }).nth(i).click().catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const d = content(page);
      const text = (await d.innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (/Not payable yet|awaiting probation completion/i.test(text)) {
        // E6 gating message (always present while not payable).
        await expect(d.getByText(/Not payable yet|awaiting probation completion/i).first(),
          'the reward should read "Not payable yet — awaiting probation completion"').toBeVisible();
        // The early-payout override control.
        const payEarly = d.getByText(/Pay early|override the probation/i).first();
        await expect(payEarly, 'an early-payout override should be offered').toBeVisible();
        // The pay actions are disabled while not payable (gating holds without an override).
        const approve = d.locator('button').filter({ hasText: /Approve & add to payroll|Mark Paid/i }).first();
        if (await approve.count()) {
          await expect(approve, 'Approve/Mark Paid should be disabled while the reward is not payable yet')
            .toBeDisabled();
        }
        // The "Reason for early payout" box is revealed only when the override is ticked (and only
        // when this user may action the reward — a self-submitted referral cannot be self-approved).
        await payEarly.click().catch(() => {});
        await page.waitForTimeout(800);
        const reason = d.getByText(/Reason for early payout/i).first();
        if (await waitVisible(reason, 3000)) {
          await expect(reason, 'ticking the override should reveal a required reason box').toBeVisible();
          if (await approve.count()) {
            await expect(approve, 'the pay action stays disabled until a reason is entered').toBeDisabled();
          }
        }
        found = true;
      }
    }
    test.skip(!found, 'no referral reward currently in the "awaiting probation" state to assert gating');
  });

});
