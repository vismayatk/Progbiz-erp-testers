'use strict';

/**
 * Task Management — documented Test Cases & Scenarios (Create New → Task modal flow)
 * Source: "Test cases.html" (TC_TASK_001..072) + "Test scenarios.html" (Scenario 1..15)
 *
 *   TM-09  Create New menu + Add Task modal structure   TC_001-016, 025, 030
 *   TM-10  Create an Instant Task (modal)               TC_017, 026-028 · Scenario 1
 *   TM-11  Create a Task for Later (scheduled)          TC_029-034, 043 · Scenario 2
 *   TM-12  Repeat mode fields                           (recurring schedule)
 *   TM-13  Negative — missing Task Type rejected        (mandatory-field)
 *   TM-14  Negative — missing Task title rejected       (mandatory-field)
 *   TM-15  My Task page columns                         TC_054-055 · Scenario 9
 *   TM-16  Created Task page + actions                  TC_048-053 · Scenario 8
 *   TM-17  Delegated Tasks (Assignees) column           (delegation)
 *   TM-18  Unscheduled Task page + row actions          TC_062-068 · Scenario 11
 *   TM-19  Status tabs (Pending/Overdue/Completed)      TC_057-059
 *   TM-20  Task lifecycle controls on dashboard         TC_044-056 · Scenario 4
 *   TM-21  Daily Activity Report                        TC_069-072 · Scenario 12
 *   TM-22  Calendar & Timeline reachable                Scenario 6 (single-user part)
 *   TM-23  Multi-user participant/admin visibility      TC_018-024 · Scenarios 5,6 (skipped — needs 2nd login)
 *
 * Run:  npx playwright test tests/task_management_modal.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { TaskManagementPage } = require('../pages/TaskManagementPage');
const { screenshot } = require('../../common/helpers');

const CREDS = {
  company:  process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

/** Log in and return a ready TaskManagementPage. */
async function arrive(page) {
  const login = new LoginPage(page);
  const tm = new TaskManagementPage(page);
  await login.goto();
  await login.login(CREDS.company, CREDS.username, CREDS.password);
  return tm;
}

test.describe('Task Management — Documented Cases', () => {

  test('TM-09 | Create New menu + Add Task modal structure', async ({ page }) => {
    const tm = await arrive(page);

    // TC_001 — Create New exposes Task / Enquiry / Quotation
    const opts = await tm.getCreateNewOptions();
    console.log('  📂 Create New options:', JSON.stringify(opts));
    for (const o of ['Task', 'Enquiry', 'Quotation']) {
      expect(opts.map(s => s.toLowerCase())).toContain(o.toLowerCase());
    }

    // TC_002 — Task opens the Add Task modal
    await tm.openTaskModal();
    await expect(tm.modal).toBeVisible();
    await expect(page.locator('#home-create-task-modal, #crm-home-create-task-modal').first()).toContainText(/Add Task/i);

    // TC_003 / TC_004 — Instant default, three modes present
    expect(await tm.activeMode()).toMatch(/instant/i);
    for (const t of [tm.tabInstant, tm.tabLater, tm.tabRepeat]) await expect(t).toBeVisible();

    // TC_005 / TC_006 — Branch dropdown lists branches, Kannur default
    const branches = await tm.getBranchOptions();
    console.log('  🏢 Branches:', JSON.stringify(branches));
    expect(branches).toContain('Kannur');
    const branchSelected = (await tm.branchSelect.locator('option:checked').first().textContent()) || '';
    expect(branchSelected, 'Main branch (Kannur) should be the default').toMatch(/Kannur/i);

    // TC_008 — predefined Task Types. The list is TENANT master data (e.g. "Complaint"
    // exists on lesol_test but not lesol_dev) — require the core types every tenant has.
    const types = (await tm.getTaskTypeOptions()).map(s => s.trim());
    console.log('  🏷️  Task Types:', JSON.stringify(types));
    for (const t of ['Call', 'Online Meeting']) expect(types).toContain(t);
    expect(types.length, 'task type list should offer real choices').toBeGreaterThan(3);

    // TC_010 — Priority options
    const prio = (await tm.getPriorityOptions()).map(s => s.trim());
    console.log('  ⚑ Priorities:', JSON.stringify(prio));
    for (const p of ['Normal', 'Medium', 'High']) expect(prio).toContain(p);

    // TC_012 / TC_025 — title + description accept input
    await tm.taskInput.fill('Structure probe');
    await tm.descInput.fill('desc probe');
    expect(await tm.taskInput.inputValue()).toBe('Structure probe');
    expect(await tm.descInput.inputValue()).toBe('desc probe');

    // TC_013-016, 030 — party / participant / host controls
    const ctl = await tm.modalControls();
    console.log('  🔧 Controls:', JSON.stringify(ctl));
    expect(ctl.party, 'Party search field').toBeTruthy();
    expect(ctl.partySearchBtn, 'Party search button').toBeTruthy();
    expect(ctl.partyAddBtn, 'Party add (+)').toBeTruthy();
    expect(ctl.participantAdd, 'Participants add').toBeTruthy();

    await screenshot(page, 'tm09_modal_structure');
    console.log('  ✅ ASSERT: Add Task modal structure matches documented spec');
  });

  test('TM-10 | Create an Instant Task via the modal (Scenario 1)', async ({ page }) => {
    test.setTimeout(300_000);   // create + cross-tab visibility check on a slow tenant
    const tm = await arrive(page);
    const name = `Instant ${Date.now()}`;
    const msg = await tm.createViaModal(name, { type: 'Call', priority: 'Normal', description: 'instant via modal' });
    await screenshot(page, 'tm10_instant');
    expect(msg, `Instant task should save, got: "${msg}"`).toBeFalsy();
    console.log(`  ✅ ASSERT: Instant task "${name}" created (TC_017/026/028)`);

    // TC_027 — data round-trip: the created task must appear in My Tasks
    const tab = await tm.findAcrossTabs(name);
    console.log(`  🔎 "${name}" visible in My Tasks under tab: ${tab}`);
    expect(tab, `Instant task "${name}" not found on any My Tasks tab`).toBeTruthy();
  });

  test('TM-11 | Create a Task for Later — Hosts + scheduling (Scenario 2)', async ({ page }) => {
    test.setTimeout(300_000);   // create + cross-tab visibility check on a slow tenant
    const tm = await arrive(page);
    await tm.openTaskModal();

    // TC_030 — Host field appears in Task for Later
    await tm.selectMode('later');
    const ctl = await tm.modalControls();
    console.log('  🔧 Later controls:', JSON.stringify(ctl));
    expect(ctl.hostsLabel || ctl.hostAdd, 'Host field in Task for Later').toBeTruthy();
    expect(ctl.deadlineToggle, 'scheduling/deadline toggle').toBeTruthy();

    // TC_033/034/043 — schedule a future date/time and save
    const name = `LaterModal ${Date.now()}`;
    await tm.branchSelect.evaluate(s => { if (!s.value) s.selectedIndex = 0; }).catch(() => {});
    await tm.taskTypeSelect.selectOption({ label: 'Call' }).catch(() => {});
    await tm.taskInput.fill(name);
    // party BEFORE schedule (mandatory on DEV; the pick re-renders the form)
    await tm.choosePartyIfRequired();
    await tm.ensureSelfHost();
    const tgl = tm.deadlineToggle;
    if (await tgl.isVisible().catch(() => false)) { await tgl.click({ force: true }).catch(() => {}); await page.waitForTimeout(800); }
    const d = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await tm.modal.locator('input[type="date"]:visible').first().fill(d).catch(() => {});
    await tm.modal.locator('input[type="date"]:visible').first().blur().catch(() => {});
    await tm.modal.locator('input[type="time"]:visible').first().fill('10:00').catch(() => {});
    await tm.modal.locator('input[type="time"]:visible').first().blur().catch(() => {});
    await page.waitForTimeout(800);
    await tm.saveBtn.click();
    await page.waitForTimeout(2500);
    const msg = await tm._afterSave();
    await screenshot(page, 'tm11_later');
    expect(msg, `Scheduled task should save, got: "${msg}"`).toBeFalsy();
    // Data round-trip: scheduled task must be listed in My Tasks
    const tab = await tm.findAcrossTabs(name);
    console.log(`  🔎 "${name}" visible under tab: ${tab}`);
    expect(tab, `Task-for-Later "${name}" not listed in My Tasks`).toBeTruthy();
    console.log(`  ✅ ASSERT: Scheduled "Task for Later" "${name}" created and listed`);
  });

  test('TM-12 | Repeat mode — recurring schedule fields + create (NEW feature, not in doc)', async ({ page }) => {
    test.setTimeout(300_000);   // create + cross-tab visibility check on a slow tenant
    const tm = await arrive(page);
    await tm.openTaskModal();
    await tm.selectMode('repeat');

    // Structure: recurrence + Start/End Time + From/To Date
    const ui = await page.evaluate(() => {
      const m = document.querySelector('#home-create-task-modal, #crm-home-create-task-modal');
      const labels = [...m.querySelectorAll('label, .form-label')].map(l => l.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const recur = [...m.querySelectorAll('label,button,span,.day')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => /^(Daily|Weekly|Monthly)$/i.test(t));
      return { labels: labels.join(' | '), recur: [...new Set(recur)] };
    });
    console.log('  🔁 Repeat labels:', ui.labels, '| recurrence:', JSON.stringify(ui.recur));
    expect(ui.labels).toMatch(/Start Time/i);
    expect(ui.labels).toMatch(/End Time/i);
    expect(ui.labels).toMatch(/From Date/i);
    expect(ui.labels).toMatch(/To Date/i);
    expect(ui.recur, 'recurrence options Daily/Weekly/Monthly').toEqual(expect.arrayContaining(['Daily', 'Weekly', 'Monthly']));
    await screenshot(page, 'tm12_repeat_fields');

    // Actually create a recurring task (Daily)
    const name = `Repeat ${Date.now()}`;
    const msg = await tm.createRepeatTask(name, { type: 'Call', recurrence: 'Daily' });
    await screenshot(page, 'tm12_repeat_created');
    // _afterSave() returns null on genuine success AND on a silent no-op, so a falsy msg
    // alone can't confirm creation. A recurring task's occurrences are future-scheduled
    // (so they may be absent from today's My Tasks), but the task itself must appear in
    // Created Tasks — assert that as the real data round-trip.
    expect(msg, `Repeat task should save, got: "${msg}"`).toBeFalsy();
    await tm.gotoCreated();
    let listed = false;
    let where = 'Created Tasks';
    if (await tm.isDeadRoute()) {
      // DEV build removed /created-tasks — verify via My Tasks tabs / home schedule instead
      where = 'My Tasks tabs';
      listed = !!(await tm.findAcrossTabs(name));
      if (!listed) {
        await tm.gotoHome();
        listed = await page.evaluate((n) => document.body.innerText.includes(n), name);
        where = 'home schedule';
      }
    } else {
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      for (let i = 0; i < 4 && !listed; i++) {
        listed = await page.evaluate((n) =>
          [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent || '').includes(n)), name);
        if (!listed) await page.waitForTimeout(1200);
      }
    }
    console.log(`  🔎 "${name}" listed in ${where}: ${listed}`);
    expect(listed, `Repeat task "${name}" not visible in ${where} after save`).toBeTruthy();
    console.log(`  ✅ ASSERT: Repeat (recurring) task "${name}" created and listed in ${where}`);
  });

  test('TM-13 | Negative — Save without Task Type is rejected', async ({ page }) => {
    const tm = await arrive(page);
    const msg = await tm.createViaModal(`NoType ${Date.now()}`, { skipType: true });
    await screenshot(page, 'tm13_no_type');
    expect(msg, `Missing Task Type should be rejected, saved instead (msg="${msg}")`).toBeTruthy();
    console.log(`  ✅ ASSERT: Rejected missing Task Type — "${msg}"`);
  });

  test('TM-14 | Negative — Save without Task title is rejected', async ({ page }) => {
    const tm = await arrive(page);
    const msg = await tm.createViaModal(null, { type: 'Call' });   // leave title empty
    await screenshot(page, 'tm14_no_title');
    expect(msg, `Missing Task title should be rejected, saved instead (msg="${msg}")`).toBeTruthy();
    console.log(`  ✅ ASSERT: Rejected missing Task title — "${msg}"`);
  });

  test('TM-15 | My Task page columns (TC_054-055)', async ({ page }) => {
    const tm = await arrive(page);
    await tm.gotoMyTasks();
    expect(page.url()).toContain('/my-tasks');
    const cols = await tm.getColumns();
    console.log('  🧾 My Tasks columns:', JSON.stringify(cols));
    const joined = cols.join(' | ');
    for (const c of ['Status', 'Task', 'Task Type', 'Added on']) expect(joined).toMatch(new RegExp(c, 'i'));
    await screenshot(page, 'tm15_mytask_cols');
    console.log('  ✅ ASSERT: My Task page shows documented columns');
  });

  test('TM-16 | Created Task page loads with actions (TC_048-053)', async ({ page }) => {
    const tm = await arrive(page);
    await tm.gotoCreated();
    test.skip(await tm.isDeadRoute(), 'This build has no /created-tasks route (removed in the DEV redesign).');
    expect(page.url()).toContain('created-tasks');
    const cols = await tm.getColumns();
    const kinds = await tm.rowActionKinds();
    console.log('  🧾 Created columns:', JSON.stringify(cols), '| actions:', JSON.stringify(kinds));
    await screenshot(page, 'tm16_created');
    // Array.isArray(kinds) is always true (tautology). This suite creates tasks (TM-10/11/12),
    // so Created Tasks must list rows, and those rows must expose the overview action.
    const createdRows = await page.locator('table tbody tr').count();
    expect(createdRows, 'Created Tasks should list tasks this suite created (TM-10/11/12)').toBeGreaterThan(0);
    expect(kinds, 'each Created-task row must expose an overview control').toEqual(expect.arrayContaining(['overview-task']));
    console.log('  ✅ ASSERT: Created Task page lists rows with actions (', kinds.join(',') || 'none', ')');
  });

  test('TM-17 | Delegated Tasks shows Assignees column', async ({ page }) => {
    const tm = await arrive(page);
    await tm.gotoDelegated();
    expect(page.url()).toContain('delegated-tasks');
    const cols = await tm.getColumns();
    console.log('  🧾 Delegated columns:', JSON.stringify(cols));
    expect(cols.join(' | ')).toMatch(/Assignees/i);
    await screenshot(page, 'tm17_delegated');
    console.log('  ✅ ASSERT: Delegated Tasks shows Assignees');
  });

  test('TM-18 | Unscheduled Task page + row actions (TC_062-068, Scenario 11)', async ({ page }) => {
    const tm = await arrive(page);
    await tm.gotoUnscheduled();
    test.skip(await tm.isDeadRoute(), 'This build has no /unscheduled-tasks route (removed in the DEV redesign).');
    expect(page.url()).toContain('unscheduled-tasks');
    const cols = await tm.getColumns();
    const kinds = await tm.rowActionKinds();
    console.log('  🧾 Unscheduled columns:', JSON.stringify(cols), '| actions:', JSON.stringify(kinds));
    await screenshot(page, 'tm18_unscheduled');
    // Array.isArray(kinds) is always true. Assert the table header rendered, and that
    // any rows present expose row actions (Unscheduled can legitimately be empty).
    expect(cols.join(' | '), 'Unscheduled table header must render').toMatch(/Task/i);
    const unschedRows = await page.locator('table tbody tr').count();
    if (unschedRows > 0) {
      expect(kinds.some(k => /edit-task|delete-task|overview-task/.test(k)),
        'Unscheduled rows present but no row actions rendered').toBeTruthy();
    }
    console.log('  ✅ ASSERT: Unscheduled page reachable (rows:', unschedRows, 'actions:', kinds.join(',') || 'none', ')');
  });

  test('TM-19 | Status tabs Pending/Overdue/Completed navigable (TC_057-059)', async ({ page }) => {
    const tm = await arrive(page);
    await tm.gotoMyTasks();
    // wait until the list is interactive (a too-early click no-ops on the Blazor circuit)
    const hasData = await page.waitForFunction(() =>
      [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent || '').trim().length > 0),
      { timeout: 20000 }).then(() => true).catch(() => false);
    if (!hasData) {
      // On DEV, party-attached tasks are delegated to the party owner, so admin's My Tasks
      // can be legitimately empty — run the same tab check on Delegated Tasks instead.
      console.log('  ℹ️  My Tasks empty for this user — checking the Delegated Tasks tabs instead');
      await tm.gotoDelegated();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent || '').trim().length > 0),
        { timeout: 20000 }).catch(() => {});
    }
    const counts = await tm.getTabCounts();
    console.log('  📊 Tab badges:', JSON.stringify(counts));
    let topRows = {};
    let renderedSomewhere = false;
    // up to 2 rounds: transient skeleton/no-data loads produce all-empty top rows -
    // reload once and retry before failing
    for (let round = 0; round < 2; round++) {
      topRows = {}; renderedSomewhere = false;
      for (const tab of ['Today', 'Delayed', 'Upcoming', 'Unscheduled', 'Completed']) {
        const n = await tm.clickTab(tab);
        topRows[tab] = await tm.firstRowText();
        console.log(`  📑 ${tab} (badge ${counts[tab]}) → ${n} row(s) | top: "${topRows[tab].slice(0, 40)}"`);
        if (topRows[tab]) renderedSomewhere = true;
      }
      if (renderedSomewhere) break;
      console.log('  ⏳ all tabs rendered empty (transient load) - reloading once');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
    }
    expect(renderedSomewhere, 'no status tab rendered any rows — task list not loading').toBeTruthy();
    // At least two tabs must differ → switching has an observable effect. An EMPTY tab next
    // to a populated one IS filtering evidence (with tasks in a single bucket, the other
    // tabs legitimately show nothing), so empties count as a distinct signal.
    const distinct = new Set(Object.values(topRows));
    expect(distinct.size, `tab switching had no effect — every tab showed the same top row (${[...distinct]})`).toBeGreaterThan(1);
    await screenshot(page, 'tm19_tabs');
    console.log('  ✅ ASSERT: status tabs navigable AND switching filters the list');
  });

  test('TM-20 | Task lifecycle controls on dashboard (Scenario 4)', async ({ page }) => {
    const tm = await arrive(page);
    const lc = await tm.dashboardLifecycle();
    console.log('  ⏯️  Lifecycle:', JSON.stringify(lc));
    await screenshot(page, 'tm20_lifecycle');
    // Running tasks exist on dev → start/end controls + timers must be present
    expect(lc.start + lc.end, 'No start/stop controls found').toBeGreaterThan(0);
    expect(lc.sections.length, 'No task sections found').toBeGreaterThan(0);
    console.log('  ✅ ASSERT: Start/Hold/End controls + task sections present');
  });

  test('TM-21 | Daily Activity Report (TC_069-072, Scenario 12)', async ({ page }) => {
    const tm = await arrive(page);
    const n = await tm.reportRowCount();
    console.log(`  📊 Daily Activity rows: ${n}`);
    expect(page.url()).toContain('daily-activity-report');
    // tasks exist from this suite's own runs, so the report must have rows
    expect(n, 'Daily Activity Report should list at least one row').toBeGreaterThan(0);
    await screenshot(page, 'tm21_report');
    console.log('  ✅ ASSERT: Daily Activity Report loaded with data');
  });

  test('TM-22 | Calendar & Timeline reachable (Scenario 6 — single user)', async ({ page }) => {
    const tm = await arrive(page);
    await tm.gotoCalendar();
    expect(page.url()).toContain('calendar');
    console.log('  📅 Calendar reachable');
    await tm.gotoTimeline();
    console.log('  🗓️  Timeline →', page.url());
    // The Timeline half had no assertion — goto() resolves on 4xx/redirects, so a broken
    // timeline bounced to /login/error slipped through. Require the timeline route.
    expect(page.url(), 'Timeline route should be reachable (not bounced to login/error)').toMatch(/timeline/i);
    await screenshot(page, 'tm22_calendar');
    console.log('  ✅ ASSERT: Calendar & Timeline both reachable');
  });

  test('TM-23 | Multi-user participant/admin visibility (TC_018-024, Scenarios 5 & 6)', async () => {
    test.skip(true, 'Now automated in tests/task_management_multiuser.spec.js (MU-01..03) using the second login (SECOND_USERNAME/PASSWORD/NAME in .env). This placeholder is kept for traceability.');
  });
});
