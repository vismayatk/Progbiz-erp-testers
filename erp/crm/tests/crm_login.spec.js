'use strict';

/**
 * CRM — Login Page  (Excel "Login Page" sheet: Login_01 .. Login_08)
 * Selectors: #companycode · #signin-username · #signin-password ·
 *            eye toggle .password-toggle · "Forgot password ?" link.
 *
 * Run:  npx playwright test tests/crm_login.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { screenshot } = require('../../common/helpers');

const C = {
  company:  process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

test.describe('CRM — Login Page', () => {

  test('Login_01 | Login page loads successfully', async ({ page }) => {
    const lp = new LoginPage(page);
    const ok = await lp.openLogin();
    expect(ok, 'Login form did not render').toBeTruthy();
    await expect(lp.companyInput).toBeVisible();
    await expect(lp.usernameInput).toBeVisible();
    await expect(lp.passwordInput).toBeVisible();
    await screenshot(page, 'login01_loaded');
    console.log('  ✅ Login page loaded with Company/Username/Password fields');
  });

  test('Login_02 | Login with valid Company Code, Username and Password', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.login(C.company, C.username, C.password);
    // login() already throws unless the URL left /login, so re-checking that is a tautology.
    // Assert we actually landed on the authenticated home/dashboard (catches wrong-redirects).
    expect(page.url(), 'valid login should land on home/dashboard').toMatch(/home|dashboard/i);
    console.log('  ✅ Valid login succeeded →', page.url());
  });

  test('Login_03 | Login when Company Code is valid and mapped to user', async ({ page }) => {
    // Same tenant mapping path as Login_02 (valid mapped company → success)
    const lp = new LoginPage(page);
    await lp.login(C.company, C.username, C.password);
    // Prove the mapped company reached its tenant dashboard, not a /login-left-but-wrong page.
    expect(page.url(), 'mapped company should land on its tenant dashboard/home').toMatch(/home|dashboard/i);
    // authenticated-shell marker: the home "Create New" control (visible text like
    // "logout"/"profile" lives behind the avatar menu on some builds)
    const authed = await page.locator('#new-task').first().isVisible().catch(() => false)
      || await page.locator('text=/logout|dashboard|profile/i').first().isVisible().catch(() => false);
    expect(authed, 'expected an authenticated area for the mapped company').toBeTruthy();
    console.log('  ✅ Mapped company login succeeded');
  });

  test('Login_04 | Login using keyboard Enter key', async ({ page }) => {
    const lp = new LoginPage(page);
    const ok = await lp.loginWithEnter(C.company, C.username, C.password);
    await screenshot(page, 'login04_enter');
    expect(ok, 'Enter-key submit did not log in').toBeTruthy();
    // Confirm the Enter submit truly authenticated (reached home/dashboard), not just
    // left /login (e.g. a native GET reload to base URL would also leave /login).
    expect(page.url(), 'Enter-key login should land on home/dashboard').toMatch(/home|dashboard/i);
    console.log('  ✅ Enter-key login succeeded');
  });

  test('Login_05 | Password visibility (eye) icon', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.openLogin();
    const r = await lp.revealPassword();
    await screenshot(page, 'login05_reveal');
    console.log('  👁  password type:', JSON.stringify(r));
    expect(r.before, 'Password field should start masked').toBe('password');
    expect(r.toggled && r.after === 'text', 'Eye icon should reveal the password (type=text)').toBeTruthy();
    console.log('  ✅ Password visibility toggle works');
  });

  test('Login_06 | Remember Password option', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.openLogin();
    const cb = page.locator('input[type="checkbox"]').first();
    const present = await cb.isVisible().catch(() => false);
    test.skip(!present, 'No "Remember Password" checkbox on this build — not applicable.');
    await cb.check();
    // the checkbox must actually register as checked (catches a no-op/dead checkbox)
    expect(await cb.isChecked(), 'Remember Password checkbox must actually become checked').toBeTruthy();
    await lp.companyInput.fill(C.company);
    await lp.usernameInput.fill(C.username);
    await lp.passwordInput.fill(C.password);
    await lp.submitBtn.click();
    await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 30000 }).catch(() => {});
    expect(page.url(), 'login should succeed').not.toContain('/login');
    // Remember Password should persist a long-lived (non-session) cookie — logged as evidence
    const cookies = await page.context().cookies();
    const persistent = cookies.some(c => c.expires && c.expires > Date.now() / 1000 + 3600);
    console.log('  🍪 persistent (non-session) cookie set:', persistent);
    console.log('  ✅ Login with Remember Password succeeded (checkbox checked)');
  });

  test('Login_07 | Forgot Password link is present/navigable', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.openLogin();
    await expect(lp.forgotLink, 'Forgot Password link not found').toBeVisible();
    const before = page.url();
    await lp.forgotLink.click().catch(() => {});
    await page.waitForTimeout(1500);
    await screenshot(page, 'login07_forgot');
    console.log('  🔗 after Forgot click →', page.url());
    // The link must actually DO something: route to a reset URL or open a reset view.
    const routed = page.url() !== before && /forgot|reset|recover/i.test(page.url());
    const resetView = await page.locator('input[type="email"]')
      .or(page.getByText(/reset password|recover password|reset your password/i))
      .first().isVisible().catch(() => false);
    expect(routed || resetView, 'Forgot Password must navigate to a reset route or open a reset view').toBeTruthy();
    console.log('  ✅ Forgot Password link navigates to a reset flow');
  });

  test('Login_08 | Successful login redirects to dashboard/home', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.login(C.company, C.username, C.password);
    expect(page.url()).toMatch(/home|dashboard/i);
    await screenshot(page, 'login08_redirect');
    console.log('  ✅ Landed on', page.url());
  });
});
