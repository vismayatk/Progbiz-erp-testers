'use strict';

/**
 * Accounts > Contras  (/contra-vouchers) and the voucher view it opens (/voucher-view/<id>).
 *
 * The list is slow to fill (a second call after the count), so it waits for rows. A voucher is
 * found by its journal number ("C-5"), which Bank Deposit and Staff Cash both report when they save.
 */
const { BASE, num, settle } = require('./shared');

class ContraPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) { this.page = page; }

  async goto() {
    await this.page.goto(`${BASE}/contra-vouchers`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.page.locator('table thead').first().waitFor({ state: 'visible', timeout: 40000 });
    await this.page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});
    await settle(this.page, 600);
  }

  /** Journal numbers on the page, in the order shown. */
  async journalNumbers() {
    return this.page.locator('table tbody tr').evaluateAll((rows) => rows.map((r) => {
      const c = [...r.querySelectorAll('td')].map((td) => (td.innerText || '').trim());
      return c[3] || '';
    }));
  }

  /** Open the voucher with this journal number. If it is not on the first page, sort by Date the other way and look again. */
  async open(journalNo) {
    const { page } = this;
    await this.goto();
    const row = () => page.locator('table tbody tr').filter({ has: page.locator('td', { hasText: new RegExp(`^\\s*${journalNo}\\s*$`) }) }).first();
    if (!(await row().count())) {
      await page.locator('table thead th', { hasText: 'Date' }).first().click().catch(() => {});
      await page.waitForTimeout(3000);
    }
    if (!(await row().count())) throw new Error(`contra ${journalNo} is not on the contra list (first page)`);
    await row().click();
    await page.waitForURL(/voucher-view/, { timeout: 20000 });
    await page.locator('table').first().waitFor({ state: 'visible', timeout: 20000 });
    await settle(page, 600);
  }

  /** What the voucher view shows: journal no, narration ("Particular") and the ledger lines. */
  async read() {
    const { page } = this;
    const text = await page.locator('main, .main-content').first().innerText();
    const lines = await page.locator('table').first().locator('tbody tr').evaluateAll((rows) => rows.map((r) => {
      const c = [...r.querySelectorAll('td')].map((td) => (td.innerText || '').trim());
      return { ledger: c[0] || '', debit: c[1] || '', credit: c[2] || '' };
    }));
    return {
      journalNo: (text.match(/Journal No\s*:\s*#?(\S+)/i) || [])[1] || '',
      type: (text.match(/Voucher Type Name\s*:\s*(.+)/i) || [])[1]?.trim() || '',
      particular: (text.match(/Particular\s*:\s*(.+)/i) || [])[1]?.trim() || '',
      lines: lines.filter((l) => l.ledger).map((l) => ({ ledger: l.ledger, debit: num(l.debit), credit: num(l.credit) })),
    };
  }
}

module.exports = { ContraPage };
