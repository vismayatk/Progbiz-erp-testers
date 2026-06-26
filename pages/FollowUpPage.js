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

  /** #followup-status option labels. */
  statusOptions() { return this.statusSelect.locator('option').allTextContents(); }

  /** Select a follow-up status by label and let the conditional fields settle. */
  async selectStatus(label) {
    await this.statusSelect.selectOption({ label }).catch(() => {});
    await this.page.waitForTimeout(900);
  }

  /** Whether Lead Quality is visible (appears only for In-Followup/Interested). */
  leadQualityVisible() { return this.leadQualitySelect.isVisible().catch(() => false); }
  /** Whether the Description field is visible. */
  descriptionVisible() { return this.notesInput.isVisible().catch(() => false); }
  /** The follow-up date/time field value (auto-filled to now). */
  dateValue() { return this.page.locator('#followup-date').inputValue().catch(() => ''); }

  /** Close the modal via its Close/Cancel control. */
  async cancel() {
    const close = this.modal.getByRole('button', { name: /close|cancel/i }).first()
      .or(this.modal.locator('.btn-close, [data-bs-dismiss="modal"]').first());
    await close.click().catch(() => {});
    await this.modal.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  }

  /** Edit/delete controls present on the latest follow-up history row. */
  async latestRowControls() {
    await this.getFollowUpCount();   // opens history tab + waits
    return this.page.evaluate(() => {
      const rows = [...document.querySelectorAll('#followups li.crm-recent-activity-content, #followups li, #followups tbody tr')];
      if (!rows.length) return { rows: 0, edit: false, del: false };
      const r = rows[0];
      const has = (re) => [...r.querySelectorAll('a,button,i')].some(e => re.test((e.getAttribute('class') || '') + (e.getAttribute('title') || '') + (e.textContent || '')));
      return { rows: rows.length, edit: has(/edit|pencil/i), del: has(/delete|trash|bin/i) };
    });
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
