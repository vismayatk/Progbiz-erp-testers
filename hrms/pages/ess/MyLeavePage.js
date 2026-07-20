'use strict';

const { BasePage } = require('../BasePage');

/**
 * /ess/leave — "My Leave": the employee's leave hub. Three cards:
 * "Balances <year>" (grid: Leave Type | Balance | Reserved | Available, empty
 * state "No balances."), "My Leave Requests <year>" (grid: Type | From | To |
 * Days | Status, empty state "No leave requests.") and the "Apply For Leave"
 * form (crawled input order: year number, leave-type select "-- Select --",
 * Start Date, End Date, #halfday checkbox, Reason textarea).
 * "Submit Request" creates a real leave request (surfaces on
 * /leave-request-list / /leave-approval) — exposed but NEVER clicked by tests.
 * "Show" is a read-only year refresh and safe.
 */
class MyLeavePage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess/leave');

    // ── "Balances <year>" refresh ──────────────────────────────────────────
    this.yearInput = this.main.locator('input[type="number"]').first();
    this.showBtn   = this.button('Show');                          // read-only refresh — safe

    // ── "Apply For Leave" form (crawled input order) ───────────────────────
    this.leaveTypeSelect  = this.main.locator('select').first();   // "-- Select --"
    this.startDateInput   = this.main.locator('input[type="date"]').nth(0);
    this.endDateInput     = this.main.locator('input[type="date"]').nth(1);
    this.halfDayChk       = page.locator('#halfday');              // stable crawled id
    this.reasonTextarea   = this.main.locator('textarea').first();
    this.submitRequestBtn = this.button('Submit Request');         // final submit — never clicked by tests

    // ── the two grids (BasePage.grid == balances, the first table) ─────────
    this.balancesGrid     = this.main.locator('table').nth(0);
    this.requestsGrid     = this.main.locator('table').nth(1);
  }

  /** Refresh the Balances/Requests cards for a year via "Show" (read-only). */
  async showYear(year) {
    await this.yearInput.fill(String(year));
    await this.showBtn.click();
    await this.waitReady();
  }

  /** Option labels of the Leave Type select. */
  leaveTypeOptions() { return this.leaveTypeSelect.locator('option').allTextContents(); }

  /**
   * Draft a leave application WITHOUT submitting — form state only.
   * "Submit Request" is never clicked here. Dates are ISO yyyy-mm-dd.
   */
  async fillLeaveDraft({ start, end, halfDay = false, reason } = {}) {
    if (start) await this.startDateInput.fill(start);
    if (end)   await this.endDateInput.fill(end);
    if (halfDay) await this.halfDayChk.check().catch(() => {});
    if (reason !== undefined) await this.reasonTextarea.fill(reason);
    await this.page.waitForTimeout(200);
  }

  /** True when the balances empty state ("No balances.") is showing. */
  hasNoBalances() { return this.containsText('No balances.'); }

  /** True when the requests empty state ("No leave requests.") is showing. */
  hasNoLeaveRequests() { return this.containsText('No leave requests.'); }

  /** Header texts of the "My Leave Requests" grid (the second table). */
  async requestsHeaderTexts() {
    const cells = this.requestsGrid.locator('thead th, thead td');
    const n = await cells.count();
    const out = [];
    for (let i = 0; i < n; i++) out.push((await cells.nth(i).innerText()).trim());
    return out.filter(Boolean);
  }

  /** Balances row count (the empty state renders as a single message row). */
  balancesRowCount() { return this.balancesGrid.locator('tbody tr').count(); }

  /** Requests row count (the empty state renders as a single message row). */
  requestsRowCount() { return this.requestsGrid.locator('tbody tr').count(); }
}

module.exports = { MyLeavePage };
