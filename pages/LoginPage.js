'use strict';

class LoginPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    // exact ids on this build: #companycode, #signin-username, #signin-password
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
    this.eyeToggle     = page.locator('.password-toggle, .bi-eye, .bi-eye-slash, [class*="password-toggle"]').first();
    this.forgotLink    = page.getByText(/forgot password/i).first();
  }

  async goto() {
    // best-effort; login() re-navigates with retries
    await this.page.goto(`${this.baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  }

  /** Navigate to /login and wait for the (slow, JS-rendered) form. Returns true if the 3 fields rendered. */
  async openLogin() {
    await this.page.goto(`${this.baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    const ok = await this.companyInput.waitFor({ state: 'visible', timeout: 45000 }).then(() => true).catch(() => false);
    await this.page.waitForTimeout(500);
    return ok;
  }

  /** Login_05 — click the eye icon and report whether the password became visible (type=text). */
  async revealPassword() {
    await this.passwordInput.fill('123');
    const before = await this.passwordInput.getAttribute('type');
    await this.eyeToggle.click().catch(() => {});
    await this.page.waitForTimeout(300);
    const after = await this.passwordInput.getAttribute('type');
    return { before, after, toggled: before !== after };
  }

  /** Login_04 — fill credentials and submit via the Enter key (no button click). */
  async loginWithEnter(company, username, password) {
    await this.openLogin();
    await this.companyInput.fill(company);
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.passwordInput.press('Enter');
    return this.page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 })
      .then(() => true).catch(() => false);
  }

  /**
   * Robust login: retries the whole flow up to 3× because the SPA login form
   * (rendered after ~58 scripts + a backend call) intermittently loads slowly
   * on the test/dev tenants.
   */
  async login(company = 'lesol_test', username = 'admin', password = '123') {
    console.log(`\n  🔐 LoginPage: filling credentials for "${username}" @ "${company}"`);
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
        console.log(`  ⏳ Login attempt ${attempt} failed (${e.message.split('\n')[0].slice(0, 50)}) — retrying`);
        await this.page.waitForTimeout(3000);
      }
    }
    throw lastErr;
  }
}

module.exports = { LoginPage };
