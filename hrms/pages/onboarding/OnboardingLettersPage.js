'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');

/**
 * Generic page object for the three onboarding letter lists:
 *   /hrms/appointment-letters   — Sl No | Joiner | Branch | Designation | Joining Date | Onboarding | Appointment Letter | Action (Download / Retry Email)
 *   /hrms/confirmation-letters  — Sl.No | Employee | Code | Branch | Confirmed On | Confirmation Letter | Action
 *   /hrms/extension-letters     — Sl.No | Employee | Code | Branch | New End Date | Extension Letter | Action
 * These are read/verify: the letter is listed and a Download/Action control exists for a row.
 */
class OnboardingLettersPage extends BasePage {
  constructor(page, route, headingRe) {
    super(page, route);
    this.headingRe = headingRe;
  }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'letters heading').toContainText(this.headingRe, { timeout: 30000 });
    await this.page.waitForTimeout(800);
  }

  rows() { return this.gridRows.filter({ hasText: /\S/ }); }
  async count() { return this.rows().count(); }
  rowFor(text) { return this.rows().filter({ hasText: text }).first(); }

  /** A Download / letter action control is available on the first row. */
  async downloadAvailable() {
    const row = this.rows().first();
    if (!(await row.count())) return false;
    return (await row.locator('button, a').filter({ hasText: /download|view|retry|letter/i }).or(row.locator('[title*="download" i], a[href]')).count()) > 0;
  }
}

module.exports = { OnboardingLettersPage };
