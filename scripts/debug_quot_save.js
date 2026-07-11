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
    await p.goto(process.env.BASE_URL + '/quotation/0/275848'); await p.waitForTimeout(4000);
    const state = await p.evaluate(() => ({
      items: [...document.querySelectorAll('table tbody tr')].map(r => (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,60)),
      expdate: document.querySelector('#expdate') ? { type: document.querySelector('#expdate').type, value: document.querySelector('#expdate').value } : null,
      required: [...document.querySelectorAll('input[required],select[required]')].map(e => e.id || e.name),
    }));
    console.log('BEFORE:', JSON.stringify(state, null, 1));
    await p.locator('#expdate').fill('2026-07-25').catch(e => console.log('fill err', e.message.slice(0,80)));
    await p.locator('#btn-save-quotation').click().catch(e => console.log('save err', e.message.slice(0,80)));
    await p.waitForTimeout(3500);
    const after = await p.evaluate(() => ({
      url: location.href,
      swal: document.querySelector('.swal2-title, .swal2-html-container')?.textContent?.trim() || null,
      toast: document.querySelector('.toast-message, .alert:not(.d-none)')?.textContent?.trim().slice(0,120) || null,
      validation: [...document.querySelectorAll('.text-danger, .invalid-feedback, .error, [class*="validation"]')].map(e => (e.textContent||'').trim()).filter(Boolean).slice(0,8),
    }));
    console.log('AFTER SAVE:', JSON.stringify(after, null, 1));
    await p.screenshot({ path: 'screenshots/debug_quot_save.png', fullPage: true });
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
