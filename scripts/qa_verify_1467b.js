'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.goto(`${login.baseUrl}/dynamic-report`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(2500);
    // dump report-type controls
    const ctrls = await page.evaluate(() => {
      const vis = e => e.getClientRects().length > 0;
      return {
        selects: [...document.querySelectorAll('select')].filter(vis).map(s => ({ id: s.id, opts: [...s.options].map(o => o.textContent.trim()).slice(0, 10) })),
        tabsBtns: [...document.querySelectorAll('button,a,.nav-link,.tab')].filter(vis).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /task|enquiry|quotation|report|filter/i.test(t) && t.length < 22).slice(0, 15),
      };
    });
    console.log('report-type controls:', JSON.stringify(ctrls, null, 1));
    await page.locator('#selectbox').selectOption({ label: 'Tasks' }).catch(() => {});
    await page.waitForTimeout(3000);
    // open any filter panel / generate
    for (const sel of ['#btn-toggle-filter', 'button:has-text("Filter")', 'button:has-text("Generate")', 'button:has-text("Search")', '[id*="filter" i]']) {
      await page.locator(sel).first().click().catch(() => {});
      await page.waitForTimeout(900);
    }
    // dump ALL filter labels to see what task filters exist
    const allLabels = await page.evaluate(() => [...document.querySelectorAll('label,.form-label,th')].filter(e => e.getClientRects().length).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40));
    console.log('\nALL task-report filter labels:', JSON.stringify(allLabels));
    const fin = await page.evaluate(() => {
      const hit = /finish\s*before/i.test(document.body.innerText);
      const labels = [...document.querySelectorAll('label,th,span,div')].filter(e => /finish\s*before/i.test(e.textContent || '')).slice(0, 4);
      const info = labels.map(l => {
        const c = l.closest('div,td,.filter,.form-group') || l.parentElement;
        const f = c && (c.querySelector('input,select') || c.parentElement?.querySelector('input,select'));
        return { label: l.textContent.replace(/\s+/g, ' ').trim().slice(0, 26), tag: f?.tagName, type: f?.type, opts: f && f.tagName === 'SELECT' ? [...f.options].map(o => o.textContent.trim()).slice(0, 8) : null };
      });
      return { hit, info };
    });
    console.log('\nfinish-before present:', fin.hit);
    console.log('finish-before field:', JSON.stringify(fin.info, null, 1));
    await page.screenshot({ path: 'screenshots/qa_1467b.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
