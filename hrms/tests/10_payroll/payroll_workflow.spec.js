'use strict';

/**
 * Payroll — SAFE, positive-only workflows (independent tests).
 *
 *   PAY1 Create a Salary Component   (PAY-001)  /payroll/components   [additive write]
 *   PAY2 Payroll Policy renders      (support)  /payroll/policies     [READ-ONLY]
 *   PAY3 Salary Structures render    (support)  /payroll/structures   [READ-ONLY]
 *   PAY4 Runs & Payslips preview     (PAY-00x)  /payroll/runs|payslips[READ-ONLY]
 *
 * SCOPE GUARD (per brief — "preview/calculation only, no real payments"):
 *   • The ONLY write here is creating a new Salary Component — a purely additive
 *     master-data record (like a new leave type). It never touches an employee's pay.
 *   • Payroll Policy is the SHARED tenant config (custom cut-off 15→15). This spec
 *     NEVER saves it — it only asserts the page renders. Changing it would break the
 *     tenant for everyone (see hrms-resignation-exit-module notes).
 *   • No payroll run is created, finalised, paid, or submitted to any statutory body.
 *     Runs/payslips are asserted as read-only preview surfaces.
 * Every step carries an assertion; the create ends with a persisted-after-reload check.
 */
const { test, expect } = require('@playwright/test');
const { FormKit } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const { tagged, RUN_ID } = require('../../data/naming');   // company naming standard

async function openPage(page, route) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1200);
  expect(page.url(), `should stay authenticated on /${route}`).not.toMatch(/\/login/);
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe('Payroll — safe positive workflows', () => {
  test('PAY1 — create a Salary Component (additive master data)', async ({ page }) => {
    test.setTimeout(100_000);
    const fk = new FormKit(page);
    const code = `SPLALW${RUN_ID.slice(0, 8)}`;   // Special Allowance + DDMMHHMM, e.g. SPLALW08101312
    const name = tagged('Special Allowance');

    await openPage(page, 'payroll/components');
    // The create form ("New Component") is inline on the page — scope to body.
    const form = page.locator('body');
    await expect(page.getByText(/New Component/i).first(), 'the New Component form should render').toBeVisible({ timeout: 20000 });

    await fk.setInput(fk.fieldByLabel(form, 'Code', 'input'), code, 'Code');
    await fk.setInput(fk.fieldByLabel(form, 'Name', 'input'), name, 'Name');
    await fk.setSelect(fk.selectWithOption(form, 'Employer Contribution'), 'Earning', 'Type', { loose: true });
    await fk.setSelect(fk.selectWithOption(form, '% of CTC'), 'Fixed amount', 'Calculation', { loose: true });
    // Fixed-amount earning: give it a positive amount so the record is valid.
    await fk.setInput(fk.fieldByLabel(form, 'Amount', 'input'), '1000', 'Amount');

    const saveBtn = page.locator('button', { hasText: /Save Component/i }).first();
    const via = await fk.saveAndConfirm(saveBtn, { name: 'Save Component', successRe: /success|saved|created|added/i });
    console.log(`  ✅ PAY1 salary component "${code}" saved (${via})`);

    // Persisted-after-reload: reload the list and find the new component.
    await openPage(page, 'payroll/components');
    const search = page.locator('input[placeholder*="Search" i]').filter({ hasNot: page.locator('#side-menu-search-input') }).last();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(code).catch(() => {});
      await page.waitForTimeout(800);
    }
    await expect(page.getByText(code, { exact: false }).first(),
      `the Salary Components list should show the new component code "${code}"`).toBeVisible({ timeout: 20000 });
    console.log('  ✅ PAY1 salary component persisted and listed');
  });

  test('PAY2 — Payroll Policy page renders (READ-ONLY, shared config not modified)', async ({ page }) => {
    test.setTimeout(90_000);
    await openPage(page, 'payroll/policies');
    // Assert the policy config surface renders (Period type select is the anchor).
    const periodType = page.locator('select').filter({ has: page.locator('option', { hasText: /Full calendar month/i }) }).first();
    await expect(periodType, 'the Payroll Policy "Period type" select should render').toBeVisible({ timeout: 20000 });
    const body = await page.locator('body').innerText();
    expect(body, 'policy page should not error').not.toMatch(/Oops|something went wrong|nothing at this address/i);
    console.log('  ✅ PAY2 Payroll Policy renders (not saved — shared tenant config left untouched)');
  });

  test('PAY3 — Salary Structures list renders (READ-ONLY)', async ({ page }) => {
    test.setTimeout(90_000);
    await openPage(page, 'payroll/structures');
    await expect(page.getByRole('heading', { name: /Salary Structures/i }).first(),
      'the Salary Structures page heading should render').toBeVisible({ timeout: 20000 });
    // The "New Structure" action confirms we are on the structures management surface.
    await expect(page.locator('a, button, [role="button"]').filter({ hasText: /New Structure/i }).first(),
      'the "New Structure" control should be present').toBeVisible({ timeout: 20000 });
    console.log('  ✅ PAY3 Salary Structures surface renders');
  });

  test('PAY4 — Payroll Runs & Payslips preview surfaces render (READ-ONLY)', async ({ page }) => {
    test.setTimeout(90_000);

    await openPage(page, 'payroll/runs');
    await expect(page.getByRole('heading', { name: /Payroll Runs/i }).first(),
      'the Payroll Runs page heading should render').toBeVisible({ timeout: 20000 });
    console.log('  ✅ PAY4a Payroll Runs surface renders (no run created/finalised)');

    await openPage(page, 'payroll/payslips');
    await expect(page.getByRole('heading', { name: /Payslips/i }).first(),
      'the Payslips page heading should render').toBeVisible({ timeout: 20000 });
    console.log('  ✅ PAY4b Payslips preview surface renders');
  });
});
