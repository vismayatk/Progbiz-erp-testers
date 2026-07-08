'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const BASE = process.env.BASE_URL;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  try {
    // --- LOGIN PAGE elements ---
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(3000);
    const lp = await page.evaluate(() => {
      const vis = e => e.getClientRects().length > 0;
      return {
        inputs: [...document.querySelectorAll('input')].filter(vis).map(i => ({ id: i.id, name: i.name, type: i.type, ph: i.placeholder })),
        eyeIcons: [...document.querySelectorAll('i,span,button,svg')].filter(vis).map(e => (e.getAttribute('class') || '')).filter(c => /eye|pass|show|visib|ri-eye/i.test(c)).slice(0, 6),
        checkboxes: [...document.querySelectorAll('input[type=checkbox]')].map(c => ({ id: c.id, label: (c.closest('label,div')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) })),
        links: [...document.querySelectorAll('a')].filter(vis).map(a => ({ txt: (a.textContent || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') })).filter(a => /forgot|password|reset/i.test(a.txt)),
        buttons: [...document.querySelectorAll('button')].filter(vis).map(b => ({ id: b.id, txt: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20) })),
      };
    });
    console.log('=== LOGIN PAGE ==='); console.log(JSON.stringify(lp, null, 1));
    await page.screenshot({ path: 'screenshots/discover_login.png' }).catch(() => {});

    // login
    const login = new LoginPage(page);
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // --- CRM dashboard ---
    for (const slug of ['crm-dashboard', 'home']) {
      await page.goto(`${BASE}/${slug}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const d = await page.evaluate(() => {
        const vis = e => e.getClientRects().length > 0;
        const txt = document.body.innerText;
        const cards = [...document.querySelectorAll('.card,.widget,[class*="card"]')].filter(vis).map(c => (c.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /new lead|followup|follow up|overdue|completed|pending/i.test(t) && t.length < 40).slice(0, 10);
        const sections = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,.card-title,.fw-semibold')].filter(vis).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /lead|followup|follow up|overdue|complete|schedule|summary|history|timeline/i.test(t) && t.length < 30).slice(0, 16);
        const summary = ['Total', 'New', 'Cold', 'Warm', 'Hot', 'Won', 'Lost'].filter(w => new RegExp('\b' + w + '\b', 'i').test(txt));
        const idEls = [...document.querySelectorAll('[id]')].filter(vis).map(e => e.id).filter(id => /lead|followup|overdue|complete|summary|exec|filter|schedule|new-enquiry|new-quotation|create/i.test(id)).slice(0, 25);
        return { url: location.pathname, cards: [...new Set(cards)], sections: [...new Set(sections)], summaryWords: summary, ids: idEls, hasCreateNew: /create new/i.test(txt), greeting: (txt.match(/Hey,?\s+[^\n!]{1,30}/i) || [''])[0] };
      });
      console.log(`\n=== ${slug} ===`); console.log(JSON.stringify(d, null, 1));
      await page.screenshot({ path: `screenshots/discover_${slug}.png`, fullPage: true }).catch(() => {});
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
