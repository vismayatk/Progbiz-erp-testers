'use strict';

const { getAlertText } = require('../utils/helpers');

class FollowUpPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // ── Trigger button (on enquiry detail) ────────────────────────────────
    this.addFollowUpBtn = page.getByRole('button', { name: /add follow.?up|\+ follow/i }).or(
                          page.getByRole('link',   { name: /add follow.?up|\+ follow/i })).first();

    // ── Form fields ────────────────────────────────────────────────────────
    this.notesInput = page.locator(
      'textarea[name*="note" i], textarea[name*="remark" i], textarea[name*="comment" i], textarea[name*="desc" i]'
    ).first();
    this.nextFollowUpInput = page.locator(
      'input[name*="next" i][type="date"], input[name*="follow" i][type="date"], input[type="date"]'
    ).first();
    this.typeSelect = page.locator('select[name*="type" i], select[id*="type" i]').first();

    this.saveBtn = page.getByRole('button', { name: /save|submit|add/i }).first();

    // ── Listing ────────────────────────────────────────────────────────────
    this.followUpRows = page.locator(
      '.follow-up-list tr, #follow-up-table tbody tr, [id*="followup"] tbody tr, .followup-row'
    );
  }

  /** Click the "Add Follow-up" button (may open a modal or section). */
  async clickAddFollowUp() {
    await this.addFollowUpBtn.waitFor({ state: 'visible', timeout: 10000 });
    await this.addFollowUpBtn.click();
    console.log('  ➕ Opened "Add Follow-up" panel / modal');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Fill and submit the follow-up form.
   * @param {object} data - from testData.followUp
   */
  async fillAndSave(data) {
    console.log(`  ✍️  Filling follow-up: "${data.notes}"`);

    try {
      await this.notesInput.waitFor({ state: 'visible', timeout: 6000 });
      await this.notesInput.fill(data.notes);
    } catch {
      // textarea not visible — skip
    }

    try {
      await this.nextFollowUpInput.waitFor({ state: 'visible', timeout: 6000 });
      await this.nextFollowUpInput.fill(data.nextFollowUp);
    } catch {
      // date field not present — skip
    }

    await this.saveBtn.click();
    console.log('  💾 Follow-up saved');
  }

  /** Return the success message after saving. */
  async getSuccessMessage() {
    const msg = await getAlertText(this.page, 12000);
    console.log(`  💬 Follow-up alert: "${msg}"`);
    return msg;
  }

  /**
   * Count visible follow-up rows in the listing table / section.
   * @returns {number}
   */
  async getFollowUpCount() {
    await this.page.waitForLoadState('domcontentloaded');
    const count = await this.followUpRows.count();
    console.log(`  📊 Follow-up rows visible: ${count}`);
    return count;
  }

  /** Return text of the most recent follow-up row. */
  async getLatestFollowUpText() {
    const count = await this.followUpRows.count();
    if (count === 0) return null;
    return (await this.followUpRows.last().textContent()).trim();
  }
}

module.exports = { FollowUpPage };
