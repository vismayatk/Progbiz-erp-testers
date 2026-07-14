'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    await tm.gotoMyTasks(); await tm.clickTab('Today');
    await p.waitForFunction(() => [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent||'').trim().length>5), { timeout: 10000 }).catch(()=>{});
    const cells = await p.evaluate(() => { const r=[...document.querySelectorAll('table tbody tr')].find(x=>(x.textContent||'').trim().length>5); return r?[...r.querySelectorAll('td')].map((td,i)=>({i,txt:(td.textContent||'').replace(/\s+/g,' ').trim().slice(0,20)})):[]; });
    console.log('cells:', JSON.stringify(cells));
    const r = p.locator('table tbody tr').filter({ hasNotText: /^\s*$/ }).first();
    for (const i of [3,2,1,4]) {
      await r.locator(`td`).nth(i).click().catch(()=>{});
      await p.waitForTimeout(2200);
      const m = await p.evaluate(() => { const mm=[...document.querySelectorAll('.modal,.offcanvas')].find(x=>x.classList.contains('show')||getComputedStyle(x).display==='block'); return mm?{id:mm.id,hasChat:!!mm.querySelector('#txtChat'),textStart:(mm.textContent||'').replace(/\s+/g,' ').trim().slice(0,40)}:null; });
      const url = p.url();
      if (m) { console.log(`td[${i}] click → MODAL`, JSON.stringify(m)); break; }
      else if (/overview|task\//.test(url)) { console.log(`td[${i}] click → navigated to ${url}`); break; }
      else console.log(`td[${i}] click → nothing (url ${url.replace(/^https?:\/\/[^/]+/,'')})`);
    }
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
