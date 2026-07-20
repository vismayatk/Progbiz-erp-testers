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

  /** True when the stage editor (dialog OR inline panel with Save/Submit) is on screen. */
  async stageConfigVisible() {
    if (await this.modal.isVisible().catch(() => false)) return true;
    // Inline fallback — a Save/Submit button the baseline board does not have
    // (crawl captured only "Configure Stages" and "Score").
    return this.main.locator('button').filter({ hasText: /^\s*(save|submit)\s*$/i }).first()
      .isVisible().catch(() => false);
  }

  /** Dismiss the stage-configuration UI WITHOUT saving any stage changes. */
  async closeStageConfig() {
    await this.dismissModal();
    // Panel variant (non-modal) still showing the editor → reload to discard it.
    if (await this.stageConfigVisible()) await this.goto();
    await this.page.waitForTimeout(300);
  }
}

module.exports = { RecruitmentPipelinePage };
