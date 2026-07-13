'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const B = process.env.BASE_URL;
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    await p.goto(B + '/enquiry', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
    // click the magnifier in the item-search group
    const grp = p.locator('#item-search-input').locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
    await grp.locator('i.ri-search-line').first().click();
    await p.waitForTimeout(2500);
    const modal = await p.evaluate(() => {
      const m = [...document.querySelectorAll('.modal')].find(m => m.classList.contains('show') || getComputedStyle(m).display === 'block');
      if (!m) return 'NO MODAL OPENED';
      return { id: m.id,
        inputs: [...m.querySelectorAll('input')].map(e => ({ id: e.id, ph: e.placeholder||'' })).slice(0,5),
        rows: m.querySelectorAll('table tbody tr').length,
        firstRow: (m.querySelector('table tbody tr')?.textContent||'').replace(/\s+/g,' ').trim().slice(0,60) };
    });
    console.log('===== ITEM MODAL (magnifier) ====='); console.log(JSON.stringify(modal, null, 1));

    // phone flow: fill + click search icon next to phone if any
    const phoneGrp = await p.evaluate(() => {
      const inp = document.querySelector('#customer-phone');
      const grp = inp && inp.closest('.input-group');
      return grp ? [...grp.querySelectorAll('i,button')].map(e => ({ tag: e.tagName, id: e.id||'', cls: (e.className||'').slice(0,40) })) : 'no group';
    });
    console.log('phone group controls:', JSON.stringify(phoneGrp));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
