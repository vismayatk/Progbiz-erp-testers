'use strict';

/**
 * Login page object for the HRMS ERP build (https://hrms-erp.progbiz.in).
 * Same 3-field SPA login as the other ProgBiz tenants:
 * #companycode / #signin-username / #signin-password.
 */
class HrmsLoginPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.HRMS_BASE_URL || 'https://hrms-erp.progbiz.in';

    this.companyInput  = page.locator('#companycode').or(
                         page.locator('input[name="company_code"]')).or(
                         page.locator('input[id*="company" i]')).first();
    this.usernameInput = page.locator('#signin-username').or(
                         page.locator('input[name="username"]')).or(
                         page.locator('input[id*="user" i]')).first();
    this.passwordInput = page.locator('#signin-password').or(
                         page.locator('input[type="password"]')).first();
    this.submitBtn     = page.locator('button[type="submit"]').or(
                         page.locator('input[type="submit"]')).or(
                         page.getByRole('button', { name: /login|sign in/i })).first();
  }

  /**
   * Robust login with retries (SPA form renders slowly on first hit).
   * Defaults come from env so specs never hardcode credentials:
   * HRMS_COMPANY_CODE / HRMS_USERNAME / HRMS_PASSWORD.
   */
  async login(
    company  = process.env.HRMS_COMPANY_CODE || 'Hrms',
    username = process.env.HRMS_USERNAME     || 'vismaya',
    password = process.env.HRMS_PASSWORD     || '123',
  ) {
    console.log(`\n  🔐 HrmsLoginPage: logging in "${username}" @ "${company}"`);
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.page.goto(`${this.baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await this.companyInput.waitFor({ state: 'visible', timeout: 45000 });
        await this.companyInput.fill(company);
        await this.usernameInput.fill(username);
        await this.passwordInput.fill(password);
        await this.submitBtn.click();
        await this.page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 });
        console.log(`  ✅ Logged in — URL: ${this.page.url()}`);
        return;
      } catch (e) {
        lastErr = e;
        console.log(`  ⏳ Login attempt ${attempt} failed — retrying`);
        await this.page.waitForTimeout(3000);
      }
    }
    throw lastErr;
  }

  /** Navigate to an HRMS route after login, waiting for the SPA to settle. */
  async open(route) {
    await this.page.goto(`${this.baseUrl}/${route.replace(/^\//, '')}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  }
}

module.exports = { HrmsLoginPage };
