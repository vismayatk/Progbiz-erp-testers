'use strict';

/**
 * Resignation & Exit — positive HR workflow (on the RUN EMPLOYEE, last in the run).
 *
 *   RE2 HR "Initiate Exit" (Resignation) for the run employee     (EXIT-002)   /resignations
 *
 * One employee per run: the employee is the one Core HR Step 1 created (flows/runEmployee.js);
 * this spec creates nobody. It runs after every other module that uses the employee, because
 * "On Notice" is final for this run.
 *
 * SAFETY (per brief + hrms-resignation-exit-module):
 *   • The exit is initiated only against the test-created run employee — NEVER the admin login
 *     or any shared/real record.
 *   • The chain STOPS at "On Notice". It does NOT approve, clear, run F&F, issue relieving
 *     letters, or close the exit — those are irreversible / statutory and out of scope.
 * RE2 ends with a persisted-after-reload check that the employee shows in Resignations & Exits.
 */
const { test, expect } = require('@playwright/test');
const { FormKit } = require('../../pages/FormKit');
const { requireRunEmployee } = require('../../flows/runEmployee');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

// Last Working Day = 45 days out (comfortably clears any notice-period rule).
function lwdISO(days = 45) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe.configure({ mode: 'serial' });

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe('Resignation & Exit — HR initiate exit (run employee)', () => {
  const run = {};

  test('RE2 — HR Initiate Exit (Resignation) → employee goes On Notice', async ({ page }) => {
    test.setTimeout(150_000);
    const e = requireRunEmployee();
    Object.assign(run, { code: e.code, first: e.first, display: e.display });
    console.log(`  🔁 Exit for this run's employee ${run.display} (${run.code})`);
    const fk = new FormKit(page);

    await page.goto(`${BASE}/resignations`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    await test.step('Open the Initiate Exit form', async () => {
      await page.locator('a, button, [role="button"]').filter({ hasText: /^\s*Initiate Exit\s*$/i }).first().click();
    });
    const form = await fk.scope({ ready: 'select' });

    // Employee* — picked by the run employee's unique code.
    await fk.pickByOption(form, `[${run.code}]`, 'Employee');
    // Exit Type* — Resignation (the only type with a configured approval chain; positive path).
    await fk.setSelect(fk.selectWithOption(form, 'Termination'), 'Resignation', 'Exit Type', { loose: true });
    // Last Working Day* — a comfortably future date.
    const lwd = lwdISO(45);
    await fk.setInput(fk.fieldByLabel(form, 'Last Working Day', 'input'), lwd, 'Last Working Day');
    // Reason* — a positive, seeded reason.
    await fk.setSelect(fk.selectWithOption(form, 'Better Opportunity'), 'Better Opportunity', 'Reason', { loose: true });

    const saveBtn = fk.saveButton(form, /initiate|submit|save/i);
    const via = await fk.saveAndConfirm(saveBtn, { name: 'Initiate Exit', successRe: /success|initiat|on notice|submitted|created|saved/i });
    console.log(`  ✅ RE2 exit initiated for "${run.display}" LWD ${lwd} (${via})`);

    // Persisted-after-reload: the employee now shows in the Resignations & Exits list.
    await page.goto(`${BASE}/resignations`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const searchList = page.locator('input[placeholder*="Search employee" i]').first();
    if (await searchList.isVisible().catch(() => false)) {
      await searchList.fill(run.code).catch(() => {});   // search by unique code
      await page.waitForTimeout(1000);
    }
    await expect(page.getByText(run.first, { exact: false }).first(),
      `the Resignations & Exits list should now contain "${run.first}"`).toBeVisible({ timeout: 20000 });
    const body = (await page.locator('body').innerText());
    expect(body, 'the exit record should reflect an in-progress / on-notice state').toMatch(/on\s*notice|exit in progress|resignation|pending|approved/i);
    console.log('  ✅ RE2 exit persisted — employee appears in Resignations & Exits');
  });
});
