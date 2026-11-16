'use strict';

/**
 * Reports > Inventory > Daily Report  (/daily-report)
 *
 * Day book for one branch and one date: every cash and bank ledger (plus the ledgers the day's
 * entries touched) with Opening, Debit, Credit and Closing, then an Invoice Summary by type.
 * Opening is blank when it is 0; a Credit closing reads "3500.00 Cr".
 */
const { BASE, num, parseSigned, settle } = require('./shared');

class DailyReportPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) { this.page = page; }

  // "Go Back" is an <a> without an href, so it has no link role: find it by its text
  get goBack() { return this.page.locator('a, button').filter({ hasText: /Go Back/ }).filter({ visible: true }).first(); }

  get dateInput() { return this.page.locator('input[type="date"]').filter({ visible: true }).first(); }

  async goto() {
    await this.page.goto(`${BASE}/daily-report`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.dateInput.or(this.goBack).first().waitFor({ state: 'visible', timeout: 40000 });
    await settle(this.page, 600);
  }

  /** The date the form opens on, as YYYY-MM-DD. The page keeps the last report in sessionStorage, so clear that first. */
  async defaultDate() {
    if (!this.page.url().includes('/daily-report')) await this.goto();
    await this.page.evaluate(() => sessionStorage.removeItem('report-state:daily-report'));
    await this.goto();
    return this.dateInput.inputValue();
  }

  /** The page remembers the last report: return to the form first. */
  async goBackToForm() {
    const back = this.goBack;
    if (await back.count()) {
      await back.click();
      await this.dateInput.waitFor({ state: 'visible', timeout: 15000 });
    }
  }

  /** Run the report for a date (YYYY-MM-DD). Returns what it shows. */
  async run(isoDate) {
    const { page } = this;
    if (!page.url().includes('/daily-report')) await this.goto();
    await this.goBackToForm();
    await this.dateInput.fill(isoDate);
    await this.dateInput.press('Tab');
    await page.getByRole('button', { name: /View Report/ }).click();
    await page.locator('table').filter({ hasText: 'Account Name' }).first().waitFor({ state: 'visible', timeout: 40000 });
    await settle(page, 800);
    return this.read();
  }

  /** Parse the report on screen. accounts: name -> { opening, debit, credit, closing } (signed: Dr +, Cr -). */
  async read() {
    const { page } = this;
    const tables = await page.locator('table').evaluateAll((ts) => ts.map((t) => [...t.querySelectorAll('tr')].map((r) => [...r.querySelectorAll('th,td')].map((c) => (c.innerText || '').trim()))));
    // The Invoice Summary table sits inside the same outer table, so walk the rows once: account rows first,
    // then everything after the "Invoice Type" header row is the invoice summary.
    const all = tables.find((t) => t.some((r) => r[0] === 'Account Name')) || [];
    const accounts = {};
    const invoices = {};
    let inInvoices = false;
    for (const r of all) {
      if (r[0] === 'Invoice Type') { inInvoices = true; continue; }
      if (!inInvoices) {
        // the company / report / branch / date lines are one-cell rows: data rows have all five columns
        if (r.length < 5 || !r[0] || r[0] === 'Account Name') continue;
        accounts[r[0]] = { opening: parseSigned(r[1]), debit: num(r[2]), credit: num(r[3]), closing: parseSigned(r[4]) };
      } else {
        if (r.length < 7 || !r[0]) continue;
        invoices[r[0]] = { gross: num(r[1]), discount: num(r[2]), tax: num(r[3]), net: num(r[4]), other: num(r[5]), total: num(r[6]), raw: r.slice(1) };
      }
    }
    const head = await page.locator('table').filter({ hasText: 'Account Name' }).first().innerText();
    return {
      date: (head.match(/Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1] || '',
      company: (head.split('\n').map((s) => s.trim()).filter(Boolean)[0]) || '',
      accounts,
      invoices,
    };
  }

  /** account name -> closing (signed), or 0 when the account is not on the report. */
  static closing(rep, name) { return rep.accounts[name] ? rep.accounts[name].closing : 0; }
}

module.exports = { DailyReportPage };
