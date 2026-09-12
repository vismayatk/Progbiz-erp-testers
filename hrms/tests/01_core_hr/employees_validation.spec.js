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
const { WorkerDirectoryPage } = require('../../pages/core-hr/WorkerDirectoryPage');
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

  test('Step 2 — the new employee appears in the Worker Directory (Branch filter + search) with the right details', async ({ page }) => {
    const emp = run.employee;
    expect(emp, 'Step 1 must have created the employee before Step 2 can look for them').toBeTruthy();
    const wd = new WorkerDirectoryPage(page);
    const reportsToName = emp.reportsTo.split(' [')[0];              // "Amit Kumar [progbiz0017]" → "Amit Kumar"

    await test.step('Open the Worker Directory and wait for the employees to load', async () => {
      await wd.open();
      await expect(wd.searchInput, 'the directory search box should be visible').toBeVisible();
      await expect(wd.searchBtn,   'the "Search" button should be visible').toBeVisible();
      const strip = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const headcount = (strip.match(/Headcount\s+(\d+)/i) || [])[1] || '';
      expect(headcount, 'the stats strip should show a numeric Headcount once loaded').toMatch(/^\d+$/);
      console.log(`  🏢 Worker Directory loaded — Headcount ${headcount}`);
    });

    await test.step(`Filter Branch = "${emp.branch}"`, async () => {
      await wd.filterBranch(emp.branch);
      const picked = (await wd.branchSelect.locator('option:checked').textContent() || '').trim();
      expect(picked, `the Branch filter should show "${emp.branch}"`).toBe(emp.branch);
    });

    await test.step(`Search for the employee by code "${emp.code}"`, async () => {
      const n = await wd.searchAndWait(emp.code);
      expect(n, `exactly one directory card should match code ${emp.code}`).toBe(1);
      await expect(wd.cardFor(emp.code), 'the employee card should be visible').toBeVisible();
      const footer = await wd.resultsCount();
      if (footer !== null) expect(footer, 'the results footer should also count exactly 1').toBe(1);
    });

    const card = await test.step('Read the employee card and print the details', async () => {
      const c = await wd.readCard(wd.cardFor(emp.code));
      console.log('  📇 Worker Directory card →');
      console.log(`     Name        : ${c.name}`);
      console.log(`     Designation : ${c.designation}`);
      console.log(`     Code        : ${c.code}`);
      console.log(`     Branch      : ${c.branch}`);
      console.log(`     Reports To  : ${c.reportsTo}`);
      console.log(`     Phone       : ${c.phone}`);
      console.log(`     Email       : ${c.email}`);
      console.log(`     Profile     : ${c.profileHref}`);
      expect(c.name, 'the card should carry a name').toBeTruthy();
      return c;
    });

    const row = await test.step('Switch to List view and print the employee row', async () => {
      await wd.switchToList();
      const r = await wd.listRowFor(emp.code);
      expect(r, `the List view should contain a row for code ${emp.code}`).toBeTruthy();
      console.log('  📋 Worker Directory list row →');
      for (const [k, v] of Object.entries(r)) console.log(`     ${k.padEnd(12)}: ${v}`);
      return r;
    });

    await test.step('Directory details match the employee created in Step 1', async () => {
      // Card
      expect(card.name,        'card name should be the display name we entered').toBe(emp.display);
      expect(card.designation, 'card designation should match').toBe(emp.designation);
      expect(card.code,        'card code should be the auto-generated Employee Code').toBe(emp.code);
      expect(card.branch,      'card branch should match').toBe(emp.branch);
      expect(card.reportsTo,   'card "Reports To" should be the manager we picked').toBe(reportsToName);
      expect(card.phone,       'card phone should be the phone we entered').toBe(emp.phone);
      expect(card.email,       'card email should be the email we entered').toBe(emp.email);
      expect(card.profileHref, 'card name should link to the employee profile').toMatch(/\/employee-view\//);
      // List row
      expect(row['Employee'],    'list Employee should contain the display name').toContain(emp.display);
      expect(row['Code'],        'list Code should match').toBe(emp.code);
      expect(row['Designation'], 'list Designation should match').toBe(emp.designation);
      expect(row['Branch'],      'list Branch should match').toBe(emp.branch);
      expect(row['Reports to'],  'list "Reports to" should match').toBe(reportsToName);
      expect(row['Phone'],       'list Phone should match').toBe(emp.phone);
      expect(row['Email'],       'list Email should match').toBe(emp.email);
      const jd = new Date(`${emp.joiningDate}T00:00:00`);
      const joinedRe = new RegExp(`^${jd.getDate()} ${jd.toLocaleString('en-US', { month: 'short' })}\\w* ${jd.getFullYear()}$`);   // e.g. "11 Sept 2026"
      expect(row['Joined'],      `list Joined should be the joining date we entered (${emp.joiningDate})`).toMatch(joinedRe);
      run.employee.profileHref = card.profileHref;                   // handy for later steps
      console.log(`  ✅ Worker Directory shows ${emp.display} (${emp.code}) with the details entered in Step 1`);
    });
  });

  // ── Next steps of the full-module run go here, reading run.employee, e.g.:
  //   Step 3 — assign a leave pattern to run.employee (Leave Management)
  //   Step 4 — log in as run.employee and apply for leave (ESS)
  //   Step 5 — approve as Amit Kumar → attendance sync → payroll
});
