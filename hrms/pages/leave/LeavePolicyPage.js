'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-policy — Leave Policy Configuration.
 * The page is GATED: a single card "Choose A Leave Pattern" with one native
 * select (placeholder "Choose"). No buttons and no tables render until a
 * pattern is picked, so the initial state itself is the assertion target.
 * Patterns come from /leave-patterns; the configured policy drives
 * /my-leave-policy, encashability on /leave-encashment and accrual behaviour.
 */
class LeavePolicyPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-policy');

    // The gate — only control on initial load (labelled "Leave Pattern").
    this.patternSelect = this.main.locator('select').first();
  }

  /** Option labels of the Leave Pattern select (first entry is the "Choose" placeholder). */
  patternOptions() { return this.patternSelect.locator('option').allTextContents(); }

  /** Choose a pattern by label — reveals the policy form. Nothing is saved. */
  async choosePattern(label) {
    await this.patternSelect.selectOption({ label });
    await this.waitReady();
  }

  /** True while the page is still gated (no pattern chosen → no buttons, no tables). */
  async isGated() {
    const buttons = await this.main.locator('button:visible').count();
    const tables  = await this.main.locator('table:visible').count();
    return buttons === 0 && tables === 0;
  }
}

module.exports = { LeavePolicyPage };
