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
    await p.goto(process.env.BASE_URL + '/leads'); await p.waitForTimeout(4000);
    const row = await p.evaluate(() => {
      const tr = document.querySelector('table tbody tr');
      if (!tr) return 'NO ROW';
      return {
        cells: [...tr.querySelectorAll('td')].map(td => (td.textContent||'').replace(/\s+/g,' ').trim().slice(0,25)),
        anchors: [...tr.querySelectorAll('a,button')].map(a => ({
          tag: a.tagName, id: a.id, cls: (a.className||'').slice(0,50),
          href: a.getAttribute('href'), title: a.getAttribute('title'),
          txt: (a.textContent||'').replace(/\s+/g,' ').trim().slice(0,20),
          icon: a.querySelector('i') ? a.querySelector('i').className : ''
        })),
      };
    });
    console.log(JSON.stringify(row, null, 1));
    // click the first anchor (what openFirstEnquiry does) and report where we land
    const before = p.url();
    await p.locator('table tbody tr:first-child td a').first().click().catch(e => console.log('click err', e.message.slice(0,60)));
    await p.waitForTimeout(2500);
    console.log('after first-anchor click:', before, '->', p.url());
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
