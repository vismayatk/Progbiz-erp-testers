'use strict';

const { BasePage } = require('../BasePage');

/**
 * Candidate Followup Status (/candidate-status) — HRMS Settings master,
 * "Status List". Defines followup statuses + nature driving the /candidates
 * lifecycle buckets. Shared master data — interaction tests must never mutate.
 *
 * Grid: Sl No | Status Name | Nature | Action. NOTE the "Sl No" spelling
 * (no dot) vs "Sl.No" elsewhere — keep column assertions page-specific.
 * The grid initially renders a "Loading..." row (async fetch) — wait it out.
 */
class CandidateStatusPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'candidate-status');

    this.addFollowupStatusBtn = this.button('Add Followup Status');
  }

  /** Wait for the async "Loading..." first row to clear. */
  async waitLoaded() {
    await this.gridRows.filter({ hasText: 'Loading...' }).first()
      .waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  }

  /** Open the small create modal (name + nature) via "Add Followup Status". Nothing is saved. */
  async openCreateForm() {
    await this.addFollowupStatusBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** True when the create dialog (or an inline create form) is on screen. */
  async createFormVisible() {
    if (await this.modal.isVisible().catch(() => false)) return true;
    return this.main.locator('button').filter({ hasText: /^\s*(save|submit)\s*$/i }).first()
      .isVisible().catch(() => false);
  }

  /** Dismiss the create form WITHOUT saving (close X / Cancel / Escape / reload). */
  async closeCreateForm() {
    for (let i = 0; i < 2 && await this.modal.isVisible().catch(() => false); i++) {
      const x = this.modal.locator('.btn-close, [aria-label="Close"], [data-bs-dismiss="modal"]').first();
      if (await x.count()) await x.click().catch(() => {});
      else {
        const cancel = this.modal.locator('button').filter({ hasText: /^\s*(cancel|close)\s*$/i }).first();
        if (await cancel.count()) await cancel.click().catch(() => {});
        else await this.page.keyboard.press('Escape').catch(() => {});
      }
      await this.modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    if (await this.createFormVisible()) await this.goto();
    await this.page.waitForTimeout(300);
  }

  /** Current data-row count (after waitLoaded; 0 is valid). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { CandidateStatusPage };
