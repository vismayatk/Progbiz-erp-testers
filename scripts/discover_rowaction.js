'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);
    await page.goto(`${login.baseUrl}/my-tasks`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.locator('button, a.btn').filter({ hasText: /^Delayed\s+\d/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    const info = await page.evaluate(() => {
      const row = document.querySelector('table tbody tr');
      if (!row) return { none: true };
      const actionCell = row.querySelector('td');
      const clickable = [...row.querySelectorAll('a,button,i,[onclick],[id]')].map(e => ({ tag: e.tagName, id: e.id, cls: (e.getAttribute('class') || '').slice(0, 45), title: e.getAttribute('title') || '' })).filter(e => e.id || e.cls || e.title).slice(0, 14);
      return { actionCellHTML: (actionCell?.innerHTML || '').replace(/\s+/g, ' ').slice(0, 500), clickable, rowText: (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
    });
    console.log(JSON.stringify(info, null, 1));
    // click the first icon/link in the action cell to see what opens
    const firstIcon = page.locator('table tbody tr').first().locator('a,button,i').first();
    if (await firstIcon.isVisible().catch(() => false)) {
      await firstIcon.click().catch(() => {});
      await page.waitForTimeout(2800);
      console.log('after row-action click → url:', page.url());
      console.log('edit-modal visible:', await page.locator('#task-edit-modal').isVisible().catch(() => false));
      console.log('headings:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('h4,h5,h6,.modal-title,.nav-link')].filter(e => e.getClientRects().length > 0).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => t && t.length < 26).slice(0, 12))));
      await page.screenshot({ path: 'screenshots/discover_rowaction.png', fullPage: true }).catch(() => {});
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
