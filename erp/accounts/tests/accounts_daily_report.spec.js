'use strict';

/**
 * Accounts — Daily Report  (DR-01 .. DR-05)
 *
 * Reports > Inventory > Daily Report: opening, debit, credit and closing for every cash and bank
 * ledger on one date, plus an invoice summary. The checks use invariants, so they hold whatever the
 * tenant already contains:
 *
 *   DR-01 A date long before any entry lists this company's own cash and bank ledgers, all at zero
 *   DR-02 Opening of a day = closing of the day before, for every cash and bank ledger
 *   DR-03 A voucher posted today raises today's debit/credit and closing, but NOT today's opening; the
 *         next day opens on the new closing and the day before is unchanged
 *   DR-04 The form opens on today (before 5:30 am it still shows yesterday)
 *   DR-05 Debits equal credits on the report
 *
 * Posts one small deposit (DR-03). Run:  npx playwright test erp/accounts/tests/accounts_daily_report.spec.js --workers=1
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { BankDepositPage } = require('../pages/BankDepositPage');
const { DailyReportPage } = require('../pages/DailyReportPage');
const { C, appToday, iso, addDays } = require('../pages/shared');

const BANK = 'QA_Bank_Fixture';
const CASH = 'Cash';

test.describe('Accounts — Daily Report', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
  test.skip(C.company !== 'onetouch_test', 'posts a QA voucher: onetouch_test only');

  /** @type {import('@playwright/test').Page} */
  let page, rep, bd;
  let cashBankNames = [];
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    rep = new DailyReportPage(page);
    bd = new BankDepositPage(page);
    // every cash and bank ledger of this company, as the Bank Deposit page lists them
    await bd.goto();
    const banks = (await bd.options(bd.bank)).map((o) => o.text);
    const cash = (await bd.options(bd.other)).map((o) => o.text);
    cashBankNames = [...new Set([...banks, ...cash])];
    expect(cashBankNames.length, 'no cash or bank ledgers found').toBeGreaterThan(0);
  });
  test.afterAll(async () => { await page?.close(); });

  const today = () => appToday();

  test('DR-01 | A date before any entry lists this company\'s own cash and bank ledgers, all at zero', async () => {
    const r = await rep.run('2020-01-01');
    const names = Object.keys(r.accounts);
    expect(names.slice().sort(), 'the report lists exactly the cash and bank ledgers of this company').toEqual(cashBankNames.slice().sort());
    for (const n of names) {
      expect(r.accounts[n], `${n} should be empty on 01/01/2020`).toMatchObject({ opening: 0, debit: 0, credit: 0, closing: 0 });
    }
    expect(r.company, 'report header names the company').toMatch(/\w/);
  });

  test('DR-02 | Opening of a day is the closing of the day before, for every cash and bank ledger', async () => {
    const d = today();
    const yesterday = await rep.run(iso(addDays(d, -1)));
    const todayRep = await rep.run(iso(d));
    const tomorrow = await rep.run(iso(addDays(d, 1)));
    for (const n of cashBankNames) {
      const y = yesterday.accounts[n]?.closing ?? 0;
      const t = todayRep.accounts[n];
      const m = tomorrow.accounts[n];
      expect(t?.opening ?? 0, `${n}: today's opening should equal yesterday's closing`).toBeCloseTo(y, 2);
      expect(m?.opening ?? 0, `${n}: tomorrow's opening should equal today's closing`).toBeCloseTo(t?.closing ?? 0, 2);
      expect(t?.closing ?? 0, `${n}: closing = opening + debit - credit`).toBeCloseTo((t?.opening ?? 0) + (t?.debit ?? 0) - (t?.credit ?? 0), 2);
    }
  });

  test('DR-03 | A voucher today raises today\'s closing but not today\'s opening; tomorrow opens on the new closing', async () => {
    const d = today();
    const before = await rep.run(iso(d));
    const yBefore = await rep.run(iso(addDays(d, -1)));

    await bd.goto();
    await bd.mode('Deposit');
    await bd.chooseBank(BANK);
    await bd.chooseOther(CASH);
    await bd.fill({ amount: 33, narration: `QA_daily_report_${Date.now()}` });
    const saved = await bd.save();
    expect(saved.kind, `deposit did not save: ${saved.text}`).toBe('saved');

    const after = await rep.run(iso(d));
    const tomorrow = await rep.run(iso(addDays(d, 1)));
    const yAfter = await rep.run(iso(addDays(d, -1)));
    const b = (r, n) => r.accounts[n] || { opening: 0, debit: 0, credit: 0, closing: 0 };

    expect(b(after, BANK).opening, 'bank: today\'s own entries are not in today\'s opening').toBeCloseTo(b(before, BANK).opening, 2);
    expect(b(after, CASH).opening, 'cash: today\'s own entries are not in today\'s opening').toBeCloseTo(b(before, CASH).opening, 2);
    expect(b(after, BANK).debit - b(before, BANK).debit, 'bank debit today rose by the deposit').toBeCloseTo(33, 2);
    expect(b(after, CASH).credit - b(before, CASH).credit, 'cash credit today rose by the deposit').toBeCloseTo(33, 2);
    expect(b(after, BANK).closing - b(before, BANK).closing, 'bank closing rose by the deposit').toBeCloseTo(33, 2);
    expect(b(after, CASH).closing - b(before, CASH).closing, 'cash closing fell by the deposit').toBeCloseTo(-33, 2);
    expect(b(tomorrow, BANK).opening, 'tomorrow opens on today\'s new bank closing').toBeCloseTo(b(after, BANK).closing, 2);
    expect(b(tomorrow, CASH).opening, 'tomorrow opens on today\'s new cash closing').toBeCloseTo(b(after, CASH).closing, 2);
    expect(b(yAfter, BANK).closing, 'yesterday does not move when today is posted').toBeCloseTo(b(yBefore, BANK).closing, 2);
    expect(b(yAfter, CASH).closing, 'yesterday does not move when today is posted').toBeCloseTo(b(yBefore, CASH).closing, 2);
  });

  test('DR-04 | The form opens on today (before 5:30 am it still shows yesterday)', async () => {
    await rep.goto();
    const shown = await rep.defaultDate();
    expect(shown).toBe(iso(today()));
  });

  test('DR-05 | Debits equal credits on the report', async () => {
    const r = await rep.run(iso(today()));
    const debit = Object.values(r.accounts).reduce((s, a) => s + a.debit, 0);
    const credit = Object.values(r.accounts).reduce((s, a) => s + a.credit, 0);
    expect(debit, 'total debit equals total credit').toBeCloseTo(credit, 2);
  });
});
