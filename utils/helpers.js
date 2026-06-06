'use strict';

const path = require('path');
const fs   = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * Capture a named screenshot into screenshots/.
 * @param {import('@playwright/test').Page} page
 * @param {string} name  - filename without extension
 */
async function screenshot(page, name) {
  ensureScreenshotDir();
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 Screenshot saved: screenshots/${name}.png`);
}

/**
 * Wait for a toast / success alert to appear and return its text.
 * Tries common selectors used by Bootstrap / custom CRM themes.
 */
async function getAlertText(page, timeoutMs = 10000) {
  const selectors = [
    '.alert-success',
    '.toast-success',
    '.swal2-success',
    '[class*="success"]',
    '.alert',
    '[role="alert"]',
    '.notification',
    '.flash-message',
  ];
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'visible', timeout: timeoutMs });
      return (await loc.textContent()).trim();
    } catch {
      // try next selector
    }
  }
  return null;
}

/**
 * Click a button / link that contains the given text (case-insensitive partial).
 */
async function clickByText(page, text) {
  await page.getByRole('button', { name: new RegExp(text, 'i') })
            .or(page.getByRole('link', { name: new RegExp(text, 'i') }))
            .first()
            .click();
}

/**
 * Select an option from a <select> or custom dropdown by visible text.
 */
async function selectOption(page, locator, value) {
  const el = page.locator(locator);
  const tag = await el.evaluate(n => n.tagName.toLowerCase());
  if (tag === 'select') {
    await el.selectOption({ label: value });
  } else {
    await el.click();
    await page.getByRole('option', { name: value }).click();
  }
}

module.exports = { screenshot, getAlertText, clickByText, selectOption };
