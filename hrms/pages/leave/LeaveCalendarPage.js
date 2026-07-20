'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-calendar — visual calendar of who is on leave (no data grid).
 * Filters: Branch select ("All Branches"), Department select
 * ("All Departments"), Employee text input (placeholder "Type a name to
 * filter…") + "Show" button.
 * ASYNC LOAD: the calendar body renders behind a "Loading calendar…" spinner —
 * always wait for it to clear (generous timeout) before asserting content.
 */
class LeaveCalendarPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-calendar');

    this.branchSelect     = this.main.locator('select').nth(0);
    this.departmentSelect = this.main.locator('select').nth(1);
    // Unicode ellipsis in the placeholder — match on the stable prefix.
    this.employeeInput    = this.main.locator('input[placeholder*="Type a name" i]').first();
    this.showBtn          = this.button('Show');
  }

  /** Wait for the async "Loading calendar…" spinner to clear (generous timeout). */
  async waitCalendarLoaded() {
    await this.page.waitForFunction(
      () => !/loading calendar/i.test(document.body.innerText || ''),
      { timeout: 30000 },
    ).catch(() => {});
    await this.page.waitForTimeout(500);
  }

  /** Re-query the calendar with the current filters via "Show" (read-only). */
  async show() {
    await this.showBtn.click();
    await this.waitCalendarLoaded();
  }

  /** Filter by employee name and re-query (read-only). */
  async filterByEmployee(name) {
    await this.employeeInput.fill(name);
    await this.show();
  }

  /** True while the async loading spinner text is still on screen. */
  isLoading() { return this.containsText('Loading calendar'); }
}

module.exports = { LeaveCalendarPage };
