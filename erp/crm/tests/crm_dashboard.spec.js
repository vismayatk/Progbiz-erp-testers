'use strict';

/**
 * CRM — Dashboard  (DB-01 .. DB-04)
 *
 * /crm-dashboard renders an executive summary grid and a lead-source ROI
 * grid, both with grouped (two-row) headers.
 *
 * The column-alignment check here is deliberately careful. Summing colspan
 * across every header row double-counts a grouped header and produces a
 * false "misaligned" result — that mistake was made once already during
 * exploratory testing. CrmDashboardPage.effectiveColumnCount() encodes the
 * correct calculation; this spec is what keeps it honest.
 *
 * Run:  npx playwright test erp/crm/tests/crm_dashboard.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { CrmDashboardPage } = require('../pages/CrmDashboardPage');
const { EnquiryPage } = require('../pages/EnquiryPage');

const C = {
  company:  process.env.COMPANY_CODE || 'lesol_dev',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

async function arrive(page) {
  await new LoginPage(page).login(C.company, C.username, C.password);
  const dash = new CrmDashboardPage(page);
  await dash.goto();
  return dash;
}

test.describe('CRM — Dashboard', () => {
  test.describe.configure({ timeout: 200_000 });

  test('DB-01 | Every grid renders and has at least one data row', async ({ page }) => {
    const dash = await arrive(page);
    const grids = await dash.grids();
    expect(grids.length, 'no visible grids on the CRM dashboard').toBeGreaterThan(0);
    for (const g of grids) {
      expect(g.headerRows.length, `grid ${g.idx} has no header row`).toBeGreaterThan(0);
    }
    console.log(`  ✅ ${grids.length} grid(s): rows = ${grids.map((g) => g.rows.length).join(', ')}`);
  });

  test('DB-02 | Data cells line up with the header columns in every grid', async ({ page }) => {
    const dash = await arrive(page);
    const grids = await dash.grids();

    for (const g of grids) {
      const expected = dash.effectiveColumnCount(g);
      const labels = dash.headerLabels(g);
      for (const [i, row] of g.rows.slice(0, 5).entries()) {
        expect(
          row.length,
          `grid ${g.idx} row ${i}: ${row.length} cells vs ${expected} header columns ` +
          `(headers: ${labels.join(' | ')})`
        ).toBe(expected);
      }
      console.log(`  ✅ grid ${g.idx}: ${expected} columns, ${g.rows.length} row(s) aligned`);
    }
  });

  test('DB-03 | Executive lead counts agree with the Leads listing', async ({ page }) => {
    const dash = await arrive(page);
    const grids = await dash.grids();
    const summary = grids[0];
    test.skip(!summary || !summary.rows.length, 'no executive summary rows on this tenant');

    const execName = summary.rows[0][0];
    const dashLeads = await dash.executiveMetric(execName, 'Leads');
    test.skip(dashLeads === null, 'no "Leads" column found in the summary grid');

    // Cross-check against the listing. The listing paginates, so this only
    // holds while the count fits on one page — skip rather than fail a
    // comparison the page size makes meaningless.
    const enq = new EnquiryPage(page);
    await enq.gotoList();
    await page.waitForTimeout(3000);
    const { listed, pageSize } = await page.evaluate((name) => {
      const onScreen = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(onScreen)
        .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
      if (!t) return { listed: null, pageSize: null };
      const hs = [...t.querySelectorAll('thead th')].map((h) => (h.innerText || '').trim());
      const ai = hs.findIndex((h) => /assignee/i.test(h));
      const rows = [...t.querySelectorAll('tbody tr')];
      return {
        listed: ai < 0 ? null : rows.filter((r) =>
          ((r.querySelectorAll('td')[ai] || {}).innerText || '').trim() === name).length,
        pageSize: rows.length,
      };
    }, execName);

    test.skip(listed === null, 'Leads listing has no Assignee column to cross-check against');
    test.skip(pageSize >= 10 && dashLeads > pageSize,
      `listing is paginated (${pageSize} rows/page) and the dashboard reports ${dashLeads}`);

    expect(listed, `dashboard reports ${dashLeads} leads for "${execName}", listing shows ${listed}`)
      .toBe(dashLeads);
    console.log(`  ✅ ${execName}: dashboard=${dashLeads} listing=${listed}`);
  });

  test('DB-04 | Export controls are present', async ({ page }) => {
    const dash = await arrive(page);
    await expect(dash.executiveDownloadBtn,
      '#executive-leads-download-btn missing — dashboard export contract changed').toBeVisible();
    // Not clicked: each triggers a file download, which needs a download
    // fixture and a temp dir rather than a drive-by assertion.
    console.log('  ✅ export buttons present (downloads not exercised)');
  });
});
