'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { expectToast } = require('./reUi');

/**
 * /exit-type-settings — Exit Type Settings (SRS §6 FR-37). One row per exit type:
 * Exit Type | Enabled | Default Notice Treatment (<select>) | Gratuity by Default | Absconding
 * Trigger (days) | Approval Chain | Scope | Applies To | Retirement Age | Active. "Save" + "Add Rule"
 * (retirement-age rules). Read-only here except for ensuring Resignation is enabled and reading each
 * type's Approval Chain cell — that tells the workflow whether a type auto-activates (no chain) or
 * needs an approver (FR-05). Resignation is always enabled by rule.
 */
class ExitTypeSettingsPage extends BasePage {
  constructor(page) {
    super(page, 'exit-type-settings');
    this.saveBtn = this.main.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first();
  }

  rowFor(type) { return this.gridRows.filter({ hasText: new RegExp(`^\\s*${type}\\b`, 'i') }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Exit Type Settings heading').toContainText(/Exit Type Settings/i, { timeout: 30000 });
    await expect(this.rowFor('Resignation'), 'the Resignation row').toBeVisible({ timeout: 20000 });
  }

  /** The Approval Chain cell text for a type (e.g. "Configured", "No chain", or a workflow name). */
  async approvalChain(type) {
    const row = this.rowFor(type);
    const txt = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
    // Heuristic: cell wording varies; capture a chain hint from the row text.
    if (/no chain|not configured|—|auto/i.test(txt)) return 'none';
    if (/configured|chain|approval/i.test(txt)) return 'configured';
    return txt;
  }

  /** Whether a type's Enabled checkbox is ticked. */
  async isEnabled(type) {
    const chk = this.rowFor(type).locator('input[type="checkbox"]').first();
    return chk.isChecked().catch(() => false);
  }

  /** Ensure Resignation (or `type`) is enabled; save if changed. Returns whether a save ran. */
  async ensureEnabled(type = 'Resignation') {
    const chk = this.rowFor(type).locator('input[type="checkbox"]').first();
    if (await chk.count() && !(await chk.isChecked().catch(() => false)) && !(await chk.isDisabled().catch(() => false))) {
      await chk.click({ force: true }).catch(() => {});
      await this.save();
      return true;
    }
    return false;
  }

  /** Set a type's default notice treatment and save. */
  async setDefaultNoticeTreatment(type, label) {
    const sel = this.rowFor(type).locator('select').first();
    if (!(await sel.count())) return false;
    await sel.selectOption({ label }).catch(async () => {
      const match = (await sel.locator('option').allTextContents()).map(t => t.trim()).find(t => t.toLowerCase().includes(label.toLowerCase()));
      if (match) await sel.selectOption({ label: match });
    });
    await this.save();
    return true;
  }

  async save() {
    await this.saveBtn.click();
    await expectToast(this.page, /success|saved|updated/i, 'Save exit type settings').catch(() => {});
  }
}

module.exports = { ExitTypeSettingsPage };
