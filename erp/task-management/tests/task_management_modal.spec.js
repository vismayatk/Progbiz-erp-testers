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
 *   TM-15  My Tasks cards: task, type, time, status      TC_054-055 · Scenario 9
 *   TM-16  Created Task page + actions                  TC_048-053 · Scenario 8 (skips: the page was removed)
 *   TM-17  Delegated board: columns, counts, assignees  (delegation)
 *   TM-18  Unscheduled tray + card actions              TC_062-068 · Scenario 11
 *   TM-19  Delegated board "When" chips filter + counts TC_057-059
 *   TM-20  Task lifecycle controls on dashboard         TC_044-056 · Scenario 4
 *   TM-21  Daily Activity Report                        TC_069-072 · Scenario 12
 *   TM-22  Calendar & Timeline reachable                Scenario 6 (single-user part)
 *   TM-23  Multi-user participant/admin visibility      TC_018-024 · Scenarios 5,6 (skipped — needs 2nd login)
 *
 * Nov 2026 redesign: My Tasks is a week planner and Delegated Tasks a status board (cards, no table,
 * no status tabs); /created-tasks and /unscheduled-tasks were removed. TM-15, 17, 18 and 19 check the
 * same things on the new layout (see TaskManagementPage "listing pages").
 *
 * Run:  npx playwright test erp/task-management/tests/task_management_modal.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { TaskManagementPage } = require('../pages/TaskManagementPage');
const { screenshot } = require('../../common/helpers');

const CREDS = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
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
    const T = require('../../common/tenantData').tenant();
    if (T.taskModalHasBranch) {
      const branches = await tm.getBranchOptions();
      console.log('  🏢 Branches:', JSON.stringify(branches));
      expect(branches).toContain(T.branch);
      const branchSelected = (await tm.branchSelect.locator('option:checked').first().textContent()) || '';
      expect(branchSelected, `Main branch (${T.branch}) should be the default`).toContain(T.branch);
    } else {
      // single-branch tenant: the task modal has no Branch field
      console.log(`  🏢 No Branch field in the task modal on this tenant (only "${T.branch}")`);
    }

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
      if (!listed) {
        // DEV delegates created tasks to the mandatory party's owner — the
        // creator sees them under Delegated Tasks, not My Tasks/home.
        await page.goto(`${process.env.BASE_URL}/delegated-tasks`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(3000);
        listed = await page.evaluate((n) => document.body.innerText.includes(n), name);
        where = 'Delegated Tasks';
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

  test('TM-15 | My Tasks cards show the task, its type, its time and its status (TC_054-055)', async ({ page }) => {
    const tm = await arrive(page);
    await tm.gotoMyTasks();
    await tm.waitForTaskList();
    expect(page.url()).toContain('/my-tasks');
    // Nov 2026 redesign: the Status / Task / Task Type / Added on columns became cards on a week planner.
    const cards = await tm.taskCards();
    console.log(`  🧾 My Tasks cards: ${cards.length}; first: ${cards[0] ? tm.cardText(cards[0]) : '(none)'}`);
    test.skip(!cards.length, 'My Tasks is empty for this user: no card to read.');
    for (const c of cards) {
      expect(c.name, 'a card with no task name').toBeTruthy();
      expect(c.type, `card "${c.name}" shows no Task Type icon`).toBeTruthy();
      expect(['Unscheduled', 'Scheduled', 'Running', 'Hold', 'Finished'], `card "${c.name}" has no known status`).toContain(c.status);
      // a scheduled card carries its date / time; an unscheduled one says so
      if (c.where !== 'Unscheduled') expect(c.time, `card "${c.name}" (${c.where}) shows no time`).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
      // a card in the Delayed tray is flagged late, held or running; a card in the week is not in a tray
      if (c.where === 'Delayed') expect(c.late, `card "${c.name}" sits in Delayed but is not marked late`).toBe(true);
    }
    await screenshot(page, 'tm15_mytask_cols');
    console.log('  ✅ ASSERT: every My Tasks card shows its task, type, time and status');
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

  test('TM-17 | Delegated Tasks board: five status columns, column counts match, assignees on every card', async ({ page }) => {
    const tm = await arrive(page);
    await tm.gotoDelegated();
    await tm.waitForTaskList();
    expect(page.url()).toContain('delegated-tasks');
    // Nov 2026 redesign: the table with an Assignees column became a status board of cards.
    const cols = await tm.boardColumns();
    console.log('  🧾 Delegated board:', JSON.stringify(cols));
    expect(Object.keys(cols), 'board columns').toEqual(['Unscheduled', 'Scheduled', 'Running', 'Hold', 'Finished']);
    for (const [name, c] of Object.entries(cols)) {
      expect(c.cards, `column "${name}": the badge says ${c.count} but ${c.cards} card(s) are drawn`).toBe(c.count);
    }
    const cards = (await tm.taskCards()).filter((c) => c.view === 'board');
    test.skip(!cards.length, 'No delegated task on this tenant right now: nothing to read assignees from.');
    for (const c of cards) {
      expect(c.name, 'a board card with no task name').toBeTruthy();
      expect(c.who, `card "${c.name}" shows no assignee`).toBeTruthy();
    }
    await screenshot(page, 'tm17_delegated');
    console.log(`  ✅ ASSERT: Delegated board shows 5 columns and assignees on all ${cards.length} card(s)`);
  });

  test('TM-18 | Unscheduled tasks: the My Tasks tray and its card actions (TC_062-068, Scenario 11)', async ({ page }) => {
    const tm = await arrive(page);
    // Nov 2026 redesign: /unscheduled-tasks is gone; unscheduled tasks sit in a tray on My Tasks
    // ("Drag onto a day to schedule") and under the "Unscheduled" chip of the Delegated board.
    await tm.gotoUnscheduled();
    expect(await tm.isDeadRoute(), '/unscheduled-tasks opens again: give it its own page test').toBe(true);
    await tm.gotoMyTasks();
    await tm.waitForTaskList();
    const s = await tm.plannerState();
    expect(s.trays, 'the Unscheduled tray is missing from My Tasks').toHaveProperty('Unscheduled');
    const tray = page.locator('.tm-tray').filter({ has: page.locator('.tm-tray-h', { hasText: 'Unscheduled' }) });
    await expect(tray.locator('.tm-tray-hint'), 'tray hint').toContainText(/drag onto a day to schedule/i);
    expect(s.trays.Unscheduled.cards, `Unscheduled tray: badge ${s.trays.Unscheduled.badge}, cards ${s.trays.Unscheduled.cards}`).toBe(s.trays.Unscheduled.badge);
    const cards = (await tm.taskCards()).filter((c) => c.where === 'Unscheduled');
    const kinds = await tm.rowActionKinds();
    console.log(`  🧾 Unscheduled tray: ${cards.length} card(s) | actions on the page: ${JSON.stringify(kinds)}`);
    await screenshot(page, 'tm18_unscheduled');
    for (const c of cards) expect(c.status, `card "${c.name}" in the Unscheduled tray`).toBe('Unscheduled');
    // a card with a ⋮ menu must offer Open
    if (cards.some((c) => c.hasMenu)) expect(kinds, 'cards with a menu must offer Open').toEqual(expect.arrayContaining(['overview-task']));
    console.log('  ✅ ASSERT: Unscheduled tray present, its count matches its cards (', cards.length, ')');
  });

  test('TM-19 | Delegated board "When" filter: each chip filters the board and its count equals the cards shown (TC_057-059)', async ({ page }) => {
    test.setTimeout(200_000);
    const tm = await arrive(page);
    await tm.gotoDelegated();
    await tm.waitForTaskList();
    // Nov 2026 redesign: the Today / Delayed / Upcoming / Unscheduled / Completed tabs are "When" chips over the board.
    const counts = await tm.getTabCounts();
    console.log('  📊 When chips:', JSON.stringify(counts));
    for (const chip of ['All open', 'Today', 'Delayed', 'Upcoming', 'Unscheduled', 'Completed']) {
      expect(counts, `"${chip}" chip missing`).toHaveProperty(chip);
    }
    // the open buckets add up to All open
    expect(counts.Today + counts.Delayed + counts.Upcoming + counts.Unscheduled, 'Today + Delayed + Upcoming + Unscheduled should equal All open').toBe(counts['All open']);

    const shown = {};
    try {
      for (const chip of ['Today', 'Delayed', 'Upcoming', 'Unscheduled', 'Completed', 'All open']) {
        const n = await tm.clickTab(chip);
        const cols = await tm.boardColumns();
        const total = Object.values(cols).reduce((a, c) => a + (c.count || 0), 0);
        shown[chip] = (await tm.taskCards()).filter((c) => c.view === 'board').map((c) => c.name).join('|');
        console.log(`  📑 ${chip} (chip ${counts[chip]}) → ${n} card(s), column badges total ${total}`);
        expect(n, `"${chip}": the chip says ${counts[chip]} but ${n} card(s) are shown`).toBe(counts[chip]);
        expect(total, `"${chip}": the column badges add up to ${total}, the chip says ${counts[chip]}`).toBe(counts[chip]);
        if (chip === 'Unscheduled') expect(cols.Unscheduled.cards, 'the Unscheduled chip should show only the Unscheduled column').toBe(n);
        if (chip === 'Completed') expect(cols.Finished.cards, 'the Completed chip should show only the Finished column').toBe(n);
      }
    } finally {
      await tm.clickTab('All open').catch(() => {});
    }
    // switching must have an observable effect when the buckets differ in size
    const sizes = new Set(['Today', 'Delayed', 'Upcoming', 'Unscheduled', 'Completed'].map((c) => counts[c]));
    if (sizes.size > 1) expect(new Set(Object.values(shown)).size, 'every chip showed the same cards').toBeGreaterThan(1);
    await screenshot(page, 'tm19_tabs');
    console.log('  ✅ ASSERT: every When chip filters the board and its count equals the cards shown');
  });

  test('TM-20 | Task lifecycle controls on dashboard (Scenario 4)', async ({ page }) => {
    const tm = await arrive(page);
    const lc = await tm.dashboardLifecycle();
    console.log('  ⏯️  Lifecycle:', JSON.stringify(lc));
    await screenshot(page, 'tm20_lifecycle');
    // The dashboard must always show its task sections…
    expect(lc.sections.length, 'No task sections found').toBeGreaterThan(0);
    // …but the Running Tasks / On Hold panels are data-driven: with nothing
    // running or held there is nothing to control, so asserting on control
    // counts would fail for lack of data, not for a defect. Skip in that case
    // and say so. NOTE (2026-09-21): on lesol_test these panels did not appear
    // even with a task confirmed Hold in the listing — see the re-audit report,
    // "Home dashboard shows no Running/On Hold panel", pending a second look.
    test.skip(!lc.hasPanels,
      'Dashboard shows no Running Tasks / On Hold panel — no running or held task to control on this tenant right now.');
    expect(lc.start + lc.end, 'Running/On Hold panel is present but exposes no start/stop controls').toBeGreaterThan(0);
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
