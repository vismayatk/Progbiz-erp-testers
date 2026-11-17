'use strict';

/**
 * Accounts > Master > Ledgers  (/ledgers)
 *
 * Only one job here: make sure a QA bank ledger exists (created once, reused by every run, never
 * deleted). Bank ledgers go in the "Bank Accounts" group and also ask for a bank name, an account
 * number, a branch and an account type. No opening balance is entered, so the ledger starts at 0.
 */
const { BASE, settle } = require('./shared');

class LedgerPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) { this.page = page; }

  async goto() {
    await this.page.goto(`${BASE}/ledgers`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.page.locator('#ledger-name').waitFor({ state: 'visible', timeout: 40000 });
    await settle(this.page, 800);
  }

  /**
   * Create a bank ledger with this name. The caller checks first that it does not exist
   * (the Bank Deposit page lists every bank ledger).
   */
  async createBank(name, { bankName = 'QA Bank', accountNo = 'QA1234567890' } = {}) {
    const { page } = this;
    await this.goto();
    await page.locator('#ledger-name').fill(name);
    await page.locator('#account-group-id').selectOption({ label: await page.locator('#account-group-id option').evaluateAll((os) => (os.find((o) => /^Bank Accounts/.test((o.textContent || '').trim())) || {}).textContent) });
    await page.waitForTimeout(800);
    await page.locator('#bank-name').waitFor({ state: 'visible', timeout: 10000 });
    // the bank's own Branch drop-down: the one that starts at "Choose" and offers a branch
    const branch = page.locator('select').filter({ has: page.locator('option', { hasText: 'Main Branch' }) }).filter({ has: page.locator('option:text-is("Choose")') }).first();
    await branch.selectOption({ label: 'Main Branch' });
    await page.locator('#bank-name').fill(bankName);
    await page.locator('#acc-no').fill(accountNo);
    await page.locator('#account-type').selectOption({ label: 'Current' });
    await page.getByRole('button', { name: /\bSave\b/ }).filter({ visible: true }).last().click();
    await page.waitForTimeout(2500);
  }
}

module.exports = { LedgerPage };
