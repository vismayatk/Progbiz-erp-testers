'use strict';

const { BasePage } = require('../BasePage');

/**
 * Assessments (/assessment-list) — "Assessment Library".
 * Reusable assessment definitions (type, description, max score, attachment).
 *
 * Grid: Sl.No | Title | Type | Description | Max Score | Attachment | Action.
 * The grid initially renders a "Loading..." row (async fetch) — wait it out
 * before asserting data.
 */
class AssessmentListPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'assessment-list');

    this.newAssessmentBtn = this.button('New Assessment');
  }

  /** Wait for the async "Loading..." first row to clear. */
  async waitLoaded() {
    await this.gridRows.filter({ hasText: 'Loading...' }).first()
      .waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  }

  /** Open the create-assessment form via "New Assessment". Nothing is saved. */
  async openCreateForm() {
    await this.newAssessmentBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** True when the create dialog (or an inline create form) is on screen. */
  async createFormVisible() {
    if (await this.modal.isVisible().catch(() => false)) return true;
    return this.main.locator('button').filter({ hasText: /^\s*(save|submit)\s*$/i }).first()
      .isVisible().catch(() => false);
  }

  /** Dismiss the create form WITHOUT saving (close X / Cancel / Escape / reload). */
  async closeCreateForm() {
    await this.dismissModal();
    // Inline (non-modal) form still open → reload the route to discard it.
    if (await this.createFormVisible()) await this.goto();
    await this.page.waitForTimeout(300);
  }

  /** Current data-row count (after waitLoaded; 0 is valid). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { AssessmentListPage };
