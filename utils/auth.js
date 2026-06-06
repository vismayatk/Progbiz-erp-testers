'use strict';

/**
 * Reusable login function — call from any test file.
 * Reads credentials from environment variables (set via .env or process.env).
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [creds]
 * @param {string} [creds.company]
 * @param {string} [creds.username]
 * @param {string} [creds.password]
 */
async function login(page, creds = {}) {
  const company  = creds.company  || process.env.COMPANY_CODE || 'skiolo_test';
  const username = creds.username || process.env.USERNAME      || 'admin';
  const password = creds.password || process.env.PASSWORD      || '123';
  const baseUrl  = process.env.BASE_URL || 'https://erptest.progbiz.in';

  console.log(`\n  🔐 Logging in as "${username}" @ "${company}" ...`);

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });

  // Company code
  await page.locator('input[name="company_code"], input[id*="company" i], input[placeholder*="company" i]')
            .first()
            .fill(company);

  // Username
  await page.locator('input[name="username"], input[id*="user" i], input[placeholder*="user" i]')
            .first()
            .fill(username);

  // Password
  await page.locator('input[type="password"]').first().fill(password);

  // Submit
  await page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")')
            .first()
            .click();

  // Wait until we leave the login page
  await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 20000 });

  console.log(`  ✅ Login successful — current URL: ${page.url()}`);
}

module.exports = { login };
