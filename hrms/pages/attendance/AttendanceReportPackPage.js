'use strict';

const { BasePage } = require('../BasePage');

/**
 * /attendance-report-pack — exportable "Daily Register" (Reports breadcrumb,
 * not Attendance). NO table markup renders in the empty state — the page shows
 * the exact text "No records." plus a pagination shell (Previous/Next,
 * "Page 1", Rows per page 50|100|250|500).
 * The filter panel (4 selects + from/to date pair + 2 more selects) is
 * presumed to hide behind an icon-button in the "Daily Register" card header,
 * but the crawl captured NO such button (only "Export"/"Previous"/"Next") —
 * the toggle is UNVERIFIED until a re-crawl confirms it. "Export" triggers a
 * file download and is exposed but NEVER clicked by interaction tests.
 */
class AttendanceReportPackPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'attendance-report-pack');

    // ── Actions (crawled buttons: "Export", "Previous", "Next") ────────────
    this.exportBtn = this.button('Export');     // download — never clicked by tests
    this.prevBtn   = this.button('Previous');
    this.nextBtn   = this.button('Next');

    // UNVERIFIED: the crawl (attendance-report-pack.json) captured ONLY the
    // "Export"/"Previous"/"Next" buttons — no title/aria/icon data for any
    // filter toggle exists. Only explicitly filter-hinting attributes are
    // matched here; the former '.card-header button' catch-all was removed
    // because it could resolve to an arbitrary unlabeled button. Re-crawl to
    // capture the real toggle before relying on this locator.
    this.filterToggleBtn = this.main.locator(
      'button[title*="filter" i], button[aria-label*="filter" i], button:has(i[class*="filter" i])'
    ).first();

    // ── Filter panel inputs (captured: 6 selects + from/to date pair) ──────
    this.filterSelects  = this.main.locator('select');
    this.fromDateFilter = this.main.locator('input[type="date"]').nth(0);
    this.toDateFilter   = this.main.locator('input[type="date"]').nth(1);

    // ── Empty state / pagination shell ─────────────────────────────────────
    this.emptyState        = this.main.getByText('No records.').first();   // documented pre-filter state
    this.pageIndicator     = this.main.getByText(/Page \d+/).first();
    // Rows-per-page select — identified by its distinctive "250" option.
    this.rowsPerPageSelect = this.main.locator('select:has(option:has-text("250"))').first();
  }

  /**
   * Toggle the filter panel — clicks ONLY when a verifiably filter-hinting
   * toggle (title/aria-label/icon class containing "filter") is present.
   * The crawl captured no such control, so this never clicks an arbitrary
   * unlabeled button. Nothing is ever applied.
   * @returns {Promise<boolean|null>} null when no verified toggle exists;
   *          otherwise true when the visible control set changed
   */
  async toggleFilterPanel() {
    if ((await this.filterToggleBtn.count()) === 0) return null;
    const before = await this._visibleControlCount();
    await this.filterToggleBtn.click();
    await this.page.waitForTimeout(500);
    return (await this._visibleControlCount()) !== before;
  }

  /** Change "Rows per page" (50|100|250|500) — read-only view change. */
  async setRowsPerPage(value) {
    await this.rowsPerPageSelect.selectOption(String(value)).catch(async () => {
      await this.rowsPerPageSelect.selectOption({ label: String(value) });
    });
    await this.waitReady();
  }

  /** Current pager text (e.g. "Page 1"). */
  async pageIndicatorText() {
    return (await this.pageIndicator.innerText()).trim();
  }

  // ── private helpers ──────────────────────────────────────────────────────

  /** Visible form-control count — probe for "did the filter panel toggle". */
  _visibleControlCount() {
    return this.page.locator('input:visible, select:visible, textarea:visible').count();
  }
}

module.exports = { AttendanceReportPackPage };
