'use strict';
/**
 * Determine the NEW add-item interaction on the enquiry form.
 *
 * #item-search-input is now a <select>. Open question: does choosing an
 * option append the line item by itself, or is the ri-add-fill "+" still
 * required? Everything downstream of addItem() depends on the answer, so
 * measure it instead of assuming.
 *
 * Fills the form only. Never clicks Save — nothing is persisted.
 *
 *   node scripts/probe_additem_flow.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');

const BASE = process.env.BASE_URL || 'https://devtest.progbiz.in';
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};

/** Count rows in the item grid — i.e. how many line items are staged. */
const gridState = () => {
  const sel = document.querySelector('#item-search-input');
  const tables = [...document.querySelectorAll('table')];
  const info = tables.map((t, i) => ({
    i,
    id: t.id || null,
    cls: (t.getAttribute('class') || '').slice(0, 60),
    bodyRows: t.querySelectorAll('tbody tr').length,
    firstRowText: (t.querySelector('tbody tr')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90),
  }));
  return {
    selectedValue: sel ? sel.value : null,
    selectedText: sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text.trim() : null,
    qty: document.querySelector('#new-item-quantity')?.value ?? null,
    tables: info,
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);

    console.log('=== BEFORE ===');
    const before = await page.evaluate(gridState);
    console.log(JSON.stringify(before, null, 1));

    // Pick the second option (index 0 is the "-- Select Item --" placeholder).
    const chosen = await page.evaluate(() => {
      const s = document.querySelector('#item-search-input');
      return s && s.options.length > 1
        ? { value: s.options[1].value, text: s.options[1].text.trim() }
        : null;
    });
    console.log('\nchoosing:', JSON.stringify(chosen));
    await page.selectOption('#item-search-input', chosen.value);
    await page.waitForTimeout(1500);

    console.log('\n=== AFTER selectOption (no + click) ===');
    const afterSelect = await page.evaluate(gridState);
    console.log(JSON.stringify(afterSelect, null, 1));

    // Set quantity, then click the "+" inside the item input-group.
    await page.locator('#new-item-quantity').fill('3').catch(() => {});
    await page.waitForTimeout(400);

    const plus = page.locator('#item-search-input')
      .locator('xpath=ancestor::div[contains(@class,"input-group")][1]')
      .locator('i.ri-add-fill');
    const plusCount = await plus.count().catch(() => 0);
    console.log(`\nri-add-fill inside item input-group: ${plusCount}`);
    if (plusCount > 0) {
      await plus.first().click({ timeout: 8000 }).catch((e) => console.log('  + click err:', e.message.slice(0, 60)));
      await page.waitForTimeout(1800);
    }

    console.log('\n=== AFTER + click ===');
    const afterPlus = await page.evaluate(gridState);
    console.log(JSON.stringify(afterPlus, null, 1));

    // Did a modal open instead of a row being appended?
    const modals = await page.evaluate(() =>
      [...document.querySelectorAll('.modal.show, .modal[style*="display: block"]')]
        .map((m) => ({ id: m.id || null, title: (m.querySelector('.modal-title')?.innerText || '').trim() }))
    );
    console.log('\nopen modals after +:', JSON.stringify(modals));

    await page.screenshot({ path: 'screenshots/probe_additem.png', fullPage: true }).catch(() => {});
    require('fs').writeFileSync(
      require('path').join(__dirname, 'probe_additem_report.json'),
      JSON.stringify({ before, chosen, afterSelect, plusCount, afterPlus, modals }, null, 2)
    );
    console.log('\n✅ wrote scripts/probe_additem_report.json  (nothing was saved)');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
