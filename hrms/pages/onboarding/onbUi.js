'use strict';

/** Shared UI helpers for the Onboarding-execution pages — toast/confirm plumbing (modal OR swal). */
const { expect } = require('@playwright/test');

const SUCCESS = '.swal2-popup, .toast, .toast-body, [role="alert"], [class*="toast" i]';
const ERROR_RE = /failed|error occurred|not allowed|cannot|invalid|already|refused|denied|must be|is required|unable|no record/i;

async function dismiss(page) {
  const ok = page.locator('.swal2-confirm:visible, .swal2-close:visible').first();
  if (await ok.count().catch(() => 0)) await ok.click().catch(() => {});
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/** Wait for a success message matching `re`; throw on a non-matching error toast. */
async function expectToast(page, re, name = 'action', { timeout = 25000 } = {}) {
  let said = '';
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    said = (await page.locator(SUCCESS).allInnerTexts().catch(() => [])).join(' | ').replace(/\s+/g, ' ').trim();
    if (re.test(said)) break;
    if (said && ERROR_RE.test(said) && !re.test(said)) throw new Error(`${name} failed — app said: "${said.slice(0, 220)}"`);
    await page.waitForTimeout(400);
  }
  expect(said, `${name}: expected a message matching ${re}`).toMatch(re);
  await dismiss(page);
  return said;
}

/** Confirm a Bootstrap-modal OR SweetAlert dialog (fills a reason textarea if asked). */
async function confirm(page, re = /^\s*(yes|confirm|ok|proceed|approve|complete|save|submit|extend|start|drop|mark|accept)/i, { reason } = {}) {
  const dlg = page.locator('.modal.show:visible, .swal2-popup:visible, [role="dialog"]:visible').first();
  await expect(dlg, 'a confirmation dialog should open').toBeVisible({ timeout: 10000 });
  if (reason) { const box = dlg.locator('textarea').first(); if (await box.isVisible().catch(() => false)) await box.fill(reason).catch(() => {}); }
  const btn = dlg.locator('button, .swal2-confirm').filter({ hasText: re }).filter({ hasNotText: /cancel|close|back/i }).first();
  await (await btn.count() ? btn : dlg.locator('.swal2-confirm, .btn-primary, .btn-success').first()).click();
  await page.waitForTimeout(500);
}

module.exports = { SUCCESS, dismiss, expectToast, confirm };
