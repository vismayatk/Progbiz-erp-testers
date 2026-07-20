'use strict';

const { BasePage } = require('../BasePage');

/**
 * /shifts — Shift master definitions (Attendance).
 * Card "Shift Definitions"; grid: Sl.No | Shift Name | Type | Timing | Night |
 * Active | Action. Every other attendance calculation resolves against this
 * catalogue (roster, overtime and timesheet re-surface the shift name).
 * NOTE: captured rowCount was 1 with an EMPTY first row — the tbody keeps a
 * single placeholder row when nothing matches; assert on cell text, not count.
 */
class ShiftsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'shifts');

    // ── Actions (crawled button: "New Shift") ──────────────────────────────
    this.newShiftBtn = this.button('New Shift');

    // ── "Shift Definitions" card filters ───────────────────────────────────
    this.searchInput   = this.main.locator('input[placeholder="Search by shift name"]').first();
    // Two unlabeled single-selects (type/active-style filters), in visual order.
    this.filterSelects = this.main.locator('select');
  }

  /**
   * Open the create UI behind "New Shift" (modal, routed form or inline panel —
   * the crawl could not capture which). Nothing is ever saved.
   * @returns {Promise<boolean>} true when a create form actually revealed
   */
  async openCreateForm() {
    const before = await this._visibleControlCount();
    await this.newShiftBtn.click();
    const modalShown = await this.modal.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    await this.waitReady();
    if (modalShown) return true;
    if (this._currentPath() !== this.route) return true;         // routed to a create page
    return (await this._visibleControlCount()) > before;         // inline form expanded
  }

  /** Dismiss the create UI WITHOUT saving (close/cancel button, else Escape). */
  async closeCreateForm() {
    if (await this.modal.isVisible().catch(() => false)) {
      const dismiss = this.modal
        .locator('.btn-close, [aria-label="Close"], button:has-text("Cancel"), button:has-text("Close")')
        .first();
      if (await dismiss.count()) await dismiss.click({ timeout: 5000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    } else if (this._currentPath() !== this.route) {
      await this.goto();   // "New Shift" routed away — return to the master list
    }
    await this.page.waitForTimeout(300);
  }

  /** Type into "Search by shift name" and let the grid refresh. Read-only. */
  async search(term) {
    await this.searchInput.fill(term);
    await this.waitReady();
  }

  /** Current row count — remember: 1 empty placeholder row ≠ 1 shift. */
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

module.exports = { ShiftsPage };
