'use strict';

const { BasePage } = require('../BasePage');

/**
 * Onboarding Pipeline (/onboarding-pipeline).
 * Executes onboardings for new hires against a checklist template. With zero
 * active onboardings the page shows only the documented empty state
 * "No active onboardings." — no grid/board selectors were captured.
 * "Start Onboarding" needs an offer-stage candidate + a template as seeds.
 */
class OnboardingPipelinePage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'onboarding-pipeline');

    this.startOnboardingBtn = this.button('Start Onboarding');
    // Documented baseline empty state.
    this.emptyState = this.main.getByText('No active onboardings.').first();
  }

  /** True when at least one onboarding is running (empty state gone). */
  async hasActiveOnboardings() {
    return !(await this.emptyState.isVisible().catch(() => false));
  }

  /** Open the Start-Onboarding wizard/modal. Nothing is started or saved. */
  async openStartWizard() {
    await this.startOnboardingBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** True when the start wizard (dialog or inline form) is on screen. */
  async startWizardVisible() {
    if (await this.modal.isVisible().catch(() => false)) return true;
    return this.main.locator('button').filter({ hasText: /^\s*(start|save|submit)\s*$/i }).first()
      .isVisible().catch(() => false);
  }

  /** Dismiss the start wizard WITHOUT confirming (close X / Cancel / Escape / reload). */
  async closeStartWizard() {
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
    if (await this.modal.isVisible().catch(() => false)) await this.goto();
    await this.page.waitForTimeout(300);
  }
}

module.exports = { OnboardingPipelinePage };
