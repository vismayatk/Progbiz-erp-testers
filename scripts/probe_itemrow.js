'use strict';
/**
 * Dump the real markup of the enquiry item row.
 *
 * #item-search-input sits inside a <tr>, so the item "grid" and the picker
 * are the same table. This prints that table verbatim plus every control in
 * it, to establish how a line item is actually committed.
 *
 * Fills nothing, saves nothing.
 *
 *   node scripts/probe_itemrow.js
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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);

    const out = await page.evaluate(() => {
      const sel = document.querySelector('#item-search-input');
      const table = sel ? sel.closest('table') : null;
      const tr = sel ? sel.closest('tr') : null;
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return {
        tableClass: table ? clean(table.getAttribute('class')) : null,
        tableId: table ? table.id || null : null,
        headers: table ? [...table.querySelectorAll('thead th')].map((t) => clean(t.innerText)) : null,
        tbodyRowCount: table ? table.querySelectorAll('tbody tr').length : null,
        pickerRowHTML: tr ? clean(tr.outerHTML).slice(0, 2600) : null,
        // Every actionable control inside the item table
        controlsInTable: table
          ? [...table.querySelectorAll('button, a, i, input, select')].map((e) => ({
              tag: e.tagName,
              id: e.id || null,
              cls: clean(e.getAttribute('class')).slice(0, 70),
              text: clean(e.innerText).slice(0, 30) || null,
              title: e.getAttribute('title') || null,
            }))
          : null,
        // Any button on the page whose label looks like "Add"
        addButtonsOnPage: [...document.querySelectorAll('button, a')]
          .filter((b) => /^\s*(add|add item|\+)\s*$/i.test(clean(b.innerText)))
          .map((b) => ({ id: b.id || null, cls: clean(b.getAttribute('class')).slice(0, 70), text: clean(b.innerText) })),
      };
    });

    console.log(JSON.stringify(out, null, 2));
    require('fs').writeFileSync(
      require('path').join(__dirname, 'probe_itemrow_report.json'),
      JSON.stringify(out, null, 2)
    );
    console.log('\n✅ wrote scripts/probe_itemrow_report.json');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
