'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const TARGET = 'HAFNEETHA';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  const tm = new TaskManagementPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);
    const name = `HostAssign ${Date.now()}`;
    await tm.openTaskModal();
    await tm.selectMode('later');
    await tm.taskTypeSelect.selectOption({ label: 'Call' }).catch(() => {});
    await tm.taskInput.fill(name);
    const picked = await tm.addHostByName(TARGET);
    console.log(`  Host "${TARGET}" toggle found: ${picked}`);
    // set a deadline so a Later task is valid
    const tgl = tm.deadlineToggle;
    if (await tgl.isVisible().catch(() => false)) { await tgl.click({ force: true }).catch(() => {}); await page.waitForTimeout(700); }
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await tm.modal.locator('input[type="date"]:visible').first().fill(d).catch(() => {});
    await tm.modal.locator('input[type="time"]:visible').first().fill('11:00').catch(() => {});
    await tm.saveBtn.click();
    await page.waitForTimeout(2500);
    const msg = await tm._afterSave();
    console.log(`  Save result: ${msg === null ? 'SUCCESS' : JSON.stringify(msg)}`);
    await page.screenshot({ path: 'screenshots/validate_host_pick.png', fullPage: true }).catch(() => {});

    // Verify it shows up in Created/Delegated with the assignee
    for (const slug of ['created-tasks', 'delegated-tasks']) {
      await page.goto(`${login.baseUrl}/${slug}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2500);
      const hit = await page.evaluate((n) => {
        const rows = [...document.querySelectorAll('table tbody tr')];
        const r = rows.find(x => (x.textContent || '').includes(n));
        return r ? (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) : null;
      }, name);
      console.log(`  [${slug}] row: ${hit || 'NOT FOUND'}`);
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
