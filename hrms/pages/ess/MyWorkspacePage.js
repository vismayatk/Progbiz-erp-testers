'use strict';

const { BasePage } = require('../BasePage');

/**
 * /ess — "My Workspace": the employee's personal ESS landing page. Read-only
 * snapshot: 4 KPI tiles (Leave Available | Today's Attendance | Pending
 * Requests | Letters to Acknowledge), a "My Profile" card (Employee Code,
 * Branch, Email, Phone, Reports To, Joined), "Quick Actions" deep-links and
 * the "Upcoming Holidays" / "Birthdays This Week" widgets.
 * LAZY: content renders after a "Loading your workspace…" placeholder —
 * BasePage.waitReady() already waits for it to clear.
 * No grid, no forms — every control is a navigation shortcut (safe to click).
 */
class MyWorkspacePage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess');

    // ── "Quick Actions" deep-links (first three crawl-verified) ────────────
    this.applyLeaveBtn   = this.button('Apply Leave');     // → /ess/leave
    this.myAttendanceBtn = this.button('My Attendance');   // → /ess/attendance
    this.payslipsBtn     = this.button('Payslips');        // → /ess/payslips
    // Documented (05_ESS doc) but not captured as buttons by the crawl:
    this.documentsBtn    = this.button('Documents');       // → /ess/documents
    this.lettersBtn      = this.button('Letters');         // → /ess/letters
    this.profileBtn      = this.button('Profile');         // → /ess/profile
  }

  /** True when the named KPI tile label is showing (e.g. "Leave Available"). */
  hasKpiTile(label) { return this.containsText(label); }

  /** True when the "My Profile" card rendered (it carries the Employee Code). */
  hasProfileCard() { return this.containsText('Employee Code'); }

  /** Click a Quick Action by its crawled name (pure navigation — no data touched). */
  async openQuickAction(name) {
    await this.button(name).click();
    await this.waitReady();
  }
}

module.exports = { MyWorkspacePage };
