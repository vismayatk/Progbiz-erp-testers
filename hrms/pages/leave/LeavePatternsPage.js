'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-patterns — named leave-rule bundles. Patterns feed /leave-policy
 * (its only control is a pattern chooser) and /leave-assignment-list.
 * Grid: Sl.No | Leave Pattern Name | Details | Action (captured with 0 rows).
 * The list has no inline inputs — "New Leave Pattern" opens a dialog.
 */
class LeavePatternsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-patterns');

    this.newPatternBtn = this.button('New Leave Pattern');
  }

  /**
   * Open the create UI behind "New Leave Pattern" (modal, routed form or
   * inline panel). Nothing is ever saved.
   * @returns {Promise<boolean>} true when a create form actually revealed
   */
  async openCreateModal() {
    const before = await this._visibleControlCount();
    await this.newPatternBtn.click();
    const modalShown = await this.modal.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    await this.waitReady();
    if (modalShown) return true;
    if (this._currentPath() !== this.route) return true;         // routed to a create page
    return (await this._visibleControlCount()) > before;         // inline form expanded
  }

  /** Dismiss the create UI WITHOUT saving (close/cancel button, else Escape, else reload). */
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
    await this.goto();   // routed or inline create UI — reload the list to discard it
  }

  /** Current data-row count (0 is the documented baseline). */
  rowCount() { return this.gridRows.count(); }

  // ── private helpers ──────────────────────────────────────────────────────

  _currentPath() {
    return new URL(this.page.url()).pathname.replace(/^\//, '').replace(/\/$/, '');
  }

  /** Visible form-control count — probe for "did a create form appear". */
  _visibleControlCount() {
    return this.page.locator('input:visible, select:visible, textarea:visible').count();
  }
}

module.exports = { LeavePatternsPage };
