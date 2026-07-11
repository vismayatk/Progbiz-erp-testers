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
    await p.locator('table tbody tr').first().locator('td').nth(1).click();
    await p.waitForURL(/enquiry-overview/i, { timeout: 10000 });
    await p.waitForTimeout(5000);
    const info = await p.evaluate(() => {
      const statusish = [...document.querySelectorAll('*')]
        .filter(e => e.childElementCount === 0)
        .map(e => (e.textContent || '').replace(/\s+/g,' ').trim())
        .filter(t => t && /status|interested|business|cold|warm|hot|new\b/i.test(t) && t.length < 60);
      return { url: location.href, statusish: [...new Set(statusish)].slice(0, 20) };
    });
    console.log(JSON.stringify(info, null, 1));
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
