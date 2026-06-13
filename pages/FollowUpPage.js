'use strict';

const { getAlertText, waitOverviewReady } = require('../utils/helpers');

class FollowUpPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // ── Trigger button (on the Enquiry Overview page) ──────────────────────
    this.addFollowUpBtn = page.locator('#btn-add-followup');

    // ── Follow-up modal (#followupModal) ───────────────────────────────────
    this.modal           = page.locator('#followupModal');
    this.statusSelect    = page.locator('#followup-status');     // Awaiting / Interested / Got the business / Not interested ...
    this.leadQualitySelect = page.locator('#lead-quality');      // Cold / Warm / Hot (revealed after status)
    this.noNextFollowUpChk = page.locator('#no-next-followup');  // skip the (future) next-followup date
    this.notesInput      = page.locator('#followup-description');
    this.businessValueInput = page.locator('#business-value');
    this.saveBtn         = page.locator('#btn-save-followup');

    // ── Followup History tab + listing ─────────────────────────────────────
    this.historyTab  = page.locator('#followups-tab');
    this.followUpRows = page.locator('#followups li.crm-recent-activity-content, #followups tbody tr');
  }

  /** Click "Followup" on the overview page to open the modal. */
  async clickAddFollowUp() {
    await waitOverviewReady(this.page);
    await this.addFollowUpBtn.waitFor({ state: 'visible', timeout: 15000 });
    await this.addFollowUpBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 });
    console.log('  ➕ Opened "Add FollowUp" modal');
  }

  /**
   * Fill and submit the follow-up modal.
   * @param {object} data - from testData.followUp (notes, optional status)
   */
  async fillAndSave(data) {
    console.log(`  ✍️  Filling follow-up: "${data.notes}"`);

    // Followup Status (required) — selecting it reveals Lead Quality + next date
    const status = data.status || 'Interested';
    try {
      await this.statusSelect.selectOption({ label: status });
    } catch {
      await this.statusSelect.selectOption({ index: 1 }).catch(() => {});
    }
    await this.page.waitForTimeout(900); // let the modal expand

    // Lead Quality (required once revealed) — pick first real (Cold/Warm/Hot)
    try {
      await this.leadQualitySelect.waitFor({ state: 'visible', timeout: 4000 });
      const v = await this.leadQualitySelect.evaluate(s => {
        const o = [...s.options].find(o => o.value && !/^choose$/i.test(o.text.trim()) && o.value !== '0');
        return o ? o.value : (s.options[1] ? s.options[1].value : '');
      });
      if (v) await this.leadQualitySelect.selectOption(v);
    } catch { /* not present for some statuses */ }

    // Avoid the future-dated "Next Followup Date" requirement
    try {
      if (await this.noNextFollowUpChk.count() && !(await this.noNextFollowUpChk.isChecked())) {
        await this.noNextFollowUpChk.check();
      }
    } catch { /* optional */ }

    await this.notesInput.fill(data.notes).catch(() => {});
    if (data.businessValue) await this.businessValueInput.fill(String(data.businessValue)).catch(() => {});

    await this.saveBtn.click();
    await this.modal.waitFor({ state: 'hidden', timeout: 12000 }).catch(() => {});
    await this.page.waitForTimeout(800);
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
    await waitOverviewReady(this.page);
    // Open the "Followup History" tab if present
    try {
      if (await this.historyTab.count()) {
        await this.historyTab.click();
        // wait for either a history row to render or settle
        await this.followUpRows.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
        await this.page.waitForTimeout(800);
      }
    } catch { /* tab not present */ }
    let count = await this.followUpRows.count();
    if (count === 0) {
      // fallback: any list items / rows within the followups pane
      count = await this.page.locator('#followups li, #followups tbody tr').count();
    }
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
