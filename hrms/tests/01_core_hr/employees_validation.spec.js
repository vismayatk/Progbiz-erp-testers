'use strict';

/**
 * Core HR — single end-to-end run (this is the BEGINNING of a full-module run).
 *
 * Structure:
 *  - test.describe.serial → steps run in order; a later step never runs against a
 *    failed earlier step.
 *  - `run` is the shared state carried across steps (the employee created in
 *    Step 1 is used by every later step). New module steps get added below,
 *    reading `run`.
 *  - The heavy lifting lives in the page object (EmployeesPage.createEmployee /
 *    findEmployeeRow), so any future flow can create and look up an employee
 *    with one call each.
 *
 * Step 1 CREATES a new employee on every run from hrms/data/testEmployee.js
 * (phone / email / username are stamped per run so the tenant never rejects a
 * duplicate), then searches the register for that exact person and checks the row.
 *
 * Each field/action is a named test.step with assertions inside (report shows
 * ✓/✗ per step). On failure: full-page screenshot (afterEach) + config
 * screenshot / video / trace (retain-on-failure).
 * Login: hrms/fixtures/global-setup.js (HRMS_COMPANY_CODE=pbhrms / HRMS_USERNAME / HRMS_PASSWORD).
 */
const { test, expect } = require('@playwright/test');
const { EmployeesPage } = require('../../pages/core-hr/EmployeesPage');
const testEmployee = require('../../data/testEmployee');

// ── Screenshot on failure (in addition to config screenshot:'only-on-failure') ──
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}`);
  }
});

test.describe.serial('Core HR — single run: employee lifecycle', () => {
  /** Shared state for the whole run — later steps read what earlier steps established. */
  const run = { employee: null };

  test('Step 1 — create the test employee in Core HR and find it in the register', async ({ page }) => {
    const po      = new EmployeesPage(page);
    const profile = testEmployee.forRun();   // your details + a unique phone / email / username
    console.log(`  👤 This run creates "${profile.display}" — user=${profile.username}, email=${profile.email}, phone=${profile.phone}`);

    // 1. Create — fills every mandatory field, clicks Save once, confirms the save.
    const created = await po.createEmployee(profile);

    // 2. Search — look the new person up by their unique email and read the row.
    const row = await test.step(`Search the register for "${profile.display}" by email`, async () => {
      const r = await po.findEmployeeRow(profile.email, profile.first);
      expect(r, `a register row should contain "${profile.first}" after searching "${profile.email}"`).toBeTruthy();
      return r;
    });

    run.employee = { ...created, code: row[1] || created.code, row };

    // 3. Verify — the register row carries what we just entered.
    await test.step('Register row is correct for the newly created employee', async () => {
      // Register grid: Sl.No | Employee Code | Employee Name | Department | Designation | Status | Actions
      expect(run.employee.code,   'the new employee should have an auto-generated Employee Code').toMatch(/^\S+$/);
      expect(row[2],              'the row should show the display name we entered').toContain(profile.display);
      expect(row.join(' | '),     'the row should carry the designation we picked').toMatch(new RegExp(profile.designation, 'i'));
      expect(row.join(' | '),     'the row should show the status we picked').toMatch(new RegExp(profile.status, 'i'));
      console.log(`  ✅ Created + found → code=${run.employee.code} | ${row.join(' | ')}`);
    });
  });

  // ── Next steps of the full-module run go here, reading run.employee, e.g.:
  //   Step 2 — assign a leave pattern to run.employee (Leave Management)
  //   Step 3 — log in as run.employee and apply for leave (ESS)
  //   Step 4 — approve as Amit Kumar → attendance sync → payroll
});
