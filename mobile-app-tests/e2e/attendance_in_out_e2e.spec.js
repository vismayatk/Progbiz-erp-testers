'use strict';

/**
 * MOBILE-INTEGRATED ATTENDANCE IN + OUT E2E — one command, web (Playwright) + mobile (emulator).
 *
 *   1. WEB    create a fresh Core HR employee (login enabled; password = employee code)
 *   2. MOBILE boot + login as that employee → Check-IN at the OFFICE geofence
 *   3. WEB    verify ESS My Attendance = Present, Actual In set
 *   4. MOBILE Check-OUT at the geofence (dashboard work-session "Check Out" button — tapped while
 *             still on the dashboard right after check-in, which is where that card lives)
 *   5. WEB    verify ESS My Attendance now shows Actual Out set (and worked hours)
 *
 * This proves BOTH mobile punches sync to the web. Builds on the proven check-in flow
 * (attendance_checkin.spec.js / PR #30); the new part is Check-OUT + its web verification.
 *
 * Run: npm run hrms:mobile:inout
 */
const { test, expect } = require('@playwright/test');
const testEmployee = require('../../hrms/data/testEmployee');
const { EmployeesPage } = require('../../hrms/pages/core-hr/EmployeesPage');
const mobile = require('./mobileAttendance');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const COMPANY = process.env.HRMS_COMPANY_CODE || 'pbhrms';
const PUNCH_LAT = Number(process.env.HRMS_PUNCH_LAT || 11.891560);
const PUNCH_LNG = Number(process.env.HRMS_PUNCH_LNG || 75.468381);

test.describe.configure({ mode: 'serial' });

/** Log into the web AS the given employee and return the ESS attendance page text. */
async function essAttendanceText(browser, creds) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('#companycode, input[id*="company" i]').first().fill(creds.company);
  await page.locator('#signin-username, input[name="username"]').first().fill(creds.username);
  await page.locator('#signin-password, input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first().click();
  await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 30000 }).catch(() => {});
  await page.goto(`${BASE}/ess/attendance`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const body = await page.locator('body').innerText();
  await ctx.close();
  return body;
}

test.describe('Mobile-integrated attendance IN + OUT E2E (web + emulator)', () => {
  let emp, creds;

  test.beforeAll(() => {
    test.skip(!process.env.HRMS_MOBILE && !mobile.isBooted(),
      'mobile attendance E2E — run `npm run hrms:mobile:inout` (needs the Android emulator)');
  });

  test('1 — WEB: create a fresh Core HR employee with mobile login', async ({ page }) => {
    test.setTimeout(300_000);
    const po = new EmployeesPage(page);
    const profile = testEmployee.forRun();
    console.log(`  👤 creating "${profile.display}" — user=${profile.username}`);
    await po.createEmployee(profile);
    const row = await po.findEmployeeRow(profile.email, profile.first);
    expect(row, `the register should list ${profile.display}`).toBeTruthy();
    const code = row[1];
    expect(code, 'the new employee should have an employee code').toMatch(/^\S+$/);
    emp = { username: profile.username, code, email: profile.email, display: profile.display };
    creds = { company: COMPANY, username: emp.username, password: emp.code };
    console.log(`  ✅ ${emp.display} — code=${emp.code}`);
  });

  test('2 — MOBILE: Check-IN at the OFFICE geofence', async () => {
    test.setTimeout(360_000);
    expect(creds, 'step 1 must have created the employee').toBeTruthy();
    await mobile.ensureBooted();
    await mobile.launchApp({ fresh: true });
    expect(await mobile.login(creds), 'the app should log in as the new employee').toBeTruthy();
    const res = await mobile.checkIn(PUNCH_LAT, PUNCH_LNG);
    console.log(`  📍 Check-In → ok=${res.ok} (${res.detail})`);
    expect(res.ok, `Check-In should be accepted — got: ${res.detail}`).toBeTruthy();
  });

  test('3 — WEB: verify Actual In (mobile check-in synced)', async ({ browser }) => {
    test.setTimeout(150_000);
    const body = await essAttendanceText(browser, creds);
    console.log('  🧾', body.split('\n').filter(l => /Actual In|Actual Out|Worked|Present/i.test(l)).join(' | '));
    expect(body, 'attendance should show Present').toMatch(/Present/i);
    expect(body, 'attendance should show an Actual In punch time').toMatch(/Actual In[\s\S]{0,40}\d{1,2}:\d{2}\s*(am|pm)/i);
    console.log('  ✅ mobile check-in verified on web');
  });

  test('4 — MOBILE: Check-OUT at the geofence', async () => {
    test.setTimeout(240_000);
    expect(creds, 'earlier steps must have run').toBeTruthy();
    // The app is on the dashboard from the check-in; the work-session "Check Out" card lives there.
    const res = await mobile.checkOut(PUNCH_LAT, PUNCH_LNG);
    console.log(`  📍 Check-Out → ok=${res.ok} (${res.detail})`);
    expect(res.ok, `Check-Out should be accepted — got: ${res.detail}`).toBeTruthy();
  });

  test('5 — WEB: verify Actual Out (mobile check-out synced)', async ({ browser }) => {
    test.setTimeout(150_000);
    await new Promise(r => setTimeout(r, 4000)); // let the punch propagate
    const body = await essAttendanceText(browser, creds);
    console.log('  🧾', body.split('\n').filter(l => /Actual In|Actual Out|Worked/i.test(l)).join(' | '));
    expect(body, 'attendance should now show an Actual Out punch time').toMatch(/Actual Out[\s\S]{0,40}\d{1,2}:\d{2}\s*(am|pm)/i);
    console.log('  ✅ mobile check-out verified on web — both punches synced');
  });
});
