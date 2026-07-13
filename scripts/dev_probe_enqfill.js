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
    const phone = '9' + String(Date.now()).slice(-9);
    await p.locator('#customer-phone').fill(phone);
    // open the new-customer modal via the + icon (what handleNewCustomerModal does)
    const grp = p.locator('#customer-phone').locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
    await grp.locator('i.ri-add-fill').first().click({ timeout: 8000 }).catch(e => console.log('plus err', e.message.slice(0,50)));
    await p.waitForTimeout(2500);
    const state = await p.evaluate(() => ({
      openModals: [...document.querySelectorAll('.modal')].filter(m => m.classList.contains('show') || getComputedStyle(m).display === 'block').map(m => m.id || m.className.slice(0,40)),
      backdrops: document.querySelectorAll('.modal-backdrop').length,
      newCustModal: !!document.querySelector('#enquiry-new-customer-modal'),
    }));
    console.log('after + click:', JSON.stringify(state, null, 1));
    await p.screenshot({ path: 'screenshots/dev_enq_newcust.png', fullPage: false });
    // if a modal is open, dump its visible inputs + buttons
    const dump = await p.evaluate(() => {
      const m = [...document.querySelectorAll('.modal')].find(m => m.classList.contains('show') || getComputedStyle(m).display === 'block');
      if (!m) return 'no modal';
      return { id: m.id,
        inputs: [...m.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(e=>e.getClientRects().length).map(e => ({ tag: e.tagName, id: e.id, ph: e.placeholder||'' })).slice(0,12),
        btns: [...m.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(bt => ({ id: bt.id, txt: (bt.textContent||'').trim().slice(0,18) })).slice(0,8) };
    });
    console.log('modal dump:', JSON.stringify(dump, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
