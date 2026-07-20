'use strict';

const { BasePage } = require('../BasePage');

/**
 * /my-leave-policy — read-only employee view of the leave policy assigned to
 * them for a chosen year. "Year" (plain input[type=number]) + "Show" button;
 * results load only after clicking Show (mandatory filter).
 * Documented empty state (reliable precondition assertion):
 *   "No leave policy is assigned to you yet. Once HR assigns a leave pattern,
 *    your leave types, balances and rules appear here."
 */
class MyLeavePolicyPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'my-leave-policy');

    this.yearInput = this.main.locator('input[type="number"]').first();
    this.showBtn   = this.button('Show');

    // Exact documented empty-state opener (asserted via containsText()).
    this.emptyStateText = 'No leave policy is assigned to you yet.';
  }

  /** Run the mandatory Year + Show query (read-only). */
  async showYear(year) {
    await this.yearInput.fill(String(year));
    await this.showBtn.click();
    await this.waitReady();
  }

  /** True when the documented "no policy assigned" empty state is showing. */
  hasNoPolicyAssigned() { return this.containsText(this.emptyStateText); }

  /** True when actual policy content (a table) rendered instead of the empty state. */
  async hasPolicyContent() {
    return (await this.main.locator('table:visible').count()) > 0;
  }
}

module.exports = { MyLeavePolicyPage };
