'use strict';
require('dotenv').config();
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = 'https://erptest.progbiz.in', CO = 'lesol_test', USER = 'admin', PASS = '123';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(25000);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="company_code"], input[id*="company" i]').first().fill(CO);
  await page.locator('input[name="username"], input[id*="user" i]').first().fill(USER);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 25000 });

  // ALL submenu links grouped by parent nav id — regardless of visibility
  const menus = await page.evaluate(() => {
    const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const out = {};
    document.querySelectorAll('.side-menu__item[id^="nav-"], a[id^="nav-"]').forEach(parent => {
      const li = parent.closest('li');
      if (!li) return;
      const sub = [...li.querySelectorAll('.slide-menu a, ul a')]
        .map(a => ({ text: txt(a), href: a.getAttribute('href') || '' }))
        .filter(x => x.text && x.href && !/void\(0\)|^#$|^javascript/i.test(x.href));
      out[parent.id + ' :: ' + txt(parent).slice(0,20)] = sub;
    });
    return out;
  });
  console.log('=== ALL MODULE SUBMENUS ===');
  console.log(JSON.stringify(menus, null, 2));

  // Enquiry form — wait for AJAX fields to load
  await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('#TxtCustomer, input[id*="ustomer"], form input[type="text"]', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(2500);
  const enquiryFields = await page.evaluate(() => {
    const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const vis = el => el.offsetParent !== null;
    return [...document.querySelectorAll('input,select,textarea')]
      .filter(vis).filter(el => el.type !== 'hidden' && !/^switcher-/.test(el.id))
      .map(el => ({
        tag: el.tagName.toLowerCase(), type: el.type || '', id: el.id || '', name: el.name || '',
        placeholder: el.placeholder || '', required: el.required || el.hasAttribute('required'),
        label: (el.labels && el.labels[0] && txt(el.labels[0])) || '',
        options: el.tagName === 'SELECT' ? [...el.options].map(o => o.text.trim()).slice(0, 12) : undefined,
      }));
  });
  console.log('\n=== ENQUIRY FORM FIELDS (' + enquiryFields.length + ') ===');
  console.log(JSON.stringify(enquiryFields, null, 2));
  await page.screenshot({ path: 'crm_shots/page_enquiry_form_loaded.png', fullPage: true });

  fs.writeFileSync('crm_submenu_report.json', JSON.stringify({ menus, enquiryFields }, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
