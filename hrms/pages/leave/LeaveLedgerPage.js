'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-ledger — append-only audit ledger of every leave transaction; the
 * single source of truth balances are computed from.
 * Grid: Date | Employee | Leave Type | Txn | Days | Source Ref | Balance after |
 * Posted by (captured empty — "No transactions.").
 * Banner: "Append-only — rows are never edited or deleted. Corrections post a
 * new Adjust or Reverse entry referencing the original."
 * "Export" triggers a download — exposed but not exercised by tests.
 */
class LeaveLedgerPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-ledger');

    // ── Toolbar ────────────────────────────────────────────────────────────
    this.filterBtn = this.button('Filter');
    this.exportBtn = this.button('Export');   // download — not exercised

    // ── Filters (from crawl: search input, one select, two date inputs) ────
    this.employeeSearch = this.main.locator('input[placeholder="All (search name / ID)"]').first();
    this.txnTypeSelect  = this.main.locator('select').first();
    this.fromDateInput  = this.main.locator('input[type="date"]').nth(0);
    this.toDateInput    = this.main.locator('input[type="date"]').nth(1);
  }

  /** Filter the ledger by employee name/ID (read-only query). */
  async filterByEmployee(term) {
    await this.employeeSearch.fill(term);
    await this.filterBtn.click();
    await this.waitReady();
  }

  /** Filter the ledger by a from/to date window (ISO yyyy-mm-dd). Read-only. */
  async filterByDates(from, to) {
    if (from) await this.fromDateInput.fill(from);
    if (to)   await this.toDateInput.fill(to);
    await this.filterBtn.click();
    await this.waitReady();
  }

  /** True when the documented append-only banner is showing. */
  hasAppendOnlyBanner() { return this.containsText('Append-only'); }

  /** Current grid row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { LeaveLedgerPage };
