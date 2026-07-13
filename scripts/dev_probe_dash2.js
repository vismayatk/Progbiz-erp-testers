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
    await p.waitForTimeout(7000);
    const info = await p.evaluate(() => ({
      visibleText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600),
      charts: { canvas: document.querySelectorAll('canvas').length, svg: document.querySelectorAll('svg').length,
                apex: document.querySelectorAll('.apexcharts-canvas').length },
      cardTitles: [...document.querySelectorAll('.card-title, .card-header, h5, h6')]
        .filter(e => e.getClientRects().length)
        .map(e => (e.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean).slice(0, 15),
    }));
    console.log(JSON.stringify(info, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
