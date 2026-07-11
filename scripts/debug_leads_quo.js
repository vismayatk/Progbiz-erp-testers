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
    await p.goto(process.env.BASE_URL + '/leads', { waitUntil: 'domcontentloaded' });
    for (const wait of [2000, 4000, 6000]) {
      await p.waitForTimeout(wait);
      const info = await p.evaluate(() => {
        const rows = [...document.querySelectorAll('table tbody tr')].map(r => (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,70));
        return { n: rows.length, first3: rows.slice(0,3), quo: rows.filter(r => /QUO/i.test(r)).length };
      });
      console.log(`after +${wait}ms: rows=${info.n} quoRows=${info.quo} first=${JSON.stringify(info.first3)}`);
    }
    // any Type/filter control?
    const controls = await p.evaluate(() => [...document.querySelectorAll('select')].map(s => ({ id: s.id, opts: [...s.options].map(o=>o.text.trim()).slice(0,8) })).slice(0,6));
    console.log('selects:', JSON.stringify(controls));
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
