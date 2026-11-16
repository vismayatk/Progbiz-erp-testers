'use strict';

/**
 * Accounts — Bank Deposit / Withdrawal  (AB-01 .. AB-08)
 *
 * The page posts a contra voucher between a bank ledger and a cash ledger (or a second bank ledger).
 * Two QA bank ledgers are created the first time they are missing and reused after that (a ledger
 * cannot be deleted from the UI, and nothing here deletes anything). Every balance check compares the
 * balance before and after, so earlier runs do not matter. Each run adds a few contra vouchers.
 *
 *   AB-01 Withdrawal: bank down, cash up, and the contra shows Cash Dr / Bank Cr with the narration
 *   AB-02 Deposit: bank up, cash down, contra reversed, and the next voucher number moves on by one
 *   AB-03 No cash account chosen: refused, nothing written
 *   AB-04 Amount 0: refused, nothing written
 *   AB-05 Another bank account: deposit from bank B raises A and lowers B
 *   AB-06 The bank list shows the QA banks and the other-bank list never offers the bank itself
 *   AB-07 Clear empties the form without saving
 *
 * Run:  npx playwright test erp/accounts/tests/accounts_bank_deposit.spec.js --workers=1
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { BankDepositPage } = require('../pages/BankDepositPage');
const { LedgerPage } = require('../pages/LedgerPage');
const { ContraPage } = require('../pages/ContraPage');
const { C, trackWrites } = require('../pages/shared');

const BANK_A = 'QA_Bank_Fixture';
const BANK_B = 'QA_Bank_Fixture_2';
const CASH = 'Cash';
const stamp = () => Date.now();
const voucherNumber = (v) => Number(String(v).replace(/\D/g, ''));

test.describe('Accounts — Bank Deposit / Withdrawal', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
  test.skip(C.company !== 'onetouch_test', 'posts QA vouchers: onetouch_test only');

  /** @type {import('@playwright/test').Page} */
  let page, bd, contra, tracker;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    tracker = trackWrites(page);
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    bd = new BankDepositPage(page);
    contra = new ContraPage(page);

    // the two QA bank ledgers: create whichever is missing
    for (const name of [BANK_A, BANK_B]) {
      await bd.goto();
      if ((await bd.options(bd.bank)).some((o) => o.text === name)) continue;
      await new LedgerPage(page).createBank(name);
      await bd.goto();
      expect((await bd.options(bd.bank)).map((o) => o.text), `bank ledger ${name} was not created`).toContain(name);
    }
  });
  test.afterAll(async () => { await page?.close(); });

  /** Open a fresh form with the bank and the other account chosen; return both balances. */
  async function prepare({ mode, source = 'Cash', bank = BANK_A, other = CASH }) {
    await bd.goto();
    await bd.mode(mode);
    if (source !== 'Cash') await bd.source(source);
    await bd.chooseBank(bank);
    await bd.chooseOther(other);
    return { bank: await bd.bankBalance(), other: await bd.otherBalance() };
  }
  /** Balances of the same pair after something was saved. */
  async function balancesNow({ mode, source = 'Cash', bank = BANK_A, other = CASH }) { return prepare({ mode, source, bank, other }); }

  test('AB-01 | Withdrawal: bank down, cash up, contra shows Cash Dr / Bank Cr with the narration', async () => {
    const before = await prepare({ mode: 'Withdrawal' });
    expect(before.bank, 'bank balance not shown').not.toBeNull();
    expect(before.other, 'cash balance not shown').not.toBeNull();
    const narration = `QA_withdrawal_${stamp()}`;
    const expectedNo = await bd.nextVoucherNo();
    await bd.fill({ amount: 250, ref: 'QA_REF_W', narration });
    tracker.clear();
    const r = await bd.save();
    expect(r.kind, `Withdrawal did not save: ${r.text}`).toBe('saved');
    expect(r.voucher, 'voucher number shown on the form is the one saved').toBe(expectedNo);
    expect(tracker.writes.length, 'Save sent no write request').toBeGreaterThan(0);

    const after = await balancesNow({ mode: 'Withdrawal' });
    expect(after.bank, 'bank is credited by the withdrawal').toBeCloseTo(before.bank - 250, 2);
    expect(after.other, 'cash is debited by the withdrawal').toBeCloseTo(before.other + 250, 2);

    await contra.open(r.voucher);
    const v = await contra.read();
    expect(v.type).toMatch(/contra/i);
    expect(v.particular, 'narration kept on the voucher').toContain(narration);
    expect(v.lines.find((l) => l.ledger === CASH), 'Cash line').toMatchObject({ debit: 250, credit: 0 });
    expect(v.lines.find((l) => l.ledger === BANK_A), 'bank line').toMatchObject({ debit: 0, credit: 250 });
  });

  test('AB-02 | Deposit: bank up, cash down, contra reversed, voucher number moves on by one', async () => {
    const before = await prepare({ mode: 'Deposit' });
    const noBefore = voucherNumber(await bd.nextVoucherNo());
    const narration = `QA_deposit_${stamp()}`;
    await bd.fill({ amount: 100, ref: 'QA_REF_D', narration });
    const r = await bd.save();
    expect(r.kind, `Deposit did not save: ${r.text}`).toBe('saved');
    expect(voucherNumber(r.voucher)).toBe(noBefore);

    const after = await balancesNow({ mode: 'Deposit' });
    expect(after.bank, 'bank is debited by the deposit').toBeCloseTo(before.bank + 100, 2);
    expect(after.other, 'cash is credited by the deposit').toBeCloseTo(before.other - 100, 2);
    expect(voucherNumber(await bd.nextVoucherNo()), 'the next voucher number moved on by one').toBe(noBefore + 1);

    await contra.open(r.voucher);
    const v = await contra.read();
    expect(v.particular).toContain(narration);
    expect(v.lines.find((l) => l.ledger === BANK_A), 'bank line').toMatchObject({ debit: 100, credit: 0 });
    expect(v.lines.find((l) => l.ledger === CASH), 'Cash line').toMatchObject({ debit: 0, credit: 100 });
  });

  test('AB-03 | No cash account chosen: refused, nothing written', async () => {
    await bd.goto();
    await bd.chooseBank(BANK_A);
    await bd.fill({ amount: 100 });
    tracker.clear();
    const r = await bd.save();
    expect(r.kind).toBe('dialog');
    expect(r.text).toMatch(/choose the cash account/i);
    expect(tracker.writes, 'an incomplete voucher was sent to the server').toEqual([]);
    await bd.dismiss();
  });

  test('AB-04 | Amount 0: refused, nothing written', async () => {
    await prepare({ mode: 'Deposit' });
    await bd.fill({ amount: 0 });
    tracker.clear();
    const r = await bd.save();
    expect(r.kind).toBe('dialog');
    expect(r.text).toMatch(/enter the amount/i);
    expect(tracker.writes, 'a zero voucher was sent to the server').toEqual([]);
    await bd.dismiss();
  });

  test('AB-05 | Another bank account: a deposit from bank B raises A and lowers B', async () => {
    const before = await prepare({ mode: 'Deposit', source: 'Another bank account', other: BANK_B });
    expect(before.bank).not.toBeNull();
    expect(before.other, 'the other bank balance is shown').not.toBeNull();
    await bd.fill({ amount: 75, narration: `QA_bank_transfer_${stamp()}` });
    const r = await bd.save();
    expect(r.kind, `bank-to-bank deposit did not save: ${r.text}`).toBe('saved');

    const after = await balancesNow({ mode: 'Deposit', source: 'Another bank account', other: BANK_B });
    expect(after.bank, 'bank A is debited').toBeCloseTo(before.bank + 75, 2);
    expect(after.other, 'bank B is credited').toBeCloseTo(before.other - 75, 2);
  });

  test('AB-06 | The bank list has the QA banks, and the other-bank list never offers the bank itself', async () => {
    await bd.goto();
    const banks = (await bd.options(bd.bank)).map((o) => o.text);
    expect(banks).toEqual(expect.arrayContaining([BANK_A, BANK_B]));
    expect(banks, 'cash ledgers must not appear in the bank list').not.toContain(CASH);
    await bd.chooseBank(BANK_A);
    await bd.source('Another bank account');
    const others = (await bd.options(bd.other)).map((o) => o.text);
    expect(others, 'other bank list').toContain(BANK_B);
    expect(others, 'a bank cannot be paired with itself').not.toContain(BANK_A);
    expect(others, 'cash is not a bank').not.toContain(CASH);
  });

  test('AB-07 | Clear empties the form and saves nothing', async () => {
    await prepare({ mode: 'Deposit' });
    await bd.fill({ amount: 55, ref: 'QA_REF_X', narration: 'QA_clear_check' });
    tracker.clear();
    await page.getByRole('button', { name: /\bClear\b/ }).first().click();
    await page.waitForTimeout(800);
    expect(await bd.amount.inputValue()).toMatch(/^0?(\.0+)?$/);
    expect(await bd.narration.inputValue()).toBe('');
    expect(await bd.ref.inputValue()).toBe('');
    expect(tracker.writes, 'Clear must not write anything').toEqual([]);
  });
});
