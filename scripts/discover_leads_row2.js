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
    // click the customer-name cell of the first row
    await p.locator('table tbody tr').first().click().catch(e => console.log('row click err', e.message.slice(0,80)));
    await p.waitForTimeout(3000);
    console.log('after ROW click →', p.url());
    if (!/enquiry-overview/.test(p.url())) {
      await p.goto(process.env.BASE_URL + '/leads'); await p.waitForTimeout(3500);
      await p.locator('table tbody tr td').nth(1).click().catch(e => console.log('cell click err', e.message.slice(0,80)));
      await p.waitForTimeout(3000);
      console.log('after ENQ-cell click →', p.url());
    }
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
