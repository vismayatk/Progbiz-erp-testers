'use strict';

/**
 * Shared UI helpers for the Resignation & Exit pages — toast / SweetAlert plumbing used across the
 * list, detail, task board, interview, F&F and config pages. Mirrors the meeting module's mtgUi so
 * each module keeps its own copy (no cross-module coupling).
 */
const { expect } = require('@playwright/test');

const SUCCESS = '.swal2-popup, .toast, .toast-body, [role="alert"], [class*="toast" i]';
const ERROR_RE = /failed|error occurred|not allowed|cannot|invalid|already exist|refused|denied|must be|is required|unable|no record/i;

/** Dismiss any open SweetAlert (OK/close), best effort. */
async function dismissSwal(page) {
  const ok = page.locator('.swal2-confirm:visible, .swal2-close:visible').first();
  if (await ok.count().catch(() => 0)) await ok.click().catch(() => {});
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
}

/**
 * Wait for a success message matching `re`, assert it, clear the dialog. Throws on an error toast
 * that does NOT match `re` — so a silent failure is caught, not passed.
 */
async function expectToast(page, re, name = 'action', { timeout = 25000 } = {}) {
  let said = '';
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    said = (await page.locator(SUCCESS).allInnerTexts().catch(() => [])).join(' | ').replace(/\s+/g, ' ').trim();
    if (re.test(said)) break;
    if (said && ERROR_RE.test(said) && !re.test(said)) throw new Error(`${name} failed — app said: "${said.slice(0, 240)}"`);
    await page.waitForTimeout(400);
  }
  expect(said, `${name}: expected a message matching ${re}`).toMatch(re);
  await dismissSwal(page);
  return said;
}

/** Confirm a destructive / "are you sure" SweetAlert (Yes / Confirm / Delete / Waive / Proceed). */
async function confirmSwal(page, confirmRe = /^\s*(yes|confirm|ok|proceed|delete|waive|approve|reject|withdraw|close|complete|mark|generate|issue|skip|save)/i) {
  const dlg = page.locator('.swal2-popup').first();
  await expect(dlg, 'a confirmation dialog should open').toBeVisible({ timeout: 10000 });
  const btn = dlg.locator('.swal2-confirm, button').filter({ hasText: confirmRe }).first();
  await (await btn.count() ? btn : dlg.locator('.swal2-confirm')).first().click();
  await page.waitForTimeout(500);
}

/** True if any success/toast/swal text currently matches `re`. */
async function sawText(page, re) {
  const said = (await page.locator(SUCCESS).allInnerTexts().catch(() => [])).join(' | ');
  return re.test(said);
}

/** The visible error/validation text on the page (for diagnostics). */
async function visibleErrorText(page) {
  const els = page.locator('.invalid-feedback, .text-danger, .validation-message, .swal2-html-container, [role="alert"]');
  const n = await els.count().catch(() => 0);
  const out = [];
  for (let i = 0; i < Math.min(n, 20); i++) {
    if (await els.nth(i).isVisible().catch(() => false)) {
      const t = (await els.nth(i).innerText().catch(() => '')).trim();
      if (t) out.push(t);
    }
  }
  return out.join(' | ');
}

module.exports = { SUCCESS, ERROR_RE, dismissSwal, expectToast, confirmSwal, sawText, visibleErrorText };
