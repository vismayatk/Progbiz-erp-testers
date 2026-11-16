'use strict';

/**
 * Task Management module — E2E
 *   TM-01  My Tasks opens as a week planner (toolbar, trays, seven days)
 *   TM-02  Create a task and verify it appears
 *   TM-03  All Task-Management pages are reachable (smoke)
 *   TM-04  Task for Later lands on its day, TM-05 no Task Type refused, TM-06 Online Meeting
 *   TM-07  Planner: counts match the cards, week navigation, Show completed, search
 *   TM-08  Daily Activity Report
 *
 * Nov 2026 redesign: My Tasks lost its status tabs and table. It is a week planner of cards
 * (Delayed and Unscheduled trays + seven day columns); see TaskManagementPage "listing pages".
 *
 * Run:  npx playwright test tests/task_management.spec.js
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

test.describe('Task Management Module', () => {

  test('TM-01 | My Tasks opens as a week planner: toolbar, Delayed and Unscheduled trays, seven days with today marked', async ({ page }) => {
    const login = new LoginPage(page);
    const tm = new TaskManagementPage(page);
    await login.goto();
    await login.login(CREDS.company, CREDS.username, CREDS.password);

    await tm.gotoMyTasks();
    await tm.waitForTaskList();
    expect(page.url()).toContain('/my-tasks');

    // the toolbar: week navigation, Show completed, search, Filters
    for (const id of ['#btn-week-previous', '#btn-week-today', '#btn-week-next', '#task-search', '#btn-toggle-filter']) {
      await expect(page.locator(id), `${id} missing from the planner toolbar`).toBeVisible();
    }
    await expect(page.locator('#my-tasks-show-completed'), '"Show completed" switch missing').toHaveCount(1);

    const s = await tm.plannerState();
    console.log('  📊 Planner:', JSON.stringify({ week: s.label, trays: s.trays, days: s.days.map((d) => `${d.name}${d.today ? '*' : ''}=${d.count}`) }));
    expect(s.label, 'week label ("9 – 15 Nov 2026")').toMatch(/\d{1,2}(\s+[A-Za-z]{3})?(\s+\d{4})?\s*[–-]\s*\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/);
    // the two trays replace the old Delayed / Unscheduled tabs, each with its count
    for (const tray of ['Delayed', 'Unscheduled']) {
      expect(s.trays, `"${tray}" tray missing`).toHaveProperty(tray);
      expect(typeof s.trays[tray].badge, `"${tray}" tray shows no count`).toBe('number');
    }
    // seven day columns, exactly one of them today
    expect(s.days.length, 'the week grid should have seven day columns').toBe(7);
    for (const d of s.days) expect(d.name, 'day column heading').toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}/);
    expect(s.days.filter((d) => d.today).length, 'exactly one column is marked Today').toBe(1);
    const counts = await tm.getTabCounts();
    for (const k of ['Delayed', 'Unscheduled', 'Today', 'Upcoming']) expect(counts, `count for "${k}" missing`).toHaveProperty(k);
    await screenshot(page, 'tm01_my_tasks');
    console.log('  ✅ ASSERT: My Tasks loaded as a week planner with its trays and seven days');
  });

  test('TM-02 | Create a task and verify it is listed', async ({ page }) => {
    test.setTimeout(300_000);   // create + cross-tab verification on a slow tenant
    const login = new LoginPage(page);
    const tm = new TaskManagementPage(page);
    await login.goto();
    await login.login(CREDS.company, CREDS.username, CREDS.password);

    const name = `AutoTask ${Date.now()}`;
    const msg = await tm.createTask(name, 'Call');
    await screenshot(page, 'tm02_create_task');
    expect(msg, `Task create should succeed, got: "${msg}"`).toBeFalsy();
    console.log(`  ✅ ASSERT: Task "${name}" created`);

    // Data round-trip: the created task NAME must actually appear in My Tasks
    const tab = await tm.findAcrossTabs(name);
    console.log(`  🔎 "${name}" visible in My Tasks under tab: ${tab}`);
    expect(tab, `Created task "${name}" not found on any My Tasks tab`).toBeTruthy();
  });

  test('TM-03 | All Task-Management pages are reachable', async ({ page }) => {
    test.setTimeout(150_000);
    const login = new LoginPage(page);
    const tm = new TaskManagementPage(page);
    await login.goto();
    await login.login(CREDS.company, CREDS.username, CREDS.password);

    const pages = [
      ['My Tasks', () => tm.gotoMyTasks(), 'my-tasks'],
      ['Delegated Tasks', () => tm.gotoDelegated(), 'delegated-tasks'],
      ['To Do List', () => tm.gotoTodo(), 'todo-list'],
      ['Calendar', () => tm.gotoCalendar(), 'calendar'],
      ['Daily Activity Report', () => tm.gotoDailyActivity(), 'daily-activity-report'],
    ];
    for (const [label, nav, slug] of pages) {
      await nav();
      expect(page.url(), `${label} did not load`).toContain(slug);
      console.log(`  ✅ ${label} reachable`);
    }
    await screenshot(page, 'tm03_pages');
  });

  test('TM-04 | Create a scheduled task (Task for Later)', async ({ page }) => {
    test.setTimeout(300_000);   // create + cross-tab verification on a slow tenant
    const login = new LoginPage(page); const tm = new TaskManagementPage(page);
    await login.goto(); await login.login(CREDS.company, CREDS.username, CREDS.password);

    const name = `LaterTask ${Date.now()}`;
    const msg = await tm.createTask(name, { type: 'Call', mode: 'later' });
    await screenshot(page, 'tm04_later_task');
    expect(msg, `Scheduled task should save, got: "${msg}"`).toBeFalsy();
    // The "later" scheduling is what distinguishes TM-04 from TM-02: the planner must file the task
    // under its own day (two days ahead, which can be next week's grid) with its time on the card,
    // and the details panel must carry the scheduled date.
    const d = new Date(Date.now() + 2 * 86400000);
    const expectDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const dayName = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()}`;
    const card = await tm.findOnPlanner(name);
    if (card) {
      console.log(`  🔎 task card: ${tm.cardText(card)}`);
      expect(card.status, `card should be Scheduled, got: ${tm.cardText(card)}`).toBe('Scheduled');
      expect(card.where, `card should sit under ${dayName}, got: ${tm.cardText(card)}`).toContain(dayName);
      expect(card.time, `card should show its 10:00 AM time, got: ${tm.cardText(card)}`).toMatch(/10:00\s*AM/i);
      expect(await tm._openCard(card), 'the scheduled card did not open its details').toBe(true);
      const details = (await tm.detailsModal.innerText()).replace(/\s+/g, ' ');
      expect(details, `details should carry "Scheduled : ${expectDate}"`).toMatch(new RegExp(`Scheduled\\s*:\\s*${expectDate}\\s+10:00\\s*AM`, 'i'));
    } else {
      // assigned to someone else: it sits on the creator's Delegated board, in the Scheduled column
      const row = await tm.findInDelegated(name);
      console.log(`  🔎 delegated card: ${row}`);
      expect(row, `Task "${name}" not found in My Tasks or Delegated Tasks after save`).toBeTruthy();
      expect(row, `card should be in the Scheduled column, got: ${row}`).toMatch(/\bScheduled\b/i);
    }
    console.log(`  ✅ ASSERT: Task "${name}" persisted with its +2d schedule (${expectDate})`);
  });

  test('TM-05 | Creating a task without Task Type is rejected', async ({ page }) => {
    test.setTimeout(120_000);
    const login = new LoginPage(page); const tm = new TaskManagementPage(page);
    await login.goto(); await login.login(CREDS.company, CREDS.username, CREDS.password);

    const name = `NoType ${Date.now()}`;
    const msg = await tm.createTask(name, { skipType: true });   // leave Task Type = Choose
    await screenshot(page, 'tm05_validation');
    expect(msg, `Missing required Task Type should be rejected, but it saved (msg="${msg}")`).toBeTruthy();
    console.log(`  ✅ ASSERT: Validation on missing Task Type — "${msg}"`);
  });

  test('TM-06 | Create task (Online Meeting, High priority)', async ({ page }) => {
    test.setTimeout(300_000);   // create + cross-tab verification on a slow tenant
    const login = new LoginPage(page); const tm = new TaskManagementPage(page);
    await login.goto(); await login.login(CREDS.company, CREDS.username, CREDS.password);

    const name = `Meeting ${Date.now()}`;
    const msg = await tm.createTask(name, { type: 'Online Meeting', priority: 'High' });
    await screenshot(page, 'tm06_meeting');
    expect(msg, `Task should save, got: "${msg}"`).toBeFalsy();
    // Data round-trip: the card must be on the planner and carry its Task Type
    const card = await tm.findOnPlanner(name);
    console.log(`  🔎 "${name}" card: ${card ? tm.cardText(card) : '(not on My Tasks)'}`);
    expect(card, `Online Meeting task "${name}" not listed in My Tasks`).toBeTruthy();
    expect(card.type, 'the card should carry Task Type "Online Meeting"').toMatch(/online meeting/i);
    console.log(`  ✅ ASSERT: Online Meeting task "${name}" created, listed with correct type`);
  });

  test('TM-07 | My Tasks planner: counts match the cards, week navigation, Show completed and search', async ({ page }) => {
    test.setTimeout(200_000);
    const login = new LoginPage(page); const tm = new TaskManagementPage(page);
    await login.goto(); await login.login(CREDS.company, CREDS.username, CREDS.password);

    await tm.gotoMyTasks();
    await tm.waitForTaskList();
    const now = await tm.plannerState();
    const openCards = await tm.taskCards();
    console.log('  📊 Planner:', JSON.stringify({ week: now.label, trays: now.trays, cards: openCards.length }));

    // 1. what the headers say is what is drawn: tray badge = cards in the tray, "n tasks" = cards in the day
    for (const [name, t] of Object.entries(now.trays)) {
      expect(t.cards, `${name} tray: the badge says ${t.badge} but ${t.cards} card(s) are drawn`).toBe(t.badge);
    }
    for (const d of now.days) {
      if (d.count !== null) expect(d.cards, `${d.name}: the header says "${d.meta}" but ${d.cards} card(s) are drawn`).toBe(d.count);
    }
    // every card names its task and has a status
    for (const c of openCards) {
      expect(c.name, 'a card with no task name').toBeTruthy();
      expect(['Unscheduled', 'Scheduled', 'Running', 'Hold', 'Finished'], `card "${c.name}" has no known status`).toContain(c.status);
    }

    try {
      // 2. Next / Previous week move the grid, Today comes back
      const next = await tm.plannerWeek('next');
      const nextState = await tm.plannerState();
      console.log(`  ⏭  next week: ${next}`);
      expect(next, 'Next Week did not change the week label').not.toBe(now.label);
      expect(nextState.days.some((d) => d.today), 'next week should not contain today').toBe(false);
      expect(nextState.days.length).toBe(7);
      expect(await tm.plannerWeek('today'), 'Today did not come back to the current week').toBe(now.label);
      const prev = await tm.plannerWeek('previous');
      console.log(`  ⏮  previous week: ${prev}`);
      expect(prev, 'Previous Week did not change the week label').not.toBe(now.label);
      expect(prev).not.toBe(next);
      expect(await tm.plannerWeek('today')).toBe(now.label);

      // 3. "Show completed" adds finished cards and never hides an open one
      expect(await tm.showCompleted(true), '"Show completed" did not switch on').toBe(true);
      const withDone = await tm.taskCards();
      const finished = withDone.filter((c) => c.status === 'Finished');
      console.log(`  ✔ with completed: ${withDone.length} card(s), ${finished.length} finished (open: ${openCards.length})`);
      expect(withDone.length, 'switching "Show completed" on lost cards').toBeGreaterThanOrEqual(openCards.length);
      expect(withDone.length - finished.length, 'the open cards changed when completed ones were shown').toBe(openCards.length);
      expect(await tm.showCompleted(false)).toBe(false);
      const again = await tm.taskCards();
      expect(again.filter((c) => c.status === 'Finished').length, 'finished cards stay after switching "Show completed" off').toBe(0);

      // 4. search narrows the planner to matching cards; clearing brings them back
      const sample = openCards.find((c) => /\d{6,}/.test(c.name)) || openCards[0];
      test.skip(!sample, 'My Tasks is empty for this user: nothing to search for.');
      const word = (sample.name.match(/\d{6,}/) || [sample.name.split(' ')[0]])[0];
      await tm.searchTasks(word);
      const found = await tm.taskCards();
      console.log(`  🔎 search "${word}": ${found.length} card(s)`);
      expect(found.length, `search "${word}" found nothing although a card carries it`).toBeGreaterThan(0);
      for (const c of found) expect(c.name.toLowerCase(), `search "${word}" kept a card that does not match`).toContain(word.toLowerCase());
      await tm.searchTasks('zzqa-no-such-task-zz');
      expect((await tm.taskCards()).length, 'a nonsense search still shows cards').toBe(0);
      await tm.searchTasks('');
      expect((await tm.taskCards()).length, 'clearing the search did not bring the cards back').toBe(openCards.length);
    } finally {
      // leave the planner as found: current week, completed hidden, no search
      await tm.showCompleted(false).catch(() => {});
    }
    await screenshot(page, 'tm07_tabs');
    console.log('  ✅ ASSERT: planner counts match the cards; week navigation, Show completed and search work');
  });

  test('TM-08 | Daily Activity Report loads with data', async ({ page }) => {
    test.setTimeout(120_000);
    const login = new LoginPage(page); const tm = new TaskManagementPage(page);
    await login.goto(); await login.login(CREDS.company, CREDS.username, CREDS.password);

    const n = await tm.reportRowCount();
    console.log(`  📊 Daily Activity rows (raw): ${n}`);
    expect(page.url()).toContain('daily-activity-report');
    // A raw tbody-tr count also matches a single "No records found" placeholder row.
    // Require at least one REAL multi-column activity row.
    const dataRows = await tm.dataRowCount();
    console.log(`  📊 real activity rows: ${dataRows}`);
    expect(dataRows, 'Daily Activity Report should list a real activity row (not an empty-state placeholder)').toBeGreaterThan(0);
    await screenshot(page, 'tm08_report');
    console.log('  ✅ ASSERT: Daily Activity Report loaded with real data rows');
  });
});
