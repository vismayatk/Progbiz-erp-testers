'use strict';

class LoginPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    this.companyInput  = page.locator('input[name="company_code"]').or(
                         page.locator('input[id*="company" i]')).first();
    this.usernameInput = page.locator('input[name="username"]').or(
                         page.locator('input[id*="user" i]')).first();
    this.passwordInput = page.locator('input[type="password"]').first();
    this.submitBtn     = page.locator('button[type="submit"]').or(
                         page.locator('input[type="submit"]')).or(
                         page.getByRole('button', { name: /login|sign in/i })).first();
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  }

  async login(company, username, password) {
    console.log(`\n  🔐 LoginPage: filling credentials for "${username}" @ "${company}"`);
    await this.companyInput.fill(company);
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitBtn.click();
    await this.page.waitForFunction(
      () => !window.location.href.includes('/login'),
      { timeout: 20000 }
    );
    console.log(`  ✅ Logged in — URL: ${this.page.url()}`);
  }
}

module.exports = { LoginPage };
