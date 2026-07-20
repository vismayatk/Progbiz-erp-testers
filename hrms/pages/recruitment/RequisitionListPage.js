'use strict';

const { BasePage } = require('../BasePage');

/**
 * Job Requisitions (/requisition-list) — "Manpower Requests".
 * Departments raise manpower requests that travel through an approval
 * workflow (Draft → Submitted → Approved / Rejected / Returned) before
 * becoming vacancies on /vacancy-list.
 *
 * Grid: Sl.No | Designation | Department | Positions | Type | Work Type |
 *       Status | Branch | Action  (captured empty — handle 0 rows).
 */
class RequisitionListPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'requisition-list');

    // ── Toolbar / filters (from crawl: one native select + one search input) ─
    this.newRequisitionBtn = this.button('New Requisition');
    // Options: All Status | Draft | Submitted | Approved | Rejected | Returned
    this.statusFilter = this.main.locator('select').first();
    this.searchInput  = this.main.locator('input[placeholder="Search designation..."]').first();
  }

  /** Open the create-requisition form via "New Requisition". Nothing is saved. */
  async openCreateForm() {
    await this.newRequisitionBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** True when the create dialog (or an inline create form) is on screen. */
  async createFormVisible() {
    if (await this.modal.isVisible().catch(() => false)) return true;
    // inline fallback — a Save/Submit button the list view itself does not have
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
    // Inline (non-modal) form still open → reload the route to discard it.
    if (await this.createFormVisible()) await this.goto();
    await this.page.waitForTimeout(300);
  }

  /** Filter the grid by requisition status (label, e.g. "Draft"). Read-only. */
  async filterByStatus(label) {
    await this.statusFilter.selectOption({ label });
    await this.waitReady();
  }

  /** Type into the "Search designation..." box and let the grid refresh. */
  async searchDesignation(term) {
    await this.searchInput.fill(term);
    await this.waitReady();
  }

  /** Current data-row count (0 is a valid, documented state). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { RequisitionListPage };
