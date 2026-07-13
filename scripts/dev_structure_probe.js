'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const B = process.env.BASE_URL;

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  const out = {};
  const probe = async (name, url, sels, extra) => {
    try {
      await p.goto(B + url, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(4000);
      const found = await p.evaluate((ss) => {
        const r = {};
        for (const s of ss) { try { r[s] = !!document.querySelector(s); } catch { r[s] = 'ERR'; } }
        return r;
      }, sels);
      out[name] = { url: p.url().replace(/^https?:\/\/[^/]+/, ''), sels: found };
      if (extra) out[name].extra = await extra();
    } catch (e) { out[name] = { error: e.message.slice(0, 80) }; }
  };
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);

    await probe('home', '/home', ['#new-task', '#home-create-task-modal', '#taskName', '#todayScheduletask']);
    await probe('leads', '/leads', ['table tbody tr', '#tab-lead-new', '#tab-lead-infollowup', '#tab-lead-won', '#tab-lead-lost', '#btn-toggle-filter', '#btn-apply-filter'],
      async () => p.evaluate(() => {
        const tr = document.querySelector('table tbody tr');
        return { firstRowCells: tr ? [...tr.querySelectorAll('td')].map(td => (td.textContent||'').replace(/\s+/g,' ').trim().slice(0,20)) : null,
                 rowAnchors: tr ? tr.querySelectorAll('a,button').length : null };
      }));
    await probe('enquiry form', '/enquiry', ['#TxtCustomer', '#txtphone', '#txtemail', '#source', '#description', '#btn-save-enquiry', 'button:has(i)', '#searchItemModal']);
    await probe('followups', '/followups', ['#tab-followup-today', '#tab-followup-overdue', '#tab-followup-upcoming', '#tab-followup-nonfollowup']);
    await probe('crm-dashboard', '/crm-dashboard', ['#btn-toggle-filter']);
    await probe('quotation form', '/quotation', ['#quotation-no', '#customerNameInput', '#agent', '#quotation-quality', '#currency', '#expdate', '#terms-and-condition', '#gross-total', '#payable-total', '#btn-save-quotation']);
    await probe('items list', '/items', ['table tbody tr']);
    await probe('item form', '/item', ['#item-name', '#description', '#variant']);
    await probe('my-tasks', '/my-tasks', ['table tbody tr', 'li.nav-item']);
    await probe('created-tasks', '/created-tasks', ['table tbody tr', '[id^="overview-task-"]']);
    await probe('projects', '/projects', ['table tbody tr']);
    console.log(JSON.stringify(out, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
