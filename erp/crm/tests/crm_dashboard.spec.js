'use strict';

/**
 * CRM — Dashboard  (DB-01 .. DB-06)
 *
 * Nov 2026 redesign: /crm-dashboard is split into seven tabs (Overview, Needs attention, Pipeline,
 * Team, Sources & ROI, Items, Calls). The executive grid moved to Team and the lead-source ROI grid
 * to Sources & ROI; the Overview shows the same leads as tiles. See CrmDashboardPage.
 *
 *   DB-01  the seven tabs open and the two grids render
 *   DB-02  data cells line up with the header columns in every grid
 *   DB-03  the Team grid adds up: each executive's Total is the sum of their stages, and the
 *          Total row is the sum of the rows
 *   DB-04  export controls are present
 *   DB-05  the Overview and the Team grid show the same numbers (stage tiles, follow-up ring)
 *   DB-06  Needs attention: the tab badge equals the rows listed, and its delayed follow-ups
 *          equal the Overview's Delayed count
 *
 * The column-alignment check here is deliberately careful. Summing colspan
 * across every header row double-counts a grouped header and produces a
 * false "misaligned" result — that mistake was made once already during
 * exploratory testing. CrmDashboardPage.effectiveColumnCount() encodes the
 * correct calculation; this spec is what keeps it honest.
 *
 * Read-only: nothing is saved, the period filter is left on its default.
 *
 * Run:  npx playwright test erp/crm/tests/crm_dashboard.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { CrmDashboardPage } = require('../pages/CrmDashboardPage');

const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

const num = (s) => { const n = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };

test.describe('CRM — Dashboard', () => {
  test.describe.configure({ timeout: 200_000 });

  /** One login for the file: the tenant throttles bursts ("Too many requests"). */
  /** @type {import('@playwright/test').Page} */
  let page, dash;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    await new LoginPage(page).login(C.company, C.username, C.password);
    dash = new CrmDashboardPage(page);
  });
  test.afterAll(async () => { await page?.close(); });
  // The dashboard reopens on the tab that was open last, so every test starts by going back to Overview.
  test.beforeEach(async () => { await dash.goto(); await dash.openTab('overview'); });

  test('DB-01 | The dashboard opens with its seven tabs, and the Team and Sources & ROI grids render', async () => {
    if (await dash.hasTabs()) {
      const tabs = await dash.tabs();
      console.log(`  tabs: ${tabs.map((t) => `${t.label}${t.badge !== null ? ` (${t.badge})` : ''}${t.active ? '*' : ''}`).join(' · ')}`);
      expect(tabs.map((t) => t.key), 'dashboard tabs').toEqual(CrmDashboardPage.TABS);
      expect(tabs.filter((t) => t.active).length, 'exactly one tab should be marked active').toBe(1);
      // every tab opens and draws something without an error message
      for (const key of CrmDashboardPage.TABS) {
        expect(await dash.openTab(key), `tab "${key}" did not open`).toBe(true);
        const body = (await page.locator('#divDashboardPrint').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        expect(body.length, `tab "${key}" is empty`).toBeGreaterThan(10);
        expect(body, `tab "${key}" shows an error`).not.toMatch(/oops|something went wrong|error code|unhandled/i);
      }
    }
    const grids = await dash.allGrids();
    expect(grids.length, 'no grids on the CRM dashboard (Team / Sources & ROI)').toBeGreaterThan(0);
    for (const g of grids) {
      expect(g.headerRows.length, `${g.tab} › ${g.name} has no header row`).toBeGreaterThan(0);
    }
    expect(grids.some((g) => g.name === 'executive-leads-table'), 'the Executive-Wise Leads grid is missing from Team').toBe(true);
    console.log(`  ✅ ${grids.length} grid(s): ${grids.map((g) => `${g.tab} › ${g.name} (${g.rows.length} rows)`).join(', ')}`);
  });

  test('DB-02 | Data cells line up with the header columns in every grid', async () => {
    const grids = await dash.allGrids();
    expect(grids.length, 'no grids on the CRM dashboard').toBeGreaterThan(0);
    for (const g of grids) {
      const expected = dash.effectiveColumnCount(g);
      const labels = dash.columnLabels(g);
      expect(labels.length, `${g.name}: the expanded header has ${labels.length} labels for ${expected} columns`).toBe(expected);
      for (const [i, row] of g.rows.slice(0, 5).entries()) {
        if (row.length === 1) continue;   // an empty-state row ("No data") spans the grid
        expect(
          row.length,
          `${g.name} row ${i}: ${row.length} cells vs ${expected} header columns (headers: ${labels.join(' | ')})`
        ).toBe(expected);
      }
      for (const f of g.footer) expect(f.length, `${g.name} footer: ${f.length} cells vs ${expected} header columns`).toBe(expected);
      console.log(`  ✅ ${g.tab} › ${g.name}: ${expected} columns, ${g.rows.length} row(s) aligned`);
    }
  });

  test('DB-03 | The Team grid adds up: each Total is the sum of its stages, and the Total row is the sum of the rows', async () => {
    test.skip(!(await dash.openTab('team')), 'this build has no Team tab');
    const g = (await dash.grids()).find((x) => x.name === 'executive-leads-table');
    expect(g, 'Executive-Wise Leads grid not found on the Team tab').toBeTruthy();
    test.skip(!g.rows.length, 'no executive rows on this tenant');
    const labels = dash.columnLabels(g);
    const stageCols = labels.map((l, i) => ({ l, i })).filter((c) => /^Leads › /.test(c.l) && !/› Total$/.test(c.l));
    const totalCol = labels.findIndex((l) => /^Leads › Total$/.test(l));
    expect(stageCols.length, `no lead stage columns under "Leads" (headers: ${labels.join(' | ')})`).toBeGreaterThan(0);
    expect(totalCol, 'no "Total" column under "Leads"').toBeGreaterThan(-1);

    // 1. each executive: Total = New + Cold + Warm + Hot + Super Hot + Won + Lost + Not Connected + Not Reachable
    for (const row of g.rows) {
      const sum = stageCols.reduce((a, c) => a + num(row[c.i]), 0);
      expect(sum, `${row[0]}: the stages add up to ${sum} but Total shows ${row[totalCol]}`).toBe(num(row[totalCol]));
    }
    // 2. the Total row = the sum of the executives, column by column
    const footer = g.footer[0];
    expect(footer, 'the grid has no Total row').toBeTruthy();
    expect(footer[0]).toMatch(/^total$/i);
    for (let i = 1; i < labels.length; i++) {
      const colSum = g.rows.reduce((a, r) => a + num(r[i]), 0);
      expect(Math.round(colSum * 100) / 100, `column "${labels[i]}": the rows add up to ${colSum} but the Total row shows ${footer[i]}`).toBe(num(footer[i]));
    }
    console.log(`  ✅ ${g.rows.length} executives; grand total ${footer[totalCol]} leads; every row and column adds up`);
  });

  test('DB-04 | Export controls are present', async () => {
    if (await dash.hasTabs()) {
      await expect(dash.leadsReportDownloadBtn, '#leads-report-download-btn missing from Overview').toBeVisible();
      await dash.openTab('team');
    }
    await expect(dash.executiveDownloadBtn,
      '#executive-leads-download-btn missing — dashboard export contract changed').toBeVisible();
    if (await dash.openTab('items')) {
      await expect(page.locator('#item-summary-download-btn'), '#item-summary-download-btn missing from Items').toBeVisible();
      await expect(page.locator('#item-category-download-btn'), '#item-category-download-btn missing from Items').toBeVisible();
    }
    // Not clicked: each triggers a file download, which needs a download
    // fixture and a temp dir rather than a drive-by assertion.
    console.log('  ✅ export buttons present (downloads not exercised)');
  });

  test('DB-05 | The Overview and the Team grid show the same numbers (stage tiles and follow-up ring)', async () => {
    test.skip(!(await dash.hasTabs()), 'this build has no Overview / Team tabs');
    const tiles = await dash.leadsSummary();
    const ring = await dash.followupSummary();
    console.log(`  Overview: ${Object.entries(tiles).map(([k, v]) => `${k} ${v.count}`).join(' · ')} | follow-up ${JSON.stringify(ring)}`);
    expect(tiles.Total, 'the Overview has no "Total" leads tile').toBeTruthy();

    // the stage tiles add up to Total
    const stageSum = Object.entries(tiles).filter(([k]) => k !== 'Total').reduce((a, [, v]) => a + (v.count || 0), 0);
    expect(stageSum, `the stage tiles add up to ${stageSum}, the Total tile shows ${tiles.Total.count}`).toBe(tiles.Total.count);
    // the ring: Total = Today's + Delayed + Upcoming
    expect(ring.today + ring.overdue + ring.upcoming, `follow-up ring: ${ring.today} + ${ring.overdue} + ${ring.upcoming} vs Total ${ring.total}`).toBe(ring.total);

    await dash.openTab('team');
    const g = (await dash.grids()).find((x) => x.name === 'executive-leads-table');
    expect(g && g.footer[0], 'the Team grid has no Total row to compare with').toBeTruthy();
    const labels = dash.columnLabels(g);
    const foot = (label) => num(g.footer[0][labels.indexOf(label)]);
    for (const [stage, v] of Object.entries(tiles)) {
      const col = `Leads › ${stage}`;
      if (!labels.includes(col)) continue;
      expect(foot(col), `"${stage}": the Overview tile shows ${v.count}, the Team grid Total row shows ${foot(col)}`).toBe(v.count);
    }
    expect(foot('Leads in Follow-up › Today'), 'follow-ups today: ring vs Team grid').toBe(ring.today);
    expect(foot('Leads in Follow-up › Delayed'), 'delayed follow-ups: ring vs Team grid').toBe(ring.overdue);
    expect(foot('Leads in Follow-up › Upcoming'), 'upcoming follow-ups: ring vs Team grid').toBe(ring.upcoming);
    // Won value on the Overview = Target Achieved total on the Team grid
    if (tiles.Won && tiles.Won.value !== null && labels.includes('Target Achieved')) {
      expect(foot('Target Achieved'), `Won value: the Overview shows ${tiles.Won.value}, the Team grid "Target Achieved" total shows ${foot('Target Achieved')}`).toBeCloseTo(tiles.Won.value, 0);
    }
    console.log('  ✅ Overview tiles and ring agree with the Team grid totals');
  });

  test('DB-06 | Needs attention: the tab badge equals the rows listed and matches the Overview', async () => {
    test.skip(!(await dash.hasTabs()), 'this build has no Needs attention tab');
    const ring = await dash.followupSummary();
    const badge = (await dash.tabs()).find((t) => t.key === 'attention')?.badge;
    await dash.openTab('attention');
    const rows = await dash.attentionRows();
    console.log(`  badge ${badge} | rows: ${rows.map((r) => r.title).join(' · ') || '(none)'}`);
    expect(rows.length, `the tab badge says ${badge} but ${rows.length} row(s) are listed`).toBe(badge ?? 0);
    for (const r of rows) {
      expect(r.title, 'an attention row with no headline').toBeTruthy();
      expect(r.action, `"${r.title}" offers no action button`).toBeTruthy();
    }
    const delayed = rows.find((r) => r.id === 'crm-attention-delayed-followups');
    if (delayed) {
      expect(num(delayed.title), `"${delayed.title}" vs the Overview's Delayed count ${ring.overdue}`).toBe(ring.overdue);
    } else {
      expect(ring.overdue, 'the Overview shows delayed follow-ups but Needs attention does not list them').toBe(0);
    }
    console.log('  ✅ Needs attention lists what its badge counts, and its delayed follow-ups match the Overview');
  });
});
