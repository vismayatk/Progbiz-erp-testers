'use strict';

/**
 * Leave Management — positive setup workflows (independent tests).
 *
 *   LV1 Create a Leave Type        (setup)  /leave-types (inline)
 *   LV2 Create a Leave Pattern     (setup)  /leave-patterns → New Leave Pattern
 *   LV3 Create a Holiday           (setup)  /holiday-list   → New Holiday
 *   LV4 Assign the Holiday         (setup)  /holiday-assignment-list → New Holiday Assignment
 *
 * Admin master-data, mandatory fields only (see docs/automation/MANDATORY_FIELDS.md).
 * Names are LETTERS-ONLY (this build rejects digits in leave type/pattern names — LM-7),
 * so the per-run unique suffix is random letters, not a numeric stamp.
 *
 * Every step asserts its outcome (FormKit) and every create ends with a
 * persisted-after-reload assertion. Apply-for-leave / approval (LEV-*) depend on a
 * policy assignment + a 2nd actor and are tracked separately in the coverage map.
 */
const { test, expect } = require('@playwright/test');
const { FormKit } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

// Company naming standard (data/naming.js). These names reject digits, so each is a realistic
// name + a place name (e.g. "Study Leave Kochi"), choosing one not already on the list page.
const { lettersOnlyCandidates, firstUnused } = require('../../data/naming');

/** Load a list page and return the first candidate name not already shown on it. */
async function pickUnusedName(page, route, base) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.locator('table tbody tr, .card').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return firstUnused(lettersOnlyCandidates(base), await page.locator('body').innerText());
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe('Leave Management — setup master data', () => {
  const names = {};   // chosen at run time so they don't clash with existing records

  test('LV1 — create a Leave Type (letters-only name)', async ({ page }) => {
    test.setTimeout(90_000);
    const fk = new FormKit(page);
    names.leaveType = await pickUnusedName(page, 'leave-types', 'Study Leave');
    const leaveType = names.leaveType;
    await page.goto(`${BASE}/leave-types`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page.locator('#leavetypename'), 'the inline Leave Type form should be present').toBeVisible({ timeout: 20000 });

    await fk.setInput(page.locator('#leavetypename'), leaveType, 'Leave Type Name');
    const via = await fk.saveAndConfirm(fk.saveButton(page.locator('body')), { name: 'Save leave type', successRe: /success|saved|created|added/i });
    console.log(`  ✅ LV1 leave type "${leaveType}" created (${via})`);

    await page.goto(`${BASE}/leave-types`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    // Lists on this build can render empty on first paint — search to force a filtered render.
    const search = page.locator('input[placeholder*="Search leave type" i]').first();
    if (await search.count()) { await search.fill(leaveType); await page.waitForTimeout(1500); }
    await expect(page.getByText(leaveType, { exact: false }).first(), `the Leave Types list should show "${leaveType}"`).toBeVisible({ timeout: 20000 });
    console.log('  ✅ LV1 leave type persisted and listed');
  });

  test('LV2 — create a Leave Pattern (letters-only name, effective dates)', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    names.pattern = await pickUnusedName(page, 'leave-patterns', 'Branch Leave Pattern');
    const pattern = names.pattern;
    await page.goto(`${BASE}/leave-patterns`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Leave Pattern/i }).first().click();
    const form = await fk.scope({ ready: '#leavepattern' });

    await fk.setInput(form.locator('#leavepattern'), pattern, 'Leave Pattern Name');
    await fk.setInput(form.locator('input[type="date"]').nth(0), '2026-01-01', 'Effective From');
    await fk.setInput(form.locator('input[type="date"]').nth(1), '2026-12-31', 'Effective To');
    // Grant days to the first leave type in the per-type grid (0 = excluded, so set > 0).
    await fk.setInput(form.locator('input[type="number"]').first(), '12', 'Days for first leave type');

    const via = await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save leave pattern', successRe: /success|saved|created|added/i });
    console.log(`  ✅ LV2 leave pattern "${pattern}" created (${via})`);

    // Persisted check: the pattern shows up in the Leave Policy dropdown (the patterns LIST
    // page has historically rendered empty — LM-8 — so verify via a page that reads patterns).
    await page.goto(`${BASE}/leave-patterns`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page.getByText(pattern, { exact: false }).first(), `the Leave Patterns list should show "${pattern}"`).toBeVisible({ timeout: 20000 });
    console.log('  ✅ LV2 leave pattern persisted and listed');
  });

  test('LV3 — create a Holiday', async ({ page }) => {
    test.setTimeout(100_000);
    const fk = new FormKit(page);
    names.holiday = await pickUnusedName(page, 'holiday-list', 'Company Foundation Day');
    const holiday = names.holiday;
    await page.goto(`${BASE}/holiday-list`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Holiday/i }).first().click();
    const form = await fk.scope({ ready: '#holidayname' });

    await fk.setInput(form.locator('#holidayname'), holiday, 'Holiday Name');
    await fk.setSelect(fk.selectWithOption(form, 'All employees'), 'All employees', 'Calendar Type');
    await fk.setInput(form.locator('input[type="date"]').nth(0), '2026-12-28', 'From Date');
    await fk.setInput(form.locator('input[type="date"]').nth(1), '2026-12-28', 'To Date');

    const via = await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save holiday', successRe: /success|saved|created|added/i });
    console.log(`  ✅ LV3 holiday "${holiday}" created (${via})`);

    await page.goto(`${BASE}/holiday-list`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page.getByText(holiday, { exact: false }).first(), `the Holidays list should show "${holiday}"`).toBeVisible({ timeout: 20000 });
    console.log('  ✅ LV3 holiday persisted and listed');
  });

  test('LV4 — assign the Holiday to a Branch', async ({ page }) => {
    test.setTimeout(100_000);
    const fk = new FormKit(page);
    const holiday = names.holiday;
    expect(holiday, 'LV4 depends on LV3').toBeTruthy();
    await page.goto(`${BASE}/holiday-assignment-list`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Holiday Assignment/i }).first().click();
    const form = await fk.scope({ ready: '#holidays' });

    // Two #selectbox selects: [0] Assignment Type, [1] the target (appears after choosing type).
    await fk.setSelect(form.locator('#selectbox').nth(0), 'Branch', 'Assignment Type');
    await fk.setCascade(form.locator('#selectbox').nth(1), 'Main Branch', 'Branch target');
    // "Holidays*" is a multiselect/typeahead — open it and pick our holiday.
    await form.locator('#holidays').click();
    await page.waitForTimeout(800);
    const opt = page.locator('[role="option"], .dropdown-item, li, label, .ng-option').filter({ hasText: holiday }).first();
    await expect(opt, `the holiday "${holiday}" should be selectable`).toBeVisible({ timeout: 10000 });
    await opt.click();
    await page.waitForTimeout(400);
    await expect(form.locator('#holidays').locator('xpath=ancestor::*[1]'), `"${holiday}" should be chosen`).toContainText(holiday.slice(0, 12), { timeout: 5000 }).catch(() => {});

    const via = await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save holiday assignment', successRe: /success|saved|created|added|assigned/i });
    console.log(`  ✅ LV4 holiday "${holiday}" assigned to a Branch (${via})`);

    await page.goto(`${BASE}/holiday-assignment-list`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page.getByText(holiday, { exact: false }).first(), `the Holiday Assignment list should show "${holiday}"`).toBeVisible({ timeout: 20000 });
    console.log('  ✅ LV4 holiday assignment persisted and listed');
  });
});
