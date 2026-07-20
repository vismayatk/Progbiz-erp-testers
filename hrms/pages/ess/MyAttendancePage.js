'use strict';

const { BasePage } = require('../BasePage');

/**
 * /ess/attendance — "My Attendance": the employee's own daily attendance
 * history. Card "Attendance History" with a From/To date-range filter that
 * must be applied via "Show" before rows render. Grid: Date | Entry | Exit |
 * Worked (min) | OT (min) | Status (captured empty — "No attendance in
 * range."). "Regularize" and "Raise OT" open request flows whose results land
 * in the admin approval queues (/regularization, /overtime-approval) — the
 * dialogs are only ever opened and dismissed WITHOUT submitting.
 */
class MyAttendancePage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess/attendance');

    // ── "Attendance History" range filter (crawled input order) ────────────
    this.fromDateInput = this.main.locator('input[type="date"]').nth(0);
    this.toDateInput   = this.main.locator('input[type="date"]').nth(1);
    this.showBtn       = this.button('Show');         // read-only range refresh — safe

    // ── request-flow openers (dialogs dismissed unsubmitted by tests) ──────
    this.regularizeBtn = this.button('Regularize');   // → /regularization queue on submit
    this.raiseOtBtn    = this.button('Raise OT');     // → /overtime-approval queue on submit
  }

  /** Apply the From/To range via "Show" (read-only). Dates are ISO yyyy-mm-dd. */
  async showRange(from, to) {
    await this.fromDateInput.fill(from);
    await this.toDateInput.fill(to);
    await this.showBtn.click();
    await this.waitReady();
  }

  /**
   * Open the "Regularize" request dialog (nothing is ever submitted).
   * @returns {Promise<boolean>} true when a dialog/form actually revealed
   */
  openRegularizeDialog() { return this._openDialog(this.regularizeBtn); }

  /**
   * Open the "Raise OT" request dialog (nothing is ever submitted).
   * @returns {Promise<boolean>} true when a dialog/form actually revealed
   */
  openRaiseOtDialog() { return this._openDialog(this.raiseOtBtn); }

  /** Dismiss an open request dialog WITHOUT submitting (close/cancel, else Escape). */
  async closeDialog() {
    if (await this.modal.isVisible().catch(() => false)) {
      const dismiss = this.modal
        .locator('.btn-close, [aria-label="Close"], button:has-text("Cancel"), button:has-text("Close")')
        .first();
      if (await dismiss.count()) await dismiss.click({ timeout: 5000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    } else if (this._currentPath() !== this.route) {
      await this.goto();   // the button routed away — return to the history page
    }
    await this.page.waitForTimeout(300);
  }

  /** True when the documented empty state ("No attendance in range.") is showing. */
  hasNoAttendanceInRange() { return this.containsText('No attendance in range.'); }

  /** History row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }

  // ── private helpers ──────────────────────────────────────────────────────

  /** Click an opener and probe for a modal / route change / expanded inline form. */
  async _openDialog(btn) {
    const before = await this._visibleControlCount();
    await btn.click();
    const modalShown = await this.modal.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    await this.waitReady();
    if (modalShown) return true;
    if (this._currentPath() !== this.route) return true;         // routed to a request page
    return (await this._visibleControlCount()) > before;         // inline form expanded
  }

  _currentPath() {
    return new URL(this.page.url()).pathname.replace(/^\//, '').replace(/\/$/, '');
  }

  /** Visible form-control count — probe for "did a request form appear". */
  _visibleControlCount() {
    return this.page.locator('input:visible, select:visible, textarea:visible').count();
  }
}

module.exports = { MyAttendancePage };
