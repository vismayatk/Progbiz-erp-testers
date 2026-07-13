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
    await p.goto(B + '/item', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000);
    await p.locator('#item-name').fill('CancelProbe X');
    const cancels = await p.evaluate(() => [...document.querySelectorAll('button, a.btn, a')]
      .filter(e => e.getClientRects().length && /cancel|back/i.test((e.textContent||'')))
      .map(e => ({ tag: e.tagName, id: e.id, txt: (e.textContent||'').trim().slice(0,20) })).slice(0,5));
    console.log('cancel controls:', JSON.stringify(cancels));
    await p.locator('button, a').filter({ hasText: /^\s*Cancel\s*$/i }).first().click().catch(e => console.log('click err', e.message.slice(0,60)));
    await p.waitForTimeout(3000);
    console.log('after Cancel →', p.url());
    console.log('name field still there:', await p.locator('#item-name').isVisible().catch(() => false),
      '| value:', await p.locator('#item-name').inputValue().catch(() => 'n/a'));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
