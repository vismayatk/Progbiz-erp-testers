'use strict';

const { BasePage } = require('../BasePage');

/**
 * /ess/probation — "My Probation": the employee's read-only view of their own
 * probation status and review checkpoints (mirrors admin /hrms/probation).
 * LAZY page. For a confirmed employee (the crawl user Vismaya/PB1053 is
 * Confirmed) the panel shows only the documented empty state:
 * "You are not currently on probation." A populated review panel requires an
 * employee with an active probation record.
 * Read-only — no buttons, no forms, no grid in the captured state.
 */
class MyProbationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess/probation');

    // Documented confirmed-employee empty state.
    this.notOnProbationState = this.main.locator('text=You are not currently on probation.').first();
  }

  /** True when the documented empty state ("You are not currently on probation.") is showing. */
  hasNotOnProbation() { return this.containsText('You are not currently on probation.'); }

  /** True when the "My Probation" panel title rendered (holds for either state). */
  hasProbationPanel() { return this.containsText('My Probation'); }
}

module.exports = { MyProbationPage };
