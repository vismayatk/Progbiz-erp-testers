'use strict';

/**
 * MOBILE ↔ WEB LEAVE SYNC E2E — proves leave applications sync BOTH directions for one employee.
 *
 *   1. WEB    create a fresh Core HR employee (login enabled; password = employee code)
 *   2. MOBILE boot + log in as that employee
 *   3. WEB    employee applies leave on the WEB (day B)
 *   4. MOBILE verify it appears on the mobile Leave page   → WEB → MOBILE proven
 *   5. MOBILE employee applies leave in the APP (day A, via applyLeave())
 *   6. WEB    verify BOTH requests show on ESS My Leave     → MOBILE → WEB proven
 *
 * Mobile side = mobileAttendance.js (applyLeave/openMenuItem). Web side reuses hrms leaveFlow.
 * Uses Casual Leave (no mandatory document — Medical Leave requires an attachment). Non-destructive
 * except the deliberate test employee + its (pending) leave requests.
 *
 * Run: npm run hrms:mobile:leave
 */
const { test, expect } = require('@playwright/test');
const testEmployee = require('../../hrms/data/testEmployee');
const { EmployeesPage } = require('../../hrms/pages/core-hr/EmployeesPage');
const leaveFlow = require('../../hrms/flows/leaveFlow');
const mobile = require('./mobileAttendance');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const COMPANY = process.env.HRMS_COMPANY_CODE || 'pbhrms';

/** Next weekday (Mon–Fri) at least `offset` days out, as both a Date and an ISO yyyy-mm-dd string. */
function futureWeekday(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { date: d, iso };
}
const DAY_WEB = futureWeekday(2);    // web-applied leave
const DAY_MOB = futureWeekday(4);    // mobile-applied leave

/** A page logged into the web AS the given employee. */
async function loginAsEmployee(browser, creds) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('#companycode, input[id*="company" i]').first().fill(creds.company);
  await page.locator('#signin-username, input[name="username"]').first().fill(creds.username);
  await page.locator('#signin-password, input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first().click();
  await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 30000 }).catch(() => {});
  return { ctx, page };
}

test.describe.configure({ mode: 'serial' });

test.describe('Mobile ↔ Web leave sync E2E', () => {
  let emp, creds;

  test.beforeAll(() => {
    test.skip(!process.env.HRMS_MOBILE && !mobile.isBooted(),
      'mobile leave E2E — run `npm run hrms:mobile:leave` (needs the Android emulator)');
  });

  test('1 — WEB: create a fresh employee with mobile login', async ({ page }) => {
    test.setTimeout(300_000);
    const po = new EmployeesPage(page);
    const profile = testEmployee.forRun();
    console.log(`  👤 creating "${profile.display}" — user=${profile.username}`);
    await po.createEmployee(profile);
    const row = await po.findEmployeeRow(profile.email, profile.first);
    expect(row, `the register should list ${profile.display}`).toBeTruthy();
    emp = { username: profile.username, code: row[1], email: profile.email, first: profile.first, display: profile.display };
    creds = { company: COMPANY, username: emp.username, password: emp.code };
    console.log(`  ✅ ${emp.display} — code=${emp.code}`);
  });

  test('2 — MOBILE: log in as the employee', async () => {
    test.setTimeout(300_000);
    expect(creds).toBeTruthy();
    await mobile.ensureBooted();
    await mobile.launchApp({ fresh: true });
    expect(await mobile.login(creds), 'the app should log in as the new employee').toBeTruthy();
    console.log('  📱 logged into the app as the new employee');
  });

  test('3 — WEB: employee applies leave on the web (day B)', async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page } = await loginAsEmployee(browser, creds);
    await leaveFlow.employeeApplies(page, { type: 'Casual Leave', reason: 'Web-applied leave (sync test)', day: DAY_WEB.iso });
    console.log(`  🌐 web leave applied for ${DAY_WEB.iso}`);
    await ctx.close();
  });

  test('4 — MOBILE: verify the web leave shows in the app (WEB → MOBILE)', async () => {
    test.setTimeout(180_000);
    expect(await mobile.openMenuItem('My Workspace', 'Leave'), 'should reach the mobile Leave page').toBeTruthy();
    await new Promise(r => setTimeout(r, 2500));
    const dump = mobile.ui();
    console.log('  📱 leave page:', dump.match(/desc="[^"]*(Awaiting|Request|Leave)[^"]*"/gi)?.slice(0, 5).join(' · '));
    expect(dump, 'the mobile Leave page should no longer be empty').not.toMatch(/No leave requests/i);
    expect(dump, 'the web-applied leave should appear as a pending request on mobile').toMatch(/Awaiting Level 1|Leave Requests|Cancel request/i);
    console.log('  ✅ WEB → MOBILE proven: web-applied leave visible in the app');
  });

  test('5 — MOBILE: employee applies leave in the app (day A)', async () => {
    test.setTimeout(240_000);
    const res = await mobile.applyLeave({ leaveType: 'Casual Leave', start: DAY_MOB.date, description: 'Mobile-applied leave (sync test)' });
    console.log(`  📱 mobile applyLeave → ok=${res.ok} (${res.detail})`);
    expect(res.ok, `the app should submit the leave — got: ${res.detail}`).toBeTruthy();
  });

  test('6 — WEB: verify BOTH requests on ESS My Leave (MOBILE → WEB)', async ({ browser }) => {
    test.setTimeout(150_000);
    await new Promise(r => setTimeout(r, 4000));
    const { ctx, page } = await loginAsEmployee(browser, creds);
    const webRow = await leaveFlow.myRequestRow(page, DAY_WEB.iso);
    const mobRow = await leaveFlow.myRequestRow(page, DAY_MOB.iso);
    console.log('  🧾 web row:', webRow.text, '| mobile row:', mobRow.text);
    expect(webRow.text, `the web-applied leave (${DAY_WEB.iso}) should be listed`).toMatch(/Casual Leave/i);
    expect(mobRow.text, `the mobile-applied leave (${DAY_MOB.iso}) should be listed`).toMatch(/Casual Leave/i);
    console.log('  ✅ MOBILE → WEB proven: app-applied leave visible on the web');
    await ctx.close();
  });
});
