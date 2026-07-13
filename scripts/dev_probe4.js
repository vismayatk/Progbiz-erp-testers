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

    // 1) phone lookup: type a fresh number, see what appears
    const phone = '9' + String(Date.now()).slice(-9);
    await p.locator('#customer-phone').fill(phone);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(3000);
    const custModal = await p.evaluate(() => {
      const m = [...document.querySelectorAll('.modal')].find(m => m.classList.contains('show') || getComputedStyle(m).display !== 'none');
      if (!m) return 'NO MODAL';
      return { id: m.id, fields: [...m.querySelectorAll('input,select,textarea')].map(e => ({ tag: e.tagName, id: e.id, ph: e.placeholder||'' })).slice(0,10),
               btns: [...m.querySelectorAll('button')].map(bt => ({ id: bt.id, txt: (bt.textContent||'').trim().slice(0,20) })).slice(0,6) };
    });
    console.log('===== NEW-CUSTOMER FLOW ====='); console.log(JSON.stringify(custModal, null, 1));
    // close any modal
    await p.keyboard.press('Escape'); await p.waitForTimeout(800);

    // 2) inline item search: type, dump suggestions
    await p.locator('#item-search-input').fill('Inv');
    await p.waitForTimeout(2500);
    const sugg = await p.evaluate(() => {
      const vis = [...document.querySelectorAll('ul li, .dropdown-menu *, [class*="suggest"] *, [class*="autocomplete"] *, table tbody tr')]
        .filter(e => e.getClientRects().length && /inv/i.test(e.textContent||''))
        .map(e => ({ tag: e.tagName, cls: (e.className||'').slice(0,40), txt: (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,40) }));
      return vis.slice(0, 8);
    });
    console.log('===== ITEM SUGGESTIONS (typed "Inv") ====='); console.log(JSON.stringify(sugg, null, 1));

    // also: what does the magnifier next to item search do on DEV?
    const grpIcons = await p.evaluate(() => {
      const inp = document.querySelector('#item-search-input');
      const grp = inp && inp.closest('.input-group');
      return grp ? [...grp.querySelectorAll('i,button')].map(e => ({ tag: e.tagName, id: e.id||'', cls: (e.className||'').slice(0,40) })) : 'no group';
    });
    console.log('item-search group controls:', JSON.stringify(grpIcons));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
