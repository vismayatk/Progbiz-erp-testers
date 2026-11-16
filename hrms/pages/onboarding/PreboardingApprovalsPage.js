'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { expectToast, confirm } = require('./onbUi');

/**
 * /preboarding-approvals — Pre-boarding Approvals. Tabs: Awaiting review (N) / Sent back / Approved /
 * All. Grid: Candidate | Department | Designation | Joining Date | Submitted | Contents | Status;
 * per-row "View" opens the submission to Approve / Send back. Approving a candidate makes them
 * ready to Start Onboarding.
 */
class PreboardingApprovalsPage extends BasePage {
  constructor(page) {
    super(page, 'preboarding-approvals');
  }

  tab(name) { return this.main.locator('button, a, [role="tab"], .nav-link').filter({ hasText: new RegExp(name, 'i') }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Pre-boarding Approvals heading').toContainText(/Pre-?boarding Approvals/i, { timeout: 30000 });
    await this.page.waitForTimeout(1000);
  }

  async awaitingCount() {
    const t = (await this.tab('Awaiting review').innerText().catch(() => '')) || '';
    return Number((t.match(/(\d+)/) || [])[1] || 0);
  }

  /** Open the first awaiting submission, review it, and approve. Returns the candidate name. */
  async approveFirst() {
    await this.tab('Awaiting review').click().catch(() => {});
    await this.page.waitForTimeout(1200);
    const row = this.gridRows.filter({ hasText: /\S/ }).first();
    await expect(row, 'an awaiting pre-boarding submission').toBeVisible({ timeout: 15000 });
    const cand = ((await row.innerText().catch(() => '')).trim().split(/\s{2,}|\n/)[0] || '').trim();
    const view = row.locator('button, a.btn').filter({ hasText: /^\s*View\s*$/i }).first();
    await (await view.count() ? view : row).click();
    await this.page.waitForTimeout(1500);
    const approve = this.page.locator('.modal.show, [role="dialog"], main').locator('button, a.btn').filter({ hasText: /^\s*Approve\s*$/i }).first();
    await expect(approve, 'an Approve control on the submission').toBeVisible({ timeout: 10000 });
    await approve.click();
    await this.page.waitForTimeout(600);
    if (await this.page.locator('.modal.show:visible, .swal2-popup:visible').filter({ hasText: /sure|confirm|approve/i }).isVisible().catch(() => false)) {
      await confirm(this.page, /approve|yes|confirm|proceed/i);
    }
    await expectToast(this.page, /approv|success|ready|onboard/i, 'Approve pre-boarding').catch(() => {});
    await this.page.waitForTimeout(1200);
    return cand;
  }
}

module.exports = { PreboardingApprovalsPage };
