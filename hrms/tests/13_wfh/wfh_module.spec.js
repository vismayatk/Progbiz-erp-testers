'use strict';

/**
 * Work From Home — positive-workflow automation, built from "WFH SRS" v1.0 (2026-10-28).
 *
 * Walks the module in SRS workflow order (§9): Setup (policies → assignments), then the employee
 * request life cycle (ESS), HR revert via the approval list, HR on-behalf add, the monthly report,
 * and the calendars. Every step asserts its own outcome (the exact success message + the row/state
 * it produced) and, after each action, checks for an application BLOCKER — the "Oops / something
 * went wrong / contact admin" crash screen (flows/pageCheck.js). A failing step is recorded with a
 * full-page screenshot and the walk carries on in the same tab; failures, blockers and any access
 * gaps are listed at the end. Screen recording + trace are kept for a failure by the suite config
 * (HRMS_EVIDENCE=all keeps everything).
 *
 * ACTOR: everything runs as the admin `amit`, who has WfhSetup + WfhManagement and (granted
 * 2026-10-31) access to the ESS Work From Home page — so amit is also the employee for the ESS
 * life cycle (a real employee record, Mon–Fri shift). Regular employees (e.g. the run employee)
 * are still denied /ess/wfh on this tenant, so the on-behalf add targets the run employee while the
 * self-service apply/revert run as amit.
 *
 * Run ONLY this module, headed:
 *   $env:HEADED=1; npx playwright test -c hrms/playwright.config.js hrms/tests/13_wfh
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { WfhPoliciesPage } = require('../../pages/wfh/WfhPoliciesPage');
const { WfhAssignmentsPage } = require('../../pages/wfh/WfhAssignmentsPage');
const { WfhEssPage } = require('../../pages/wfh/WfhEssPage');
const { WfhApprovalListPage } = require('../../pages/wfh/WfhApprovalListPage');
const { WfhHrAddPage } = require('../../pages/wfh/WfhHrAddPage');
const { WfhReportPage } = require('../../pages/wfh/WfhReportPage');
const { withUser } = require('../../flows/userSession');
const { assertNoBlocker, detectBlocker } = require('../../flows/pageCheck');
const { policies, todayISO, daysFromTodayISO, workingDaysAhead } = require('../../data/wfhData');
const { RUN_ID } = require('../../data/naming');
const { VIEWPORT, VIDEO_SIZE } = require('../../fixtures/window');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const AUTH = path.join(__dirname, '..', '..', '.auth');
const STATE = path.join(AUTH, 'state.json');
const SESSIONS = path.join(__dirname, '..', '..', '..', 'test-results', 'hrms', '_wfh');
const safe = s => s.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();

// amit is the ESS employee; the run employee (if present) is the on-behalf target.
const AMIT = { target: '[progbiz0017]', name: 'Amit Kumar Shaji' };
const runEmp = fs.existsSync(path.join(AUTH, 'run-employee.json'))
  ? JSON.parse(fs.readFileSync(path.join(AUTH, 'run-employee.json'), 'utf-8')) : null;

test('Work From Home — full module walk (setup → ESS → approval → HR add → report → calendars)', async ({ browser }, testInfo) => {
  test.setTimeout(90 * 60 * 1000);
  fs.mkdirSync(SESSIONS, { recursive: true });
  const context = await browser.newContext({
    storageState: STATE, viewport: VIEWPORT, recordVideo: { dir: SESSIONS, size: VIDEO_SIZE },
  });
  const page = await context.newPage();
  const results = [];
  const gaps = [];
  const P = policies();
  const blackout = daysFromTodayISO(5);
  // A pool of future working days (blackout excluded). The ESS apply / HR add pick the first the live
  // check accepts, skipping any day a prior run already requested — so the walk is re-runnable without
  // colliding with leftover approved days that cannot be withdrawn.
  const dayPool = workingDaysAhead(14, { startOffset: 3, skip: [blackout] });
  const usedDays = [];
  const reasonFull = `QA WFH full day ${RUN_ID}`;
  const reasonHalf = `QA WFH half day ${RUN_ID}`;
  const reasonHr = `QA WFH on-behalf ${RUN_ID}`;

  const step = async (label, fn) => {
    await test.step(label, async () => {
      const t0 = Date.now();
      try {
        await fn();
        await assertNoBlocker(page, label);
        results.push({ label, ok: true, secs: Math.round((Date.now() - t0) / 1000) });
        console.log(`  ✅ ${label} (${Math.round((Date.now() - t0) / 1000)}s)`);
      } catch (e) {
        const shot = testInfo.outputPath(`${safe(label)} — failure.png`);
        await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
        if (fs.existsSync(shot)) await testInfo.attach(`${label} — page at failure`, { path: shot, contentType: 'image/png' });
        const msg = String(e && e.message || e).split('\n').slice(0, 6).join(' ').replace(/\x1b\[[0-9;]*m/g, '');
        const blocker = /BLOCKER —/.test(msg);
        results.push({ label, ok: false, blocker, error: msg, secs: Math.round((Date.now() - t0) / 1000) });
        console.log(`  ${blocker ? '🚧' : '❌'} ${label} — ${msg.slice(0, 260)} | URL: ${page.url()}`);
        expect.soft(false, `${label}: ${msg}`).toBe(true);
      }
    });
  };
  const recordAccess = async (label, route) => {
    await test.step(`ACCESS ${label} (/${route})`, async () => {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      const denied = /Access Denied|don't have Permission|not authori[sz]ed/i.test(body);
      const blk = await detectBlocker(page);
      const shot = testInfo.outputPath(`access ${safe(label)}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      if (fs.existsSync(shot)) await testInfo.attach(`${label} — access state`, { path: shot, contentType: 'image/png' });
      const state = blk.blocked ? `BLOCKER (${blk.snippet})` : denied ? 'Access Denied' : 'Accessible';
      gaps.push({ label, route, state });
      console.log(`  ${state === 'Accessible' ? '🔓' : '🔒'} ${label} (/${route}) → ${state}`);
    });
  };

  try {
    // ── 1. POLICIES (WfhSetup) ────────────────────────────────────────────────
    const pol = new WfhPoliciesPage(page);
    await step('Policies — page loads (heading, New Policy, grid)', async () => {
      await pol.open();
      await expect(pol.gridHeaders.first(), 'the policy grid has headers').toBeVisible();
    });
    await step('Policy · create On request (limit/notice/emergency/past/half/blackout)', () => pol.createPolicy(P.onRequest));
    await step('Policy · create Fixed pattern — Weekdays (Tue + Thu)', () => pol.createPolicy(P.weekdays));
    await step('Policy · create Fixed pattern — Dates of the month (1, 15)', () => pol.createPolicy(P.dates));
    await step('Policy · create Fixed pattern — Working days (first 3)', () => pol.createPolicy(P.workingDays));
    await step('Policy · create Fixed pattern — Rotation (weekly, cycle 2)', () => pol.createPolicy(P.rotation));
    await step('Policy · create Fully remote', () => pol.createPolicy(P.remote));
    await step('Policy · validation — monthly limit 31.5 refused (0–31, whole/half)', () =>
      pol.expectValidation('Monthly limit', '31.5', /between 0 and 31, in whole or half days|monthly limit must be/i, { name: 'Monthly-limit boundary' }));
    await step('Policy · validation — negative day count refused', () =>
      pol.expectValidation('Notice (days)', '-1', /cannot be negative|between 0/i, { name: 'Negative day count' }));
    await step('Policy · deactivate then reactivate the On request policy', async () => {
      // Status=All so the row stays findable after it is turned Inactive (the list defaults to Active).
      await pol.open(); await pol.filterBy({ status: 'All', name: P.onRequest.name });
      await pol.setActive(P.onRequest.name, false);
      await pol.open(); await pol.filterBy({ status: 'All', name: P.onRequest.name });
      await pol.setActive(P.onRequest.name, true);
    });
    await step('Policy · filter by Type = Fully remote shows the remote policy', async () => {
      await pol.open();
      await pol.filterBy({ type: 'Fully remote' });
      await expect(pol.rowByName(P.remote.name), 'the Fully remote policy is listed').toBeVisible({ timeout: 10000 });
    });
    await step('Policy · delete the Dates-of-the-month policy', async () => {
      await pol.open();
      await pol.filterBy({ name: P.dates.name });
      await pol.deleteByName(P.dates.name);
    });

    // ── 2. ASSIGNMENTS (WfhSetup) — assign On request to the ESS employee ──────
    // Prefer the REAL two-actor pattern: assign to the run employee, then log in AS that employee
    // to apply. The run employee is still gated out of /ess/wfh on this tenant, so fall back to
    // amit (who has ESS access) until the Employee role is granted the ESS Work From Home
    // permission — at which point this automatically switches to the true per-employee login.
    const asg = new WfhAssignmentsPage(page);
    let essActor = { name: AMIT.name, target: AMIT.target, creds: null, real: false };
    await step('ESS actor — does the run employee have /ess/wfh access? (decides login path)', async () => {
      if (!runEmp) { gaps.push({ label: 'ESS actor', route: 'ess/wfh', state: 'No run-employee.json — using amit' }); return; }
      let ok = false;
      try {
        ok = await withUser(browser, testInfo, { username: runEmp.username, password: runEmp.code }, async (ep) => {
          await ep.goto(`${BASE}/ess/wfh`, { waitUntil: 'domcontentloaded' });
          await ep.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
          await ep.waitForTimeout(2000);
          return !/Access Denied|don't have Permission/i.test((await ep.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' '));
        });
      } catch { ok = false; }
      if (ok) { essActor = { name: runEmp.display, target: `[${runEmp.code}]`, creds: { username: runEmp.username, password: runEmp.code }, real: true }; }
      console.log(`  → ESS will run as ${essActor.name}${essActor.real ? ' (real employee login)' : ' (amit fallback — employee /ess/wfh gated)'}`);
    });
    // Run a function in the ESS actor's session: the employee's own login, else the admin page.
    const runEss = fn => essActor.creds ? withUser(browser, testInfo, essActor.creds, fn) : fn(page);

    await step('Assignments — page loads (heading, New Assignment, grid)', async () => {
      await asg.open();
      await expect(asg.gridHeaders.first(), 'the assignment grid has headers').toBeVisible();
    });
    // Give the ESS employee an active assignment on our On-request policy from today. Reuse their
    // existing assignment if any (it may be un-deletable with requests under it and un-endable
    // because it starts today) by repointing it to our policy — avoiding a second-assignment overlap.
    const fromTomorrow = daysFromTodayISO(1);
    await step(`Assignment · assign On request to ${essActor.name} from today (create or repoint)`, () =>
      asg.ensureAssignment(essActor.name, P.onRequest.name, essActor.target, todayISO()));
    await step('Assignment · edit remarks and re-save', () => asg.editRemarks(P.onRequest.name, `Automation WFH edited ${RUN_ID}`));
    await step('Assignment · pause then resume', async () => { await asg.pause(P.onRequest.name); await asg.resume(P.onRequest.name); });
    // Delete-button coverage on a throwaway assignment with no requests (so Delete is enabled):
    // a Weekdays policy assigned to amit (our admin only), then removed. Best-effort; amit must not
    // be the ESS actor here, and amit must not already have an un-deletable assignment.
    if (essActor.name !== AMIT.name) {
      await step('Assignment · create + delete a throwaway assignment (Delete button)', async () => {
        await asg.endActiveFor(AMIT.name);
        await asg.createAssignment({ policyName: P.weekdays.name, scope: 'Employee', target: AMIT.target, from: fromTomorrow, workflow: 'Auto-approve', remarks: `Automation WFH throwaway ${RUN_ID}` });
        await asg.deleteRow(P.weekdays.name);
      });
    }

    // ── 3. EMPLOYEE REQUEST LIFE CYCLE — logged in AS the employee (or amit) ───
    const polRe = new RegExp(P.onRequest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    await step(`ESS · ${essActor.name} applies & reverts work from home (apply full + half, revert)`, async () => {
      await runEss(async (ep) => {
        const ess = new WfhEssPage(ep);
        await ess.open();
        await expect(ep.getByText(polRe).first(), 'the ESS policy card names our On request policy').toBeVisible({ timeout: 15000 });
        // apply a full day → auto-approved (first free day from the pool)
        const full = await ess.apply({ days: dayPool, reason: reasonFull });
        expect(full.status, 'full-day request auto-approved').toBe('approved');
        usedDays.push(full.day);
        await assertNoBlocker(ep, 'ESS apply full day');
        expect(await ess.statusOf(reasonFull), 'the request row shows Approved').toMatch(/approved/i);
        // apply a half day (second half) → auto-approved (a different free day)
        const half = await ess.apply({ days: dayPool.filter(d => !usedDays.includes(d)), reason: reasonHalf, half: true, halfType: 2 });
        expect(half.status, 'half-day request auto-approved').toBe('approved');
        usedDays.push(half.day);
        await assertNoBlocker(ep, 'ESS apply half day');
        // both requests show Approved in My Requests (month-independent — the days may fall next month)
        await ess.open();
        expect(await ess.statusOf(reasonFull), 'the full-day request shows Approved').toMatch(/approved/i);
        expect(await ess.statusOf(reasonHalf), 'the half-day request shows Approved').toMatch(/approved/i);
        console.log('    ESS usage card:', JSON.stringify(await ess.usage()));
        // request a revert of the approved full day
        await ess.requestRevert(reasonFull);
        await assertNoBlocker(ep, 'ESS request revert');
      });
    });

    // ── 4. HR REVERT via the Approval list (WfhManagement) ────────────────────
    const appr = new WfhApprovalListPage(page);
    await step('Work From Home Approval — list loads, filter by Approved', async () => {
      await appr.open();
      await appr.filterStatus('Approved');
    });
    await step('Work From Home Approval · HR reverts the approved half-day request', async () => {
      await appr.open();
      await appr.filterStatus('Approved');
      await appr.filterRange(daysFromTodayISO(-2), daysFromTodayISO(45));   // cover the future WFH day
      await appr.search(essActor.name.split(' ')[0]).catch(() => {});       // narrow to the employee
      await appr.revertByReason(reasonHalf);
    });

    // ── 5. HR ADD for an employee (WfhManagement) ─────────────────────────────
    const hr = new WfhHrAddPage(page);
    const hrTarget = runEmp ? `[${runEmp.code}]` : AMIT.target;
    await step('Add Work From Home for Employee — page loads', () => hr.open());
    await step(`HR · add a work-from-home day for ${runEmp ? runEmp.display : AMIT.name} (approved at once)`, async () => {
      await hr.addFor({ employee: hrTarget, days: dayPool.filter(d => !usedDays.includes(d)), reason: reasonHr });
      await hr.verifyListed(reasonHr);
    });

    // ── 6. MONTHLY REPORT (WfhManagement) ─────────────────────────────────────
    const rep = new WfhReportPage(page);
    await step('Work From Home Report — loads, filter to this month + amit, read the row', async () => {
      await rep.open();
      await rep.setMonth(todayISO().slice(0, 7));
      const heads = await rep.headers();
      expect(heads.join(' '), 'report headers').toMatch(/Work From Home Days/i);
      await rep.filterEmployee(AMIT.name).catch(() => {});
    });

    // ── 7. CALENDARS (best-effort page checks; WFH chips need approved days) ───
    for (const [label, route] of [['My Attendance', 'ess/attendance'], ['Leave Calendar', 'leave-calendar']]) {
      await step(`Calendar · ${label} loads without error`, async () => {
        await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);
        const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
        if (/Access Denied|nothing at this address/i.test(body)) { gaps.push({ label, route, state: /Access Denied/i.test(body) ? 'Access Denied' : 'Route missing' }); return; }
        await assertNoBlocker(page, label);
      });
    }

    // ── 8. Clean up: revert the HR-added day (so approved days don't accumulate against the monthly
    //        limit across runs), then end the ESS actor's assignment (it has requests under it, so
    //        Delete is disabled — end-dating is the valid teardown). ──
    await step('Work From Home Approval · revert the HR-added day (clean up)', async () => {
      await appr.open();
      await appr.filterStatus('Approved');
      await appr.filterRange(daysFromTodayISO(-2), daysFromTodayISO(45));
      await appr.revertByReason(reasonHr);
    }).catch(() => {});
    await step(`Assignment · end the ${essActor.name} assignment (clean up)`, async () => {
      await asg.open();
      await asg.endActiveFor(essActor.name);
    });

    // ── Record the employee-login gap when the amit fallback had to be used ────
    if (runEmp && !essActor.real) gaps.push({ label: `Per-employee ESS login (${runEmp.display})`, route: 'ess/wfh', state: 'Access Denied — grant the Employee role the ESS Work From Home permission to enable the true employee login (ran as amit this time)' });
  } finally {
    const video = page.video();
    await context.close();
    if (video) {
      const d = new Date(); const pad = x => String(x).padStart(2, '0');
      await video.saveAs(path.join(SESSIONS, `wfh-run ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.webm`)).catch(() => {});
      await video.delete().catch(() => {});
    }
    const failed = results.filter(r => !r.ok);
    const blockers = failed.filter(r => r.blocker);
    console.log(`\n  📋 WFH module: ${results.length} steps · ${results.length - failed.length} passed · ${failed.filter(r => !r.blocker).length} failed · ${blockers.length} blocked (app error)`);
    for (const f of failed.filter(r => !r.blocker)) console.log(`     ❌ ${f.label} — ${f.error.slice(0, 180)}`);
    for (const b of blockers) console.log(`     🚧 ${b.label} — ${b.error.slice(0, 200)}`);
    if (gaps.length) { console.log(`\n  🔒 Access / coverage notes:`); for (const g of gaps) console.log(`     • ${g.label} (/${g.route}) — ${g.state}`); }
    fs.writeFileSync(testInfo.outputPath('wfh-results.json'), JSON.stringify({ results, gaps }, null, 2));
    await testInfo.attach('wfh-results', { path: testInfo.outputPath('wfh-results.json'), contentType: 'application/json' });
  }
});
