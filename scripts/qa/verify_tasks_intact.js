require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL;
(async () => {
  const b = await chromium.launch({ headless: true }); const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await new LoginPage(p).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD); await p.waitForTimeout(1500);
    await p.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
    const tabCounts = await p.evaluate(() => [...document.querySelectorAll('li.nav-item button, li.nav-item a')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
    await p.selectOption('#page_size', '100').catch(() => {}); await p.waitForTimeout(2500);
    const rows = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    for (const n of ['Repeat 1789652320867', 'Ashraf - Order Confirmation']) console.log(`  ${rows.some((r) => r.includes(n)) ? '✅ present' : '❌ MISSING'}  "${n}"`);
    console.log('  tab counts now:', JSON.stringify(tabCounts), '(before probe: Today 18 · Delayed 38 · Upcoming 11 · Completed 94)');
    console.log('  any confirm dialog left open:', await p.locator('text=Are you sure you want to delete').isVisible().catch(() => false));
  } finally { await b.close(); }
})();
