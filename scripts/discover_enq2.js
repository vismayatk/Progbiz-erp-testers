'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { EnquiryPage } = require('../pages/EnquiryPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password); await page.waitForTimeout(1500);
    const enq = new EnquiryPage(page);
    await enq.openAddForm();
    const dump = () => {
      const vis = e => e && e.getClientRects().length > 0;
      const byLabel = (rx) => [...document.querySelectorAll('label')].filter(l => rx.test(l.textContent || '')).map(l => {
        const f = l.closest('div')?.querySelector('input,select,textarea') || (l.htmlFor && document.getElementById(l.htmlFor));
        return { label: l.textContent.replace(/\s+/g, ' ').trim().slice(0, 22), id: f?.id || '', tag: f?.tagName || '', vis: vis(f) };
      });
      return {
        assign: byLabel(/assign/i),
        business: byLabel(/business|value/i),
        nextFollow: byLabel(/next.*follow|follow.*date/i),
        ids: [...document.querySelectorAll('input,select,textarea')].filter(vis).map(e => e.id).filter(id => /assign|business|value|next|follow|exec/i.test(id)),
      };
    };
    console.log('BEFORE status:', JSON.stringify(await page.evaluate(dump), null, 1));
    await enq.selectFollowup('Interested');
    console.log('AFTER Interested:', JSON.stringify(await page.evaluate(dump), null, 1));

    await enq.gotoList(); await page.waitForTimeout(2000);
    const rowHtml = await page.evaluate(() => {
      const r = document.querySelector('table tbody tr');
      if (!r) return '(no rows)';
      const cells = [...r.querySelectorAll('td')];
      const actionCell = cells.find(c => c.querySelector('a,button,i')) || cells[cells.length - 1];
      return (actionCell?.innerHTML || '').replace(/\s+/g, ' ').slice(0, 500);
    });
    console.log('LEADS row action cell:', rowHtml);
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
