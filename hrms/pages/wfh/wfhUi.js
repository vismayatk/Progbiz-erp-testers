'use strict';

/**
 * Shared UI helpers for the Work From Home pages — the toast/confirm plumbing this build uses
 * (SweetAlert2 popups + bootstrap toasts). Kept in one place so every WFH page object asserts
 * success the same way and dismisses dialogs without leaving a backdrop over the next action.
 */
const { expect } = require('@playwright/test');

const SUCCESS_SELECTOR = '.swal2-popup, .toast, .toast-body, [role="alert"], .notifier__notify, [class*="toast" i]';
const ERROR_RE = /failed|error occurred|not allowed|cannot|invalid|already|refused|denied|conflict|overlap|must be|negative/i;

/** Click a visible SweetAlert2 OK/confirm (success popups) to clear the backdrop. */
async function dismissSwal(page) {
  const ok = page.locator('.swal2-confirm:visible, .swal2-close:visible').first();
  if (await ok.count().catch(() => 0)) { await ok.click().catch(() => {}); }
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
}

/**
 * Wait for a success message matching `re` (e.g. /policy saved/) and assert it, then clear the
 * dialog. Throws immediately if an error-style message shows first. `name` labels the assertion.
 */
async function expectToast(page, re, name = 'action') {
  let said = '';
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    said = (await page.locator(SUCCESS_SELECTOR).allInnerTexts().catch(() => [])).join(' | ').replace(/\s+/g, ' ').trim();
    if (re.test(said)) break;
    // An error popup that is NOT the message we want → fail loudly with what it said.
    if (said && ERROR_RE.test(said) && !re.test(said)) throw new Error(`${name} failed — app said: "${said.slice(0, 200)}"`);
    await page.waitForTimeout(400);
  }
  expect(said, `${name}: the app should confirm with a message matching ${re}`).toMatch(re);
  await dismissSwal(page);
  return said;
}

/**
 * Confirm a destructive SweetAlert2 prompt ("Are you sure?" style): wait for the confirm dialog
 * and click its confirm button (Yes / Delete / Confirm / Pause / Resume / OK).
 */
async function confirmSwal(page, confirmRe = /^\s*(yes|delete|confirm|ok|pause|resume|proceed)/i) {
  const dlg = page.locator('.swal2-popup').first();
  await expect(dlg, 'a confirmation dialog should open').toBeVisible({ timeout: 10000 });
  const btn = dlg.locator('.swal2-confirm, button').filter({ hasText: confirmRe }).first();
  await (await btn.count() ? btn : dlg.locator('.swal2-confirm')).first().click();
  await page.waitForTimeout(400);
}

module.exports = { dismissSwal, expectToast, confirmSwal, SUCCESS_SELECTOR, ERROR_RE };
