'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit } = require('../FormKit');
const { expectToast, confirmSwal } = require('./reUi');

/**
 * /resignation-reasons — "Exit Reasons" master (SRS §7.1 reason source, FR-38).
 * Inline add-form row: Reason (text), Offered On (exit-type <select>), Order (number),
 * Active (#active), then "Save" / "Clear". Grid: # | Reason | Offered On | Order | Active | Action.
 * A filter box ("Filter by reason") sits above the grid. Reasons are a tenant-maintained master.
 */
class ResignationReasonsPage extends BasePage {
  constructor(page) {
    super(page, 'resignation-reasons');
    this.fk = new FormKit(page);
    this.filterBox = this.main.locator('input[placeholder*="Filter by reason" i]').first();
    // The reason input is the text box that is NOT the filter.
    this.reasonInput = this.main.locator('input[type="text"]:not([placeholder*="Filter" i]), input:not([type]):not([placeholder*="Filter" i])').first();
    this.offeredOn = this.main.locator('select').filter({ has: page.locator('option', { hasText: /^Resignation$/ }) }).first();
    this.orderInput = this.main.locator('input[type="number"]').first();
    this.activeChk = this.main.locator('#active');
    this.saveBtn = this.main.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first();
  }

  rowByReason(text) { return this.gridRows.filter({ hasText: text }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Exit Reasons heading').toContainText(/Exit Reasons|Reasons/i, { timeout: 30000 });
    await expect(this.reasonInput, 'the add-reason input').toBeVisible({ timeout: 20000 });
  }

  /** Add a reason and assert it lands in the grid (FR-38 master maintenance). */
  async addReason(spec) {
    await this.fk.setInput(this.reasonInput, spec.text, 'Reason');
    if (spec.offeredOn && await this.offeredOn.count()) await this.fk.setSelect(this.offeredOn, spec.offeredOn, 'Offered On', { loose: true });
    if (spec.order != null && await this.orderInput.count()) await this.orderInput.fill(String(spec.order)).catch(() => {});
    if (spec.active === false && await this.activeChk.isChecked().catch(() => true)) await this.activeChk.click({ force: true }).catch(() => {});
    if (spec.active !== false && await this.activeChk.count() && !(await this.activeChk.isChecked().catch(() => false))) await this.activeChk.click({ force: true }).catch(() => {});
    await this.saveBtn.click();
    await expectToast(this.page, /success|saved|added|created/i, 'Add exit reason').catch(() => {});
    // persisted: filter the grid to the new reason and assert the row.
    await this.goto();
    if (await this.filterBox.count()) { await this.filterBox.fill(spec.text).catch(() => {}); await this.page.waitForTimeout(900); }
    await expect(this.rowByReason(spec.text), `reason "${spec.text}" should be listed`).toBeVisible({ timeout: 20000 });
  }

  /** Negative: re-adding the same reason text should be refused (duplicate guard, §10). */
  async expectDuplicateRefused(text) {
    await this.goto();
    await this.fk.setInput(this.reasonInput, text, 'Reason (duplicate)');
    await this.saveBtn.click();
    // An error toast (already exists) is the pass; dismiss whatever appears.
    const said = (await this.page.locator('.swal2-popup, .toast, [role="alert"]').allInnerTexts().catch(() => [])).join(' ');
    expect(said, 'a duplicate reason should be rejected with a message').toMatch(/already|exist|duplicate|same/i);
  }
}

module.exports = { ResignationReasonsPage };
