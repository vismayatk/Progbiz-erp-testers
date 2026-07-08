'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
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
    await page.locator('table tbody tr').first().locator('a,button').first().click().catch(() => {});
    await page.waitForTimeout(2800);

    const panel = await page.evaluate(() => {
      // the Task Details modal = visible modal containing "Task Details"
      const m = [...document.querySelectorAll('.modal,[role="dialog"],.offcanvas')].filter(e => e.getClientRects().length > 0 && /Task Details/i.test(e.textContent || '')).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      if (!m) return { none: true };
      const vis = (e) => e.getClientRects().length > 0;
      return {
        modalId: m.id, modalCls: (m.className || '').slice(0, 40),
        headerBtns: [...m.querySelectorAll('.modal-header button, .modal-header a, button, a')].filter(vis).map(b => ({ id: b.id, txt: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16), cls: (b.getAttribute('class') || '').slice(0, 40), icon: (b.querySelector('i')?.className || '') })).filter(b => /hold|end|resume|start|more|ri-/i.test(b.txt + b.cls + b.icon)).slice(0, 12),
        inputs: [...m.querySelectorAll('input,textarea')].filter(vis).map(i => ({ id: i.id, tag: i.tagName, type: i.type, ph: i.placeholder })),
        fileInputs: [...m.querySelectorAll('input[type=file]')].map(i => ({ id: i.id, accept: i.accept })),
        sendIcons: [...m.querySelectorAll('i,button')].filter(vis).map(e => e.className).filter(c => /send|plane|attach|paperclip|edit|pencil/i.test(c)).slice(0, 8),
      };
    });
    console.log('PANEL:', JSON.stringify(panel, null, 1));

    // click the kebab (⋮) in the header
    const kebab = page.locator('.modal:visible .modal-header').locator('button, a').filter({ has: page.locator('i[class*="more"]') }).first()
      .or(page.locator('.modal:visible').locator('i[class*="more-2"], i[class*="more-fill"], .ri-more-2-fill').first());
    if (await kebab.isVisible().catch(() => false)) {
      await kebab.click().catch(() => {});
      await page.waitForTimeout(1200);
      const menu = await page.evaluate(() => [...document.querySelectorAll('a,button,li,.dropdown-item')].filter(e => e.getClientRects().length > 0).map(e => ({ id: e.id, txt: (e.textContent || '').replace(/\s+/g, ' ').trim() })).filter(e => e.txt && e.txt.length < 24 && /edit|reschedul|delet|resume|start|view|lead|duplicate|copy|change/i.test(e.txt)).slice(0, 12));
      console.log('KEBAB menu:', JSON.stringify(menu, null, 1));
    } else console.log('kebab not found via selector');
    await page.screenshot({ path: 'screenshots/discover_taskdetails.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
