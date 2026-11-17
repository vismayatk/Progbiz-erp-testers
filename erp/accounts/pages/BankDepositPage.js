'use strict';

/**
 * Accounts > Bank Deposit / Withdrawal  (/bank-deposit)
 *
 * One form posts a contra voucher: pick the bank account, Deposit or Withdrawal, the other side
 * (a cash account, or another bank account), amount, reference and narration. The balance of the
 * bank and of the other account shows under each drop-down ("Balance: 4000.00 Cr").
 */
const { BASE, parseBalance, outcome, closeDialog, settle } = require('./shared');

const SAVED = /Voucher\s+\S+\s+saved/i;

class BankDepositPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.bank = page.locator('#bd-bank');
    this.other = page.locator('#bd-other');
    this.amount = page.locator('#bd-amount');
    this.ref = page.locator('#bd-ref');
    this.narration = page.locator('#bd-narration');
    this.voucherNo = page.locator('#bd-no');
  }

  async goto() {
    await this.page.goto(`${BASE}/bank-deposit`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.bank.waitFor({ state: 'visible', timeout: 40000 });
    await settle(this.page, 800);
  }

  /** [{value, text}] of a <select>, without the "Choose" placeholder. */
  async options(select) {
    return select.locator('option').evaluateAll((os) => os
      .map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
      .filter((o) => o.value && o.value !== '0' && !/^(--|choose)/i.test(o.text)));
  }

  async chooseBank(name) {
    const opt = (await this.options(this.bank)).find((o) => o.text === name);
    if (!opt) throw new Error(`bank account "${name}" is not in the list`);
    await this.bank.selectOption(opt.value);
    await this.page.waitForTimeout(900);
  }

  async chooseOther(name) {
    const opt = (await this.options(this.other)).find((o) => o.text === name);
    if (!opt) throw new Error(`account "${name}" is not in the list`);
    await this.other.selectOption(opt.value);
    await this.page.waitForTimeout(900);
  }

  /** @param {'Deposit'|'Withdrawal'} kind */
  async mode(kind) {
    // the tab carries an arrow icon whose glyph is part of its accessible name, so match the word, not the whole name
    await this.page.getByRole('button', { name: new RegExp(`\\b${kind}\\b`) }).first().click();
    await this.page.waitForTimeout(500);
  }

  /** @param {'Cash'|'Another bank account'} kind  which kind of account is on the other side */
  async source(kind) {
    await this.page.getByRole('button', { name: new RegExp(`^\\s*${kind}\\s*$`, 'i') }).click();
    await this.page.waitForTimeout(500);
  }

  /** Signed balance shown under a drop-down (Dr +, Cr -); null when nothing is chosen yet. */
  async balanceUnder(selectId) {
    const text = await this.page.evaluate((id) => {
      const el = document.getElementById(id);
      const other = id === 'bd-bank' ? 'bd-other' : 'bd-bank';
      let n = el;
      for (let i = 0; i < 4 && n; i++) {
        n = n.parentElement;
        if (!n || n.querySelector('#' + other)) break;
        const m = (n.innerText || '').match(/Balance:[^\n]*/);
        if (m) return m[0];
      }
      return '';
    }, selectId);
    return parseBalance(text);
  }
  bankBalance() { return this.balanceUnder('bd-bank'); }
  otherBalance() { return this.balanceUnder('bd-other'); }

  async nextVoucherNo() { return (await this.voucherNo.inputValue()).trim(); }

  async fill({ amount, ref, narration } = {}) {
    if (amount !== undefined) { await this.amount.fill(String(amount)); await this.amount.press('Tab'); }
    if (ref !== undefined) { await this.ref.fill(ref); await this.ref.press('Tab'); }
    if (narration !== undefined) { await this.narration.fill(narration); await this.narration.press('Tab'); }
  }

  /** Press Save. Returns { kind, text, voucher }; a blocking dialog is left open for the caller. */
  async save() {
    await this.page.getByRole('button', { name: /\bSave\b/ }).filter({ visible: true }).first().click();
    const r = await outcome(this.page, SAVED);
    const m = r.text.match(/Voucher\s+(\S+)\s+saved/i);
    return { ...r, voucher: m ? m[1] : null };
  }

  async dismiss(button) { await closeDialog(this.page, button); }
}

module.exports = { BankDepositPage };
