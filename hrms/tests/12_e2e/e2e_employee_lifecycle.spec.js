'use strict';

/**
 * E2E — the run employee's lifecycle across modules (final cross-check of a complete run).
 *
 * One employee per run: Core HR Step 1 created the employee (flows/runEmployee.js), and during the
 * run the same person was given a profile (Core HR), a leave entitlement and two approved leaves
 * (Leave LV6/LV7, LA2–LA6), and an exit (Resignation RE2). This spec runs LAST and reads back,
 * from each module, that the data really flowed for that one person:
 *
 *   E1 Hire     — the employee is in the Core HR register under their code    /employees
 *   E2 Leave    — their Casual balance is below the Standard Staff entitlement /leave-request-on-behalf
 *                 (the leave approved earlier in the run is deducted)
 *   E3 Exit     — they are in Resignations & Exits, On Notice                  /resignations
 *
 * Read-only: creates and changes nothing. Every step asserts.
 */
const { test, expect } = require('@playwright/test');
const { EmployeesPage } = require('../../pages/core-hr/EmployeesPage');
const { availableDays } = require('../../flows/leaveFlow');
const { requireRunEmployee } = require('../../flows/runEmployee');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const STANDARD_STAFF_CASUAL = 3;   // Casual Leave days granted by the Standard Staff pattern

test.describe.configure({ mode: 'serial' });

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe('E2E — run employee lifecycle (hire → leave → exit)', () => {
  let emp;
  test.beforeAll(() => { emp = requireRunEmployee(); });

  test('E1 — Hire: the run employee is in the Core HR register', async ({ page }) => {
    test.setTimeout(150_000);
    const employees = new EmployeesPage(page);
    const row = await employees.findEmployeeRow(emp.email, emp.first);
    expect(row, `the register should list ${emp.display} (searched by e-mail)`).toBeTruthy();
    expect(row.join(' | '), `the register row should carry the employee code ${emp.code}`).toContain(emp.code);
    console.log(`  ✅ E1 ${emp.display} (${emp.code}) is in the register — ${row.join(' | ')}`);
  });

  test('E2 — Leave: the approved leave is deducted from their Casual balance', async ({ page }) => {
    test.setTimeout(150_000);
    const available = await availableDays(page, emp.code, /Casual Leave/i);
    expect(Number.isNaN(available), 'the run employee should have a Casual Leave balance').toBe(false);
    expect(available, `Casual Leave should be below the ${STANDARD_STAFF_CASUAL}-day entitlement after this run's approved leave`)
      .toBeLessThan(STANDARD_STAFF_CASUAL);
    console.log(`  ✅ E2 ${emp.display} Casual Leave: ${available} of ${STANDARD_STAFF_CASUAL} days left (leave taken this run is deducted)`);
  });

  test('E3 — Exit: the run employee is On Notice in Resignations & Exits', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto(`${BASE}/resignations`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    const search = page.locator('input[placeholder*="Search employee" i]').first();
    await expect(search, 'the Resignations & Exits search box should be visible').toBeVisible({ timeout: 20000 });
    await search.fill(emp.code);
    await search.press('Enter').catch(() => {});
    const row = page.locator('table tbody tr, .card').filter({ hasText: emp.first }).first();
    await expect(row, `Resignations & Exits should list ${emp.display}`).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body'), 'the exit should show an in-progress / on-notice state')
      .toContainText(/on\s*notice|exit in progress|pending/i);
    console.log(`  ✅ E3 ${emp.display} is in Resignations & Exits (On Notice) — lifecycle complete for ONE employee`);
  });
});
