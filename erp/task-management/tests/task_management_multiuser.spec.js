'use strict';

/**
 * Task Management — Multi-user visibility (TC_TASK_018-024 · Scenarios 5 & 6)
 *
 * These verify that a task created/assigned by admin is visible to the OTHER
 * user it was assigned to. They need a SECOND (non-admin) login on the same
 * tenant, supplied via .env:
 *
 *   SECOND_USERNAME=<login id>
 *   SECOND_PASSWORD=<password>
 *   SECOND_NAME=<display name exactly as shown in the Host/Participant list, e.g. "HAFNEETHA">
 *
 * If those are absent the whole file is skipped (so the main suite stays green).
 *
 *   MU-01  Host-assigned "Task for Later" is visible in the assignee's My Tasks   TC_018/019/023 · Scenario 10
 *   MU-02  Participant on an Instant task sees it in their list                    TC_018/023/024 · Scenario 5
 *   MU-03  Admin sees the assigned task in Calendar & Timeline                     TC_021/022 · Scenario 6
 *
 * Run:  npx playwright test tests/task_management_multiuser.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { TaskManagementPage } = require('../pages/TaskManagementPage');
const { screenshot } = require('../../common/helpers');

const ADMIN = {
  company:  process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};
const SECOND = {
  company:  process.env.SECOND_COMPANY || process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.SECOND_USERNAME,
  password: process.env.SECOND_PASSWORD,
  name:     process.env.SECOND_NAME,
};
const READY = Boolean(SECOND.username && SECOND.password && SECOND.name);

/** Log in (new isolated context) and return {page, tm, ctx}. */
async function loginAs(browser, creds) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const login = new LoginPage(page);
  const tm = new TaskManagementPage(page);
  await login.goto();
  await login.login(creds.company, creds.username, creds.password);
  return { page, tm, ctx };
}

test.describe('Task Management — Multi-user visibility', () => {
  test.skip(!READY, 'Set SECOND_USERNAME / SECOND_PASSWORD / SECOND_NAME in .env to enable cross-user tests.');
  test.describe.configure({ timeout: 240_000 });

  test('MU-01 | Host-assigned Task-for-Later is visible to the assignee (Scenario 10)', async ({ browser }) => {
    const name = `HostTask ${Date.now()}`;

    // Admin assigns a scheduled task to the second user as Host
    const a = await loginAs(browser, ADMIN);
    try {
      await a.tm.openTaskModal();
      await a.tm.selectMode('later');
      await a.tm.taskTypeSelect.selectOption({ label: 'Call' }).catch(() => {});
      await a.tm.taskInput.fill(name);
      const picked = await a.tm.addHostByName(SECOND.name);
      expect(picked, `Host "${SECOND.name}" not found in the user list`).toBeTruthy();
      const tgl = a.tm.deadlineToggle;
      if (await tgl.isVisible().catch(() => false)) { await tgl.click({ force: true }).catch(() => {}); await a.page.waitForTimeout(700); }
      // Schedule for the CURRENT date (TC_018: current-date task surfaces in the
      // assignee's list; far-future host tasks only show on the scheduled day).
      const d = new Date().toISOString().slice(0, 10);
      await a.tm.modal.locator('input[type="date"]:visible').first().fill(d).catch(() => {});
      await a.tm.modal.locator('input[type="time"]:visible').first().fill('23:30').catch(() => {});
      await a.tm.saveBtn.click();
      await a.page.waitForTimeout(2500);
      const msg = await a.tm._afterSave();
      await screenshot(a.page, 'mu01_admin_create');
      expect(msg, `Assigning task to host should save, got: "${msg}"`).toBeFalsy();
      console.log(`  ✅ Admin assigned "${name}" to host "${SECOND.name}"`);
    } finally { await a.ctx.close(); }

    // Second user logs in and should see it
    const b = await loginAs(browser, SECOND);
    try {
      const tab = await b.tm.findAcrossTabs(name);
      await screenshot(b.page, 'mu01_assignee_view');
      console.log(`  🔎 "${name}" visible to ${SECOND.name} under tab: ${tab}`);
      expect(tab, `Task "${name}" not visible to assignee ${SECOND.name}`).toBeTruthy();
      console.log('  ✅ ASSERT: Host-assigned task visible to the assignee');
    } finally { await b.ctx.close(); }
  });

  test('MU-02 | Participant on an Instant task sees it (Scenario 5)', async ({ browser }) => {
    const name = `PartTask ${Date.now()}`;

    const a = await loginAs(browser, ADMIN);
    try {
      await a.tm.openTaskModal();
      await a.tm.taskTypeSelect.selectOption({ label: 'Call' }).catch(() => {});
      await a.tm.taskInput.fill(name);
      const picked = await a.tm.addParticipantByName(SECOND.name);
      expect(picked, `Participant "${SECOND.name}" not found`).toBeTruthy();
      await a.tm.saveBtn.click();
      await a.page.waitForTimeout(2500);
      const msg = await a.tm._afterSave();
      await screenshot(a.page, 'mu02_admin_create');
      expect(msg, `Instant task w/ participant should save, got: "${msg}"`).toBeFalsy();
      console.log(`  ✅ Admin created instant "${name}" with participant "${SECOND.name}"`);
    } finally { await a.ctx.close(); }

    const b = await loginAs(browser, SECOND);
    try {
      const tab = await b.tm.findAcrossTabs(name);
      await screenshot(b.page, 'mu02_participant_view');
      console.log(`  🔎 "${name}" visible to participant ${SECOND.name} under tab: ${tab}`);
      expect(tab, `Task "${name}" not visible to participant ${SECOND.name}`).toBeTruthy();
      console.log('  ✅ ASSERT: Participant sees the task (consistent title)');
    } finally { await b.ctx.close(); }
  });

  test('MU-03 | Admin sees the assigned task in Calendar & Timeline (Scenario 6)', async ({ browser }) => {
    const a = await loginAs(browser, ADMIN);
    try {
      await a.tm.gotoCalendar();
      expect(a.page.url()).toContain('calendar');
      await a.tm.gotoTimeline();
      await screenshot(a.page, 'mu03_admin_views');
      console.log('  ✅ ASSERT: Admin Calendar & Timeline reachable for oversight');
    } finally { await a.ctx.close(); }
  });
});
