'use strict';

const { BasePage } = require('../BasePage');

/**
 * Current Openings (/current-openings) — public "Join Our Team" careers page.
 * Renders OUTSIDE the authenticated ERP shell (no sidebar/breadcrumb): just a
 * heading and a `#selectbox` picker of published openings (default "Choose").
 * The apply form only appears after an opening is chosen.
 *
 * With no published vacancies the select stays on "Choose" with no options.
 */
class CurrentOpeningsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'current-openings');

    // No ERP shell here — anchor selectors on the page, not on BasePage.main.
    this.heading       = page.getByText(/join our team/i).first();
    this.openingSelect = page.locator('#selectbox');
  }

  /** Option labels of the opening picker (first is the "Choose" placeholder). */
  openingOptions() {
    return this.openingSelect.locator('option').allTextContents();
  }

  /** True when at least one real (non-"Choose") opening is published. */
  async hasOpenings() {
    const opts = await this.openingOptions();
    return opts.filter(o => o.trim() && !/^choose$/i.test(o.trim())).length > 0;
  }

  /**
   * Pick an opening by its label. Read-only — selecting only reveals the
   * apply form; this method never submits an application.
   */
  async selectOpening(label) {
    await this.openingSelect.selectOption({ label });
    await this.waitReady();
  }
}

module.exports = { CurrentOpeningsPage };
