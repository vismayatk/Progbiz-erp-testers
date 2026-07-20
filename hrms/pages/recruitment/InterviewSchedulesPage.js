'use strict';

const { BasePage } = require('../BasePage');

/**
 * Interview Schedule (/interview-schedules) — "Scheduled Interviews".
 * Create and track interview appointments per candidate/round/date/mode.
 * Round options in the scheduling form come from the /interview-rounds master.
 *
 * Grid: Sl.No | Candidate | Round | Scheduled On | Mode | Status | Action
 * (captured empty — handle 0 rows).
 */
class InterviewSchedulesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'interview-schedules');

    this.scheduleInterviewBtn = this.button('Schedule Interview');
  }

  /** Open the scheduling form via "Schedule Interview". Nothing is saved. */
  async openScheduleForm() {
    await this.scheduleInterviewBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** True when the scheduling dialog (or inline form) is on screen. */
  async scheduleFormVisible() {
    if (await this.modal.isVisible().catch(() => false)) return true;
    return this.main.locator('button').filter({ hasText: /^\s*(save|submit)\s*$/i }).first()
      .isVisible().catch(() => false);
  }

  /** Dismiss the scheduling form WITHOUT saving (close X / Cancel / Escape / reload). */
  async closeScheduleForm() {
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
    if (await this.scheduleFormVisible()) await this.goto();
    await this.page.waitForTimeout(300);
  }

  /** Current data-row count (0 is the documented baseline state). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { InterviewSchedulesPage };
