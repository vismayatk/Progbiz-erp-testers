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
    await p.goto(C && 'https://erptest.progbiz.in/my-tasks');
    await p.waitForTimeout(4000);
    // find tab controls (buttons/anchors whose text starts with a status word + a number)
    const info = await p.evaluate(() => {
      const cand = [...document.querySelectorAll('button, a, li')].filter(e => /^(Today|Delayed|Upcoming|Unscheduled|Completed|Pending|Overdue)\s*\d*/i.test((e.textContent||'').trim()));
      const uniq = [];
      for (const e of cand) {
        const t = (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,30);
        if (uniq.find(u=>u.t===t)) continue;
        uniq.push({ t, tag:e.tagName, cls:e.className, ariaSel:e.getAttribute('aria-selected'), dataState:e.getAttribute('data-state') });
      }
      return uniq.slice(0,8);
    });
    console.log(JSON.stringify(info, null, 1));
    // click "Completed" and re-read its classes to see the active marker
    const before = await p.evaluate(() => {
      const e=[...document.querySelectorAll('button,a,li')].find(x=>/^Completed\s*\d*/i.test((x.textContent||'').trim()));
      return e ? e.className : null; });
    await p.locator('button,a,li').filter({ hasText:/^Completed\s*\d*/i }).first().click().catch(()=>{});
    await p.waitForTimeout(2000);
    const after = await p.evaluate(() => {
      const e=[...document.querySelectorAll('button,a,li')].find(x=>/^Completed\s*\d*/i.test((x.textContent||'').trim()));
      return e ? { cls:e.className, ariaSel:e.getAttribute('aria-selected'), dataState:e.getAttribute('data-state') } : null; });
    console.log('BEFORE cls:', before);
    console.log('AFTER Completed click:', JSON.stringify(after));
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
