'use strict';

const { BasePage } = require('../BasePage');

/**
 * /letters/generate — merge + generate a letter for an employee (Core HR, no grid).
 * Three unlabelled selects in visual order: Template | Branch | Employee
 * (Branch filters the Employee options). Preview hint enforces template+employee.
 * "Generate" produces the letter — exposed but never clicked by tests.
 */
class GenerateLetterPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'letters/generate');

    // ── Form (selects have no ids — positional, in form order) ─────────────
    this.templateSelect = this.main.locator('select').nth(0);  // "-- Select template --"
    this.branchSelect   = this.main.locator('select').nth(1);  // "-- Select branch --"
    this.employeeSelect = this.main.locator('select').nth(2);  // "-- Select employee --"
    this.emailLetterChk = page.locator('#sendmail');           // "Email the letter"

    this.previewBtn  = this.button('Preview');
    this.generateBtn = this.button('Generate');   // produces/emails the letter — never clicked by tests

    // "Preview" card hint shown before a valid selection
    this.previewHint = this.main.getByText('Select a template and employee, then Preview.').first();
  }

  /** Option labels of the Template select (empty tenant → placeholder only). */
  templateOptions() {
    return this.templateSelect.locator('option').allTextContents();
  }

  /** Option labels of the Employee select. */
  employeeOptions() {
    return this.employeeSelect.locator('option').allTextContents();
  }

  /** Render the merged preview (read-only — does NOT generate the letter). */
  async preview() {
    await this.previewBtn.click();
    await this.waitReady();
  }
}

module.exports = { GenerateLetterPage };
