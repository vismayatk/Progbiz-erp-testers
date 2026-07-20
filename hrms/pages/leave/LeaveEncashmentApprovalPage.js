'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-encashment-approval — approver worklist for encashment requests.
 * Grid: SlNo | Employee | Leave Type | Days | Amount | Status | Action
 * (captured empty — "No requests."). Row-level approve/reject live inside the
 * Action column (no bulk buttons on this page) and are never clicked by tests.
 * Five UNLABELLED native select filters (year/branch/department/type/status
 * pattern) — target by position, not by id.
 */
class LeaveEncashmentApprovalPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-encashment-approval');

    this.filterBtn     = this.button('Filter');
    this.filterSelects = this.main.locator('select');   // ×5, unlabelled
  }

  /** Apply the current filters via "Filter" (read-only query). */
  async applyFilter() {
    await this.filterBtn.click();
    await this.waitReady();
  }

  /** Number of filter selects rendered (crawl captured 5). */
  filterSelectCount() { return this.filterSelects.count(); }

  /** True when the documented empty state ("No requests.") is showing. */
  hasNoRequests() { return this.containsText('No requests.'); }

  /** Current grid row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { LeaveEncashmentApprovalPage };
