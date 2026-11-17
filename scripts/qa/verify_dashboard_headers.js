'use strict';
/**
 * Verify the CRM Dashboard grid header structure before filing anything.
 *
 * The deep test flagged 16 header cells / colspan-26 against 14 data cells.
 * That check summed colspan across BOTH header rows, which is wrong for a
 * grouped header — so the flag is as likely to be my arithmetic as the app's.
 * Break it down per header row and compare the bottom row to the data.
 *
 * Also confirms what the 33 write requests during the run actually were.
 *
 * Read-only.
 *   node scripts/qa/verify_dashboard_headers.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const reqs = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method())) {
      reqs.push({ method: r.method(), url: r.url().split('?')[0] });
    }
  });

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.goto(`${BASE}/crm-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5500);

    const out = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const onScreen = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(onScreen)[0];
      if (!t) return null;
      return {
        headerRows: [...t.querySelectorAll('thead tr')].map((tr, i) => ({
          row: i,
          cells: [...tr.querySelectorAll('th')].map((h) => ({
            text: clean(h.innerText),
            colspan: parseInt(h.getAttribute('colspan') || '1', 10),
            rowspan: parseInt(h.getAttribute('rowspan') || '1', 10),
          })),
          colspanSum: [...tr.querySelectorAll('th')]
            .reduce((a, h) => a + parseInt(h.getAttribute('colspan') || '1', 10), 0),
        })),
        dataRows: [...t.querySelectorAll('tbody tr')].slice(0, 3).map((r) => ({
          cellCount: r.querySelectorAll('td').length,
          cells: [...r.querySelectorAll('td')].map((c) => clean(c.innerText).slice(0, 16)),
        })),
      };
    });

    console.log('=== HEADER ROWS ===');
    for (const hr of out.headerRows) {
      console.log(`  row${hr.row}: ${hr.cells.length} cells, colspan sum ${hr.colspanSum}`);
      console.log('    ', hr.cells.map((c) => `${c.text}${c.colspan > 1 ? `[cs${c.colspan}]` : ''}${c.rowspan > 1 ? `[rs${c.rowspan}]` : ''}`).join(' | '));
    }
    // Effective column count = bottom row cells + any rowspan>1 cells from rows above.
    const rowsAbove = out.headerRows.slice(0, -1);
    const carried = rowsAbove.reduce((a, hr) => a + hr.cells.filter((c) => c.rowspan > 1).length, 0);
    const bottom = out.headerRows[out.headerRows.length - 1];
    const effective = (bottom ? bottom.cells.length : 0) + carried;
    console.log(`\n  effective column count = bottom(${bottom ? bottom.cells.length : 0}) + carried rowspan(${carried}) = ${effective}`);

    console.log('\n=== DATA ROWS ===');
    for (const d of out.dataRows) console.log(`  ${d.cellCount} cells: ${d.cells.join(' | ')}`);

    const dataCells = out.dataRows[0] ? out.dataRows[0].cellCount : 0;
    console.log(`\n  VERDICT: effective headers=${effective} vs data cells=${dataCells} → ${effective === dataCells ? 'ALIGNED (my earlier flag was wrong)' : 'MISMATCH (real defect)'}`);

    console.log('\n=== WRITE REQUESTS DURING DASHBOARD LOAD ===');
    const byUrl = {};
    reqs.forEach((r) => { byUrl[`${r.method} ${r.url}`] = (byUrl[`${r.method} ${r.url}`] || 0) + 1; });
    Object.entries(byUrl).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}x  ${k.slice(0, 110)}`));

    fs.writeFileSync(
      path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'dashboard-header-verify.json'),
      JSON.stringify({ ...out, effective, dataCells, writeRequests: byUrl }, null, 2)
    );
    console.log('\n✅ wrote reports/qa/raw/dashboard-header-verify.json');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
