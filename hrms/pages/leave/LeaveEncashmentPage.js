'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-encashment — employee self-service: convert encashable balance into
 * money. Card "Request Encashment": Leave Type select (placeholder "Choose"),
 * Days + Per Day Rate number inputs, computed "Amount: <n>" display and the
 * final "Submit Request" button (never clicked by tests).
 * Card "My Requests" grid: SlNo | Leave Type | Days | Amount | Status
 * (captured empty — "No requests.").
 * Precondition notice when nothing qualifies:
 *   "No leave type in your policy allows encashment."
 */
class LeaveEncashmentPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-encashment');

    // ── "Request Encashment" form ──────────────────────────────────────────
    this.leaveTypeSelect = this.main.locator('select').first();
    this.daysInput       = this.main.locator('input[type="number"]').nth(0);
    this.perDayRateInput = this.main.locator('input[type="number"]').nth(1);
    this.amountLine      = this.main.getByText(/Amount:/).first();   // computed Days × Rate

    this.submitRequestBtn = this.button('Submit Request');   // final submit — never clicked
  }

  /** Fill Days / Per Day Rate WITHOUT submitting (lets "Amount" recompute). */
  async fillRequest({ days, rate } = {}) {
    if (days !== undefined) await this.daysInput.fill(String(days));
    if (rate !== undefined) await this.perDayRateInput.fill(String(rate));
    await this.page.waitForTimeout(400);   // let the computed Amount settle
  }

  /** Text of the computed "Amount: <n>" line. */
  async amountText() { return (await this.amountLine.innerText()).trim(); }

  /** True when the "no encashable leave type" precondition notice is showing. */
  hasNoEncashableNotice() {
    return this.containsText('No leave type in your policy allows encashment.');
  }

  /** "My Requests" row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { LeaveEncashmentPage };
