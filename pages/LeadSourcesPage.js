'use strict';

const { throwIfServerError } = require('../utils/helpers');

/**
 * CRM → Settings → Lead Sources  (/lead-sources)
 * Master list of lead sources. New Lead Source → #lead-source modal →
 * #lead-source-name (maxlength 30) → #btn-lead-source-save.
 */
class LeadSourcesPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    this.newBtn    = page.locator('a, button').filter({ hasText: /new lead source/i }).first();
    this.modal     = page.locator('#lead-source');
    this.nameInput = page.locator('#lead-source-name');
    this.saveBtn   = page.locator('#btn-lead-source-save');
    this.search    = page.locator('#filter-name');
    this.rows      = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/lead-sources`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await this.rows.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    console.log(`  📋 Lead Sources loaded: ${this.page.url()}`);
  }

  /** Create a new lead source; surfaces backend save errors clearly. */
  async create(name) {
    console.log(`  ➕ New Lead Source: "${name}"`);
    await this.newBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 });
    await this.nameInput.fill(name);
    await this.saveBtn.click();
    await throwIfServerError(this.page);
    await this.modal.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(1000);
  }

  /** Search the list for a name and report whether a row contains it. */
  async existsInList(name) {
    await this.search.fill(name);
    await this.page.waitForTimeout(2500);
    return this.page.evaluate((n) =>
      [...document.querySelectorAll('table tbody tr')]
        .some(r => (r.textContent || '').toLowerCase().includes(n.toLowerCase())),
      name);
  }

  /** Max length enforced on the name field. */
  async nameMaxLength() {
    return this.nameInput.evaluate(el => el.maxLength);
  }
}

module.exports = { LeadSourcesPage };
