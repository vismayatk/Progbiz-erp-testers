'use strict';

/**
 * Accounts > Staff Cash  (/staff-cash)
 *
 * Give a staff member petty cash (paid from a cash or bank account) or collect it back (received into
 * one). The staff drop-down shows how much each person holds ("Anciya · 9,100.00"), the page shows
 * "Cash with this person: ..." once someone is chosen, and collecting more than they hold asks first.
 */
const { BASE, num, parseBalance, outcome, closeDialog, settle } = require('./shared');

const SAVED = /Voucher\s+\S+\s+saved/i;

class StaffCashPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.staff = page.locator('#sc-staff');
    this.account = page.locator('#sc-account');
    this.amount = page.locator('#sc-amount');
    this.narration = page.locator('#sc-narration');
    this.voucherNo = page.locator('#sc-no');
  }

  async goto() {
    await this.page.goto(`${BASE}/staff-cash`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.staff.waitFor({ state: 'visible', timeout: 40000 });
    await settle(this.page, 800);
  }

  /** [{value, text}] for the staff list. */
  async staffOptions() {
    return this.staff.locator('option').evaluateAll((os) => os
      .map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
      .filter((o) => o.value && o.value !== '0'));
  }

  /** Cash a person holds, from the drop-down text ("Anciya · 9,100.00" -> 9100; a person with none shows no figure -> 0). */
  async heldBy(name) {
    const o = (await this.staffOptions()).find((x) => x.text === name || x.text.startsWith(`${name} ·`));
    if (!o) throw new Error(`staff "${name}" is not in the list`);
    const m = o.text.match(/·\s*([\d,]+(?:\.\d+)?)/);
    return m ? num(m[1]) : 0;
  }

  async chooseStaff(name) {
    const o = (await this.staffOptions()).find((x) => x.text === name || x.text.startsWith(`${name} ·`));
    if (!o) throw new Error(`staff "${name}" is not in the list`);
    await this.staff.selectOption(o.value);
    await this.page.waitForTimeout(900);
  }

  /** @param {'Give Cash'|'Collect Cash'} kind */
  async mode(kind) {
    // the tab carries an icon whose glyph is part of its accessible name, so match the words, not the whole name
    await this.page.getByRole('button', { name: new RegExp(`\\b${kind}\\b`) }).first().click();
    await this.page.waitForTimeout(500);
  }

  /** Choose the cash or bank account on the other side by its name. */
  async chooseAccount(name) {
    const opts = await this.account.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() })));
    const o = opts.find((x) => x.text === name);
    if (!o) throw new Error(`account "${name}" is not in the list`);
    await this.account.selectOption(o.value);
    await this.page.waitForTimeout(900);
  }

  /** "Cash with this person: 9,100.00" -> 9100, or null when no one is chosen. */
  async cashWithPerson() {
    const t = await this.page.locator('text=/Cash with this person:/').first().innerText().catch(() => '');
    return t ? num(t.replace(/.*Cash with this person:/s, '')) : null;
  }

  /** Signed balance of the chosen account, shown under it ("Balance: 7860.00 Dr"). */
  async accountBalance() {
    const text = await this.page.evaluate(() => {
      const el = document.getElementById('sc-account');
      let n = el;
      for (let i = 0; i < 4 && n; i++) {
        n = n.parentElement;
        const m = n && (n.innerText || '').match(/Balance:[^\n]*/);
        if (m) return m[0];
      }
      return '';
    });
    return parseBalance(text);
  }

  async collectAllChip() { return this.page.getByRole('button', { name: /Collect all/i }); }

  async fill({ amount, narration } = {}) {
    if (amount !== undefined) { await this.amount.fill(String(amount)); await this.amount.press('Tab'); }
    if (narration !== undefined) { await this.narration.fill(narration); await this.narration.press('Tab'); }
  }

  /** Press Save. Returns { kind, text, voucher }. A dialog (validation, or the collect-more question) stays open. */
  async save() {
    await this.page.getByRole('button', { name: /\bSave\b/ }).filter({ visible: true }).first().click();
    const r = await outcome(this.page, SAVED);
    const m = r.text.match(/Voucher\s+(\S+)\s+saved/i);
    return { ...r, voucher: m ? m[1] : null };
  }

  /** Answer the "Collect it anyway?" question. */
  async answerCollectMore(yes) {
    await closeDialog(this.page, yes ? 'confirm' : 'cancel');
    if (!yes) return null;
    const r = await outcome(this.page, SAVED);
    const m = r.text.match(/Voucher\s+(\S+)\s+saved/i);
    return { ...r, voucher: m ? m[1] : null };
  }

  async dismiss(button) { await closeDialog(this.page, button); }
}

module.exports = { StaffCashPage };
