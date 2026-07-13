'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const B = process.env.BASE_URL;
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  const dumpFields = () => p.evaluate(() => ({
    url: location.href,
    inputs: [...document.querySelectorAll('input,select,textarea')].filter(e => e.getClientRects().length).map(e => ({
      tag: e.tagName, type: e.type || '', id: e.id, name: e.name || '', ph: e.placeholder || ''
    })).slice(0, 30),
    buttons: [...document.querySelectorAll('button')].filter(e => e.getClientRects().length).map(e => ({
      id: e.id, txt: (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,25)
    })).filter(x => x.id || x.txt).slice(0, 20),
  }));
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);

    console.log('===== ENQUIRY FORM =====');
    await p.goto(B + '/enquiry', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
    console.log(JSON.stringify(await dumpFields(), null, 1));

    console.log('===== QUOTATION (/quotation) =====');
    await p.goto(B + '/quotation', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
    console.log(JSON.stringify(await dumpFields(), null, 1));

    console.log('===== CREATED-TASKS =====');
    await p.goto(B + '/created-tasks', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
    console.log(JSON.stringify(await p.evaluate(() => ({
      url: location.href,
      bodySnippet: document.body.innerText.replace(/\s+/g,' ').slice(0, 300),
      tables: document.querySelectorAll('table').length,
      rows: document.querySelectorAll('tbody tr').length,
    })), null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
