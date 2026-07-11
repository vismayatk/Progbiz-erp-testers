'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    await p.goto('https://erptest.progbiz.in/my-tasks'); await p.waitForTimeout(4500);
    const activeInfo = (label) => p.evaluate((lab) => {
      const li = [...document.querySelectorAll('li.nav-item')].find(e => new RegExp('^\s*'+lab+'\s*\d*\s*$','i').test((e.textContent||'').trim()));
      if (!li) return null;
      const btn = li.querySelector('button,a');
      return { liCls: li.className, btnCls: btn && btn.className, ariaSel: btn && btn.getAttribute('aria-selected') };
    }, label);
    // click Completed then Today, report active class each time
    for (const lab of ['Completed','Today','Delayed']) {
      await p.locator('li.nav-item').filter({ hasText: new RegExp('^\s*'+lab+'\s*\d*\s*$','i') }).locator('button,a').first().click().catch(()=>{});
      await p.waitForTimeout(2200);
      const rows = await p.locator('table tbody tr').count();
      console.log(lab, '→ rows', rows, '| self:', JSON.stringify(await activeInfo(lab)));
    }
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
