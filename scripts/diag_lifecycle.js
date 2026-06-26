'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { TaskManagementPage } = require('../pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

const header = () => {
  const m = document.querySelector('#task-overview-modal');
  if (!m) return { none: true };
  const vis = (e) => e.getClientRects().length > 0;
  return {
    headerBtns: [...m.querySelectorAll('button,a')].filter(vis).map(b => (b.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /hold|end|resume|start|pause/i.test(t)).slice(0, 6),
    statusBadges: [...m.querySelectorAll('.badge,span,small')].filter(vis).map(e => (e.textContent || '').trim()).filter(t => /running|hold|not started|completed|paused|ended|started/i.test(t)).slice(0, 8),
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page); const tm = new TaskManagementPage(page);
  try {
    await login.login(C.company, C.username, C.password); await page.waitForTimeout(1500);
    const name = `LCdiag ${Date.now()}`;
    await tm.createViaModal(name, { type: 'Call' });
    await tm.openTaskDetails(name);
    console.log('OPEN:', JSON.stringify(await page.evaluate(header)));
    // HOLD
    await tm.detailsModal.getByRole('button', { name: /^\s*Hold\s*$/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    console.log('AFTER HOLD:', JSON.stringify(await page.evaluate(header)));
    await page.screenshot({ path: 'screenshots/diag_after_hold.png', fullPage: true }).catch(() => {});
    // RESUME/START (whatever appeared)
    await tm.detailsModal.getByRole('button', { name: /resume|start/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    console.log('AFTER RESUME:', JSON.stringify(await page.evaluate(header)));
    // END
    await tm.detailsModal.getByRole('button', { name: /end task/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    // there may be a confirm swal
    const sw = page.locator('.swal2-confirm'); if (await sw.isVisible().catch(() => false)) { await sw.click().catch(() => {}); await page.waitForTimeout(1500); }
    console.log('AFTER END:', JSON.stringify(await page.evaluate(header)));
    await page.screenshot({ path: 'screenshots/diag_after_end.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
