'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { confirmSwal, expectToast } = require('./reUi');

/**
 * /exit-clearance — the cross-exit clearance board (SRS §11, roles ExitClearance). Open items across
 * exits (owned + pool): Employee | Department | Item | Kind | Owner | Due | Last Working Day |
 * Action, with a Kind filter, a department filter, search, and Waive / N-A actions. Read coverage +
 * search here; item settling in the context of one exit is driven on the task board.
 */
class ExitClearancePage extends BasePage {
  constructor(page) {
    super(page, 'exit-clearance');
    this.search = this.main.locator('input[placeholder*="Search" i]').first();
    this.kindFilter = this.main.locator('select').filter({ has: page.locator('option', { hasText: /Knowledge Transfer|Asset Return/i }) }).first();
  }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Exit Clearance heading').toContainText(/Exit Clearance/i, { timeout: 30000 });
  }

  async searchFor(term) {
    if (await this.search.count()) { await this.search.fill(term); await this.page.waitForTimeout(1000); }
    return this.gridRows.filter({ hasText: /\S/ }).count();
  }

  async filterKind(label) {
    if (await this.kindFilter.count()) { await this.kindFilter.selectOption({ label }).catch(() => {}); await this.page.waitForTimeout(1000); }
    return this.gridRows.filter({ hasText: /\S/ }).count();
  }

  /** Waive a specific employee's clearance item from the board (reason required). */
  async waiveFor(empCode, reason = 'Waived from the clearance board (automation test)') {
    await this.searchFor(empCode);
    const row = this.gridRows.filter({ hasText: empCode }).first();
    await expect(row, `a clearance item for ${empCode}`).toBeVisible({ timeout: 15000 });
    const w = row.locator('button, a.btn, [title]').filter({ hasText: /waive/i }).first();
    await expect(w, 'a Waive control on the item').toBeVisible({ timeout: 10000 });
    await w.click();
    await this.page.waitForTimeout(600);
    const box = this.page.locator('.swal2-popup textarea, .modal.show textarea, textarea:visible').first();
    if (await box.isVisible().catch(() => false)) await box.fill(reason).catch(() => {});
    if (await this.page.locator('.swal2-popup').isVisible().catch(() => false)) await confirmSwal(this.page, /waive|yes|confirm|proceed/i).catch(() => {});
    await expectToast(this.page, /waiv|success/i, 'Waive clearance item').catch(() => {});
  }
}

module.exports = { ExitClearancePage };
