'use strict';

const { BasePage } = require('../BasePage');

/**
 * /sections — department/section master (Core HR).
 * Single-page master: "Sections" grid + "New Section" form side by side, no modal.
 * Grid: SlNo | Department Name | Section Name | Action.
 */
class SectionsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'sections');

    // ── "New Section" form ─────────────────────────────────────────────────
    // The Department select has no id (labelled "Department :", default "Choose")
    // — it is the only <select> on the page.
    this.departmentSelect = this.main.locator('select').first();
    this.sectionNameInput = page.locator('#sectionname');       // "Section Name*" (required)

    this.saveBtn  = this.button('Save');    // final submit — never clicked by tests
    this.clearBtn = this.button('Clear');   // resets the form
  }

  /** Type a section name into the New Section form WITHOUT saving. */
  async fillNewSection(sectionName) {
    await this.sectionNameInput.fill(sectionName);
  }

  /** Reset the form via its own "Clear" button (nothing is persisted). */
  async clearForm() {
    await this.clearBtn.click();
    await this.page.waitForTimeout(300);
  }

  /** Option labels of the Department select (first entry is "Choose"). */
  departmentOptions() {
    return this.departmentSelect.locator('option').allTextContents();
  }
}

module.exports = { SectionsPage };
