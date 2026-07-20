'use strict';

const { BasePage } = require('../BasePage');

/**
 * /employees — Employee master register (Core HR).
 * Grid: Sl.No | Employee Code | Employee Name | Department Name | Designation | Status | Actions.
 * Crawled with headers but 0 rows; #incl-archived reveals archived (soft-deleted) records.
 */
class EmployeesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'employees');

    // ── Actions (crawled buttons: "Filter", "New Employee") ────────────────
    this.filterBtn      = this.button('Filter');
    this.newEmployeeBtn = this.button('New Employee');

    // ── Filters ────────────────────────────────────────────────────────────
    this.includeArchivedChk = page.locator('#incl-archived');   // stable crawled id
  }

  /**
   * Open the create UI behind "New Employee" (modal, routed form or inline
   * panel — the crawl could not capture which). Nothing is ever saved.
   * @returns {Promise<boolean>} true when a create form actually revealed
   */
  async openCreateModal() {
    const before = await this._visibleControlCount();
    await this.newEmployeeBtn.click();
    const modalShown = await this.modal.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    await this.waitReady();
    if (modalShown) return true;
    if (this._currentPath() !== this.route) return true;         // routed to a create page
    return (await this._visibleControlCount()) > before;         // inline form expanded
  }

  /** Dismiss the create UI WITHOUT saving (close/cancel button, else Escape). */
  async closeModal() {
    if (await this.modal.isVisible().catch(() => false)) {
      const dismiss = this.modal
        .locator('.btn-close, [aria-label="Close"], button:has-text("Cancel"), button:has-text("Close")')
        .first();
      if (await dismiss.count()) await dismiss.click({ timeout: 5000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    } else if (this._currentPath() !== this.route) {
      await this.goto();   // "New Employee" routed away — return to the register
    }
    await this.page.waitForTimeout(300);
  }

  /** Toggle "Include archived" and let the grid re-render. */
  async toggleIncludeArchived() {
    await this.includeArchivedChk.click();
    await this.waitReady();
  }

  /** Toggle the filter panel via the "Filter" button (no query is applied). */
  async toggleFilterPanel() {
    await this.filterBtn.click();
    await this.waitReady();
  }

  // ── private helpers ──────────────────────────────────────────────────────

  _currentPath() {
    return new URL(this.page.url()).pathname.replace(/^\//, '').replace(/\/$/, '');
  }

  /** Visible form-control count — probe for "did a create form appear". */
  _visibleControlCount() {
    return this.page.locator('input:visible, select:visible, textarea:visible').count();
  }
}

module.exports = { EmployeesPage };
