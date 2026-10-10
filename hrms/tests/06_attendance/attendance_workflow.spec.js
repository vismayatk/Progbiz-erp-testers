'use strict';

/**
 * Attendance — positive setup workflows (independent tests).
 *
 *   AT1 Create a Shift        (ATT-001)  /shifts    → New Shift
 *   AT2 Create a Geofence     (ATT-011)  /geofences → Add Location
 *
 * Admin master-data, mandatory fields only (see docs/automation/MANDATORY_FIELDS.md).
 * Check-in/out, regularisation, late-in/early-out and comp-off (ATT-002..010) are
 * employee/device/date-dependent and tracked as Blocked in the coverage map — they
 * need the supported `/attendance-test-data` generator, never arbitrary waits.
 *
 * Tests are independent (not a serial chain) — each creates and verifies its own record.
 */
const { test, expect } = require('@playwright/test');
const { FormKit } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const { tagged, RUN_ID } = require('../../data/naming');

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe('Attendance — setup master data', () => {
  test('AT1 — create a work Shift (ATT-001)', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    const shiftName = tagged('General Shift');
    await page.goto(`${BASE}/shifts`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Shift/i }).first().click();
    const form = await fk.scope({ ready: 'input[type="time"]' });

    await fk.setInput(fk.fieldByLabel(form, 'Shift Name', 'input'), shiftName, 'Shift Name');
    await fk.setSelect(fk.selectWithOption(form, 'Standard'), 'Standard', 'Type');
    // Two time inputs in order: Start, End.
    await fk.setInput(form.locator('input[type="time"]').nth(0), '09:00', 'Start Time');
    await fk.setInput(form.locator('input[type="time"]').nth(1), '18:00', 'End Time');

    const via = await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save shift', successRe: /success|saved|created|added/i });
    console.log(`  ✅ AT1 shift "${shiftName}" created (${via})`);

    // Verify it persists in the list.
    await page.goto(`${BASE}/shifts`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page.getByText(shiftName, { exact: false }).first(), `the shifts list should show "${shiftName}"`).toBeVisible({ timeout: 20000 });
    console.log(`  ✅ AT1 shift persisted and listed`);
  });

  test('AT2 — create an employee Geofence (ATT-011)', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    const locName = tagged('Kochi Office Main Gate');
    await page.goto(`${BASE}/geofences`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.locator('a, button, [role="button"]').filter({ hasText: /Add Location/i }).first().click();
    const form = await fk.scope({ ready: 'select' });

    await fk.setSelect(fk.selectWithOption(form, 'Company-wide'), 'Employee', 'Scope');
    // Employee select appears when Scope=Employee; pick the first real employee.
    await fk.setCascade(fk.selectWithOption(form, '-- select --'), '', 'Employee', { index: 1 });
    await fk.setInput(fk.fieldByLabel(form, 'Location Name', 'input'), locName, 'Location Name');
    // Unique point per run: the app (correctly) rejects a second geofence at the SAME point +
    // radius for the same employee, so a fixed 10.0/76.3 collides with earlier runs.
    const lat = (10 + Number(RUN_ID.slice(-6)) / 1e7).toFixed(6);   // 10.0xxxxx — still in Kerala, unique per run
    const lng = (76.3 + Number(RUN_ID.slice(-6)) / 1e7).toFixed(6);
    await fk.setInput(fk.fieldByLabel(form, 'Latitude', 'input'), lat, 'Latitude');
    await fk.setInput(fk.fieldByLabel(form, 'Longitude', 'input'), lng, 'Longitude');
    await fk.setInput(fk.fieldByLabel(form, 'Radius', 'input'), '100', 'Radius (m)');

    const via = await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save geofence', successRe: /success|saved|created|added/i });
    console.log(`  ✅ AT2 geofence "${locName}" created (${via})`);

    await page.goto(`${BASE}/geofences`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page.getByText(locName, { exact: false }).first(), `the geofences list should show "${locName}"`).toBeVisible({ timeout: 20000 });
    console.log(`  ✅ AT2 geofence persisted and listed`);
  });
});
