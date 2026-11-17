'use strict';

/**
 * CRM Dashboard — /crm-dashboard
 *
 * Nov 2026 redesign: the dashboard is split into seven tabs (.crmd-tabs, ids #crm-dash-tab-<key>):
 *   overview   Leads Summary (#leadDashboard: a tile per stage — count, share, value), the
 *              "Leads in Follow-up" ring (Today's / Delayed / Upcoming) and the Leads Reports chart
 *   attention  "Needs attention": one row (.crmd-att-row) per thing to act on; the tab carries their count
 *   pipeline   Status Wise chart
 *   team       Executive-Wise Leads grid (.executive-leads-table) + #executive-leads-download-btn
 *   sources    Lead Source charts and the ROI grid (#lead-source-roi-table)
 *   items      Item Summary / Item Category charts and their exports
 *   calls      Call Activity
 * A period filter (#dashboard-filter-month, default "This Month") applies to every tab, and a
 * Marketing View / Sales View switch sits above the tabs.
 *
 * Before the redesign both grids sat on one page; goto() and grids() still work there.
 *
 * The Team grid uses a grouped (two-row) header, so the column count is NOT simply the number of
 * <th> elements — see effectiveColumnCount() and columnLabels().
 */
const TABS = ['overview', 'attention', 'pipeline', 'team', 'sources', 'items', 'calls'];

class CrmDashboardPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://test.erp.progbiz.in';

    this.branchFilter = page.locator('#dashboard-filter-branch');
    this.executiveFilter = page.locator('#dashboard-filter-executives');
    this.monthFilter = page.locator('#dashboard-filter-month');
    this.executiveDownloadBtn = page.locator('#executive-leads-download-btn');     // Team tab
    this.leadsReportDownloadBtn = page.locator('#leads-report-download-btn');      // Overview tab
    this.tabBar = page.locator('.crmd-tabs');
  }

  static get TABS() { return TABS; }

  async goto() {
    await this.page.goto(`${this.baseUrl}/crm-dashboard`, {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    // the tab bar on the redesigned page, the first grid on the older one-page layout
    await this.page.locator('.crmd-tabs, table').first().waitFor({ state: 'visible', timeout: 30000 });
    await this.page.waitForTimeout(2500); // several async widget calls settle
  }

  /** True on the tabbed (Nov 2026) layout. */
  async hasTabs() { return (await this.tabBar.count().catch(() => 0)) > 0; }

  /** The tabs as drawn: [{ key, label, badge, active }]. */
  async tabs() {
    return this.page.evaluate(() => [...document.querySelectorAll('.crmd-tabs .crmd-tab')].map((b) => {
      const badge = b.querySelector('.badge');
      const label = [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      return { key: (b.id || '').replace('crm-dash-tab-', ''), label, badge: badge ? Number((badge.textContent || '').trim()) : null, active: b.classList.contains('active') };
    }));
  }

  /** Open a tab by key ('team', 'sources', …). Returns false on the older layout, which has no tabs. */
  async openTab(key) {
    const tab = this.page.locator(`#crm-dash-tab-${key}`);
    if (!(await tab.count().catch(() => 0))) return false;
    await tab.click({ timeout: 10000 });
    await this.page.waitForFunction((k) => {
      const b = document.getElementById(`crm-dash-tab-${k}`);
      return b && b.classList.contains('active');
    }, key, { timeout: 10000 }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(1800);
    return true;
  }

  /** Choose the period every tab reports on ("All", "This Month", "This Year" …). */
  async setPeriod(label) {
    await this.monthFilter.selectOption({ label });
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(2500);
  }

  /** Visible grids, in DOM order (the grids of the tab that is open). */
  async grids() {
    return this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const onScreen = (e) => e.getClientRects().length > 0;
      return [...document.querySelectorAll('table')].filter(onScreen).map((t, idx) => ({
        idx,
        id: t.id || '',
        name: t.id || (t.classList.contains('executive-leads-table') ? 'executive-leads-table' : `grid ${idx}`),
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
        footer: [...t.querySelectorAll('tfoot tr')].map((r) =>
          [...r.querySelectorAll('td, th')].map((c) => clean(c.innerText))
        ),
      }));
    });
  }

  /**
   * Every grid of the dashboard: walks the tabs that hold one (Team, Sources & ROI) and tags each
   * grid with its tab. On the older one-page layout this is just grids().
   */
  async allGrids() {
    if (!(await this.hasTabs())) return (await this.grids()).map((g) => ({ ...g, tab: '(page)' }));
    const out = [];
    for (const key of ['team', 'sources']) {
      await this.openTab(key);
      for (const g of await this.grids()) out.push({ ...g, tab: key });
    }
    return out;
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

  /** Flat list of bottom-row header labels, for locating a column by name (NOT in column order — see columnLabels). */
  headerLabels(grid) {
    if (!grid.headerRows.length) return [];
    const carried = grid.headerRows.slice(0, -1).flatMap((hr) =>
      hr.filter((c) => c.rowspan > 1).map((c) => c.text));
    return [...carried, ...grid.headerRows[grid.headerRows.length - 1].map((c) => c.text)];
  }

  /**
   * One label per column, IN COLUMN ORDER, for a one- or two-row header: a top cell that spans
   * several columns hands them to the next cells of the second row, prefixed with its own text
   * ("Leads › New", "Leads in Follow-up › Today"); a top cell with rowspan 2 keeps its own text.
   */
  columnLabels(grid) {
    if (!grid.headerRows.length) return [];
    if (grid.headerRows.length === 1) return grid.headerRows[0].map((c) => c.text);
    const [top, sub] = grid.headerRows;
    const out = [];
    let si = 0;
    for (const c of top) {
      if (c.colspan > 1 && c.rowspan === 1) {
        for (let k = 0; k < c.colspan; k++) out.push(`${c.text} › ${(sub[si++] || {}).text || ''}`);
      } else out.push(c.text);
    }
    return out;
  }

  /** Numeric value from a named column of a named executive's row (Team grid; column as in columnLabels). */
  async executiveMetric(execName, columnLabel) {
    const summary = (await this.grids()).find((g) => g.name === 'executive-leads-table') || (await this.grids())[0];
    if (!summary) return null;
    const labels = this.columnLabels(summary);
    const ci = labels.findIndex((l) => l.toLowerCase() === columnLabel.toLowerCase());
    const row = summary.rows.find((r) => r[0] === execName);
    if (ci < 0 || !row) return null;
    const n = parseFloat(String(row[ci] ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  /** Overview › Leads Summary tiles: { Total: { count }, Won: { count, share, value }, New: …, Cold: … }. */
  async leadsSummary() {
    return this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const num = (s) => { const m = clean(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
      const out = {};
      for (const tile of document.querySelectorAll('#leadDashboard .col-4')) {
        const spans = [...tile.querySelectorAll(':scope > span, :scope span.d-block')];
        if (spans.length < 2) continue;
        const label = clean(spans[0].textContent);
        if (!label) continue;
        out[label] = { count: num(spans[1].textContent), share: spans[2] ? clean(spans[2].textContent) : '', value: spans[3] ? num(spans[3].getAttribute('title') || spans[3].textContent) : null };
      }
      return out;
    });
  }

  /** Overview › "Leads in Follow-up" ring: { total, today, overdue, upcoming }. */
  async followupSummary() {
    return this.page.evaluate(() => {
      const num = (e) => { const m = ((e && e.textContent) || '').replace(/,/g, '').match(/\d+/); return m ? Number(m[0]) : null; };
      const leg = (id) => num(document.querySelector(`#${id} .legend-count`));
      const ring = document.querySelector('#inPipelineRadialChart');
      const card = ring && ring.closest('.card');
      return { total: num(card && card.querySelector('.label-value')), today: leg('leads-followup-today'), overdue: leg('leads-followup-overdue'), upcoming: leg('leads-followup-upcoming') };
    });
  }

  /** Needs attention rows: [{ id, title, detail, action }]. */
  async attentionRows() {
    return this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return [...document.querySelectorAll('.crmd-att-row')].filter((r) => r.getClientRects().length).map((r) => ({
        id: r.id || '', title: clean((r.querySelector('.fw-semibold') || {}).textContent),
        detail: clean((r.querySelector('.text-muted') || {}).textContent), action: clean((r.querySelector('button') || {}).textContent),
      }));
    });
  }
}

module.exports = { CrmDashboardPage };
