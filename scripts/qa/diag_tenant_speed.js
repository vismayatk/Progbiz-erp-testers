'use strict';
// Is the tenant slow / rate-limiting right now? Times a login + two page loads
// and reports any 429/5xx responses.
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL;
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const bad = [];
  p.on('response', (r) => { const s = r.status(); if (s === 429 || s >= 500) bad.push(`${s} ${r.url().split('?')[0].replace(BASE, '').slice(-60)}`); });
  const t = (label, fn) => { const s = Date.now(); return fn().then(() => console.log(`  ${label}: ${((Date.now() - s) / 1000).toFixed(1)}s`)); };
  try {
    await t('login', async () => { await new LoginPage(p).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD); });
    await t('goto /my-tasks', async () => { await p.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' }); });
    await t('grid settle (3s wait + row count)', async () => { await p.waitForTimeout(3000); });
    console.log('  rows now:', await p.locator('table tbody tr').count());
    await t('select page_size 100', async () => { await p.selectOption('#page_size', '100').catch((e) => console.log('   err', e.message.split('\n')[0])); });
    await t('settle', async () => { await p.waitForTimeout(3000); });
    console.log('  rows after page_size:', await p.locator('table tbody tr').count());
    const first = await p.locator('table tbody tr').first().innerText().catch(() => '');
    console.log('  first row:', first.replace(/\s+/g, ' ').slice(0, 100));
    await t('goto /home', async () => { await p.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' }); });
    console.log('  429/5xx responses seen:', bad.length ? JSON.stringify(bad.slice(0, 8)) : 'none');
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0]); }
  finally { await b.close(); }
})();
