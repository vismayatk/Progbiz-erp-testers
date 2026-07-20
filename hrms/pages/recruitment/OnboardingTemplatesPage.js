'use strict';

const { BasePage } = require('../BasePage');

/**
 * Onboarding Templates (/onboarding-templates).
 * Master/detail layout, NOT a table: a "Templates" list panel on the left and
 * a detail/editor pane on the right. Documented empty states:
 *   "No templates yet."  +  "Select a template or create a new one."
 * "New Template" likely opens an INLINE editor in the detail pane (not a modal).
 */
class OnboardingTemplatesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'onboarding-templates');

    this.newTemplateBtn  = this.button('New Template');
    // Documented dual empty-state strings (pre-creation baseline).
    this.emptyListText   = this.main.getByText('No templates yet.').first();
    this.emptyDetailText = this.main.getByText('Select a template or create a new one.').first();
  }

  /** True while the template list panel is in its documented empty state. */
  async isEmpty() {
    return this.emptyListText.isVisible().catch(() => false);
  }

  /** A template entry in the list panel, by (partial) name text. */
  templateItem(name) {
    return this.main.getByText(new RegExp(name, 'i')).first();
  }

  /** Open the create editor via "New Template" (modal OR inline detail pane). Nothing is saved. */
  async openCreateEditor() {
    await this.newTemplateBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await this.page.waitForTimeout(500);
  }

  /** True when a create editor (dialog or inline pane with Save) is on screen. */
  async createEditorVisible() {
    if (await this.modal.isVisible().catch(() => false)) return true;
    const saveBtn = this.main.locator('button').filter({ hasText: /^\s*(save|submit)\s*$/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) return true;
    // inline editors expose at least one text input the empty state lacks
    return this.main.locator('input[type="text"], textarea').first().isVisible().catch(() => false);
  }

  /** Discard the unsaved editor WITHOUT saving: dismiss modal, else reload the route. */
  async closeCreateEditor() {
    if (await this.modal.isVisible().catch(() => false)) {
      const x = this.modal.locator('.btn-close, [aria-label="Close"], [data-bs-dismiss="modal"]').first();
      if (await x.count()) await x.click().catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    // Inline editor (or stubborn modal): nothing was saved — reload to discard.
    if (await this.modal.isVisible().catch(() => false) || !(await this.newTemplateBtn.isVisible().catch(() => false))) {
      await this.goto();
    }
    await this.page.waitForTimeout(300);
  }
}

module.exports = { OnboardingTemplatesPage };
