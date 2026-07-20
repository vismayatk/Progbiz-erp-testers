'use strict';

const { BasePage } = require('../BasePage');

/**
 * /comp-offs — employee self-service view of comp-off credits earned by
 * working off-days/holidays, with a manual "Request Comp-Off" flow (modal —
 * no inline inputs captured).
 * Grid ("My Comp-Off Credits"): Earned | Source | Days | Expiry | Status |
 * Action. Documented quirky empty state:
 *   "No comp-off credits yet. Worked an off-day? Request one above."
 */
class CompOffsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'comp-offs');

    this.requestCompOffBtn = this.button('Request Comp-Off');
  }

  /**
   * Open the request flow behind "Request Comp-Off". Nothing is ever submitted.
   * @returns {Promise<boolean>} true when a request form actually revealed
   */
  async openRequestModal() {
    const before = await this._visibleControlCount();
    await this.requestCompOffBtn.click();
    const modalShown = await this.modal.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    await this.waitReady();
    if (modalShown) return true;
    if (this._currentPath() !== this.route) return true;         // routed to a request page
    return (await this._visibleControlCount()) > before;         // inline form expanded
  }

  /** Dismiss the request UI WITHOUT submitting (close/cancel button, else Escape, else reload). */
  async closeModal() {
    if (await this.modal.isVisible().catch(() => false)) {
      const dismiss = this.modal
        .locator('.btn-close, [aria-label="Close"], [data-bs-dismiss="modal"], button:has-text("Cancel"), button:has-text("Close")')
        .first();
      if (await dismiss.count()) await dismiss.click({ timeout: 5000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(300);
      return;
    }
    await this.goto();   // routed or inline request UI — reload the list to discard it
  }

  /** True when the documented quirky empty state is showing. */
  hasNoCredits() { return this.containsText('No comp-off credits yet'); }

  /** Current grid row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }

  // ── private helpers ──────────────────────────────────────────────────────

  _currentPath() {
    return new URL(this.page.url()).pathname.replace(/^\//, '').replace(/\/$/, '');
  }

  /** Visible form-control count — probe for "did a request form appear". */
  _visibleControlCount() {
    return this.page.locator('input:visible, select:visible, textarea:visible').count();
  }
}

module.exports = { CompOffsPage };
