'use strict';

const { BasePage } = require('../BasePage');

/**
 * /letters/templates — HR letter template manager (Core HR).
 * Grid: Name | Owner | Type | Subject | Active | Action.
 * Empty-state ROW: "No templates yet." "Merge Fields" / "Generate Letter" are
 * plain anchors with stable hrefs; "New Template" opens the template editor.
 */
class LetterTemplatesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'letters/templates');

    // ── Header actions (crawled hrefs) ─────────────────────────────────────
    this.mergeFieldsLink    = this.main.locator('a[href="/letters/fields"]').first();
    this.generateLetterLink = this.main.locator('a[href="/letters/generate"]').first();
    this.newTemplateBtn     = this.button('New Template');
  }

  /**
   * Open the template editor behind "New Template". Nothing is ever saved.
   * @returns {Promise<boolean>} true when an editor form actually revealed
   */
  async openCreateModal() {
    const before = await this._visibleControlCount();
    await this.newTemplateBtn.click();
    const modalShown = await this.modal.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    await this.waitReady();
    if (modalShown) return true;
    if (this._currentPath() !== this.route) return true;
    return (await this._visibleControlCount()) > before;
  }

  /** Dismiss the template editor WITHOUT saving. */
  async closeModal() {
    if (await this.modal.isVisible().catch(() => false)) {
      const dismiss = this.modal
        .locator('.btn-close, [aria-label="Close"], button:has-text("Cancel"), button:has-text("Close")')
        .first();
      if (await dismiss.count()) await dismiss.click({ timeout: 5000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    } else if (this._currentPath() !== this.route) {
      await this.goto();
    }
    await this.page.waitForTimeout(300);
  }

  /** Text of the first grid row (a template, or "No templates yet."). */
  async firstRowText() {
    return (await this.gridRows.first().innerText()).trim();
  }

  // ── private helpers ──────────────────────────────────────────────────────

  _currentPath() {
    return new URL(this.page.url()).pathname.replace(/^\//, '').replace(/\/$/, '');
  }

  _visibleControlCount() {
    return this.page.locator('input:visible, select:visible, textarea:visible').count();
  }
}

module.exports = { LetterTemplatesPage };
