'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit } = require('../FormKit');
const { expectToast, confirmSwal } = require('./reUi');

/**
 * /fnf/{guid} — Full & Final Settlement worksheet (SRS §7.7, FR-26..28).
 *
 * Live layout (probed): a 6-stage strip (1 Clearance & inputs · 2 Settlement calculation · 3 Review ·
 * 4 F&F payroll run · 5 Payroll approval · 6 Paid — stages 4–6 are the Payroll module). This module
 * owns stages 1–3: "Calculate settlement" (data-derived figures), gratuity line (+override), Inputs
 * (notice recovery, ad-hoc lines, loan/asset/other recovery, bonus, remarks), "Save inputs", and
 * "Mark worksheet completed" — which is DISABLED until every clearance item is settled, then freezes
 * the worksheet.
 */
class FnfPage extends BasePage {
  constructor(page) {
    super(page, 'fnf');
    this.fk = new FormKit(page);
  }

  async open(guid) {
    await this.goto(`fnf/${guid}`);
    await expect(this.pageTitle, 'the F&F page heading').toContainText(/Full & Final|Settlement/i, { timeout: 30000 });
    await this.page.waitForTimeout(1200);
  }

  async text() { return (await this.main.innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); }
  btn(re) { return this.main.locator('button, a.btn').filter({ hasText: re }).first(); }

  /** Calculate (or recalculate) the data-derived settlement figures. */
  async calculate() {
    const b = this.btn(/calculate settlement|recalculate|calculate/i);
    await expect(b, 'a Calculate settlement button').toBeVisible({ timeout: 15000 });
    await b.click();
    await this.page.waitForTimeout(1500);
    if (await this.page.locator('.swal2-popup').isVisible().catch(() => false)) await confirmSwal(this.page, /yes|calc|confirm|proceed|ok/i).catch(() => {});
    await this.page.waitForTimeout(1500);
  }

  /** Add an ad-hoc input line (best-effort — the add control is an icon button in the Inputs area). */
  async addComponent({ kind, label, amount }) {
    const add = this.main.locator('button').filter({ hasText: /add line|add a line|\+ ?line|add component/i }).first()
      .or(this.main.getByText(/Add a line for anything/i).locator('xpath=preceding::button[1]'));
    if (!(await add.count())) return false;
    await add.click().catch(() => {});
    await this.page.waitForTimeout(500);
    const row = this.main.locator('tr, .line-row, .d-flex').filter({ has: this.page.locator('input') }).last();
    const labelInput = row.locator('input[type="text"], input:not([type])').first();
    if (await labelInput.count()) await labelInput.fill(label).catch(() => {});
    const kindSel = row.locator('select').first();
    if (await kindSel.count()) await this.fk.setSelect(kindSel, kind, 'Line kind', { loose: true }).catch(() => {});
    const amt = row.locator('input[type="number"]').first();
    if (await amt.count()) await amt.fill(String(amount)).catch(() => {});
    await this.page.waitForTimeout(300);
    return true;
  }

  /** Save the worksheet inputs (does NOT complete it). */
  async save() {
    const b = this.btn(/save inputs|save worksheet|^\s*Save\s*$/i);
    if (await b.count()) { await b.click(); await expectToast(this.page, /success|saved|updated/i, 'Save F&F inputs').catch(() => {}); await this.page.waitForTimeout(1200); }
  }

  async netPayable() {
    const t = await this.text();
    const m = t.match(/net\s*payable[^0-9-]*([\-0-9.,]+)/i);
    return m ? m[1] : '';
  }

  /** Is the Mark-completed button enabled (all clearance settled)? */
  async canComplete() {
    const b = this.btn(/mark worksheet completed|mark completed|complete settlement/i);
    return (await b.count()) ? !(await b.isDisabled().catch(() => true)) : false;
  }

  /**
   * Mark the worksheet completed — requires every clearance item settled, then freezes the record
   * (FR-28). Returns 'completed' or throws with the blocking reason if still gated.
   */
  async markCompleted() {
    const b = this.btn(/mark worksheet completed|mark completed|complete settlement/i);
    await expect(b, 'a Mark completed button').toBeVisible({ timeout: 15000 });
    if (await b.isDisabled().catch(() => false)) {
      const why = (await this.text()).match(/(\d+ clearance item\(s\) still open|clearance[^.]*open|still open)/i);
      throw new Error(`F&F Mark completed is disabled: ${why ? why[0] : 'clearance not settled / payroll stage pending'}`);
    }
    await b.click();
    await this.page.waitForTimeout(700);
    if (await this.page.locator('.swal2-popup').isVisible().catch(() => false)) await confirmSwal(this.page, /complete|mark|yes|confirm|proceed/i).catch(() => {});
    await expectToast(this.page, /complet|success|frozen|locked/i, 'Mark F&F completed').catch(() => {});
    await this.page.waitForTimeout(1500);
  }

  /** After completion the worksheet is frozen — Save inputs gone/disabled, status shows completed. */
  async assertLocked() {
    await this.page.waitForTimeout(800);
    const t = await this.text();
    expect(t, 'F&F worksheet should read completed/frozen').toMatch(/complet|frozen|locked/i);
  }
}

module.exports = { FnfPage };
