'use strict';

/**
 * Core HR — additional positive workflows (independent tests).
 *
 *   CH1 Generate an employee letter   (HR-011)  /letters/generate
 *   CH2 Complete a duty handover      (HR-012)  /employee-handover (inline)
 *   CH3 Create a letter template      (support) /letters/templates → New Template
 *
 * Mandatory fields only (see docs/automation/MANDATORY_FIELDS.md). Form selects are
 * anchored on their placeholder option ("-- Select employee --" etc.) so they are
 * never confused with the list-filter selects on the same inline page.
 * Every step asserts; creates end with a persisted/confirmed assertion.
 */
const { test, expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const { tagged } = require('../../data/naming');   // company naming standard

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe('Core HR — letters & handover', () => {
  test('CH1 — generate an employee letter (HR-011)', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    await page.goto(`${BASE}/letters/generate`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.locator('a, button, [role="button"]').filter({ hasText: /^\s*Generate\s*$/i }).first().click().catch(() => {});
    const form = await fk.scope({ ready: 'select' });

    await fk.setSelect(fk.selectWithOption(form, 'Candidate'), 'Employee', 'Letter is about');
    await fk.setSelect(fk.selectWithOption(form, 'Appoinment'), 'Appoinment', 'Template', { loose: true });
    await fk.setSelect(fk.selectWithOption(form, '-- Select branch --'), 'Main Branch', 'Branch');
    // Employee list loads after Branch — pick the first real employee.
    await fk.setCascade(fk.selectWithOption(form, '-- Select employee --'), '', 'Employee', { index: 1 });
    const employee = await fk.picked(fk.selectWithOption(form, '-- Select employee --'));

    // Leave "Email the letter" unchecked (no external send). Generate and confirm.
    const via = await fk.saveAndConfirm(
      page.locator('button, a.btn, [role="button"]').filter({ hasText: /^\s*(Generate|Generate Letter|Preview|Download)\s*$/i }).last(),
      { name: 'Generate letter', successRe: /success|generated|ready|download|preview|letter/i });
    console.log(`  ✅ CH1 letter generated for "${employee}" (${via})`);
    // A generated letter shows a confirmation with View/Download controls.
    await expect(page.getByText(/Letter generated/i).first(),
      'the "Letter generated" confirmation should appear').toBeVisible({ timeout: 20000 });
    await expect(page.locator('button, a').filter({ hasText: /Download/i }).first(),
      'a Download control should be available for the generated letter').toBeVisible({ timeout: 10000 });
    console.log('  ✅ CH1 generated-letter confirmed (View/Download available)');
  });

  test('CH2 — complete a duty handover (HR-012)', async ({ page }) => {
    test.setTimeout(200_000);
    const fk = new FormKit(page);
    const note = tagged('Covering approvals and HR tasks during annual leave');   // unique, readable marker
    await fk.gotoReady(`${BASE}/employee-handover`, { ready: /Employee going away/i, tries: 6, settle: 3000 });

    // Inline form (shares the page with the list's filter bar). Form selects use the
    // "-- Select … --" placeholders; the filter selects use "All", so these are unambiguous.
    await fk.setCascade(fk.selectWithOption(page, '-- Select employee --'), '', 'Employee going away', { index: 1 });
    const goingAway = await fk.picked(fk.selectWithOption(page, '-- Select employee --'));
    await fk.setCascade(fk.selectWithOption(page, '-- Select assignee --'), '', 'Assign duties to', { index: 2 });
    const assignee = await fk.picked(fk.selectWithOption(page, '-- Select assignee --'));
    expect(assignee, 'assignee should differ from the employee going away').not.toBe(goingAway);

    // Dates — the FORM's From*/To* are the FIRST TWO date inputs on the page (the form
    // sits above the filter bar's From/To-date). Label-anchoring ("From*"→following input)
    // hit the wrong input and left the form dates empty → the save silently no-ops, so use
    // the positional inputs (proven to persist).
    // A handover is REJECTED if its dates overlap an existing handover for the same pair
    // (correct app behaviour). The going-away/assignee are picked positionally (same pair
    // each run), so use a UNIQUE far-future window per run to avoid self-collision.
    const offsetDays = 45 + (Date.now() % 300);
    const start = new Date(Date.now() + offsetDays * 864e5);
    const end = new Date(Date.now() + (offsetDays + 1) * 864e5);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await fk.setInput(page.locator('input[type="date"]').nth(0), fmt(start), 'From');
    await fk.setInput(page.locator('input[type="date"]').nth(1), fmt(end), 'To');
    // Unique note — the reliable persistence anchor (the list has a Note column).
    await fk.setInput(page.getByText('Note', { exact: false }).first().locator('xpath=following::textarea[1]'), note, 'Note');

    // Click the exact form "Save" button (the inline page's loose save-verb buttons are
    // ambiguous, so target the exact "Save").
    const saveBtn = page.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first();
    await expect(saveBtn, 'the handover "Save" button should be visible').toBeVisible({ timeout: 15000 });
    await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await saveBtn.click();
    await page.waitForTimeout(2000);
    // Surface any post-save message. A "conflict" (overlapping dates for the same pair) is a
    // REAL rejection — fail loudly rather than silently proceed. Our unique far-future window
    // should avoid it, but if it ever fires we want to see it, not hide it.
    const postMsgs = await page.locator('.swal2-popup, .toast, .toast-body, [role="alert"], .text-danger, .invalid-feedback')
      .evaluateAll(els => els.filter(e => e.getBoundingClientRect().width > 0).map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
    const msg = [...new Set(postMsgs)].join(' | ');
    expect(msg, `handover save should not report a conflict/validation error (got: "${msg}")`).not.toMatch(/conflict|overlap|already|required|invalid/i);
    // Dismiss a success/info SweetAlert if present.
    const ok = page.locator('.swal2-confirm');
    if (await waitVisible(ok, 2000)) await ok.click().catch(() => {});
    await page.waitForTimeout(1500);
    console.log(`  ✅ CH2 handover ${goingAway} → ${assignee} created (note "${note}", ${fmt(start)})`);

    // Persisted-after-reload: the unique note appears in the handovers list. The list is
    // sorted newest-first, so the new handover is row 1 on page 1. The Employee FILTER
    // dropdown does NOT list every employee (the going-away person may be absent), so we do
    // NOT rely on it — we reset all filters to "All" and read page 1. Reload until it shows
    // (the list is prone to blank/skeleton renders).
    let found = false;
    for (let attempt = 0; attempt < 4 && !found; attempt++) {
      await fk.gotoReady(`${BASE}/employee-handover`, { ready: /Employee going away/i, tries: 6, settle: 3000 });
      const filterSelects = page.locator('select').filter({ has: page.locator('option', { hasText: /^All$/ }) });
      const fn = await filterSelects.count();
      for (let i = 0; i < fn; i++) await filterSelects.nth(i).selectOption({ label: 'All' }).catch(() => {});
      await page.waitForTimeout(3000);
      if ((await page.locator('body').innerText()).includes(note)) found = true;
    }
    await expect(page.getByText(note, { exact: false }).first(),
      `the handovers list should show the new handover (note "${note}")`).toBeVisible({ timeout: 15000 });
    console.log('  ✅ CH2 handover persisted and listed (by unique note)');
  });

  test('CH3 — create a letter template (support)', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    const tplName = tagged('Experience Letter');
    await page.goto(`${BASE}/letters/templates`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Template/i }).first().click();
    const form = await fk.scope({ ready: '#letterTemplateSubject' });

    await fk.setInput(fk.fieldByLabel(form, 'Template Name', 'input'), tplName, 'Template Name');
    await fk.setSelect(fk.selectWithOption(form, 'Candidate'), 'Employee', 'Letter is about');
    // "Type*" loads after "Letter is about" — pick the first real option.
    await fk.setCascade(fk.fieldByLabel(form, 'Type', 'select'), '', 'Type', { index: 1 });
    await fk.setInput(form.locator('#letterTemplateSubject'), 'Experience Certificate', 'Subject');

    const via = await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save template', successRe: /success|saved|created|added/i });
    console.log(`  ✅ CH3 letter template "${tplName}" created (${via})`);

    await page.goto(`${BASE}/letters/templates`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page.getByText(tplName, { exact: false }).first(), `the Templates list should show "${tplName}"`).toBeVisible({ timeout: 20000 });
    console.log('  ✅ CH3 template persisted and listed');
  });
});
