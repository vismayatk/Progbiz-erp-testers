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
    // 1) all sidebar/menu routes (hidden submenus included)
    const routes = await p.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))
        .filter(h => h && !/^https?|javascript|#/.test(h)))].sort());
    console.log('===== APP ROUTES =====');
    console.log(JSON.stringify(routes));

    // 2) open first lead → overview structure
    await p.goto(B + '/leads', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
    await p.locator('table tbody tr').first().locator('td').nth(1).click().catch(() => {});
    const onOverview = await p.waitForURL(/enquiry-overview/i, { timeout: 8000 }).then(() => true).catch(() => false);
    console.log('===== OVERVIEW (cell-click nav: ' + onOverview + ') =====');
    if (!onOverview) { // try customer cell
      await p.locator('table tbody tr').first().locator('td').nth(2).click().catch(() => {});
      await p.waitForURL(/enquiry-overview/i, { timeout: 8000 }).catch(() => {});
    }
    await p.waitForTimeout(4000);
    const ov = await p.evaluate(() => ({
      url: location.href,
      btns: [...document.querySelectorAll('button, a.btn')].filter(e => e.getClientRects().length)
        .map(e => ({ id: e.id, txt: (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,22) }))
        .filter(x => x.id || x.txt).slice(0, 18),
      statusLines: [...document.querySelectorAll('*')].filter(e => e.childElementCount === 0 && e.getClientRects().length)
        .map(e => (e.textContent||'').replace(/\s+/g,' ').trim())
        .filter(t => /^(followup\s*)?status\s*:/i.test(t) && t.length < 60).slice(0, 4),
    }));
    console.log(JSON.stringify(ov, null, 1));

    // 3) follow-up modal structure
    const fuBtn = p.locator('#btn-add-followup');
    if (await fuBtn.isVisible().catch(() => false)) {
      await fuBtn.click(); await p.waitForTimeout(2000);
      const fu = await p.evaluate(() => {
        const m = document.querySelector('#followupModal, .modal.show');
        if (!m) return 'NO MODAL';
        return {
          modalId: m.id,
          fields: [...m.querySelectorAll('input,select,textarea')].map(e => ({ tag: e.tagName, type: e.type||'', id: e.id })).slice(0, 12),
        };
      });
      console.log('===== FOLLOWUP MODAL ====='); console.log(JSON.stringify(fu, null, 1));
    } else console.log('===== FOLLOWUP MODAL ===== #btn-add-followup NOT VISIBLE');
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
