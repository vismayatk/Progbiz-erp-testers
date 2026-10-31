'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit, waitVisible } = require('../FormKit');
const { expectToast } = require('./wfhUi');

/**
 * /wfh-requests — "Work From Home Approval" (role WfhManagement). Lists WFH requests across the
 * employees the viewer may see and lets HR REVERT an approved request directly (it does not
 * approve/reject — that happens in the approvals inbox). Filters: From, To, Status, Branch,
 * Department, Search (Name / code). Grid Sl No | Employee | From | To | Days | Reason | Status |
 * Action (Revert). Revert opens a prompt with an OPTIONAL reason; on success:
 * "Work from home reverted -- those days are office days again."
 */
class WfhApprovalListPage extends BasePage {
  constructor(page) {
    super(page, 'wfh-requests');
    this.fk = new FormKit(page);
    this.searchInput = this.main.locator('input[placeholder*="Name" i], input[placeholder*="code" i]').first();
    this.statusSelect = this.main.locator('select').filter({ has: page.locator('option', { hasText: /Approved/ }) }).first();
  }

  rowByReason(reason) { return this.gridRows.filter({ hasText: reason }).first(); }

  async open() {
    await this.goto();
    await expect(this.page.getByText(/Work From Home Approval/i).first(), 'the Approval heading').toBeVisible({ timeout: 30000 });
    await expect(this.gridHeaders.first(), 'the request grid headers').toBeVisible({ timeout: 20000 });
  }

  async filterStatus(label) {
    if (await this.statusSelect.count()) { await this.statusSelect.selectOption({ label }).catch(() => {}); await this.page.waitForTimeout(1200); }
  }

  /** Widen the From/To date range so a future request is listed (the list defaults to a short range). */
  async filterRange(fromISO, toISO) {
    const dates = this.main.locator('input[type="date"]');
    if (await dates.count() >= 2) {
      await dates.nth(0).fill(fromISO).catch(() => {});
      await dates.nth(1).fill(toISO).catch(() => {});
      await this.page.waitForTimeout(1500);
    }
  }

  async search(text) {
    if (await this.searchInput.count()) { await this.searchInput.fill(text); await this.page.waitForTimeout(1200); }
  }

  /** Revert an approved request matched by its reason text. */
  async revertByReason(reason) {
    const row = this.rowByReason(reason);
    await expect(row, `an approved request row for "${reason}"`).toBeVisible({ timeout: 20000 });
    await row.locator('[title="Revert" i]').or(row.locator('button, a').filter({ hasText: /^\s*Revert\s*$/i })).first().click();
    const dlg = this.page.locator('.swal2-popup, .modal.show, [role="dialog"]').first();
    await expect(dlg, 'the HR Revert prompt opens').toBeVisible({ timeout: 10000 });
    const field = dlg.locator('textarea, input[type="text"]').first();
    if (await waitVisible(field, 3000)) await field.fill(`HR revert in testing — ${reason}`);  // optional reason
    await dlg.locator('.swal2-confirm, button').filter({ hasText: /^\s*(revert|yes|confirm|ok|save)/i }).first().click();
    return expectToast(this.page, /work from home reverted/i, 'HR Revert');
  }
}

module.exports = { WfhApprovalListPage };
