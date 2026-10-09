'use strict';

/**
 * Onboarding — buildable positive setup workflows (independent tests).
 *
 *   ON1 Create an Onboarding Template  (ONB-002 support)  /onboarding-templates (inline)
 *   ON2 Create a Training Course       (support)          /training-courses → New Course
 *
 * Additive master-data creates, mandatory fields only. The full "Start Onboarding" flow
 * (ONB-001) unlocks only after an invited candidate submits their pre-boarding details
 * (candidate-side; see recruitment R9d).
 * Every step asserts; each create ends with a persisted-after-reload assertion.
 */
const { test, expect } = require('@playwright/test');
const { FormKit } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const { tagged } = require('../../data/naming');   // company naming standard

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe('Onboarding — setup master data', () => {
  // ON1 — Onboarding Template is a multi-level builder: Template Name → ≥1 Pipeline Stage →
  // each stage needs ≥1 Task (Task name / Owner / Due days / Required) — the app refuses an
  // empty stage ("No tasks — add at least one… It cannot be saved empty.").
  test('ON1 — create an Onboarding Template with a stage + task (ONB-002)', async ({ page }) => {
    test.setTimeout(150_000);
    const fk = new FormKit(page);
    const name = tagged('Software Tester Onboarding');
    await fk.gotoReady(`${BASE}/onboarding-templates`, { ready: /New Template/i });
    await page.locator('a, button').filter({ hasText: /New Template/i }).first().click();

    const nameInput = page.locator('label').filter({ hasText: /^\s*Template Name/ }).locator('xpath=following::input[1]').first();
    await expect(nameInput, 'the template editor should open').toBeVisible({ timeout: 15000 });
    await fk.setInput(nameInput, name, 'Template Name');

    await page.locator('button').filter({ hasText: /Add Stage/i }).first().click();
    const stage = page.getByPlaceholder('Stage name').first();
    await expect(stage, 'a stage should be added').toBeVisible({ timeout: 10000 });
    await fk.setInput(stage, 'Day 1 Orientation', 'Stage Name');

    await page.locator('button').filter({ hasText: /Add Task/i }).first().click();
    const task = page.getByPlaceholder('Task name').first();
    await expect(task, 'a task row should be added to the stage').toBeVisible({ timeout: 10000 });
    await fk.setInput(task, 'Collect signed offer letter and ID proof', 'Task');
    const taskRow = task.locator('xpath=ancestor::tr[1]');
    await fk.setSelect(taskRow.locator('select').first(), 'Reporting Manager', 'Owner');
    await fk.setInput(taskRow.locator('input[type="number"]').first(), '1', 'Due (days after joining)');
    const required = taskRow.locator('input[type="checkbox"]').first();
    await required.check();
    await expect(required, 'the task should be marked Required').toBeChecked();

    await page.locator('button').filter({ hasText: /^\s*Save Template\s*$/i }).first().click();
    console.log(`  ✅ ON1 template "${name}" saved`);
    // Persisted check: the list card reads "<name> 1 stage(s) · 1 task(s)" after a fresh load.
    await expect.poll(async () => {
      await fk.gotoReady(`${BASE}/onboarding-templates`, { ready: /New Template/i });
      await page.waitForTimeout(1500);
      return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    }, { timeout: 60000, intervals: [2000, 5000], message: `the templates list should show "${name}" with 1 stage and 1 task` })
      .toContain(`${name} 1 stage(s) · 1 task(s)`);
    console.log('  ✅ ON1 template persisted (1 stage · 1 task)');
  });

  test('ON2 — create a Training Course', async ({ page }) => {
    test.setTimeout(100_000);
    const fk = new FormKit(page);
    const course = tagged('Workplace Safety Induction');
    await page.goto(`${BASE}/training-courses`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Course/i }).first().click();
    const form = await fk.scope({ ready: 'select' });

    await fk.setInput(fk.fieldByLabel(form, 'Course Name', 'input'), course, 'Course Name');
    await fk.setSelect(fk.selectWithOption(form, 'Specific Employee'), 'Self', 'Provider/Instructor');
    const via = await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save course', successRe: /success|saved|created|added/i });
    console.log(`  ✅ ON2 training course "${course}" created (${via})`);

    await page.goto(`${BASE}/training-courses`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page.getByText(course, { exact: false }).first(), `the Training Courses list should show "${course}"`).toBeVisible({ timeout: 20000 });
    console.log('  ✅ ON2 training course persisted and listed');
  });
});
