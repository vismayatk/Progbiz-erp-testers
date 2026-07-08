'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { EnquiryPage } = require('../erp/crm/pages/EnquiryPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const BASE = process.env.BASE_URL;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);
    const enq = new EnquiryPage(page);
    await enq.gotoList().catch(() => {});
    await enq.clickAddNew().catch(async () => { await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded' }); });
    await page.waitForTimeout(2500);
    // baseline fields
    const base = await page.evaluate(() => {
      const vis = e => e.getClientRects().length > 0;
      return {
        branch: [...(document.querySelector('#branch')?.options || [])].map(o => o.textContent.trim()).slice(0, 6),
        followupOptions: [...(document.querySelector('#followup')?.options || [])].map(o => o.textContent.trim()),
        assignto: [...(document.querySelector('#assignto')?.options || [])].map(o => o.textContent.trim()).slice(0, 10),
        leadsource: [...(document.querySelector('#leadsource')?.options || [])].map(o => o.textContent.trim()).slice(0, 8),
        enquiryNo: document.querySelector('#enquiry-number')?.value || '',
        dateVal: document.querySelector('#enquiry-date')?.value || '',
        leadQualityPresent: !!document.querySelector('#lead-quality, [id*="quality" i]'),
        leadQualityVisible: vis(document.querySelector('#lead-quality, [id*="quality" i]') || document.createElement('x')),
        descVisible: vis(document.querySelector('#enquiry-description') || document.createElement('x')),
      };
    });
    console.log('BASELINE:', JSON.stringify(base, null, 1));

    // try selecting followup statuses and observe lead-quality/description visibility
    const fu = page.locator('#followup');
    for (const label of base.followupOptions.filter(o => /interested|got the business|not interested|new enquiry/i.test(o)).slice(0, 4)) {
      await fu.selectOption({ label }).catch(() => {});
      await page.waitForTimeout(900);
      const st = await page.evaluate(() => {
        const vis = e => e && e.getClientRects().length > 0;
        const lq = document.querySelector('#lead-quality, [id*="quality" i]');
        return { lqVisible: vis(lq), lqOptions: lq ? [...lq.options || []].map(o => o.textContent.trim()).slice(0, 5) : [], descVisible: vis(document.querySelector('#enquiry-description')) };
      });
      console.log(`  status "${label}" →`, JSON.stringify(st));
    }
    await page.screenshot({ path: 'screenshots/discover_enquiry_form.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
