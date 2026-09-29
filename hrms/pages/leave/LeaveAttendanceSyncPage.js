'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-attendance-sync — reconciliation of approved leave onto attendance
 * rows, with LOP flags and a period recalculation tool.
 * Grid: Leave Ref | Employee | Dates | Attendance rows | LOP | Sync status
 * (captured empty — "No leave in this period.").
 * Filters: one number input (year) + three selects (period/branch/department).
 * "Recalculate period" RE-RUNS the engine for the filtered month — state
 * mutating, never clicked by tests.
 */
class LeaveAttendanceSyncPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-attendance-sync');

    // Probed live: "Filter" is the offcanvas TOGGLE (#syncFilterOffcanvas);
    // the year/period/branch/department fields are resident inside it.
    this.filterBtn      = this.button('Filter');
    this.recalculateBtn = this.button('Recalculate period');   // mutating — never clicked

    this.yearInput     = this.filterPanel.locator('input[type="number"]').first();
    this.filterSelects = this.filterPanel.locator('select');   // period / branch / department
  }

  /** Apply the year filter and let the reconciliation grid re-render (read-only). */
  async applyYearFilter(year) {
    await this.openFilterPanel();
    await this.yearInput.fill(String(year));
    await this.waitReady();
  }

  /** True when the documented empty state ("No leave in this period.") is showing. */
  hasNoLeaveInPeriod() { return this.containsText('No leave in this period.'); }

  /** True when the documented LOP → payroll footnote is showing. */
  hasLopFootnote() { return this.containsText('IsLOP = 1'); }

  /** Current grid row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { LeaveAttendanceSyncPage };
