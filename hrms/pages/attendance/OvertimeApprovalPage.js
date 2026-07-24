'use strict';

const { BasePage } = require('../BasePage');

/**
 * /overtime-approval — approval queue for computed overtime (Attendance).
 * Card "Overtime Queue"; grid: Sl.No | Employee | Date | Shift | OT Min |
 * Eligible | Payout | Status | Exported | Action.
 * No page-level buttons — all mutations happen via row-level "Action" controls
 * (never clicked by interaction tests). Eligible/Exported are boolean-style
 * badge cells. NOTE: captured rowCount was 1 with an EMPTY first row — a
 * placeholder row exists when the queue is empty; never count rows to assert
 * emptiness.
 */
class OvertimeApprovalPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'overtime-approval');

    // ── "Overtime Queue" filters (crawled input order) ──────────────────────
    this.searchInput    = this.main.locator('input[placeholder="Search employee or shift..."]').first();
    // Two unlabeled single-selects (status/eligibility-style filters).
    this.filterSelects  = this.main.locator('select');
    this.fromDateFilter = this.main.locator('input[type="date"]').nth(0);
    this.toDateFilter   = this.main.locator('input[type="date"]').nth(1);
  }

  /** Type into "Search employee or shift..." and let the queue refresh. Read-only. */
  async search(term) {
    await this.ensureVisible(this.searchInput);   // may live in #filterOffcanvas
    await this.searchInput.fill(term);
    await this.waitReady();
  }

  /** Bound the queue with the from/to date pair (read-only filter). */
  async filterByDateRange(from, to) {
    await this.ensureVisible(this.fromDateFilter);  // may live in #filterOffcanvas
    if (from) await this.fromDateFilter.fill(from);
    if (to)   await this.toDateFilter.fill(to);
    await this.waitReady();
  }

  /** Current row count — remember: 1 empty placeholder row ≠ 1 OT record. */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { OvertimeApprovalPage };
