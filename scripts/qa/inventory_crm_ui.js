'use strict';
/**
 * Inventory every field, button and column the CRM section actually exposes,
 * then diff it against what the Playwright page objects reference.
 *
 * Answers two questions the structural sweep cannot:
 *   · What is on these pages? (fields, buttons, grid columns)
 *   · Which of those does our automation not know about — i.e. what is new?
 *
 * Read-only.
 *   node scripts/qa/inventory_crm_ui.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const REPO = path.join(__dirname, '..', '..');
const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};

// The CRM section on this tenant, from the live discovery crawl.
const ROUTES = [
  '/leads', '/followups', '/enquiry', '/crm-dashboard', '/lead-sources',
  '/lead-status', '/bulk-lead-transfer', '/solar-orders', '/sales-targets',
  '/lead-expenses', '/lead-source-commissions', '/call-analysis',
  '/add-multiple-lead-tasks', '/quotation', '/quotations', '/enquiries',
  '/customers', '/dealers',
];

/** Everything the CRM page objects + specs already reference, so we can tell
 *  "new" from "already known". */
function knownSelectors() {
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  });
  walk(path.join(REPO, 'erp'));
  const src = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  return new Set([...src.matchAll(/#([A-Za-z][\w-]{2,})/g)].map((m) => m[1]));
}

(async () => {
  const known = knownSelectors();
  console.log(`automation already references ${known.size} distinct #ids\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const out = { base: BASE, tenant: C.company, capturedAt: new Date().toISOString(), pages: [] };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    for (const route of ROUTES) {
      process.stdout.write(`  ${route.padEnd(30)}`);
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3800);

      const ui = await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const onScreen = (e) => {
          if (e.getClientRects().length === 0) return false;
          const s = getComputedStyle(e);
          return s.display !== 'none' && s.visibility !== 'hidden';
        };
        return {
          fields: [...document.querySelectorAll('input[id],select[id],textarea[id]')]
            .filter((e) => e.type !== 'hidden')
            .map((e) => ({
              id: e.id,
              tag: e.tagName.toLowerCase(),
              type: e.type || null,
              visible: onScreen(e),
              required: e.required || e.getAttribute('aria-required') === 'true',
              optionCount: e.tagName === 'SELECT' ? e.options.length : null,
            })),
          buttons: [...document.querySelectorAll('button,a.btn')]
            .filter(onScreen)
            .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 40) }))
            .filter((b) => b.id || b.text),
          gridColumns: [...document.querySelectorAll('table')]
            .filter(onScreen)
            .map((t) => [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean))
            .filter((c) => c.length),
        };
      }).catch(() => ({ fields: [], buttons: [], gridColumns: [] }));

      const visibleFields = ui.fields.filter((f) => f.visible);
      const newFields = visibleFields.filter((f) => !known.has(f.id));
      const newButtons = ui.buttons.filter((b) => b.id && !known.has(b.id));

      out.pages.push({ route, ...ui, newFieldIds: newFields.map((f) => f.id), newButtonIds: newButtons.map((b) => b.id) });
      console.log(`fields=${String(visibleFields.length).padStart(3)}  new=${String(newFields.length).padStart(3)}  buttons=${String(ui.buttons.length).padStart(3)}  newBtn=${newButtons.length}`);
    }
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }

  const p = path.join(REPO, 'reports', 'qa', 'raw', 'crm-ui-inventory.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(out, null, 2));
  console.log(`\n✅ wrote ${path.relative(REPO, p)}`);
})();
