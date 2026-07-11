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
    await p.goto('https://erptest.progbiz.in/my-tasks');
    await p.waitForTimeout(4500);
    const rowsSel = 'table tbody tr';
    const rc = () => p.locator(rowsSel).count();
    console.log('initial rows:', await rc());
    // structure of the tab element carrying "Unscheduled"
    const struct = await p.evaluate(() => {
      const li = [...document.querySelectorAll('li,button,a,div')].find(e => /^\s*Unscheduled\s*\d*\s*$/i.test((e.textContent||'').trim()));
      if (!li) return 'NO Unscheduled element';
      const inner = li.querySelector('a,button');
      return { tag: li.tagName, cls: li.className, onclick: li.getAttribute('onclick'), hasInnerA: !!inner, innerTag: inner && inner.tagName, innerCls: inner && inner.className, innerHref: inner && inner.getAttribute('href') };
    });
    console.log('Unscheduled el:', JSON.stringify(struct));
    // Try clicking Unscheduled a few ways, report row count after each
    const tries = [
      ['li text',      () => p.locator('li').filter({ hasText: /^\s*Unscheduled\s*\d*\s*$/i }).first().click()],
      ['li>a',         () => p.locator('li').filter({ hasText: /^\s*Unscheduled\s*\d*\s*$/i }).locator('a,button').first().click()],
      ['any text',     () => p.getByText(/^\s*Unscheduled\s*\d*\s*$/i).first().click()],
    ];
    for (const [name, fn] of tries) {
      await p.goto('https://erptest.progbiz.in/my-tasks'); await p.waitForTimeout(3500);
      const before = await rc();
      await fn().catch(e => console.log('   click err', name, e.message.slice(0,60)));
      await p.waitForTimeout(2500);
      const after = await rc();
      console.log(`try[${name}] rows ${before} -> ${after}`);
    }
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
