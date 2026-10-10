'use strict';

/**
 * CRM — Sales Targets  (ST-01 .. ST-09)
 *
 * /sales-targets distributes an annual figure across twelve months for each
 * sales executive. The arithmetic is the point of this spec: a naive
 * `amount / 12` rounded to two decimals loses money on any figure that does
 * not divide evenly, and that error compounds across every executive and
 * every year. The current build absorbs the remainder into the final month,
 * so the months always sum exactly to the amount entered — these tests lock
 * that behaviour in.
 *
 * SAFETY: nothing here saves. #btn-save-targets would overwrite live targets
 * for real executives and there is no per-record isolation to undo it. The
 * spread helper and copy-previous-year are client-side only, which ST-08
 * asserts rather than assumes.
 *
 * Run:  npx playwright test erp/crm/tests/crm_sales_targets.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { SalesTargetsPage } = require('../pages/SalesTargetsPage');

const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

/** Login and land on a loaded Sales Targets grid. */
async function arrive(page) {
  await new LoginPage(page).login(C.company, C.username, C.password);
  const st = new SalesTargetsPage(page);
  await st.goto();
  return st;
}

test.describe('CRM — Sales Targets', () => {
  test.describe.configure({ timeout: 200_000 });

  test('ST-01 | Grid renders one row per sales executive', async ({ page }) => {
    const st = await arrive(page);
    const ids = await st.executiveIds();
    expect(ids.length, 'no executive rows rendered on /sales-targets').toBeGreaterThan(0);
    const name = await st.executiveName(ids[0]);
    expect(name, 'first executive row has no name in column 1').toBeTruthy();
    console.log(`  ✅ ${ids.length} executive row(s); first = "${name}"`);
  });

  // The four cases below are chosen to expose rounding: one that divides
  // evenly, one that does not, the smallest positive value, and a decimal.
  const SPREAD_CASES = [
    { amount: 120000,   note: 'divides evenly (10,000/month)' },
    { amount: 100000,   note: 'does NOT divide evenly (8,333.33…)' },
    { amount: 1,        note: 'smallest positive value' },
    { amount: 99999.99, note: 'decimal input' },
  ];

  for (const [i, tc] of SPREAD_CASES.entries()) {
    test(`ST-0${i + 2} | Spread ${tc.amount} sums exactly across 12 months — ${tc.note}`,
      async ({ page }) => {
        const st = await arrive(page);
        const [execId] = await st.executiveIds();
        test.skip(!execId, 'tenant has no sales executives');

        const months = await st.spread(execId, tc.amount);
        expect(months, 'expected exactly 12 monthly cells').toHaveLength(12);

        const sum = await st.monthlyTotal(execId);
        // Money must reconcile to the paise, not "close enough".
        expect(sum, `12 months summed to ${sum}, expected ${tc.amount}`)
          .toBeCloseTo(tc.amount, 2);
        console.log(`  ✅ ${tc.amount} → months[0..2]=${months.slice(0, 3).join(', ')} … sum=${sum}`);
      });
  }

  test('ST-06 | Total column equals the sum of the twelve monthly cells', async ({ page }) => {
    // KNOWN DEFECT CRM-009: the Total cell drops the decimals, so months
    // summing to 99,999.99 render as "100,000". Marked expected-to-fail so it
    // stays visible; when the formatting is fixed Playwright will flag this as
    // unexpectedly passing and the marker can be removed.
    test.fail(true, 'CRM-009 — Total column rounds to whole units and drops paise');

    const st = await arrive(page);
    const [execId] = await st.executiveIds();
    test.skip(!execId, 'tenant has no sales executives');

    await st.spread(execId, 99999.99);
    const monthSum = await st.monthlyTotal(execId);
    const shown = await st.totalCellValue(execId);
    const text = await st.totalCellText(execId);
    console.log(`  months sum=${monthSum} · Total cell="${text}" (${shown})`);
    expect(shown, `Total shows "${text}" but the months sum to ${monthSum}`)
      .toBeCloseTo(monthSum, 2);
  });

  test('ST-07 | A negative spread amount is not distributed', async ({ page }) => {
    const st = await arrive(page);
    const [execId] = await st.executiveIds();
    test.skip(!execId, 'tenant has no sales executives');

    // Establish a known good state first, so "unchanged" is distinguishable
    // from "was already empty".
    await st.spread(execId, 12000);
    const before = await st.monthlyTotal(execId);

    await st.spread(execId, -50000).catch(() => {});
    const after = await st.monthlyTotal(execId);

    expect(after, 'a negative amount must not produce negative monthly targets')
      .toBeGreaterThanOrEqual(0);
    expect(after, 'a negative amount should leave the existing targets untouched')
      .toBeCloseTo(before, 2);
    console.log(`  ✅ before=${before} after negative spread=${after}`);
  });

  test('ST-08 | Copy-previous-year fills the form without persisting', async ({ page }) => {
    const st = await arrive(page);
    // A "copy" helper that writes immediately would silently overwrite live
    // targets, so assert on network traffic rather than on the visible form.
    const writes = [];
    page.on('request', (r) => {
      if (['POST', 'PUT', 'PATCH'].includes(r.method()) && /save|update|insert/i.test(r.url())) {
        writes.push(`${r.method()} ${r.url().split('?')[0].slice(-60)}`);
      }
    });

    await st.copyPreviousYear();
    expect(writes, `copy-previous-year issued write request(s): ${writes.join(', ')}`)
      .toHaveLength(0);
    console.log('  ✅ no persisting request observed');
  });

  test('ST-09 | Save control is present but is never exercised by this suite', async ({ page }) => {
    const st = await arrive(page);
    await expect(st.saveBtn, '#btn-save-targets missing — the page contract changed')
      .toBeVisible();
    // Deliberately not clicked: saving overwrites real executives' targets and
    // nothing here could put them back. Persistence needs a throwaway tenant.
    console.log('  ✅ #btn-save-targets present (intentionally not clicked)');
  });
});
