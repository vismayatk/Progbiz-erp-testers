'use strict';

/**
 * Sales > Invoices (/sales-invoice) and Purchase > Purchase Invoices (/purchase-invoice).
 *
 * Both pages share one layout: a party picker (#invoice-party), an item picker (#item-search-input),
 * a rate box (#footer-unit-rate) and quantity box in the entry row, a green "+" that adds the line,
 * a Total Summary box, a Discount box, "Pay Using" payment rows and Save (the card layout of the 12 Nov 2026
 * build also has "Save as Draft" / "Save & Confirm"; the plain layout seen again on 14 Nov has Save). The sales page lists
 * customers and opens the customer modal; the purchase page lists suppliers and has a "Set selling
 * price" tag on every line.
 *
 * Payment rows: the entry row at the bottom ("Cash", amount, "+") adds a row; a row for Credit shows
 * only when a party is chosen. When the total changes, the Credit row absorbs the difference.
 */
const { BASE, num, outcome, closeDialog, settle } = require('../../accounts/pages/shared');
const { dismissRateLimit } = require('../../common/helpers');

class InvoicePage {
  /** @param {import('@playwright/test').Page} page  @param {'sales'|'purchase'} kind */
  constructor(page, kind) {
    this.page = page;
    this.kind = kind;
    this.route = kind === 'sales' ? '/sales-invoice' : '/purchase-invoice';
    this.listRoute = kind === 'sales' ? '/sales-invoices' : '/purchase-invoices';
    this.trigger = page.locator('#invoice-party');
    this.itemInput = page.locator('#item-search-input');
    this.rate = page.locator('#footer-unit-rate');
  }

  async goto() {
    await this.page.goto(`${BASE}${this.route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.backOff();
    await this.trigger.waitFor({ state: 'visible', timeout: 40000 });
    await settle(this.page, 800);
  }

  /** The tenant throttles bursts ("Too many requests"): dismiss the dialog and give it time to recover. */
  async backOff() {
    if (await dismissRateLimit(this.page)) {
      await this.page.waitForTimeout(20000);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await settle(this.page, 800);
    }
  }

  /** Put text in a search box with ONE input event (typing key by key sends a search per key and trips the throttle). */
  async search(box, text, ready) {
    await box.click();
    await box.fill(text);
    await this.page.waitForTimeout(2000);
    if (await ready().count()) return;
    // some builds only search on a key press: one space and one backspace, two requests at most
    await this.page.keyboard.press('Space');
    await this.page.keyboard.press('Backspace');
    await this.page.waitForTimeout(2200);
  }

  /** ---- party -------------------------------------------------------------------------------------------- */

  /** Search the picker for a party and choose it. Returns false when there is no such party. */
  async pickParty(name) {
    const { page } = this;
    await this.trigger.click();
    const panel = page.locator('.pp-panel');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    const box = panel.locator('input').first();
    const opt = panel.locator('.pp-option').filter({ hasText: name }).first();
    await this.search(box, name, () => opt);
    if (!(await opt.count())) { await page.keyboard.press('Escape').catch(() => {}); return false; }
    await opt.click();
    await page.waitForTimeout(900);
    return true;
  }

  async selectedParty() { return (await this.trigger.innerText()).replace(/\s+/g, ' ').trim(); }

  /** A party whose phone is already used by another party gets "Do you still want to save?": answer yes (a QA fixture). */
  async confirmDuplicatePhone() {
    const dlg = this.page.locator('.swal2-popup:visible').filter({ hasText: /still want to save/i });
    if (await dlg.first().waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await this.page.locator('.swal2-confirm:visible').first().click();
    }
  }

  /** Choose the supplier, creating it first (name + phone) when it is missing. */
  async ensureSupplier(name, phone = '501230011') {
    const { page } = this;
    if (await this.pickParty(name)) return;
    await this.trigger.click();
    await page.locator('.pp-panel .pp-footer').click();
    const modal = page.locator('.modal.show').last();
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await modal.getByPlaceholder('please enter company name').fill(name);
    await modal.getByPlaceholder('please enter phone number').fill(phone);
    await modal.getByRole('button', { name: /^\s*Save\s*$/ }).click();
    await this.confirmDuplicatePhone();
    await modal.waitFor({ state: 'hidden', timeout: 20000 });
    await page.waitForTimeout(1200);
    if (!(await this.selectedParty()).includes(name)) await this.pickParty(name);
  }

  /** Choose the customer, creating it first (display name + phone) when it is missing. */
  async ensureCustomer(name, phone = '9000000099') {
    const { page } = this;
    if (await this.pickParty(name)) return;
    await this.trigger.click();
    await page.locator('.pp-panel .pp-footer').click();
    const modal = page.locator('.modal.show').last();
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await modal.locator('#first-name').fill(name);
    await modal.locator('#cust-disp-ind').fill(name);
    await modal.locator('#customer-phone-input').fill(phone);
    await modal.locator('#btn-customer-save').click();
    await this.confirmDuplicatePhone();
    await modal.waitFor({ state: 'hidden', timeout: 20000 });
    await page.waitForTimeout(1200);
    if (!(await this.selectedParty()).includes(name)) await this.pickParty(name);
  }

  /** ---- lines -------------------------------------------------------------------------------------------- */

  /** Choose an item in the entry row, set rate and quantity, and add the line. */
  async addLine({ item, rate, qty }) {
    const { page } = this;
    const opt = page.locator('.ip-option').filter({ has: page.locator('.ip-name', { hasText: item }) }).first();
    await this.search(this.itemInput, item, () => opt);
    await opt.click();
    await page.waitForTimeout(600);
    if (rate !== undefined) { await this.rate.fill(String(rate)); await this.rate.press('Tab'); }
    const qtyBox = this.rate.locator('xpath=following::input[contains(@class,"number")][1]');
    await qtyBox.fill(String(qty));
    await qtyBox.press('Tab');
    await this.rate.locator('xpath=following::button[contains(@class,"btn-icon")][1]').click();
    await page.waitForTimeout(900);
  }

  /** The row of an added line (it holds the item name and its own rate and quantity boxes). */
  lineRow(item) {
    return this.page.locator('table tr').filter({ hasText: item }).filter({ has: this.page.locator('input') }).last();
  }

  async setLineQty(item, qty) {
    const box = this.lineRow(item).locator('input').nth(1);
    await box.fill(String(qty)); await box.press('Tab');
    await this.page.waitForTimeout(900);
  }

  async setLineRate(item, rate) {
    const box = this.lineRow(item).locator('input').nth(0);
    await box.fill(String(rate)); await box.press('Tab');
    await this.page.waitForTimeout(900);
  }

  /** ---- totals and discount -------------------------------------------------------------------------------- */

  /**
   * Total Summary: { quantity, gross, tax, discount, total, balance, raw }. Balance is 0 when the box shows none.
   *
   * The page has had two layouts and the test host has switched between them, so both are read:
   *   card layout  (12 Nov 2026 build): a ".card-title" "Total Summary", rows ".inv-sum-row" (two spans), discount in ".inv-charge"
   *   plain layout (14 Nov 2026 build): a <p> "Total Summary", rows ".d-flex.justify-content-between" (label, value)
   */
  async summary() {
    const raw = await this.page.evaluate(() => {
      const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const out = {};
      const head = [...document.querySelectorAll('.card-title, p, h5, h6')].find((e) => /^Total Summary$/i.test(t(e.textContent)));
      const box = head && (head.closest('.card') || head.parentElement);
      if (!box) return out;
      box.querySelectorAll('.inv-sum-row, .d-flex.justify-content-between').forEach((r) => {
        const kids = [...r.children];
        if (kids.length < 2) return;
        const k = t(kids[0].textContent);
        if (k) out[k] = t(kids[kids.length - 1].textContent);
      });
      const ch = box.querySelector('.inv-charge .inv-charge-value');
      if (ch) out.Discount = t(ch.textContent).replace(/^—$/, '0');
      if (out['Balance To Pay'] === undefined) {   // card layout: the balance row sits under the payments
        const bal = [...document.querySelectorAll('.inv-sum-row')].find((r) => /Balance To Pay/.test(r.textContent || ''));
        if (bal) out['Balance To Pay'] = t(bal.lastElementChild.textContent);
      }
      return out;
    });
    const n = (k) => (raw[k] === undefined ? 0 : num(raw[k]));
    return { quantity: n('Quantity'), gross: n('Gross Amount'), tax: n('Tax'), discount: n('Discount'), total: n('Total Payable'), balance: n('Balance To Pay'), raw };
  }

  /** Invoice-level discount as a percentage. */
  async discountPercent(p) {
    const box = this.page.locator('input[id^="charge_perc"]').first();
    await box.fill(String(p)); await box.press('Tab');
    await this.page.waitForTimeout(900);
  }

  /** ---- payments ----------------------------------------------------------------------------------------- */

  /** The "Pay Using" block: the card around its title (card layout) or the block that holds its <p> (plain layout). */
  get payArea() {
    const card = this.page.locator('.card').filter({ has: this.page.locator('.card-title', { hasText: /Pay Using/ }) });
    const plain = this.page.locator('p').filter({ hasText: /^\s*Pay Using:?\s*$/ }).locator('xpath=..');
    return card.or(plain).last();
  }

  /** Fill the entry row of "Pay Using" (method + amount) and press its "+". */
  async pay(method, amount) {
    const area = this.payArea;
    await area.locator('select').last().selectOption({ label: method });
    await this.page.waitForTimeout(500);
    if (amount !== undefined) {
      const box = area.locator('input[placeholder="Amount"]').last();
      await box.fill(String(amount)); await box.press('Tab');
    }
    // "+" of the entry row: title "Add payment" on the card layout, a bare plus icon on the plain one
    await area.locator('button[title="Add payment"], button:has(i.bi-plus-lg)').last().click();
    await this.page.waitForTimeout(900);
  }

  /**
   * The payment area: { text, inputs, rows }.
   *   text    what the block shows, without the option lists of its dropdowns
   *   rows    the committed payments [{ method, amount }] of the plain layout
   *   inputs  every amount in the block: the values of its boxes and the amounts shown as text
   *           (a committed amount is text on the plain layout and sits in a box on the card layout)
   */
  async paymentSnapshot() {
    const data = await this.payArea.evaluate((el) => {
      const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const clone = el.cloneNode(true);
      clone.querySelectorAll('select').forEach((s) => s.remove());
      const rows = [...el.querySelectorAll('.border.rounded')].map((r) => {
        const box = r.querySelector('input');
        return { method: t((r.querySelector('.fw-semibold') || {}).textContent), amount: box ? box.value : t((r.querySelector('.cursor-pencil, .text-end') || {}).textContent) };
      });
      return { text: t(clone.textContent), inputs: [...el.querySelectorAll('input')].map((i) => i.value).filter((v) => v !== ''), rows };
    });
    data.inputs = data.inputs.concat(data.rows.map((r) => r.amount).filter(Boolean));
    return data;
  }

  /** ---- save --------------------------------------------------------------------------------------------- */

  /** Press Save. { kind: 'saved', url } when it returns to the list; { kind: 'dialog', text } for a refusal. */
  async save() {
    const { page } = this;
    await page.locator('#btn-save-confirm, button[type="submit"]').filter({ hasText: /^\s*Save(\s*&\s*Confirm)?\s*$/ }).filter({ visible: true }).first().click();   // 12 Nov: "Save & Confirm" (#btn-save-confirm) next to "Save as Draft"
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      if (page.url().includes(this.listRoute)) return { kind: 'saved', text: '', url: page.url() };
      const dlg = await page.locator('.swal2-popup:visible').allInnerTexts().catch(() => []);
      if (dlg.length) {
        const text = dlg[0].replace(/\s+/g, ' ').trim();
        if (/saved successfully|success/i.test(text) && !/oops|cant save|please check/i.test(text)) {
          // "Invoice saved successfully": confirm it and let the page return to the list
          await closeDialog(page);
          await page.waitForURL((u) => u.href.includes(this.listRoute), { timeout: 20000 }).catch(() => {});
          return { kind: 'saved', text, url: page.url() };
        }
        return { kind: 'dialog', text };
      }
      await page.waitForTimeout(300);
    }
    return { kind: 'none', text: '' };
  }

  async dismiss() { await closeDialog(this.page); }

  /** ---- selling price modal (purchase) ------------------------------------------------------------------- */

  async openSellingPrice(item) {
    await this.lineRow(item).locator('button:has(i.ri-price-tag-3-line)').click();
    const modal = this.page.locator('.modal.show').filter({ hasText: /Selling Price/ }).last();
    await modal.waitFor({ state: 'visible', timeout: 15000 });
    await this.page.waitForTimeout(800);
    return modal;
  }

  /** { cost, rows: [{ label, price, pct, amount, negative }] } read from the open modal. */
  async sellingPrice() {
    return this.page.evaluate(() => {
      const m = [...document.querySelectorAll('.modal.show')].pop();
      const t = (m.innerText || '').replace(/,/g, '');
      const cost = Number(((t.match(/Cost \(this purchase\)\s*([\d.]+)/) || [])[1]) || 0);
      const rows = [...m.querySelectorAll('.row')].filter((r) => r.querySelector('input[type="number"]')).map((r) => {
        const pctEl = r.querySelector('span.fw-semibold');
        const amtEl = r.querySelector('.fs-11');
        return {
          label: ((r.querySelector('label') || {}).textContent || '').trim(),
          price: Number(r.querySelector('input[type="number"]').value || 0),
          pct: Number(((pctEl ? pctEl.textContent : '').replace(/[%,\s]/g, '')) || 0),
          amount: Number(((amtEl ? amtEl.textContent : '').replace(/,/g, '').trim()) || 0),
          negative: !!(pctEl && /danger/.test(pctEl.className)),
        };
      });
      return { cost, rows };
    });
  }

  async setSellingPrice(value, index = 0) {
    const box = this.page.locator('.modal.show input[type="number"]').nth(index);
    await box.fill(String(value)); await box.press('Tab');
    await this.page.waitForTimeout(600);
  }

  async closeSellingPrice() {
    await this.page.locator('.modal.show').getByRole('button', { name: /^\s*Close\s*$/ }).click();
    await this.page.locator('.modal.show').first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  }
}

module.exports = { InvoicePage };
