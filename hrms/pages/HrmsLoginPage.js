'use strict';

/**
 * Login page object for the HRMS build (https://hrms-test.progbiz.in, company pbhrms).
 * Same 3-field SPA login as the other ProgBiz tenants:
 * #companycode / #signin-username / #signin-password.
 */
class HrmsLoginPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

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
    // HRMS has its own tenant: never fall back to the ERP login (COMPANY_CODE /
    // CRM_USERNAME / PASSWORD point at the ERP tenant, e.g. onetouch_test).
    // Defaults match the tenant the HRMS suite targets: company pbhrms, user amit.
    company  = process.env.HRMS_COMPANY_CODE || 'pbhrms',
    username = process.env.HRMS_USERNAME     || 'amit',
    password = process.env.HRMS_PASSWORD,
  ) {
    if (!password) {
      throw new Error(`HRMS_PASSWORD is not set — add it to .env (HRMS target: ${this.baseUrl}, company "${company}", user "${username}").`);
    }
    console.log(`\n  🔐 HrmsLoginPage: logging in "${username}" @ "${company}"`);
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // The HRMS app downloads ~10 MB before it draws the form: usually ~5 s, but
        // at slow moments 40 s+ (seen 2026-10-10). Wait generously, and treat a
        // redirect away from /login as success — a slow earlier attempt may have
        // signed in after all, and /login then never shows the form again.
        await this.page.goto(`${this.baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        // (each branch settles to a value, so the losing one can't fail later unhandled)
        const state = await Promise.race([
          this.companyInput.waitFor({ state: 'visible', timeout: 120000 }).then(() => 'form', () => null),
          this.page.waitForURL((u) => !/\/login/i.test(String(u)), { timeout: 120000 }).then(() => 'signed-in', () => null),
        ]);
        if (!state) throw new Error('HRMS login form did not appear within 120 s');
        if (state === 'signed-in') {
          console.log(`  ✅ Already signed in — URL: ${this.page.url()}`);
          return;
        }
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
