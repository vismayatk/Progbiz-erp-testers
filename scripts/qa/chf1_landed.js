require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const browser = await chromium.launch({ headless: true }); const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try { await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);
    await page.goto(`${BASE}/enquiry-overview/396806`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.nav-tabs a, .nav-tabs button, [role=tab]')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
    console.log('overview tabs:', JSON.stringify(tabs));
    for (const t of tabs.filter((x) => /follow/i.test(x))) { await page.locator('.nav-tabs a, .nav-tabs button, [role=tab]').filter({ hasText: t }).first().click().catch(() => {}); await page.waitForTimeout(2500);
      const rows = await page.evaluate(() => [...document.querySelectorAll('.tab-pane.active table tbody tr, .tab-content table tbody tr, .timeline li, .list-group-item')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12));
      console.log(`tab "${t}" → ${rows.length} entries`); rows.forEach((r) => console.log('   ', r.slice(0, 140))); }
    await page.goto(`${BASE}/followups`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
    const tabs2 = await page.evaluate(() => [...document.querySelectorAll('.nav-tabs a, .nav-tabs button, [role=tab]')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
    for (const t of ['(default)', ...tabs2]) { if (t !== '(default)') { await page.locator('.nav-tabs a, .nav-tabs button, [role=tab]').filter({ hasText: t }).first().click().catch(() => {}); await page.waitForTimeout(3000); }
      await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(2500);
      const rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
      const mine = rows.filter((r) => /QA_LEAD_1788793891372/.test(r)); console.log(`/followups tab ${t}: ${rows.length} rows · QA_LEAD_1788793891372 rows: ${mine.length}`); mine.forEach((r) => console.log('   ', r.slice(0, 160))); }
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0]); } finally { await browser.close(); }
})();
