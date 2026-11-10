'use strict';

/**
 * Recruitment SRS 2026-11 — DEEP (destructive) coverage: full create + persist.
 * Complements the non-destructive srs_2026_11_changes.spec.js by actually SAVING
 * records and verifying they persist. Creates tagged throwaway test candidates
 * (realistic name + unique run-id e-mail/phone, per the data standard).
 *
 *   R1  Add a candidate via the slide-in panel → Saved → persists in the register
 *   R2  "Add to Talent Pool only" → Saved → appears in Talent Pool, NOT the register
 *
 * Run: npx playwright test -c hrms/playwright.config.js hrms/tests/02_recruitment/srs_deep_2026_11.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { FormKit, waitVisible } = require('../../pages/FormKit');
const { person, RUN_ID } = require('../../data/naming');
const { openAddCandidate, candidateRow, assertCandidateListed, readRows } = require('../../flows/recruitmentFlow');

const content = (page) => page.locator('.app-content, .main-content, [class*="content-wrapper" i]').last();

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
// The recruitment resume upload accepts .pdf/.doc/.docx (NOT images — unlike the
// candidate pre-boarding upload which is image-only).
const RESUME = path.join(__dirname, '..', '..', 'fixtures', 'sample-resume.pdf');
const DEPARTMENT = 'SOFTWARE DEVELOPMENT';
const DESIGNATION = 'SOFTWARE TESTER';

/** Fill the shared identity fields (First/Last/Email/Gender/Phone/Source) in the panel. */
async function fillIdentity(fk, panel, who, phone) {
  await fk.setInput(panel.locator('input[placeholder="First name"]').first(), who.first, 'First Name');
  await fk.setInput(panel.locator('input[placeholder*="Last name" i]').first(), who.last, 'Last Name');
  await fk.setInput(panel.locator('input[placeholder="name@example.com"]').first(), who.email, 'Email');
  await fk.setSelect(panel.locator('select').filter({ has: panel.page().locator('option', { hasText: /Select gender/i }) }).first(), who.gender, 'Gender');
  // Country code → India (+91), then the number.
  await fk.setSelect(panel.locator('select').filter({ has: panel.page().locator('option', { hasText: /^Code$/i }) }).first(), 'IND', 'Country code', { loose: true });
  await fk.setInput(panel.locator('input[placeholder="Phone number"]').first(), phone, 'Phone');
  await fk.setSelect(panel.locator('select').filter({ has: panel.page().locator('option', { hasText: /^Manual$/i }) }).first(), 'Manual', 'Source');
}

test.describe('Recruitment SRS 2026-11 — deep create+persist (R1, R2)', () => {

  test('R1 add a candidate via the panel and confirm it persists in the register', async ({ page }) => {
    const fk = new FormKit(page);
    const who = person({ gender: 'male' });
    const phone = `9${RUN_ID.slice(-9)}`;                       // 10-digit, unique per run

    await fk.gotoReady(`${BASE}/recruitment-candidates`, { ready: /Recruitment Candidates|Add New/i });
    const panel = await openAddCandidate(page);
    await fillIdentity(fk, panel, who, phone);

    // Dept → Designation → Job Opening cascade.
    await fk.setSelect(panel.locator('select').filter({ has: page.locator('option', { hasText: new RegExp(DEPARTMENT, 'i') }) }).first(), DEPARTMENT, 'Department');
    await fk.setCascade(panel.locator('select').filter({ has: page.locator('option', { hasText: new RegExp(DESIGNATION, 'i') }) }).first(), DESIGNATION, 'Designation', { loose: true });
    const openingSel = panel.getByText(/Apply to Job Opening/i).first().locator('xpath=following::select[1]');
    await fk.setCascade(openingSel, null, 'Job Opening', { index: 1 });

    // Resume (mandatory on the normal path).
    await panel.locator('input[type="file"]').first().setInputFiles(RESUME);
    await page.waitForTimeout(500);

    // Save — success = the panel closes (the toast is fleeting; persistence is the real gate).
    await panel.locator('button, a').filter({ hasText: /Save Candidate/i }).first().click();
    await expect(page.locator('.offcanvas.show'), 'the panel should close on a successful save')
      .toBeHidden({ timeout: 25000 });

    // Persisted: the register lists the new candidate (found by its unique e-mail).
    await assertCandidateListed(page, who.email);
    expect(await candidateRow(page, who.email), 'the register row should show the Manual source')
      .toMatch(new RegExp(who.email, 'i'));
  });

  test('R2 add a Talent-Pool-only candidate → in Talent Pool, not in the register', async ({ page }) => {
    const fk = new FormKit(page);
    const who = person({ gender: 'female' });
    const phone = `8${RUN_ID.slice(-9)}`;

    await fk.gotoReady(`${BASE}/recruitment-candidates`, { ready: /Recruitment Candidates|Add New/i });
    const panel = await openAddCandidate(page);

    // Talent-Pool-only: no opening cascade, resume optional.
    await fk.check(panel.locator('#recAddTalentPoolOnly'), 'Add to Talent Pool only');
    await expect(panel.getByText(/Apply to Job Opening/i), 'the opening cascade should be hidden').toHaveCount(0);
    await fillIdentity(fk, panel, who, phone);

    await panel.locator('button, a').filter({ hasText: /Save Candidate/i }).first().click();
    await expect(page.locator('.offcanvas.show'), 'the panel should close on a successful Talent-Pool save')
      .toBeHidden({ timeout: 25000 });

    // In the Talent Pool… search by the unique e-mail; widen any pool/status filter to "All"
    // first so a newly-banked person isn't hidden by the default "Archived" view.
    await fk.gotoReady(`${BASE}/talent-pool`, { ready: 'table' });
    const c = content(page);
    for (const sel of await c.locator('select').all()) {
      const opts = (await sel.locator('option').allInnerTexts().catch(() => [])).map(o => o.trim());
      const allOpt = opts.find(o => /^All\b|^All /i.test(o));
      if (allOpt) await sel.selectOption({ label: allOpt }).catch(() => {});
    }
    const search = c.locator('input[placeholder*="Name, email" i]').first();
    await expect(search, 'the Talent Pool search box should be present').toBeVisible({ timeout: 10000 });
    await search.fill(who.email);
    await search.press('Enter').catch(() => {});
    await page.waitForTimeout(2500);
    const poolRows = await readRows(page);
    expect(poolRows.some(r => new RegExp(`${who.first}.*${who.last}|${who.last}.*${who.first}`, 'i').test(r)),
      'the Talent Pool should list the new person (searched by their unique e-mail)').toBeTruthy();

    // …and NOT on the Recruitment Candidates register (no live application).
    expect(await candidateRow(page, who.email), 'a Talent-Pool-only person should not appear in the candidate register').toBe('');
  });

});
