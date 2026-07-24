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

  /**
   * Open the stage-configuration UI via "Configure Stages". Probed live: it is
   * an INLINE editor — rows of {order number, stage name text, select, checkbox}
   * appear on the board itself (no modal). Nothing is saved.
   */
  async openStageConfig() {
    await this.configureStagesBtn.click();
    await this.stageRowInputs().first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** The stage-row inputs that only exist while the inline editor is open. */
  stageRowInputs() {
    // Baseline board has ONLY the vacancy select + #autoSync — any visible
    // number/text input means the stage editor is open.
    return this.main.locator('input[type="number"], input[type="text"]');
  }

  /** True when the stage editor (inline rows or a dialog) is on screen. */
  async stageConfigVisible() {
    if (await this.modal.isVisible().catch(() => false)) return true;
    return this.stageRowInputs().first().isVisible().catch(() => false);
  }

  /** Dismiss the stage-configuration UI WITHOUT saving any stage changes. */
  async closeStageConfig() {
    await this.dismissModal();                     // harmless if no dialog
    // Inline editor has no cancel affordance we can trust — reload to discard.
    if (await this.stageConfigVisible()) await this.goto();
    await this.page.waitForTimeout(300);
  }
}

module.exports = { RecruitmentPipelinePage };
