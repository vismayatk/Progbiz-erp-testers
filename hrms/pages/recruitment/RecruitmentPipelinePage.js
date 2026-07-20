'use strict';

const { BasePage } = require('../BasePage');

/**
 * Recruitment Pipeline (/recruitment-pipeline) — per-vacancy Kanban board.
 * MANDATORY FILTER: nothing renders until a vacancy is chosen in the Vacancy
 * select (options "— Select a vacancy —" / "All vacancies" / one per opening).
 * "Configure Stages" opens the stage-editing UI; "Score" stays muted until a
 * vacancy with candidates is selected; `#autoSync` toggles status↔stage sync.
 *
 * No data grid — cards are targeted by candidate-name text.
 */
class RecruitmentPipelinePage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'recruitment-pipeline');

    // Single native select captured on the page = the Vacancy picker.
    this.vacancySelect      = this.main.locator('select').first();
    this.autoSyncToggle     = page.locator('#autoSync');
    this.configureStagesBtn = this.button('Configure Stages');
    this.scoreBtn           = this.button('Score');
  }

  /** Option labels of the Vacancy picker. */
  vacancyOptions() {
    return this.vacancySelect.locator('option').allTextContents();
  }

  /** Choose a vacancy by label ("All vacancies" is always available). Read-only. */
  async selectVacancy(label) {
    await this.vacancySelect.selectOption({ label });
    await this.waitReady();
  }

  /** Read the Auto-Sync toggle state WITHOUT changing it (it persists config). */
  async isAutoSyncChecked() {
    return this.autoSyncToggle.isChecked().catch(() => false);
  }

  /** Open the stage-configuration UI via "Configure Stages". Nothing is saved. */
  async openStageConfig() {
    await this.configureStagesBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** Dismiss the stage-configuration UI WITHOUT saving any stage changes. */
  async closeStageConfig() {
    for (let i = 0; i < 2 && await this.modal.isVisible().catch(() => false); i++) {
      const x = this.modal.locator('.btn-close, [aria-label="Close"], [data-bs-dismiss="modal"]').first();
      if (await x.count()) await x.click().catch(() => {});
      else {
        const cancel = this.modal.locator('button').filter({ hasText: /^\s*(cancel|close)\s*$/i }).first();
        if (await cancel.count()) await cancel.click().catch(() => {});
        else await this.page.keyboard.press('Escape').catch(() => {});
      }
      await this.modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    // Panel variant (non-modal) → reload the route to discard the editor.
    if (await this.modal.isVisible().catch(() => false)) await this.goto();
    await this.page.waitForTimeout(300);
  }
}

module.exports = { RecruitmentPipelinePage };
