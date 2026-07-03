/**
 * LoginPage.js
 * ---------------------------------------------------------------------------
 * Page Object for the PROGBIZ ERP Login page (https://erp.progbiz.io/login).
 *
 * LOCATOR STRATEGY (priority): getByRole > getByLabel > getByPlaceholder >
 * getByText > data-testid > CSS > XPath.
 *
 * The source document describes the controls but does NOT provide DOM
 * selectors, so the locators below are *inferred* from the documented field
 * names/labels/placeholders. High-confidence ones (button/link/placeholder that
 * the doc quotes) are used directly; low-confidence ones are marked with
 * `// TODO` and given a reasonable fallback. Verify against the live DOM
 * (`npm run codegen`) and adjust as needed.
 */

'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('./BasePage');
const { urls } = require('../utils/testData');

class LoginPage extends BasePage {
  constructor(page, logger) {
    super(page, logger);

    // --- Fields ---------------------------------------------------------
    // Doc: Company Code placeholder reads 'company code' (TC_LOGIN_03) -> high confidence.
    this.companyCode = page
      .getByPlaceholder(/company\s*code/i)
      .or(page.getByLabel(/company\s*code/i));

    // Doc label: 'User Name'. TODO: confirm exact label/placeholder in live DOM.
    this.username = page
      .getByLabel(/user\s*name/i)
      .or(page.getByPlaceholder(/user\s*name|username/i));

    // Password: prefer label; fall back to the password input type.
    this.password = page
      .getByLabel(/^password$/i)
      .or(page.locator('input[type="password"]'));

    // --- Buttons / links / headings ------------------------------------
    this.signInButton = page.getByRole('button', { name: /sign\s*in/i }); // high confidence
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot\s*password/i }); // high confidence
    this.signInHeading = page.getByRole('heading', { name: /sign\s*in/i });
    this.logo = page.getByRole('img', { name: /progbiz|erp|logo/i }); // TODO: confirm logo accessible name

    // Show/hide password "eye" icon. TODO: no accessible name documented; this is
    // a best guess (a clickable control inside/next to the password group). Verify.
    this.passwordToggle = page
      .getByRole('button', { name: /show password|hide password|toggle/i })
      .or(page.locator('.password-eye, [class*="eye"], button:near(input[type="password"])').first());
  }

  /* ----------------------------- navigation ------------------------------ */

  /** Open the login page and wait until it is ready. */
  async open() {
    await this.goto(urls.login);
  }

  /* ----------------------------- field actions --------------------------- */

  async enterCompanyCode(value) {
    await this.fill(this.companyCode, value, 'Company Code');
  }

  async enterUsername(value) {
    await this.fill(this.username, value, 'User Name');
  }

  async enterPassword(value) {
    await this.fill(this.password, value, 'Password');
  }

  async clickSignIn() {
    await this.click(this.signInButton, 'Sign In button');
  }

  /* ----------------------------- reusable flow --------------------------- */

  /**
   * Reusable login. Only fills fields whose value is a non-undefined string,
   * so it also supports the "leave field blank" negative cases.
   *
   * @param {object} data
   * @param {string} [data.companyCode]
   * @param {string} [data.username]
   * @param {string} [data.password]
   * @param {boolean} [submit=true]  whether to click Sign In afterwards
   */
  async login(data = {}, submit = true) {
    const { companyCode, username, password } = data;

    if (companyCode !== undefined) {
      await this.logger.step(
        'Entering Company Code',
        () => this.enterCompanyCode(companyCode),
        'Company Code entered'
      );
    }
    if (username !== undefined) {
      await this.logger.step(
        'Entering User Name',
        () => this.enterUsername(username),
        'User Name entered'
      );
    }
    if (password !== undefined) {
      await this.logger.step(
        'Entering Password',
        () => this.enterPassword(password),
        'Password entered'
      );
    }
    if (submit) {
      await this.logger.step('Click Sign In', () => this.clickSignIn(), 'Sign In button clicked');
    }
  }

  /** Submit the form by pressing Enter from the password field (TC_LOGIN_08). */
  async submitWithEnter() {
    await this.password.press('Enter');
  }

  /** Toggle password visibility via the eye icon. */
  async togglePasswordVisibility() {
    await this.click(this.passwordToggle, 'Password show/hide toggle');
  }

  /** Current `type` attribute of the password input ('password' | 'text'). */
  async passwordInputType() {
    return this.password.getAttribute('type');
  }

  /* ----------------------------- assertions helpers ---------------------- */

  /**
   * Locate a visible validation message by its text (used by blank-field cases).
   * @param {string|RegExp} text
   */
  validationMessage(text) {
    return this.page.getByText(text, { exact: false });
  }

  /** True when still on the login page (URL still contains /login). */
  async isOnLoginPage() {
    return /\/login/i.test(this.page.url());
  }

  /** Assert the core login controls are present (TC_LOGIN_01/02). */
  async expectLoaded() {
    await expect(this.companyCode, 'Company Code field visible').toBeVisible();
    await expect(this.username, 'User Name field visible').toBeVisible();
    await expect(this.password, 'Password field visible').toBeVisible();
    await expect(this.signInButton, 'Sign In button visible').toBeVisible();
  }
}

module.exports = { LoginPage };
