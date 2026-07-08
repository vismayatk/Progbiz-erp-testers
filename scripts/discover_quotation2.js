'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { EnquiryPage } = require('../erp/crm/pages/EnquiryPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const uniq = () => { const ts = Date.now(); return { customerName: `QT Cust ${ts}`, mobile: '9' + String(ts).slice(-9), email: `qt${ts}@x.com`, source: 'Website', product: 'Inverter', description: 'qt', quantity: '2', unitPrice: '1000' }; };
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password); await page.waitForTimeout(1500);
    const enq = new EnquiryPage(page);
    await enq.openAddForm();
    await enq.fillAndCreate(uniq());
    await page.waitForTimeout(1500);
    await enq.convertToQuotation();
    await page.waitForTimeout(2500);
    console.log('URL after convert:', page.url());
    const d = await page.evaluate(() => {
      const vis = e => e && e.getClientRects().length > 0;
      const ok = s => !/switcher|theme|direction|navigation|sidemenu|page-styles|layout|menu-|header-|example-radios/.test(s || '');
      return {
        fields: [...document.querySelectorAll('input,select,textarea')].filter(vis).filter(e => ok(e.id || e.name)).map(e => ({ id: e.id, type: e.type, ph: e.placeholder, val: (e.value || '').slice(0, 18),
          label: (() => { let p = e.closest('div,td'); for (let i = 0; i < 3 && p; i++) { const l = p.querySelector('label,th'); if (l) return l.textContent.replace(/\s+/g, ' ').trim().slice(0, 18); p = p.parentElement; } return ''; })() })).slice(0, 40),
        buttons: [...document.querySelectorAll('button,a.btn')].filter(vis).map(b => ({ id: b.id, txt: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22) })).filter(b => /save|cancel|quotation|add|item/i.test(b.id + b.txt)).slice(0, 12),
        totals: ['Gross', 'Discount', 'Tax', 'Total', 'Payable', 'Terms', 'Condition', 'Valid'].filter(w => new RegExp(w, 'i').test(document.body.innerText)),
        itemRows: document.querySelectorAll('table tbody tr').length,
        cols: [...document.querySelectorAll('table thead th')].map(t => t.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12),
      };
    });
    console.log('QUOTATION (from enquiry):', JSON.stringify(d, null, 1));
    await page.screenshot({ path: 'screenshots/discover_quotation_form.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
