'use strict';
/**
 * Focused probe: what did the enquiry item picker actually become?
 *
 * The suite drives it as "text input + magnifier -> #searchItemModal".
 * Discovery says #item-search-input is now a <select>. This confirms the
 * new interaction model before any page object is rewritten.
 *
 * Also re-checks the routes the nav no longer links, to tell "removed"
 * apart from "still reachable, just not in the menu".
 *
 * READ-ONLY. Navigates and reads; never saves.
 *
 *   node scripts/probe_itempicker.js
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

/** Routes the suite covers that no longer appear in the sidebar. */
const ORPHANED = [
  '/item', '/task', '/created-tasks', '/unscheduled-tasks',
  '/projects', '/project', '/project-notes', '/project-attachments',
  '/project-expenses', '/project-incomes',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // ── The item picker ───────────────────────────────────────────────────
    await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);

    const picker = await page.evaluate(() => {
      const el = document.querySelector('#item-search-input');
      if (!el) return { present: false };
      const grp = el.closest('.input-group');
      return {
        present: true,
        tagName: el.tagName,
        type: el.type || null,
        optionCount: el.tagName === 'SELECT' ? el.options.length : null,
        firstOptions: el.tagName === 'SELECT'
          ? [...el.options].slice(0, 12).map((o) => ({ value: o.value, text: o.text.trim() }))
          : null,
        // Does the surrounding input-group still carry a magnifier?
        inputGroupHTML: grp ? grp.outerHTML.replace(/\s+/g, ' ').slice(0, 900) : null,
        magnifierInsideGroup: grp ? !!grp.querySelector('i.ri-search-line') : null,
        controlsInsideGroup: grp
          ? [...grp.querySelectorAll('button,i,a')].map((e) => ({
              tag: e.tagName, id: e.id || null,
              class: (e.getAttribute('class') || '').slice(0, 80),
            }))
          : null,
        // Is the old modal still in the DOM at all?
        searchItemModalExists: !!document.querySelector('#searchItemModal'),
        itemSearchModalInputExists: !!document.querySelector('#item-search-modal-input'),
        quantityInputExists: !!document.querySelector('#new-item-quantity'),
      };
    });
    console.log('=== ITEM PICKER ===');
    console.log(JSON.stringify(picker, null, 2));

    // ── The customer picker, for contrast (ENQ-05 still passes) ──────────
    const cust = await page.evaluate(() => {
      const el = document.querySelector('#customer-phone');
      if (!el) return { present: false };
      const grp = el.closest('.input-group');
      return {
        present: true, tagName: el.tagName,
        magnifierInsideGroup: grp ? !!grp.querySelector('i.ri-search-line') : null,
        addIconInsideGroup: grp ? !!grp.querySelector('i.ri-add-fill') : null,
      };
    });
    console.log('\n=== CUSTOMER PICKER (control group) ===');
    console.log(JSON.stringify(cust, null, 2));

    // ── Are the orphaned routes gone, or just unlinked? ──────────────────
    console.log('\n=== ORPHANED ROUTE PROBE ===');
    const routeResults = [];
    for (const r of ORPHANED) {
      let status = 'unknown';
      const resp = await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        .catch(() => null);
      await page.waitForTimeout(1200);
      const landed = page.url().replace(BASE, '');
      const http = resp ? resp.status() : null;
      const body = await page.evaluate(
        () => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      ).catch(() => '');
      if (landed.startsWith('/login')) status = 'BOUNCED-TO-LOGIN';
      else if (!landed.startsWith(r)) status = `REDIRECTED -> ${landed}`;
      else if (/not found|404|no page|unauthor/i.test(body)) status = 'NOT-FOUND-PAGE';
      else status = 'REACHABLE';
      routeResults.push({ route: r, http, landed, status, sample: body.slice(0, 70) });
      console.log(`  ${r.padEnd(24)} http=${String(http).padEnd(4)} ${status}`);
    }

    require('fs').writeFileSync(
      require('path').join(__dirname, 'probe_itempicker_report.json'),
      JSON.stringify({ picker, cust, routeResults }, null, 2)
    );
    console.log('\n✅ wrote scripts/probe_itempicker_report.json');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
