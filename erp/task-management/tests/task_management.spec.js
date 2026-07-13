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
    // The "later" scheduling is what distinguishes TM-04 from TM-02. Verify the ROW's
    // own status + date rather than which tab holds it: the DEV build has a bucketing
    // bug (scheduled future tasks list under "Unscheduled" and badges read 0), so the
    // row text "Scheduled <date>" is the reliable proof the schedule persisted.
    const row = await tm.findTaskRowText(name);
    console.log(`  🔎 task row: ${row}`);
    expect(row, `Task "${name}" not found in My Tasks or Delegated Tasks after save`).toBeTruthy();
    const d = new Date(Date.now() + 2 * 86400000);
    const expectDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    expect(row, `row should carry Scheduled status, got: ${row}`).toMatch(/\bScheduled\b/i);
    expect(row, `row should carry the +2d date ${expectDate}, got: ${row}`).toContain(expectDate);
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
    // wait until the list is interactive (a too-early click no-ops on the Blazor circuit)
    let hasData = await page.waitForFunction(() =>
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
    // Prove tab switching actually FILTERS: capture the first rendered row per tab.
    // If clicking tabs did nothing (old bug: wrong selector), every tab shows the same top row.
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
    await screenshot(page, 'tm07_tabs');
    console.log('  ✅ ASSERT: status tabs navigable AND switching filters the list');
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
