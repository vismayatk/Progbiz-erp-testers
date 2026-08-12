'use strict';

/**
 * CRM — Newer modules smoke + empty-state contract  (NM-01 .. NM-06)
 *
 * Covers the CRM pages built after the original suite: Lead Expenses,
 * Lead Source Commissions, AI Call Analysis, Solar Orders and Lead Task
 * Assignment.
 *
 * These carry little or no data on a dev tenant, so asserting on row counts
 * would be meaningless. What IS worth asserting is the empty-state contract:
 * a listing with nothing to show must say so. A grid that renders headers
 * over a silent, empty body is indistinguishable from one that failed to
 * load, and that ambiguity is what generates support tickets.
 *
 * Run:  npx playwright test erp/crm/tests/crm_new_modules.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');

const BASE = process.env.BASE_URL || 'https://dev.erp.progbiz.in';
const C = {
  company:  process.env.COMPANY_CODE || 'lesol_dev',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

async function login(page) {
  await new LoginPage(page).login(C.company, C.username, C.password);
  await page.waitForTimeout(1200);
}

/** Land on a route and report what its primary grid is showing. */
async function gridState(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);
  return page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const onScreen = (e) => {
      if (e.getClientRects().length === 0) return false;
      const s = getComputedStyle(e);
      return s.display !== 'none' && s.visibility !== 'hidden';
    };
    const t = [...document.querySelectorAll('table')].filter(onScreen)
      .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
    return {
      hasGrid: !!t,
      headers: t ? [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)) : [],
      bodyRowCount: t ? t.querySelectorAll('tbody tr').length : 0,
      bodyText: t ? clean(t.querySelector('tbody')?.innerText) : '',
      pageHasError: /oops|went wrong|error code|exception/i.test(document.body.innerText),
    };
  });
}

test.describe('CRM — Newer modules', () => {
  test.describe.configure({ timeout: 200_000 });

  const PAGES = [
    { id: 'NM-01', route: '/lead-expenses',           name: 'Lead Expenses' },
    { id: 'NM-02', route: '/lead-source-commissions', name: 'Lead Source Commissions' },
    { id: 'NM-03', route: '/call-analysis',           name: 'AI Call Analysis' },
    { id: 'NM-04', route: '/sales-targets',           name: 'Sales Targets' },
  ];

  for (const p of PAGES) {
    test(`${p.id} | ${p.name} loads with a grid and no error text`, async ({ page }) => {
      await login(page);
      const s = await gridState(page, p.route);
      expect(s.pageHasError, `${p.route} rendered an error message`).toBe(false);
      expect(s.hasGrid, `${p.route} rendered no grid at all`).toBe(true);
      expect(s.headers.length, `${p.route} grid has no column headers`).toBeGreaterThan(0);
      console.log(`  ✅ ${p.route}: ${s.headers.length} columns, ${s.bodyRowCount} body row(s)`);
    });
  }

  test('NM-05 | An empty listing states that it is empty', async ({ page }) => {
    // KNOWN DEFECT CRM-010: /solar-orders renders headers over a completely
    // empty tbody — no rows, no message. Every sibling listing handles this:
    //   AI Call Analysis        → "No Data"
    //   Lead Expenses           → "No expenses recorded for the selected filters"
    //   Lead Source Commissions → "No lead source earns commission yet. …"
    // Expected-to-fail so it stays tracked; remove the marker once fixed.
    test.fail(true, 'CRM-010 — /solar-orders shows a blank grid body with no empty-state message');

    await login(page);
    const s = await gridState(page, '/solar-orders');
    test.skip(s.bodyRowCount > 0, 'tenant has solar orders — empty state not exercised');

    expect(s.bodyText.length,
      '/solar-orders has an empty grid body and no empty-state message — ' +
      'a user cannot tell this apart from a failed load').toBeGreaterThan(0);
  });

  test('NM-06 | Lead Task Assignment exposes its filter controls', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/add-multiple-lead-tasks`, {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    await page.waitForTimeout(4500);

    const controls = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const onScreen = (e) => e.getClientRects().length > 0;
      return {
        buttons: [...document.querySelectorAll('button, a.btn')].filter(onScreen)
          .map((b) => clean(b.innerText)).filter(Boolean),
        fieldCount: [...document.querySelectorAll('input, select, textarea')]
          .filter(onScreen).filter((e) => e.type !== 'hidden').length,
      };
    });

    expect(controls.fieldCount, 'no filter fields rendered').toBeGreaterThan(0);
    expect(controls.buttons.join(' '), 'Apply Filters control missing').toMatch(/apply/i);
    // The assignment action itself is not reachable until leads are filtered
    // and selected, so it is out of scope here rather than asserted absent.
    console.log(`  ✅ ${controls.fieldCount} filter field(s); buttons: ${controls.buttons.join(', ')}`);
  });
});
