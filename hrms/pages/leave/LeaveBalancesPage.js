'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-balances — "My Leave Balance": per-leave-type balance sheet for a
 * year, computed live from the leave ledger (incl. monetary Liability).
 * Grid: Sl.No | Leave Type | Opening | Accrued | Carried Fwd | Used |
 * Encashed | Reserved | Available | Liability.
 * Card title interpolates the year ("Balance Detail — <year>"); two documented
 * empty states: banner "No balances found for <year>." + cell "No balances found.".
 * "Run Accrual" POSTS Accrue rows to the ledger — state-mutating, never clicked.
 */
class LeaveBalancesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-balances');

    this.yearInput     = this.main.locator('input[type="number"]').first();
    this.showBtn       = this.button('Show');
    this.runAccrualBtn = this.button('Run Accrual');   // mutating — never clicked by tests
  }

  /** Run the Year + Show query (read-only recomputation from the ledger). */
  async showYear(year) {
    await this.yearInput.fill(String(year));
    await this.showBtn.click();
    await this.waitReady();
  }

  /** True when the year-interpolated card title ("Balance Detail — <year>") is showing. */
  hasBalanceCardFor(year) { return this.containsText(`Balance Detail — ${year}`); }

  /** True when the year-interpolated empty banner ("No balances found for <year>.") is showing. */
  hasNoBalancesFor(year) { return this.containsText(`No balances found for ${year}.`); }

  /** True when the "computed live from the leave ledger" footnote is showing. */
  hasLedgerFootnote() { return this.containsText('computed live from the leave ledger'); }

  /** Current grid row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { LeaveBalancesPage };
