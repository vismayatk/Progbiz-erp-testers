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
    await page.waitForTimeout(2500);
    const item = page.locator('#new-task-item');
    for (let i = 0; i < 6 && !(await item.isVisible().catch(() => false)); i++) { await page.locator('#new-task').click().catch(() => {}); await page.waitForTimeout(700); }
    await item.click();
    await page.waitForTimeout(2500);
    await page.getByText(/^\s*Repeat\s*$/i).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const m = document.querySelector('#home-create-task-modal .modal-body') || document.querySelector('#home-create-task-modal'); if (m) m.scrollTop = m.scrollHeight; });
    await page.waitForTimeout(500);
    const dump = await page.evaluate(() => {
      const m = document.querySelector('#home-create-task-modal');
      const vis = (e) => e.getClientRects().length > 0;
      const ok = (s) => !/switcher|theme-|example-radios|direction|navigation|sidemenu|page-styles|layout-|menu-|header-/.test(s || '');
      const fields = [...m.querySelectorAll('input,select,textarea')].filter(vis).filter(e => ok(e.id || e.name)).map(e => {
        let lbl = ''; let p = e.closest('div'); for (let i = 0; i < 4 && p && !lbl; i++) { const l = p.querySelector('label,.form-label'); if (l) lbl = l.textContent.replace(/\s+/g, ' ').trim(); p = p.parentElement; }
        return { tag: e.tagName, id: e.id, type: e.type, ph: e.placeholder, label: lbl.slice(0, 25), options: e.tagName === 'SELECT' ? [...e.options].map(o => o.textContent.trim()).slice(0, 9) : undefined };
      });
      const days = [...m.querySelectorAll('label,button,span,.day,.weekday')].filter(vis).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily|Weekly|Monthly|Every)/i.test(t)).slice(0, 12);
      return { fields, days: [...new Set(days)] };
    });
    console.log(JSON.stringify(dump, null, 1));
    await page.screenshot({ path: 'screenshots/discover_repeat.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
