'use strict';

const { BasePage } = require('../BasePage');

/**
 * /holiday-assignment-list — assign holiday calendars to organisational
 * targets. Structural twin of /leave-assignment-list, but note the header
 * wording difference: "Assigned Target Name" HERE vs "Assignment Target Name"
 * there — keep selectors page-specific.
 * Grid: Sl.No | Assignment Type | Assigned Target Name | Action (captured
 * with 0 rows). "New Holiday Assignment" implies a modal (no inline inputs).
 */
class HolidayAssignmentListPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'holiday-assignment-list');

    this.filterBtn        = this.button('Filter');
    this.newAssignmentBtn = this.button('New Holiday Assignment');
  }

  /**
   * Open the create UI behind "New Holiday Assignment". Nothing is ever saved.
   * @returns {Promise<boolean>} true when a create form actually revealed
   */
  async openCreateModal() {
    const before = await this._visibleControlCount();
    await this.newAssignmentBtn.click();
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

  /** Toggle the filter panel via the "Filter" button (no query is applied). */
  async toggleFilterPanel() {
    await this.filterBtn.click();
    await this.waitReady();
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

module.exports = { HolidayAssignmentListPage };
