'use strict';

/**
 * CRM Dashboard — /crm-dashboard
 *
 * Two grids: an executive summary (lead counts and target achieved per
 * executive) and a lead-source ROI table. Both use grouped headers, so the
 * column count is NOT simply the number of <th> elements — see
 * effectiveColumnCount() for why.
 *
 * Also carries ten filter controls and four export buttons.
 */
class CrmDashboardPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://test.erp.progbiz.in';

    this.branchFilter = page.locator('#dashboard-filter-branch');
    this.executiveFilter = page.locator('#dashboard-filter-executives');
    this.monthFilter = page.locator('#dashboard-filter-month');
    this.executiveDownloadBtn = page.locator('#executive-leads-download-btn');
    this.leadsReportDownloadBtn = page.locator('#leads-report-download-btn');
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/crm-dashboard`, {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    await this.page.locator('table').first().waitFor({ state: 'visible', timeout: 30000 });
    await this.page.waitForTimeout(2500); // several async widget calls settle
  }

  /** Visible grids, in DOM order. */
  async grids() {
    return this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const onScreen = (e) => e.getClientRects().length > 0;
      return [...document.querySelectorAll('table')].filter(onScreen).map((t, idx) => ({
        idx,
        headerRows: [...t.querySelectorAll('thead tr')].map((tr) =>
          [...tr.querySelectorAll('th')].map((h) => ({
            text: clean(h.innerText),
            colspan: parseInt(h.getAttribute('colspan') || '1', 10),
            rowspan: parseInt(h.getAttribute('rowspan') || '1', 10),
          }))
        ),
        rows: [...t.querySelectorAll('tbody tr')].map((r) =>
          [...r.querySelectorAll('td')].map((c) => clean(c.innerText))
        ),
      }));
    });
  }

  /**
   * Real column count for a grouped header.
   *
   * Summing colspan across every header row double-counts, because an upper
   * row's grouped cell spans columns that the bottom row also declares. The
   * true count is the bottom row's cells plus any cell from a row above that
   * carries rowspan > 1 (those occupy their own column outright).
   */
  effectiveColumnCount(grid) {
    if (!grid.headerRows.length) return 0;
    const bottom = grid.headerRows[grid.headerRows.length - 1];
    const carried = grid.headerRows
      .slice(0, -1)
      .reduce((a, hr) => a + hr.filter((c) => c.rowspan > 1).length, 0);
    return bottom.length + carried;
  }

  /** Flat list of bottom-row header labels, for locating a column by name. */
  headerLabels(grid) {
    if (!grid.headerRows.length) return [];
    const carried = grid.headerRows.slice(0, -1).flatMap((hr) =>
      hr.filter((c) => c.rowspan > 1).map((c) => c.text));
    return [...carried, ...grid.headerRows[grid.headerRows.length - 1].map((c) => c.text)];
  }

  /** Numeric value from a named column of a named executive's row. */
  async executiveMetric(execName, columnLabel) {
    const [summary] = await this.grids();
    if (!summary) return null;
    const labels = this.headerLabels(summary);
    const ci = labels.findIndex((l) => l.toLowerCase() === columnLabel.toLowerCase());
    const row = summary.rows.find((r) => r[0] === execName);
    if (ci < 0 || !row) return null;
    const n = parseFloat(String(row[ci] ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
}

module.exports = { CrmDashboardPage };
