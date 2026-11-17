'use strict';

/**
 * Inventory — purchase and sales invoices  (PS-01 .. PS-07)
 *
 * Uses three QA records that are created the first time they are missing and reused after that:
 * QA_Supplier_Fixture, QA_Customer_Fixture (phone 9000000099, shared with master_customers.spec.js) and
 * QA_Item_Fixture (made by inventory_items.spec.js, or here if it is missing). Nothing is deleted.
 * Stock and balances grow a little each run, so every figure is checked as a change (Daily Report
 * before / after). PS-01 buys stock first and the later sales tests rely on it: run the file as a whole.
 *
 *   PS-01 Purchase invoice: 10 x 60, paid in cash: saved; cash credit and Purchase debit rise by 600
 *   PS-02 Selling Price modal: cost = line cost; profit % = (price - cost) / cost, red below cost (not saved)
 *   PS-03 Selling Price cost with an invoice discount (OBS-01, recorded, not asserted)
 *   PS-04 Sales invoice, Cash 60 + Credit 40, quantity 1 -> 2: Credit rises to 140, cash stays 60; saved;
 *         Cash debit +60, customer debit +140, Sales credit +200
 *   PS-05 Payments above the total: "Balance amount should be zero", nothing written
 *   PS-06 More than the stock on hand: "Insufficient stock ... Negative stock is not allowed", nothing posted (Daily Report unchanged)
 *         SWITCHED OFF (test.fixme) since 14 Nov 2026 — defect ERP-020: the server now SAVES this invoice. See the test.
 *   PS-07 The same item, party and quantity on a sales invoice shows the entered rate and total
 *
 * Run:  npx playwright test erp/inventory/tests/inventory_purchase_sales.spec.js --workers=1
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { ErpItemPage } = require('../pages/ErpItemPage');
const { InvoicePage } = require('../pages/InvoicePage');
const { DailyReportPage } = require('../../accounts/pages/DailyReportPage');
const { C, trackWrites, appToday, iso } = require('../../accounts/pages/shared');

const ITEM = 'QA_Item_Fixture';
const SUPPLIER = 'QA_Supplier_Fixture';
const CUSTOMER = 'QA_Customer_Fixture';
const CUSTOMER_PHONE = '9000000099';
const row = (rep, name) => rep.accounts[name] || { opening: 0, debit: 0, credit: 0, closing: 0 };

test.describe('Inventory — purchase and sales invoices', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });
  test.skip(C.company !== 'onetouch_test', 'posts QA invoices: onetouch_test only');

  /** @type {import('@playwright/test').Page} */
  let page, purchase, sales, report, tracker;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    tracker = trackWrites(page);
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    purchase = new InvoicePage(page, 'purchase');
    sales = new InvoicePage(page, 'sales');
    report = new DailyReportPage(page);
    // the item every test uses
    const items = new ErpItemPage(page);
    if (!(await items.exists(ITEM))) {
      const r = await items.create({ name: ITEM, price: 100 });
      expect(['saved', 'none'], `QA item did not save: ${r.text}`).toContain(r.kind);
      expect(await items.exists(ITEM), 'QA item is not listed after saving').toBe(true);
    }
  });
  test.afterAll(async () => { await page?.close(); });

  const todayIso = () => iso(appToday());

  test('PS-01 | Purchase invoice 10 x 60 paid in cash: saved, cash credit and Purchase debit rise by 600', async () => {
    const before = await report.run(todayIso());
    await purchase.goto();
    await purchase.ensureSupplier(SUPPLIER);
    expect(await purchase.selectedParty()).toContain(SUPPLIER);
    await purchase.addLine({ item: ITEM, rate: 60, qty: 10 });
    const s = await purchase.summary();
    expect(s.quantity).toBe(10);
    expect(s.gross).toBeCloseTo(600, 2);
    expect(s.total).toBeCloseTo(600, 2);
    await purchase.pay('Cash', 600);
    expect((await purchase.summary()).balance, 'nothing left to pay').toBeCloseTo(0, 2);
    tracker.clear();
    const r = await purchase.save();
    expect(r.kind, `purchase invoice did not save: ${r.text}`).toBe('saved');
    expect(tracker.writes.length, 'Save sent no write request').toBeGreaterThan(0);

    const after = await report.run(todayIso());
    expect(row(after, 'Cash').credit - row(before, 'Cash').credit, 'cash paid out').toBeCloseTo(600, 2);
    expect(row(after, 'Purchase').debit - row(before, 'Purchase').debit, 'Purchase ledger debit').toBeCloseTo(600, 2);
    expect((after.invoices.Purchase?.total ?? 0) - (before.invoices.Purchase?.total ?? 0), 'Invoice Summary, Purchase total').toBeCloseTo(600, 2);
  });

  test('PS-02 | Selling Price modal: cost is the line cost, profit % = (price - cost) / cost, red below cost', async () => {
    await purchase.goto();
    await purchase.ensureSupplier(SUPPLIER);
    await purchase.addLine({ item: ITEM, rate: 60, qty: 10 });
    await purchase.openSellingPrice(ITEM);
    let m = await purchase.sellingPrice();
    expect(m.cost, 'cost (this purchase)').toBeCloseTo(60, 2);
    expect(m.rows.length, 'at least one price row').toBeGreaterThan(0);

    await purchase.setSellingPrice(100);
    m = await purchase.sellingPrice();
    expect(m.rows[0].pct).toBeCloseTo(66.67, 2);
    expect(m.rows[0].amount).toBeCloseTo(40, 2);
    expect(m.rows[0].negative, 'a profit is not shown in red').toBe(false);

    await purchase.setSellingPrice(50);
    m = await purchase.sellingPrice();
    expect(m.rows[0].pct).toBeCloseTo(-16.67, 2);
    expect(m.rows[0].amount).toBeCloseTo(-10, 2);
    expect(m.rows[0].negative, 'a loss is not shown in red').toBe(true);

    await purchase.setSellingPrice(60);
    m = await purchase.sellingPrice();
    expect(m.rows[0].pct, 'price = cost gives 0%').toBeCloseTo(0, 2);
    await purchase.closeSellingPrice();
  });

  test('PS-03 | Selling Price cost with a 10% invoice discount is recorded (OBS-01)', async () => {
    await purchase.goto();
    await purchase.ensureSupplier(SUPPLIER);
    await purchase.addLine({ item: ITEM, rate: 60, qty: 10 });
    await purchase.discountPercent(10);
    const s = await purchase.summary();
    expect(s.discount, 'the 10% discount is applied to the invoice').toBeCloseTo(-60, 2);
    expect(s.total).toBeCloseTo(540, 2);
    await purchase.openSellingPrice(ITEM);
    const m = await purchase.sellingPrice();
    // the tooltip says "cost ... after discounts"; 54.00 would be that, 60.00 means the invoice discount is not counted
    test.info().annotations.push({ type: 'observation', description: `OBS-01: cost in the Selling Price modal after a 10% invoice discount is ${m.cost} (60 = discount not counted, 54 = counted)` });
    expect([54, 60]).toContain(Math.round(m.cost * 100) / 100);
    await purchase.closeSellingPrice();
  });

  test('PS-04 | Sales invoice Cash 60 + Credit 40, quantity 1 -> 2: Credit rises to 140, cash stays 60, then saved', async () => {
    const before = await report.run(todayIso());
    await sales.goto();
    await sales.ensureCustomer(CUSTOMER, CUSTOMER_PHONE);
    expect(await sales.selectedParty()).toContain(CUSTOMER);
    await sales.addLine({ item: ITEM, rate: 100, qty: 1 });
    expect((await sales.summary()).total).toBeCloseTo(100, 2);
    await sales.pay('Cash', 60);
    await sales.pay('Credit', 40);
    expect((await sales.summary()).balance, 'balanced after Cash 60 + Credit 40').toBeCloseTo(0, 2);

    await sales.setLineQty(ITEM, 2);
    const s = await sales.summary();
    expect(s.total, 'total after quantity 2').toBeCloseTo(200, 2);
    const snap = await sales.paymentSnapshot();
    expect(snap.inputs.map(Number), 'the Credit row took the difference: 40 -> 140').toContain(140);
    expect(snap.text, 'cash is still 60').toMatch(/Cash\s*60(\.00)?/);
    expect(s.balance, 'still balanced after the change').toBeCloseTo(0, 2);

    tracker.clear();
    const r = await sales.save();
    expect(r.kind, `sales invoice did not save: ${r.text}`).toBe('saved');
    expect(tracker.writes.length, 'Save sent no write request').toBeGreaterThan(0);

    const after = await report.run(todayIso());
    expect(row(after, 'Cash').debit - row(before, 'Cash').debit, 'only the cash part (60) is received as cash').toBeCloseTo(60, 2);
    expect(row(after, CUSTOMER).debit - row(before, CUSTOMER).debit, 'the customer owes the credit part (140)').toBeCloseTo(140, 2);
    expect(row(after, 'Sales').credit - row(before, 'Sales').credit, 'Sales credit').toBeCloseTo(200, 2);
  });

  test('PS-05 | Payments above the total: "Balance amount should be zero", nothing written', async () => {
    await sales.goto();
    await sales.ensureCustomer(CUSTOMER, CUSTOMER_PHONE);
    await sales.addLine({ item: ITEM, rate: 100, qty: 2 });
    await sales.pay('Cash', 60);
    await sales.pay('Credit', 140);
    await sales.setLineRate(ITEM, 25);
    const s = await sales.summary();
    expect(s.total).toBeCloseTo(50, 2);
    expect(s.balance, 'payments (200) are above the total (50)').toBeCloseTo(-150, 2);
    tracker.clear();
    const r = await sales.save();
    expect(r.kind).toBe('dialog');
    expect(r.text).toMatch(/balance amount should be zero/i);
    expect(tracker.writes, 'an over-paid invoice was sent to the server').toEqual([]);
    await sales.dismiss();
  });

  // ERP-020 (High, found 12 Nov 2026, seen again 14 Nov 2026): with Inventory Settings > "Allow Negative Stock" OFF, a sales
  // invoice for more than the stock on hand is now SAVED and confirmed (POST /api/inventory/save-and-confirm-invoice succeeds
  // and the page returns to the Invoices list). On the 6 Nov build the server refused it with "Insufficient stock ...
  // Negative stock is not allowed" and this test passed.
  // The test is switched off, not marked as an expected failure, because while the defect is there every run posts a real
  // 999,999-unit cash sale (AED 99,999,900) that cannot be undone from the suite: three exist already (S-7 and S-9 from 12 Nov, S-11 from 14 Nov).
  // To bring it back once the fix is confirmed by hand: cancel those three invoices so QA_Item_Fixture has stock again
  // (PS-04's normal sale would otherwise be refused too), then change test.fixme back to test.
  test.fixme('PS-06 | More than the stock on hand: "Insufficient stock ... Negative stock is not allowed", nothing is posted', async () => {
    const before = await report.run(todayIso());
    await sales.goto();
    await sales.ensureCustomer(CUSTOMER, CUSTOMER_PHONE);
    await sales.addLine({ item: ITEM, rate: 100, qty: 999999 });
    const total = (await sales.summary()).total;
    await sales.pay('Cash', total);
    const r = await sales.save();       // the page sends the save and the SERVER refuses it
    expect(r.kind).toBe('dialog');
    expect(r.text).toMatch(/insufficient stock/i);
    expect(r.text, 'names the item').toContain(ITEM);
    expect(r.text).toMatch(/negative stock is not allowed/i);
    await sales.dismiss();

    const after = await report.run(todayIso());
    expect(row(after, 'Sales').credit, 'no sale was posted').toBeCloseTo(row(before, 'Sales').credit, 2);
    expect(row(after, 'Cash').debit, 'no cash was received').toBeCloseTo(row(before, 'Cash').debit, 2);
    expect(row(after, CUSTOMER).debit, 'the customer was not charged').toBeCloseTo(row(before, CUSTOMER).debit, 2);
  });

  test('PS-07 | A sales line shows the entered rate and gross, and the summary adds up', async () => {
    await sales.goto();
    await sales.ensureCustomer(CUSTOMER, CUSTOMER_PHONE);
    await sales.addLine({ item: ITEM, rate: 80, qty: 3 });
    const s = await sales.summary();
    expect(s.quantity).toBe(3);
    expect(s.gross).toBeCloseTo(240, 2);
    expect(s.total).toBeCloseTo(240 + s.tax, 2);
    await expect(sales.lineRow(ITEM)).toContainText('240');
  });
});
