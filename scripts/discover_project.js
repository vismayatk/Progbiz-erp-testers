'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const BASE = process.env.BASE_URL;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);
    // click the Project nav item and read its submenu
    const proj = page.locator('a,button,span,li').filter({ hasText: /^\s*Project\s*$/i }).first();
    await proj.click().catch(() => {});
    await page.waitForTimeout(1500);
    const submenu = await page.evaluate(() =>
      [...document.querySelectorAll('a')].filter(e => e.getClientRects().length > 0)
        .map(a => ({ txt: (a.textContent || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') }))
        .filter(a => a.href && a.txt && a.txt.length < 30 && /project|task|milestone|board|sprint|team|dashboard|report|list/i.test(a.txt + a.href)));
    console.log('PROJECT submenu:', JSON.stringify([...new Map(submenu.map(s => [s.href, s])).values()], null, 1));

    // probe likely routes
    for (const slug of ['projects', 'project', 'project-list', 'project-dashboard', 'project-management', 'project-board', 'project-report']) {
      await page.goto(`${BASE}/${slug}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const d = await page.evaluate(() => ({
        url: location.pathname,
        is404: /nothing at this address|not found|404/i.test(document.body.innerText),
        title: (document.querySelector('h1,h2,h3,h4,.page-title,.breadcrumb')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        cols: [...document.querySelectorAll('table thead th')].map(t => t.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8),
        rows: document.querySelectorAll('table tbody tr').length,
        addBtn: [...document.querySelectorAll('button,a.btn')].map(b => (b.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /new|add|create|\+/i.test(t)).slice(0, 4),
      }));
      console.log(`  /${slug} →`, JSON.stringify(d));
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
