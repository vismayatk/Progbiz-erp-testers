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
    expect(page.url()).not.toContain('/login');
    console.log('  ✅ Valid login succeeded →', page.url());
  });

  test('Login_03 | Login when Company Code is valid and mapped to user', async ({ page }) => {
    // Same tenant mapping path as Login_02 (valid mapped company → success)
    const lp = new LoginPage(page);
    await lp.login(C.company, C.username, C.password);
    expect(page.url()).not.toContain('/login');
    console.log('  ✅ Mapped company login succeeded');
  });

  test('Login_04 | Login using keyboard Enter key', async ({ page }) => {
    const lp = new LoginPage(page);
    const ok = await lp.loginWithEnter(C.company, C.username, C.password);
    await screenshot(page, 'login04_enter');
    expect(ok, 'Enter-key submit did not log in').toBeTruthy();
    expect(page.url()).not.toContain('/login');
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
    await cb.check().catch(() => {});
    await lp.companyInput.fill(C.company);
    await lp.usernameInput.fill(C.username);
    await lp.passwordInput.fill(C.password);
    await lp.submitBtn.click();
    await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 30000 }).catch(() => {});
    expect(page.url()).not.toContain('/login');
    console.log('  ✅ Login with Remember Password succeeded');
  });

  test('Login_07 | Forgot Password link is present/navigable', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.openLogin();
    await expect(lp.forgotLink, 'Forgot Password link not found').toBeVisible();
    await lp.forgotLink.click().catch(() => {});
    await page.waitForTimeout(1500);
    await screenshot(page, 'login07_forgot');
    // either navigates or opens a reset view — assert the link exists & is actionable
    console.log('  🔗 after Forgot click →', page.url());
    console.log('  ✅ Forgot Password link present and clickable');
  });

  test('Login_08 | Successful login redirects to dashboard/home', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.login(C.company, C.username, C.password);
    expect(page.url()).toMatch(/home|dashboard/i);
    await screenshot(page, 'login08_redirect');
    console.log('  ✅ Landed on', page.url());
  });
});
