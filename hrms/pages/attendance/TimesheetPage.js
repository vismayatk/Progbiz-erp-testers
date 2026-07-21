'use strict';

const { BasePage } = require('../BasePage');

/**
 * /timesheet — daily attendance hours vs task hours reconciliation
 * (Attendance). Card "Daily Worked Hours Vs Task Hours"; grid: Sl.No | Date |
 * Employee | Shift | Status | Attendance Hrs | Task Hrs | Tasks.
 * READ-ONLY comparison view — no action buttons exist; "Tasks" is the
 * drill-down into the Task Management hours behind "Task Hrs".
 * NOTE: captured rowCount was 1 with an EMPTY first row (placeholder).
 */
class TimesheetPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'timesheet');

    // ── Filters (crawled input order) ──────────────────────────────────────
    this.searchInput    = this.main.locator('input[placeholder="Search employee..."]').first();
    // Two unlabeled single-selects (shift/status-style filters).
    this.filterSelects  = this.main.locator('select');
    this.fromDateFilter = this.main.locator('input[type="date"]').nth(0);
    this.toDateFilter   = this.main.locator('input[type="date"]').nth(1);
  }

  /** Type into "Search employee..." and let the grid refresh. Read-only. */
  async search(term) {
    await this.ensureVisible(this.searchInput);   // may live in #filterOffcanvas
    await this.searchInput.fill(term);
    await this.waitReady();
  }

  /** Bound the comparison with the from/to date pair (read-only filter). */
  async filterByDateRange(from, to) {
    // Probed live: the date pair sits inside the closed #filterOffcanvas panel.
    await this.ensureVisible(this.fromDateFilter);
    if (from) await this.fromDateFilter.fill(from);
    if (to)   await this.toDateFilter.fill(to);
    await this.waitReady();
  }

  /** Current row count — remember: 1 empty placeholder row ≠ 1 employee-day. */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { TimesheetPage };
