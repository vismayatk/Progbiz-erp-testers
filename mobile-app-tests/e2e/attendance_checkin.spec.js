'use strict';

/**
 * MOBILE-INTEGRATED ATTENDANCE E2E — one command, web (Playwright) + mobile (Android emulator).
 *
 *   1. WEB   create a fresh employee in Core HR (login enabled; username set, password = emp code)
 *   2. ∥     MOBILE boot emulator + reset app + launch + log in as that employee
 *      ∥     WEB    (parallel) runs alongside the emulator login
 *   3. MOBILE set GPS inside the company OFFICE geofence → attendance Check-In
 *   4. WEB   verify the punch landed: ESS My Attendance = Present, Actual In set
 *
 * The emulator half is driven by ./mobileAttendance.js (adb + panel/emu.js). The web half reuses
 * the HRMS page objects/data. Non-destructive except the deliberate test employee + its punch.
 *
 * Run: npm run hrms:mobile   (or: npx playwright test -c mobile-app-tests/playwright.config.js)
 */
const { test, expect } = require('@playwright/test');
const testEmployee = require('../../hrms/data/testEmployee');
const { EmployeesPage } = require('../../hrms/pages/core-hr/EmployeesPage');
const mobile = require('./mobileAttendance');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const COMPANY = process.env.HRMS_COMPANY_CODE || 'pbhrms';
// Company-wide OFFICE geofence from /geofences (applies to every employee). Override via env.
const PUNCH_LAT = Number(process.env.HRMS_PUNCH_LAT || 11.891560);
const PUNCH_LNG = Number(process.env.HRMS_PUNCH_LNG || 75.468381);

test.describe.configure({ mode: 'serial' });

test.describe('Mobile-integrated attendance E2E (web + emulator)', () => {
  let emp;        // { username, code, email, first, display }
  let creds;      // { company, username, password }

  // Opt-in: only runs when explicitly asked (npm run hrms:mobile sets HRMS_MOBILE) or an emulator
  // is already attached — so it never tries to drive a phone that isn't there.
  test.beforeAll(() => {
    test.skip(!process.env.HRMS_MOBILE && !mobile.isBooted(),
      'mobile attendance E2E — run `npm run hrms:mobile` (needs the Android emulator)');
  });

  test('1 — WEB: create a fresh Core HR employee with mobile login', async ({ page }) => {
    test.setTimeout(300_000);
    const po = new EmployeesPage(page);
    const profile = testEmployee.forRun();     // unique first/username/email/phone, canLogin:true
    console.log(`  👤 creating "${profile.display}" — user=${profile.username}`);
    const created = await po.createEmployee(profile);
    const row = await po.findEmployeeRow(profile.email, profile.first);
    expect(row, `the register should list ${profile.display} after creation`).toBeTruthy();
    const code = row[1] || created.code;
    expect(code, 'the new employee should have an auto-generated employee code').toMatch(/^\S+$/);
    emp = { username: profile.username, code, email: profile.email, first: profile.first, display: profile.display };
    creds = { company: COMPANY, username: emp.username, password: emp.code };
    console.log(`  ✅ created ${emp.display} — code=${emp.code} (mobile password = code)`);
  });

  test('2 — MOBILE login ∥ WEB, then Check-In at the OFFICE geofence', async ({ page }) => {
    test.setTimeout(360_000);
    expect(creds, 'step 1 must have created the employee').toBeTruthy();

    // Parallel: boot/login the emulator while the web side runs alongside.
    const mobilePrep = (async () => {
      await mobile.ensureBooted();
      await mobile.launchApp({ fresh: true });          // pm clear + grant perms → clean login screen
      const ok = await mobile.login(creds);
      expect(ok, 'the ERP app should log in with the new employee credentials').toBeTruthy();
      console.log('  📱 logged into the app as the new employee');
    })();

    const webBranch = (async () => {
      await page.goto(`${BASE}/employees`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      console.log('  🌐 web branch ran in parallel with the emulator login');
    })();

    await Promise.all([mobilePrep, webBranch]);

    const res = await mobile.checkIn(PUNCH_LAT, PUNCH_LNG);
    console.log(`  📍 Check-In → ok=${res.ok} (${res.detail})`);
    expect(res.ok, `Check-In should be accepted at the OFFICE geofence — got: ${res.detail}`).toBeTruthy();
  });

  test('3 — WEB: verify the mobile punch in ESS My Attendance (Present, Actual In)', async ({ browser }) => {
    test.setTimeout(150_000);
    expect(creds, 'earlier steps must have run').toBeTruthy();
    const ctx = await browser.newContext();               // clean context — log in AS the employee
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
    console.log('  🧾 attendance:', body.split('\n').filter(l => /Present|Actual In|Actual Out|Worked|Shift|Late/i.test(l)).join(' | '));
    expect(body, 'ESS attendance should show the employee Present today').toMatch(/Present/i);
    expect(body, 'ESS attendance should show an Actual In punch time (from the mobile check-in)').toMatch(/Actual In[\s\S]{0,40}\d{1,2}:\d{2}\s*(am|pm)/i);
    console.log('  ✅ mobile check-in verified on the web — attendance Present with an Actual In time');
    await ctx.close();
  });
});
