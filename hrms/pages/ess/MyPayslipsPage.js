'use strict';

const { BasePage } = require('../BasePage');

/**
 * /ess/payslips — "Self Service Payslips" (My Pay): read-only view of the
 * employee's monthly payslips as produced by admin /employee-salary-process.
 * Card "Payslips" with a year (number) input applied via "Show"; grid:
 * Period | Basic | Deductions | Net | Payable | Paid (captured empty —
 * "No payslips found."). Documented footnote: "Payslip PDF download is not
 * yet available — see your HR department for a stamped copy."
 * Entirely read-only — "Show" only re-queries.
 */
class MyPayslipsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess/payslips');

    this.yearInput = this.main.locator('input[type="number"]').first();
    this.showBtn   = this.button('Show');   // read-only period refresh — safe
  }

  /** Load the payslips for a year via "Show" (read-only re-query). */
  async showYear(year) {
    await this.yearInput.fill(String(year));
    await this.showBtn.click();
    await this.waitReady();
  }

  /** True when the documented empty state ("No payslips found.") is showing. */
  hasNoPayslips() { return this.containsText('No payslips found.'); }

  /** True when the "PDF download is not yet available" footnote is showing. */
  hasPdfFootnote() { return this.containsText('Payslip PDF download is not yet available'); }

  /** Payslip row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { MyPayslipsPage };
