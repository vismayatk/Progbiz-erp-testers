'use strict';

const { BasePage } = require('../BasePage');

/**
 * Offer Management (/offer-list) — "Offers".
 * Issue and track job offers (candidate, total CTC, joining date, status).
 *
 * Grid: Sl.No | Candidate | Total CTC | Joining | Status | Action
 * (captured empty — handle 0 rows).
 */
class OfferListPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'offer-list');

    this.newOfferBtn = this.button('New Offer');
  }

  /** Open the create-offer form via "New Offer". Nothing is saved. */
  async openCreateForm() {
    await this.newOfferBtn.click();
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
    await this.dismissModal();
    // Inline (non-modal) form still open → reload the route to discard it.
    if (await this.createFormVisible()) await this.goto();
    await this.page.waitForTimeout(300);
  }

  /** Current data-row count (0 is the documented baseline state). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { OfferListPage };
