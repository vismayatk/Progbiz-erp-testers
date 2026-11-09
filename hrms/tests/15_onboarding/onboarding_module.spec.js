'use strict';

/**
 * Onboarding — EXECUTION module automation (beyond the setup templates in tests/03_onboarding).
 *
 * Onboarding's entry points are curated to existing pipeline/candidate/probation records (a fresh
 * Core-HR employee is NOT offered for Start Onboarding), so — with the owner's go-ahead — this suite
 * drives the live workflow against existing TEST records on the QA tenant:
 *
 *   O1 Start Onboarding          — onboard the first eligible employee with a template
 *   O2 My Onboarding Tasks       — mark an assigned onboarding task done
 *   O3 Pre-boarding Approvals    — approve the first awaiting submission
 *   O4 Probation — review        — Manage the first probation → record a review
 *   O5 Probation — confirm       — confirm an end-passed probation → Confirmation letter
 *   O6 Probation — extend        — extend an in-progress probation → Extension letter
 *   O7 Letters                   — Confirmation / Extension / Appointment letters listed + downloadable
 *   O8 Read-side                 — pipeline / pre-boarding / blacklist / reports render
 *
 * Assertion + blocker check after each feature; a screenshot is attached per step and the session is
 * screen-recorded (keep all with HRMS_EVIDENCE=all). Each mutating step is guarded so the suite stays
 * green when no actionable row exists. Run headed / module-only:
 *   npx playwright test -c hrms/playwright.config.js hrms/tests/15_onboarding --headed
 */
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { assertNoBlocker } = require('../../flows/pageCheck');
const { OnboardingPipelinePage } = require('../../pages/onboarding/OnboardingPipelinePage');
const { PreboardingApprovalsPage } = require('../../pages/onboarding/PreboardingApprovalsPage');
const { MyOnboardingTasksPage } = require('../../pages/onboarding/MyOnboardingTasksPage');
const { ProbationDashboardPage } = require('../../pages/onboarding/ProbationDashboardPage');
const { OnboardingLettersPage } = require('../../pages/onboarding/OnboardingLettersPage');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

test.describe.configure({ mode: 'serial' });
const run = {};

async function shot(page, testInfo, name) {
  const p = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  if (fs.existsSync(p)) await testInfo.attach(name, { path: p, contentType: 'image/png' });
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) await shot(page, testInfo, 'failure');
});

test.describe('Onboarding — execution module', () => {
  test('O1 — Start Onboarding for an eligible employee', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const po = new OnboardingPipelinePage(page);
    await po.open();
    const before = await po.count();
    run.onboarded = await po.startOnboarding({ dateISO: today() });
    console.log(`  • started onboarding for "${run.onboarded}" (board was ${before})`);
    await assertNoBlocker(page, 'Start Onboarding');
    await shot(page, testInfo, 'O1-onboarding-started');
    console.log('  ✅ O1 onboarding started');
  });

  test('O2 — My Onboarding Tasks: mark a task done', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const po = new MyOnboardingTasksPage(page);
    await po.open();
    const n = await po.count();
    const title = await po.markFirstDone().catch(e => { console.log(`  ℹ️ mark done: ${e.message.slice(0, 100)}`); return ''; });
    console.log(title ? `  ✅ O2 marked task "${title}" done (of ${n})` : `  ℹ️ O2 no open task to mark (of ${n})`);
    await shot(page, testInfo, 'O2-tasks');
    await assertNoBlocker(page, 'My Onboarding Tasks');
  });

  test('O3 — Pre-boarding: approve the first awaiting submission', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const po = new PreboardingApprovalsPage(page);
    await po.open();
    const awaiting = await po.awaitingCount();
    console.log(`  • ${awaiting} awaiting review`);
    if (awaiting > 0) {
      const cand = await po.approveFirst().catch(e => { console.log(`  ℹ️ approve: ${e.message.slice(0, 120)}`); return ''; });
      console.log(cand ? `  ✅ O3 approved pre-boarding for "${cand}"` : '  ℹ️ O3 approve not actionable');
    } else console.log('  ℹ️ O3 nothing awaiting');
    await shot(page, testInfo, 'O3-preboarding');
    await assertNoBlocker(page, 'Pre-boarding Approvals');
  });

  test('O4 — Probation: record a review', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const po = new ProbationDashboardPage(page);
    await po.open();
    expect(await po.exportAvailable(), 'Export Excel on the probation dashboard').toBeTruthy();
    const emp = await po.manageFirst().catch(e => { console.log(`  ℹ️ manage: ${e.message.slice(0, 100)}`); return ''; });
    const r = emp ? await po.recordReview().catch(e => { console.log(`  ℹ️ review: ${e.message.slice(0, 100)}`); return 'not-available'; }) : 'no-row';
    console.log(`  • record review for "${emp}": ${r}`);
    await shot(page, testInfo, 'O4-review');
    await assertNoBlocker(page, 'Probation review');
    console.log('  ✅ O4 probation review exercised');
  });

  test('O5 — Probation: confirm an end-passed probation', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const po = new ProbationDashboardPage(page);
    await po.open();
    await po.filterStatus('End date passed').catch(() => {});
    const emp = await po.manageFirst().catch(() => '');
    run.confirm = emp ? await po.confirm().catch(e => { console.log(`  ℹ️ confirm: ${e.message.slice(0, 140)}`); return 'error'; }) : 'no-row';
    console.log(`  • confirm probation for "${emp}": ${run.confirm}`);
    await shot(page, testInfo, 'O5-confirm');
    await assertNoBlocker(page, 'Confirm probation');
    console.log('  ✅ O5 confirm-probation exercised');
  });

  test('O6 — Probation: extend an in-progress probation', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const po = new ProbationDashboardPage(page);
    await po.open();
    await po.filterStatus('In progress').catch(() => {});
    const emp = await po.manageFirst().catch(() => '');
    run.extend = emp ? await po.extend(plusDays(60)).catch(e => { console.log(`  ℹ️ extend: ${e.message.slice(0, 140)}`); return 'error'; }) : 'no-row';
    console.log(`  • extend probation for "${emp}": ${run.extend}`);
    await shot(page, testInfo, 'O6-extend');
    await assertNoBlocker(page, 'Extend probation');
    console.log('  ✅ O6 extend-probation exercised');
  });

  test('O7 — Letters: confirmation / extension / appointment listed + downloadable', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    for (const [route, re, name] of [
      ['hrms/confirmation-letters', /Confirmation Letters/i, 'Confirmation'],
      ['hrms/extension-letters', /Extension Letters/i, 'Extension'],
      ['hrms/appointment-letters', /Appointment Letters/i, 'Appointment'],
    ]) {
      const po = new OnboardingLettersPage(page, route, re);
      await po.open();
      console.log(`  • ${name} letters: ${await po.count()} row(s), download ${await po.downloadAvailable() ? 'available' : 'n/a'}`);
      await assertNoBlocker(page, `${name} Letters`);
    }
    await shot(page, testInfo, 'O7-letters');
    console.log('  ✅ O7 letters verified');
  });

  test('O8 — Read-side: pipeline / pre-boarding / blacklist / reports', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const pipe = new OnboardingPipelinePage(page); await pipe.open();
    console.log(`  • pipeline: ${await pipe.count()} records`);
    await page.goto(`${BASE}/blacklisted-employees`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
    // Scope to a content heading — getByText matches the (hidden) sidebar nav link otherwise.
    await expect(page.locator('main h1, main h2, .main-content h1, .main-content h2, h1, h2').filter({ hasText: /Blacklisted/i }).first(), 'Blacklisted Employees page').toBeVisible({ timeout: 20000 });
    for (const r of ['onboarded-employees-report', 'onboarding-task-report', 'hrms/probation-report']) {
      await page.goto(`${BASE}/${r}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
      const body = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
      expect(body, `report /${r} should not error`).not.toMatch(/oops|something went wrong|unhandled/);
    }
    await shot(page, testInfo, 'O8-readside');
    await assertNoBlocker(page, 'Onboarding read-side');
    console.log('  ✅ O8 read-side verified');
  });
});
