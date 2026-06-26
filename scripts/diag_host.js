'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { TaskManagementPage } = require('../pages/TaskManagementPage');
const A = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const S = { company: process.env.COMPANY_CODE, username: process.env.SECOND_USERNAME, password: process.env.SECOND_PASSWORD, name: process.env.SECOND_NAME };

async function rowsOnTab(page, tm, tab) {
  await tm.clickTab(tab);
  // wait for table to settle / populate
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return page.evaluate(() => ({
    count: document.querySelectorAll('table tbody tr').length,
    sample: [...document.querySelectorAll('table tbody tr')].slice(0, 6).map(r => (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70)),
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  // Admin creates host-assigned task scheduled for ~2h from now (today)
  const a = await (await browser.newContext()).newPage();
  const la = new LoginPage(a); const ta = new TaskManagementPage(a);
  await la.login(A.company, A.username, A.password);
  await a.waitForTimeout(1500);
  const name = `DiagHost ${Date.now()}`;
  await ta.openTaskModal();
  await ta.selectMode('later');
  await ta.taskTypeSelect.selectOption({ label: 'Call' }).catch(() => {});
  await ta.taskInput.fill(name);
  const picked = await ta.addHostByName(S.name);
  console.log('host picked:', picked);
  const tgl = ta.deadlineToggle;
  if (await tgl.isVisible().catch(() => false)) { await tgl.click({ force: true }).catch(() => {}); await a.waitForTimeout(700); }
  const today = new Date().toISOString().slice(0, 10);
  await ta.modal.locator('input[type="date"]:visible').first().fill(today).catch(() => {});
  await ta.modal.locator('input[type="time"]:visible').first().fill('23:30').catch(() => {});
  await ta.saveBtn.click(); await a.waitForTimeout(2500);
  console.log('save:', await ta._afterSave());
  await a.context().close();

  // HAFNEETHA checks each tab + delegated + unscheduled pages
  const b = await (await browser.newContext()).newPage();
  const lb = new LoginPage(b); const tb = new TaskManagementPage(b);
  await lb.login(S.company, S.username, S.password);
  await b.waitForTimeout(1500);
  await tb.gotoMyTasks();
  console.log('tab counts:', JSON.stringify(await tb.getTabCounts()));
  for (const tab of ['Today', 'Upcoming', 'Unscheduled', 'Delayed']) {
    console.log(`MyTasks/${tab}:`, JSON.stringify(await rowsOnTab(b, tb, tab)));
  }
  for (const slug of ['delegated-tasks', 'todo-list', 'unscheduled-tasks']) {
    await b.goto(`${lb.baseUrl}/${slug}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await b.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await b.waitForTimeout(1500);
    const hit = await b.evaluate((n) => { const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent || '').includes(n)); return r ? r.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : `(${document.querySelectorAll('table tbody tr').length} rows, name not found)`; }, name);
    console.log(`${slug}:`, hit);
  }
  await b.context().close();
  await browser.close();
})();
