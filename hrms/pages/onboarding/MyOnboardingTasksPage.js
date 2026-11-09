'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { expectToast, confirm } = require('./onbUi');

/**
 * /my-onboarding-tasks — the signed-in user's assigned onboarding tasks. Grid: Task | New Hire |
 * Stage | Due Date | Status | Completed On | Action; a per-row "Mark Done" settles a task. (Driven
 * as the task owner — amit or a test employee.)
 */
class MyOnboardingTasksPage extends BasePage {
  constructor(page) { super(page, 'my-onboarding-tasks'); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'My Onboarding Tasks heading').toContainText(/Onboarding Tasks/i, { timeout: 30000 });
    await this.page.waitForTimeout(1000);
  }

  rows() { return this.gridRows.filter({ hasText: /\S/ }); }
  async count() { return this.rows().count(); }
  openRows() { return this.rows().filter({ hasNot: this.page.locator('text=/completed|done/i') }); }

  /** Mark the first not-done task as done. Returns the task title, or '' if none open. */
  async markFirstDone() {
    const n = await this.count();
    for (let i = 0; i < n; i++) {
      const row = this.rows().nth(i);
      const txt = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (/completed|done/i.test(txt)) continue;
      const btn = row.locator('button, a.btn').filter({ hasText: /Mark Done|mark as done|complete/i }).first();
      if (!(await btn.count())) continue;
      const title = (txt.split('  ')[0] || txt).trim().slice(0, 60);
      await btn.click();
      await this.page.waitForTimeout(600);
      if (await this.page.locator('.modal.show:visible, .swal2-popup:visible').isVisible().catch(() => false)) await confirm(this.page, /done|complete|yes|confirm|mark/i).catch(() => {});
      await expectToast(this.page, /done|complet|success|marked/i, `Mark task "${title}" done`).catch(() => {});
      await this.page.waitForTimeout(800);
      return title;
    }
    return '';
  }
}

module.exports = { MyOnboardingTasksPage };
