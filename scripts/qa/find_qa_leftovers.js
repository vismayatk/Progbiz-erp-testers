'use strict';
/**
 * READ-ONLY: list the QA_ records the automation left on the tenant.
 *
 *   node scripts/qa/find_qa_leftovers.js
 *
 * Opens each master / listing that the tests create records on, finds rows and cards whose text
 * contains "QA_", and prints them. It deletes nothing: remove what it finds by hand (or with the
 * matching spec's cleanup), after checking it really is automation data.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { chromium } = require('playwright');
const { LoginPage } = require('../../erp/common/LoginPage');

const BASE = process.env.BASE_URL;
const PAGES = [
  '/item-packing-types', '/department', '/designations', '/user-levels', '/workflow-cost-types', '/payment-terms', '/teams',
  '/lead-sources', '/lead-status', '/customers', '/leads', '/crm-items', '/predefined-tasks', '/email-templates', '/knowledge-base',
  '/dynamic-fields', '/dynamic-list', '/access-roles', '/users',
];

(async () => {
  const b = await chromium.launch({ headless: !process.env.HEADED });
  const page = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const lp = new LoginPage(page); await lp.goto();
  await lp.login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD);
  let total = 0;
  for (const route of PAGES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    // the page's own search box (never the sidebar's "Search menu" box)
    const search = page.locator('#filter-name, #cost-type-search, #team-search-input, #bc-search-input, #cf-search-input, #dr-search-input, #urg-search-input, #us-search-input, #user-log-filter-search, main input[placeholder*="Search" i], .main-content input[placeholder*="Search" i]').first();
    if (await search.count()) { await search.fill('QA_').catch(() => {}); await search.press('Enter').catch(() => {}); await page.waitForTimeout(2500); }   // searches run on Enter
    else if (await page.locator('#page_size').count()) { await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(1500); }
    const hits = await page.evaluate(() => {
      const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const rows = [...document.querySelectorAll('table tbody tr')].map((r) => t(r.innerText));
      const cards = [...document.querySelectorAll('.card')].filter((c) => !c.querySelector('.card')).map((c) => t(c.innerText));
      return [...new Set([...rows, ...cards].filter((x) => /QA_/.test(x)).map((x) => x.slice(0, 100)))];
    });
    if (hits.length) { total += hits.length; console.log(`${route}`); hits.forEach((h) => console.log(`   • ${h}`)); }
  }
  console.log(total ? `\n${total} QA_ record(s) found.` : '\nNo QA_ records found on the checked pages.');
  await b.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
