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
async function getAlertText(page, timeoutMs = 6000) {
  // Single combined locator so the TOTAL wait is `timeoutMs` (not per-selector).
  // The CRM may redirect on success without a lingering toast, so this returns
  // null quickly rather than blocking the whole test on each selector.
  const combined = [
    '.toast-message',          // toastr (used by this CRM)
    '.toast-success',
    '.alert-success',
    '.swal2-html-container',
    '.swal2-title',
    '.alert',
    '[role="alert"]',
    '.notification',
    '.flash-message',
  ].join(', ');
  try {
    const loc = page.locator(combined).first();
    await loc.waitFor({ state: 'visible', timeout: timeoutMs });
    return (await loc.textContent()).trim();
  } catch {
    return null;
  }
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

/**
 * The /enquiry-overview/{id} page loads its content via AJAX behind skeleton
 * placeholders. Wait for the network to settle and the action buttons to render
 * before interacting, otherwise clicks/counts hit the skeleton.
 */
async function waitOverviewReady(page, timeoutMs = 25000) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  // networkidle can stall if the app polls; cap it short and rely on the button.
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  // The "Followup" button only appears once the enquiry detail has rendered.
  await page.locator('#btn-add-followup').waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(600);
}

/**
 * Detect the backend's "Oops something went wrong / Error Code: …" SweetAlert
 * that intermittently appears after save operations (customer create, enquiry
 * save) following the recent backend changes. Dismisses it and throws a clear
 * error so the failure is actionable instead of a confusing downstream timeout.
 * Returns false (no error) on success.
 */
async function throwIfServerError(page, timeoutMs = 4000) {
  const swal = page.locator('.swal2-popup');
  const seen = await swal.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => true).catch(() => false);
  if (!seen) return false;
  const text = (await page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').trim();
  await page.locator('.swal2-confirm').click().catch(() => {});
  await swal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  if (/oops|something went wrong|error code|failed/i.test(text)) {
    throw new Error(`Backend server error on save: "${text}"`);
  }
  return false;
}

/**
 * Detect and dismiss the app's "Too many requests" rate-limit dialog
 * ("Too many attempts. Please wait a little while and try again." + OK).
 * Seen live on 2026-09-21 during a long single-session run (crm_enquiry ENQ-16,
 * ~90 min / 140+ tests in) — a genuine server-side throttle, not a UI bug.
 * A tight client-side retry loop (as in EnquiryPage.addItem) can itself walk
 * straight into this if it fires several requests in a few seconds, so callers
 * that retry should check for this and back off longer than their normal gap.
 * Returns true if the dialog was present (and has now been dismissed).
 */
async function dismissRateLimit(page, timeoutMs = 1500) {
  const dlg = page.getByText(/too many (requests|attempts)/i).first();
  const seen = await dlg.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => true).catch(() => false);
  if (!seen) return false;
  console.log('  ⏳ "Too many requests" dialog seen — dismissing and backing off');
  await page.getByRole('button', { name: /^ok$/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  return true;
}

module.exports = { screenshot, getAlertText, clickByText, selectOption, waitOverviewReady, throwIfServerError, dismissRateLimit };
