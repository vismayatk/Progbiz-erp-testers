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
    await p.goto(process.env.BASE_URL + '/crm-dashboard', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
    const info = await p.evaluate(() => {
      const cats = ['New', 'Cold', 'Warm', 'Hot', 'Won', 'Lost'];
      // small visible elements containing a category word — show their full line text
      const lines = [...document.querySelectorAll('body *')]
        .filter(e => e.getClientRects().length && e.children.length <= 3)
        .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 0 && t.length < 60 && cats.some(c => new RegExp('\b' + c + '\b').test(t)));
      return [...new Set(lines)].slice(0, 25);
    });
    console.log(JSON.stringify(info, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
