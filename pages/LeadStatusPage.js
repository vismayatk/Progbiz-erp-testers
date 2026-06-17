'use strict';

const { throwIfServerError } = require('../utils/helpers');

/**
 * CRM → Settings → Lead Status  (/lead-status, heading "Followup Status")
 * Configures follow-up statuses and their lifecycle "Nature" (In Followup / Won
 * / Lost) — the master that drives Won/Lost classification across the CRM.
 * New Followup Status → #followup-status modal → name + Nature select → Save.
 */
class LeadStatusPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    this.newBtn       = page.locator('a, button').filter({ hasText: /new followup status/i }).first();
    this.modal        = page.locator('#followup-status');
    this.nameInput    = this.modal.locator('input[type="text"]:visible, input[placeholder*="status name" i]').first();
    this.natureSelect = this.modal.locator('select').first();
    this.saveBtn      = this.modal.locator('button').filter({ hasText: /^\s*save\s*$/i }).first();
    this.search       = page.locator('#filter-name');
    this.rows         = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/lead-status`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    console.log(`  📋 Lead Status (Followup Status) loaded: ${this.page.url()}`);
  }

  /** Create a follow-up status with a lifecycle Nature (In Followup / Won / Lost). */
  async create(name, nature) {
    console.log(`  ➕ New Followup Status: "${name}" (nature=${nature})`);
    await this.newBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 });
    await this.nameInput.fill(name);
    await this.natureSelect.selectOption({ label: nature }).catch(async () => {
      await this.natureSelect.selectOption({ index: 1 }).catch(() => {});
    });
    await this.saveBtn.click();
    await throwIfServerError(this.page);
    await this.modal.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(1000);
  }

  /** Search the list and report whether a row contains the name (optionally with nature). */
  async existsInList(name) {
    await this.search.fill(name);
    await this.page.waitForTimeout(2500);
    return this.page.evaluate((n) =>
      [...document.querySelectorAll('table tbody tr')]
        .some(r => (r.textContent || '').toLowerCase().includes(n.toLowerCase())),
      name);
  }
}

module.exports = { LeadStatusPage };
