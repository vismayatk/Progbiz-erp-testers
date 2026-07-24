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

    // ── "Quick Actions" deep-links (crawl-verified via page-manifest.js) ───
    this.applyLeaveBtn   = this.button('Apply Leave');     // → /ess/leave
    this.myAttendanceBtn = this.button('My Attendance');   // → /ess/attendance
    this.payslipsBtn     = this.button('Payslips');        // → /ess/payslips
    // Documents / Letters / Profile Quick Actions were documented in 05_ESS
    // but trace to NO crawl data (ess.json buttons:[] — nav-only recapture);
    // locators removed until a re-crawl of /ess verifies their accessible names.
  }

  /**
   * True when the named KPI tile label is showing (e.g. "Leave Available").
   * DOC-SOURCED, crawl-UNVERIFIED (ess.json recapture caught only the global
   * nav) — assert softly until a re-crawl confirms the tile labels.
   */
  hasKpiTile(label) { return this.containsText(label); }

  /**
   * True when the "My Profile" card rendered (it carries the Employee Code).
   * DOC-SOURCED, crawl-UNVERIFIED (ess.json recapture caught only the global
   * nav) — assert softly until a re-crawl confirms the card text.
   */
  hasProfileCard() { return this.containsText('Employee Code'); }

  /** Click a Quick Action by its crawled name (pure navigation — no data touched). */
  async openQuickAction(name) {
    await this.button(name).click();
    await this.waitReady();
  }
}

module.exports = { MyWorkspacePage };
