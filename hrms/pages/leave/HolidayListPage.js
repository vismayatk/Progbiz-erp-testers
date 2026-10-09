'use strict';

const { BasePage } = require('../BasePage');

/**
 * /holiday-list — holiday calendar master for the year ("Holiday Calendar —
 * <year>"). Grid: Sl.No | Holiday Name | Dates | Calendar | Action — captured
 * with 1 live row (Onam | 24/08/2026 | State - Kerala), so tests must not
 * assume an empty grid.
 * "Calendar" NAVIGATES to /holiday-calendar (a separate route — probed live),
 * a full calendar visualisation of the same data; "Export" triggers a download
 * (not exercised); "New Holiday" opens a create modal.
 */
class HolidayListPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'holiday-list');

    // ── Toolbar ────────────────────────────────────────────────────────────
    this.calendarViewBtn = this.button('Calendar');      // navigates to /holiday-calendar
    this.exportBtn       = this.button('Export');        // download — not exercised
    this.newHolidayBtn   = this.button('New Holiday');

    this.searchInput = this.main.locator('input[placeholder="Search by Holiday Name"]').first();
  }

  /**
   * Open the create UI behind "New Holiday". Nothing is ever saved.
   * @returns {Promise<boolean>} true when a create form actually revealed
   */
  async openCreateModal() {
    const before = await this._visibleControlCount();
    await this.newHolidayBtn.click();
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

  /** Type into "Search by Holiday Name" and let the grid refresh (read-only). */
  async searchHoliday(term) {
    await this.searchInput.fill(term);
    await this.waitReady();
  }

  /** Open the calendar visualisation — navigates to /holiday-calendar (read-only). */
  async toggleCalendarView() {
    await this.calendarViewBtn.click();
    await this.page.waitForURL(/\/holiday-calendar(\?|$)/, { timeout: 20000 }).catch(() => {});
    await this.waitReady();
  }

  /** Current grid row count (live data exists — 1 row was captured). */
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

module.exports = { HolidayListPage };
