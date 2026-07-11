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
    await p.waitForTimeout(5000);
    // set the Type select (the one with a 'Quotation' option) to Quotation
    const did = await p.evaluate(() => {
      const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => /^Quotation$/i.test(o.text.trim())));
      if (!sel) return 'no type select';
      const opt = [...sel.options].find(o => /^Quotation$/i.test(o.text.trim()));
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return 'set to ' + opt.value;
    });
    console.log('type select:', did);
    // look for an apply/search button
    const btns = await p.evaluate(() => [...document.querySelectorAll('button')].map(b=> (b.textContent||'').replace(/\s+/g,' ').trim()).filter(t=>/apply|search|filter|go/i.test(t)).slice(0,5));
    console.log('filter buttons:', JSON.stringify(btns));
    if (btns.length) await p.locator('button').filter({ hasText: new RegExp(btns[0], 'i') }).first().click().catch(()=>{});
    await p.waitForTimeout(5000);
    const rows = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(r => (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,70)));
    console.log(`rows after Type=Quotation: ${rows.length}`);
    rows.slice(0,4).forEach(r => console.log('  ', r));
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
