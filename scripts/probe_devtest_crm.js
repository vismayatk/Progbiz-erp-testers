'use strict';
/** Read-only probe #2: crm-dashboard count format, enquiry-overview phone
 *  display, leads-list search + tabs. Diagnoses Home_15 / TC-02B / TC-11. */
require('dotenv').config();
const { chromium } = require('playwright');
const { LoginPage } = require('../erp/common/LoginPage');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await new LoginPage(page).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD);

  // ── Home_15: crm-dashboard classification counts ──
  await page.goto(`${process.env.BASE_URL}/crm-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  const dash = await page.evaluate(() => {
    const text = document.body.innerText.replace(/\s+/g, ' ');
    const around = (w) => {
      const i = text.search(new RegExp('\\b' + w + '\\b'));
      return i < 0 ? '(absent)' : text.slice(Math.max(0, i - 30), i + 40);
    };
    return { New: around('New'), Won: around('Won'), Lost: around('Lost'), head: text.slice(0, 350) };
  });
  console.log('HOME15 dashboard context:', JSON.stringify(dash, null, 1));

  // ── TC-02B/TC-11: leads list — search box, tabs, first row link ──
  await page.goto(`${process.env.BASE_URL}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);
  const leads = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inputs = Array.from(document.querySelectorAll('input')).filter(vis)
      .map(i => ({ id: i.id || null, ph: i.getAttribute('placeholder'), type: i.type })).slice(0, 8);
    const tabs = Array.from(document.querySelectorAll('a, button, li')).filter(vis)
      .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim())
      .filter(t => /^(New|In Follow ?-?Up|Won|Lost|Non[- ]?Followup)\s*\d*$/i.test(t)).slice(0, 8);
    const row = document.querySelector('table tbody tr');
    const link = row ? row.querySelector('a[href]') : null;
    return { inputs, tabs, firstRowHref: link ? link.getAttribute('href') : null, firstRowText: row ? row.innerText.replace(/\s+/g, ' ').slice(0, 140) : null };
  });
  console.log('LEADS list:', JSON.stringify(leads, null, 1));

  // ── open the first enquiry's overview and check phone display ──
  if (leads.firstRowHref) {
    const url = leads.firstRowHref.startsWith('http') ? leads.firstRowHref : `${process.env.BASE_URL}/${leads.firstRowHref.replace(/^\//, '')}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    const ov = await page.evaluate(() => {
      const text = document.body.innerText.replace(/\s+/g, ' ');
      const phones = text.match(/\+?\d[\d \-()]{8,14}\d/g) || [];
      return { url: location.href, phoneLike: phones.slice(0, 5), snippet: text.slice(0, 450) };
    });
    console.log('OVERVIEW:', JSON.stringify(ov, null, 1));
  } else {
    console.log('OVERVIEW: no first-row link found — row may not be a link anymore');
  }

  await browser.close();
})().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
