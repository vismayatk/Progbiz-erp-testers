'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

async function walkSwal(page) {
  for (let i = 0; i < 3; i++) {
    const sw = page.locator('.swal2-popup');
    if (!(await sw.isVisible().catch(() => false))) break;
    const t = (await page.locator('.swal2-title,.swal2-html-container').allTextContents().catch(() => [])).join(' ').replace(/\s+/g, ' ').trim();
    console.log('   swal:', t.slice(0, 70));
    await page.locator('.swal2-confirm').click().catch(() => {});
    await page.waitForTimeout(1200);
  }
}
const hdr = () => { const m = document.querySelector('#task-overview-modal'); if (!m) return {}; const vis = e => e.getClientRects().length > 0;
  return { btns: [...m.querySelectorAll('button')].filter(vis).map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(t => /hold|end|resume|start/i.test(t)), status: [...m.querySelectorAll('.badge,span')].filter(vis).map(e => e.textContent.trim()).filter(t => /running|hold|completed|not started|paused/i.test(t)).slice(0, 4) }; };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page); const tm = new TaskManagementPage(page);
  try {
    await login.login(C.company, C.username, C.password); await page.waitForTimeout(1500);
    const name = `LC2 ${Date.now()}`;
    await tm.createViaModal(name, { type: 'Call' });
    await tm.openTaskDetails(name);
    console.log('OPEN:', JSON.stringify(await page.evaluate(hdr)));

    // HOLD via class
    await tm.detailsModal.locator('.btn-warning-light').first().click().catch(() => {});
    await page.waitForTimeout(1500); await walkSwal(page); await page.waitForTimeout(1500);
    console.log('AFTER HOLD:', JSON.stringify(await page.evaluate(hdr)));

    // RESUME/START via class (warning-light likely now Resume) or any start/resume button
    await tm.detailsModal.locator('.btn-warning-light, .btn-success-light, .btn-success').filter({ hasText: /resume|start/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500); await walkSwal(page); await page.waitForTimeout(1500);
    console.log('AFTER RESUME:', JSON.stringify(await page.evaluate(hdr)));

    // END via class
    await tm.detailsModal.locator('.btn-danger-light, .btn-danger').filter({ hasText: /end/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500); await walkSwal(page); await page.waitForTimeout(1500);
    console.log('AFTER END:', JSON.stringify(await page.evaluate(hdr)));
    await page.screenshot({ path: 'screenshots/diag_lc2_end.png', fullPage: true }).catch(() => {});

    // verify via row status in my-tasks
    await page.keyboard.press('Escape').catch(() => {});
    await tm.gotoMyTasks(); await page.waitForTimeout(1500);
    for (const tab of ['Completed', 'Today', 'Delayed']) {
      await tm.clickTab(tab); await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      const st = await page.evaluate((n) => { const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent || '').includes(n)); return r ? (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70) : null; }, name);
      if (st) { console.log(`ROW on ${tab}:`, st); break; }
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
