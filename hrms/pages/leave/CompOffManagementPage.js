'use strict';

const { BasePage } = require('../BasePage');

/**
 * /comp-off-management — HR/manager console: comp-off credits for ALL
 * employees, with per-row Grant / Reject inside the Action column.
 * Grid: SlNo | Employee | Earned | Source | Days | Expiry | Status | Action.
 * LIVE DATA exists on this environment (Akshay ASK112, source "worked in
 * holiday") — tests must not assume an empty grid, and Grant/Reject are final
 * decisions that are NEVER clicked.
 * #reqOnly is the stable id of the "Pending grant only" filter checkbox.
 */
class CompOffManagementPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'comp-off-management');

    this.pendingOnlyChk = page.locator('#reqOnly');   // "Pending grant only" filter
    // Row-level decision buttons — exposed for structural asserts, NEVER clicked.
    this.rowActionButtons = this.gridRows.locator('button');
  }

  /** Toggle "Pending grant only" and let the grid re-render (filter only). */
  async togglePendingOnly() {
    await this.pendingOnlyChk.click();
    await this.waitReady();
  }

  /** Whether the pending-only filter is currently ticked. */
  isPendingOnlyChecked() { return this.pendingOnlyChk.isChecked(); }

  /** Current grid row count (real data may exist — 0 is not guaranteed). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { CompOffManagementPage };
