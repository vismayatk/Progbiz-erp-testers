'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit, waitVisible } = require('../FormKit');
const { expectToast } = require('./wfhUi');

/**
 * /wfh-apply-for-employee — "Add Work From Home for Employee" (role WfhManagement).
 * Filters From / To / Search; grid Sl No | Employee | From | To | Days | Reason | Status | Added by.
 * "Add" opens a modal (§7.4): Employee * (select), From * / To * (dates), Half day (#hr-wfh-half →
 * First/Second half), Reason * (textarea). Saved WFH is approved at once (bypasses notice / past
 * window / monthly limit / emergency cap), limited to employees in the viewer's leave visibility.
 */
class WfhHrAddPage extends BasePage {
  constructor(page) {
    super(page, 'wfh-apply-for-employee');
    this.fk = new FormKit(page);
    this.addBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*Add\s*$|Add Work From Home/i }).first();
  }

  modalScope() { return this.page.locator('.modal.show:visible, .offcanvas.show:visible, [role="dialog"]:visible').first(); }
  rowMatching(text) { return this.gridRows.filter({ hasText: text }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Add Work From Home for Employee heading').toContainText(/Add Work From Home for Employee/i, { timeout: 30000 });
    await this.addBtn.waitFor({ state: 'visible', timeout: 20000 });
  }

  /**
   * Add a WFH day for an employee (approved at once).
   * @param {{employee:string, from:string, to?:string, reason:string, half?:boolean, halfType?:1|2}} o
   *   `employee` is a substring of the option, e.g. "[pbhrms0385]" or the display name.
   */
  async addFor(o) {
    const days = (o.days && o.days.length) ? o.days : [o.from];
    await this.addBtn.click();
    const m = this.modalScope();
    await expect(m, 'the Add Work From Home modal opens').toBeVisible({ timeout: 15000 });
    await this.fk.pickByOption(m, o.employee, 'Employee');
    const dates = m.locator('input[type="date"]');
    if (o.half) {
      const half = m.locator('#hr-wfh-half');
      if (!(await half.isChecked().catch(() => false))) await half.click({ force: true });
      await this.page.waitForTimeout(300);
      await m.locator(o.halfType === 2 ? '#wfh-h2, #hr-wfh-h2' : '#wfh-h1, #hr-wfh-h1').first().click({ force: true }).catch(() => {});
    }
    await m.locator('textarea').first().fill(o.reason);
    const save = m.locator('button').filter({ hasText: /^\s*(Save|Add)\s*$/i }).first();
    // Try each candidate day; the live check disables Save on a clash (already requested / blackout).
    let usedDay = null, lastWhy = '';
    for (const day of days) {
      await dates.nth(0).fill(day); await dates.nth(0).evaluate(e => e.blur()).catch(() => {});
      await dates.nth(1).fill(day).catch(() => {}); await dates.nth(1).evaluate(e => e.blur()).catch(() => {});
      await this.page.waitForTimeout(2000);
      if (await save.isEnabled().catch(() => false)) { usedDay = day; break; }
      lastWhy = (await m.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    }
    if (!usedDay) throw new Error(`HR Add: no candidate day was accepted (Save stayed disabled) — last: "${lastWhy}"`);
    await save.click();
    const said = await expectToast(this.page, /work from home (approved for \d|added)/i, 'HR Add for Employee');
    await expect(m, 'the Add modal closes').toBeHidden({ timeout: 15000 }).catch(() => {});
    return { said, day: usedDay };
  }

  /** The on-behalf list should list a row carrying `reason` after a reload. The list defaults to a
   *  date range ("…in these dates"), so widen From/To to cover a future entry before checking. */
  async verifyListed(reason) {
    await this.goto();
    await this.page.waitForTimeout(1500);
    const pad = n => String(n).padStart(2, '0');
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const from = new Date(); from.setDate(from.getDate() - 2);
    const to = new Date(); to.setDate(to.getDate() + 45);
    const dateFilters = this.main.locator('input[type="date"]');
    if (await dateFilters.count() >= 2) {
      await dateFilters.nth(0).fill(iso(from)).catch(() => {});
      await dateFilters.nth(1).fill(iso(to)).catch(() => {});
      await this.page.waitForTimeout(1500);
    }
    const row = this.rowMatching(reason);
    await expect(row, `the on-behalf list should show "${reason}"`).toBeVisible({ timeout: 20000 });
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
  }
}

module.exports = { WfhHrAddPage };
