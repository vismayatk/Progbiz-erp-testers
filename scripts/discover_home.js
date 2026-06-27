'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const BASE = process.env.BASE_URL;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password); await page.waitForTimeout(2000);
    console.log('LANDING after login:', page.url());
    for (const slug of ['home', 'crm-dashboard', 'leads', 'followups']) {
      await page.goto(`${BASE}/${slug}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const d = await page.evaluate(() => {
        const vis = e => e && e.getClientRects().length > 0;
        const txt = document.body.innerText;
        // cards/counts: elements whose text mentions the CRM home keywords + a number
        const cards = [...document.querySelectorAll('div,a,button')].filter(vis).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(t => /(new lead|follow ?up|overdue|completed|pending)\s*\d|^\d+\s*(new lead|follow ?up|overdue|completed)/i.test(t) && t.length < 30);
        const summary = ['Total', 'New', 'Cold', 'Warm', 'Hot', 'Won', 'Lost'].filter(w => new RegExp('\\b' + w + '\\b').test(txt));
        const tabs = [...document.querySelectorAll('[id^="tab-"], button, a.btn')].filter(vis).map(e => ({ id: e.id, t: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) })).filter(e => /lead|follow|overdue|today|upcoming|won|lost|new/i.test(e.id + e.t)).slice(0, 14);
        const ids = [...document.querySelectorAll('[id]')].filter(vis).map(e => e.id).filter(id => /lead|follow|overdue|complete|summary|exec|today|schedule|history|new-enquiry|new-quotation|timeline|calendar/i.test(id)).slice(0, 25);
        return {
          url: location.pathname,
          greeting: (txt.match(/Hey,?\s*[^\n!]{1,28}/i) || [''])[0].trim(),
          cards: [...new Set(cards)].slice(0, 10),
          summaryWords: summary,
          tabs, ids,
          createNew: /create new/i.test(txt),
          newLeads: /new lead/i.test(txt), overdue: /overdue/i.test(txt), todaySchedule: /today'?s schedule/i.test(txt), followHistory: /follow ?up history/i.test(txt),
        };
      });
      console.log(`\n=== /${slug} ===`); console.log(JSON.stringify(d, null, 1));
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
