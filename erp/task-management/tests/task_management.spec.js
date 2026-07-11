'use strict';

/**
 * Task Management module — E2E
 *   TM-01  My Tasks page loads (tabs + table)
 *   TM-02  Create a task and verify it appears
 *   TM-03  All Task-Management pages are reachable (smoke)
 *
 * Run:  npx playwright test tests/task_management.spec.js
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

test.describe('Task Management Module', () => {

  test('TM-01 | My Tasks page loads with status tabs', async ({ page }) => {
    const login = new LoginPage(page);
    const tm = new TaskManagementPage(page);
    await login.goto();
    await login.login(CREDS.company, CREDS.username, CREDS.password);

    await tm.gotoMyTasks();
    expect(page.url()).toContain('/my-tasks');

    const counts = await tm.getTabCounts();
    console.log('  📊 Tab counts:', JSON.stringify(counts));
    // The five status buckets should be present
    for (const tab of ['Today', 'Delayed', 'Upcoming', 'Unscheduled', 'Completed']) {
      expect(counts, `Tab "${tab}" missing`).toHaveProperty(tab);
    }
    await screenshot(page, 'tm01_my_tasks');
    console.log('  ✅ ASSERT: My Tasks loaded with all status tabs');
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
    // Data round-trip: scheduled task must appear in My Tasks (Upcoming/Today)
    const tab = await tm.findAcrossTabs(name);
    console.log(`  🔎 "${name}" visible under tab: ${tab}`);
    expect(tab, `Scheduled task "${name}" not listed in My Tasks`).toBeTruthy();
    console.log(`  ✅ ASSERT: Scheduled task "${name}" created and listed`);
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
    // Data round-trip: verify the row shows the task with its type
    const tab = await tm.findAcrossTabs(name);
    console.log(`  🔎 "${name}" visible under tab: ${tab}`);
    expect(tab, `Online Meeting task "${name}" not listed in My Tasks`).toBeTruthy();
    const rowHasType = await page.evaluate((n) => {
      const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent || '').includes(n));
      return r ? /online meeting/i.test(r.textContent || '') : false;
    }, name);
    expect(rowHasType, 'Row should display Task Type "Online Meeting"').toBeTruthy();
    console.log(`  ✅ ASSERT: Online Meeting task "${name}" created, listed with correct type`);
  });

  test('TM-07 | My Tasks status tabs are navigable', async ({ page }) => {
    test.setTimeout(150_000);
    const login = new LoginPage(page); const tm = new TaskManagementPage(page);
    await login.goto(); await login.login(CREDS.company, CREDS.username, CREDS.password);

    await tm.gotoMyTasks();
    for (const tab of ['Today', 'Delayed', 'Upcoming', 'Unscheduled', 'Completed']) {
      const n = await tm.clickTab(tab);
      console.log(`  📑 ${tab} → ${n} row(s)`);
      expect(typeof n, `${tab} tab not navigable`).toBe('number');
    }
    await screenshot(page, 'tm07_tabs');
    console.log('  ✅ ASSERT: All status tabs navigable');
  });

  test('TM-08 | Daily Activity Report loads with data', async ({ page }) => {
    test.setTimeout(120_000);
    const login = new LoginPage(page); const tm = new TaskManagementPage(page);
    await login.goto(); await login.login(CREDS.company, CREDS.username, CREDS.password);

    const n = await tm.reportRowCount();
    console.log(`  📊 Daily Activity rows: ${n}`);
    expect(page.url()).toContain('daily-activity-report');
    // tasks exist from this suite's own runs, so the report must have rows
    expect(n, 'Daily Activity Report should list at least one row').toBeGreaterThan(0);
    await screenshot(page, 'tm08_report');
    console.log('  ✅ ASSERT: Daily Activity Report loaded with data');
  });
});
