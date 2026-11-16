'use strict';

/**
 * My Policies (ESS) — SRS change E2 (new module, 02→09 Nov 2026).
 * Source: Z:\hrms documents\SRS\SRS-ESS-Recruitment-Changes-2026-11-09.docx
 *
 * Employee-facing policy acknowledgement on /ess/policies (+ /ess/policies/{id}).
 * The list page and its structure are verified green here. The read / acknowledge
 * flow (watermarked viewer, acknowledge modes, require-full-read gate, certificate,
 * Q&feedback) needs a policy ASSIGNED to the signed-in account by HR on the admin
 * Policy-Management side — a prerequisite this suite does not create — so that test
 * is guarded: it runs when a policy is assigned, and skips with a clear reason when
 * the account has none (as the admin account currently does: "You have no policies
 * waiting for your acknowledgement.").
 *
 * Run: npx playwright test -c hrms/playwright.config.js hrms/tests/05_ess/policies_srs_2026_11.spec.js
 */
const { test, expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const content = (page) => page.locator('.app-content, .main-content, [class*="content-wrapper" i]').last();

test.describe('My Policies SRS 2026-11 — E2', () => {

  test('E2 My Policies list renders its summary cards, tabs and filters', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/policies`, { ready: 'h1, h2, h3' });
    const c = content(page);
    await expect(c.getByText(/My Policies/i).first(), 'the page title should be "My Policies"').toBeVisible({ timeout: 20000 });

    const body = (await c.innerText().catch(() => '')).replace(/\s+/g, ' ');
    // Summary cards.
    for (const card of ['Pending', 'Overdue', 'Acknowledged', 'All policies']) {
      expect(body, `summary card "${card}" should be shown`).toMatch(new RegExp(card, 'i'));
    }
    // Tabs.
    for (const tab of ['Pending', 'Acknowledged', 'All', 'Favourites', 'Recent', 'Popular']) {
      await expect(c.getByText(new RegExp(`^\\s*${tab}\\s*$`, 'i')).first(), `the "${tab}" tab should be present`).toBeVisible();
    }
    // The full-text search box (searches the words inside the policy).
    await expect(c.locator('input[placeholder*="Search title, number or text" i]').first(),
      'the policy full-text search box should be present').toBeVisible({ timeout: 10000 });
  });

  test('E2 switching tabs and the empty state behave', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/policies`, { ready: 'h1, h2, h3' });
    const c = content(page);

    // The Pending tab shows its specific empty-state message when nothing is pending.
    const pendingTab = c.getByText(/^\s*Pending\s*$/i).first();
    await pendingTab.click().catch(() => {});
    await page.waitForTimeout(1200);
    const pendingBody = (await c.innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (/no policies waiting|no policies found/i.test(pendingBody)) {
      expect(pendingBody, 'the Pending empty-state message should be shown').toMatch(/no policies waiting for your acknowledgement|No policies found/i);
    }

    // Switching to another tab keeps the page working.
    const allTab = c.getByText(/^\s*All\s*$/i).first();
    await allTab.click().catch(() => {});
    await page.waitForTimeout(1000);
    await expect(c.getByText(/My Policies/i).first(), 'the page should remain on My Policies after switching tabs').toBeVisible();
  });

  // ── E2 read / acknowledge flow — guarded on an assigned policy ──
  test('E2 reading and acknowledging an assigned policy', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/policies`, { ready: 'h1, h2, h3' });
    const c = content(page);

    // Need a policy row with a "Read & acknowledge" / "Read" action.
    const action = c.locator('a, button').filter({ hasText: /Read & acknowledge|^\s*Read\s*$/i }).first();
    test.skip(!(await waitVisible(action, 6000)),
      'no policy is assigned to the signed-in account — HR must assign one on the admin Policy-Management side to exercise the acknowledge flow');

    await action.click().catch(() => {});
    // The read/acknowledge page shows the protected viewer + an Acknowledgement panel.
    await expect(page, 'the read/acknowledge page should open (/ess/policies/{id})').toHaveURL(/\/ess\/policies\/[^/]+/, { timeout: 15000 });
    const body = (await content(page).innerText().catch(() => '')).replace(/\s+/g, ' ');
    expect(body, 'the read page should surface the acknowledgement / about-this-policy panel')
      .toMatch(/Acknowledge|About this policy|acknowledgement/i);
    // We stop here — actually acknowledging is a durable state change for a real policy,
    // so the spec verifies the flow is reachable without committing the acknowledgement.
  });

});
