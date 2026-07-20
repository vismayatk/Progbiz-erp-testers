'use strict';

const { BasePage } = require('../BasePage');

/**
 * /geofences — geofence points (lat/long/radius) constraining mobile punching
 * (Attendance). Card "Locations"; grid: Sl.No | Scope | Applies To | Name |
 * Lat | Long | Radius | Status | Active. "Status" (approval state) and
 * "Active" (on/off) are DISTINCT columns — never conflate them in assertions.
 * QUIRK: an "Add Location" nav element also sits in the breadcrumb trail —
 * either instance opens the same create flow.
 * NOTE: captured rowCount was 1 with an EMPTY first row (placeholder).
 */
class GeofencesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'geofences');

    // ── Actions (crawled button: "Add Location") ───────────────────────────
    this.addLocationBtn = this.button('Add Location');

    // ── "Locations" card filters ───────────────────────────────────────────
    this.searchInput   = this.main.locator('input[placeholder="Search location or target..."]').first();
    // Two unlabeled single-selects (scope/status-style filters).
    this.filterSelects = this.main.locator('select');
  }

  /**
   * Open the create UI behind "Add Location" (likely a modal with a
   * map/lat-long form — the crawl could not capture it). Nothing is ever saved.
   * @returns {Promise<boolean>} true when a create form actually revealed
   */
  async openCreateForm() {
    const before = await this._visibleControlCount();
    await this.addLocationBtn.click();
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
      await this.goto();   // "Add Location" routed away — return to the register
    }
    await this.page.waitForTimeout(300);
  }

  /** Type into "Search location or target..." and let the grid refresh. Read-only. */
  async search(term) {
    await this.searchInput.fill(term);
    await this.waitReady();
  }

  /** Current row count — remember: 1 empty placeholder row ≠ 1 geofence. */
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

module.exports = { GeofencesPage };
