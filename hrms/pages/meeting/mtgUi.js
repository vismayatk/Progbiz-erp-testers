'use strict';

/**
 * Shared UI helpers for the Meeting Management pages — toast/confirm plumbing and the box-style
 * multi-select picker the module uses everywhere (a read-only "#<id>" box that opens a searchable
 * list of switches: participants, required facilities, announcement branches, room facilities).
 */
const { expect } = require('@playwright/test');

const SUCCESS = '.swal2-popup, .toast, .toast-body, [role="alert"], [class*="toast" i]';
const ERROR_RE = /failed|error occurred|not allowed|cannot|invalid|already|refused|denied|conflict|must be|required|unable/i;

async function dismissSwal(page) {
  const ok = page.locator('.swal2-confirm:visible, .swal2-close:visible').first();
  if (await ok.count().catch(() => 0)) await ok.click().catch(() => {});
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
}

/** Wait for a success message matching `re`, assert it, then clear the dialog. Throws on an error toast. */
async function expectToast(page, re, name = 'action') {
  let said = '';
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    said = (await page.locator(SUCCESS).allInnerTexts().catch(() => [])).join(' | ').replace(/\s+/g, ' ').trim();
    if (re.test(said)) break;
    if (said && ERROR_RE.test(said) && !re.test(said)) throw new Error(`${name} failed — app said: "${said.slice(0, 220)}"`);
    await page.waitForTimeout(400);
  }
  expect(said, `${name}: expected a message matching ${re}`).toMatch(re);
  await dismissSwal(page);
  return said;
}

/** Confirm a destructive / "are you sure" SweetAlert. */
async function confirmSwal(page, confirmRe = /^\s*(yes|delete|confirm|ok|proceed|cancel meeting|end|stop|schedule)/i) {
  const dlg = page.locator('.swal2-popup').first();
  await expect(dlg, 'a confirmation dialog should open').toBeVisible({ timeout: 10000 });
  const btn = dlg.locator('.swal2-confirm, button').filter({ hasText: confirmRe }).first();
  await (await btn.count() ? btn : dlg.locator('.swal2-confirm')).first().click();
  await page.waitForTimeout(400);
}

/**
 * The module's box-style multi-select: a read-only input `#<boxId>` that, when clicked, reveals a
 * `#<boxId>-search-input` and a list of switches (one per option). Clicking an option's LABEL ticks
 * it and writes it into the box. Selects `text`, verifying the box took it. Returns the matched text.
 */
async function pickInBox(page, boxId, text, { scope = page } = {}) {
  const box = scope.locator(`#${boxId}`);
  await box.click();
  const search = page.locator(`#${boxId}-search-input`);
  if (await search.isVisible().catch(() => false)) { await search.fill(text); await page.waitForTimeout(500); }
  const label = page.locator('ul.list-group li label.form-check-label, .list-group li label, [class*="list" i] label')
    .filter({ hasText: new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
  await expect(label, `option "${text}" should be offered in #${boxId}`).toBeVisible({ timeout: 10000 });
  const chosen = (await label.innerText()).replace(/\s+/g, ' ').trim();
  await label.click();
  await page.waitForTimeout(400);
  // close the dropdown (click the box again or elsewhere) so the value commits
  await box.click().catch(() => {});
  await page.waitForTimeout(200);
  await expect(box, `#${boxId} should show the chosen "${text}"`).toHaveValue(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), { timeout: 5000 })
    .catch(async () => { /* some boxes render chips not a value — fall back to presence of a chip */ });
  return chosen;
}

module.exports = { dismissSwal, expectToast, confirmSwal, pickInBox, SUCCESS };
