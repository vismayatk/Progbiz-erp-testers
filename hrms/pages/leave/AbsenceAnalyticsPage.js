'use strict';

const { BasePage } = require('../BasePage');

/**
 * /absence-analytics — KPI dashboard: absence rate, unplanned share, Bradford
 * alerts, avg days/employee, monthly trend + per-department rate charts, and
 * the "Bradford Factor — Highest Risk (S² × D)" risk table.
 * Risk grid: SL No | Employee | Department | Spells (S) | Days (D) |
 * Score (S²·D) | Signal — captured with 1 LIVE row (Akshay | Dotnet | Normal),
 * so tests must not assume an empty grid.
 * KPI values are volatile — assert tile LABELS, not numbers. "Export"
 * downloads the risk table (not exercised).
 */
class AbsenceAnalyticsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'absence-analytics');

    this.filterBtn = this.button('Filter');
    this.exportBtn = this.button('Export');   // download — not exercised

    // ── Filters ────────────────────────────────────────────────────────────
    this.yearInput        = this.main.locator('input[type="number"]').first();
    this.branchSelect     = this.main.locator('select').nth(0);
    this.departmentSelect = this.main.locator('select').nth(1);

    // Stable KPI tile labels (values are volatile — assert labels only).
    this.kpiTileLabels = ['Absence rate', 'Unplanned share', 'Bradford alerts', 'Avg days / employee'];
  }

  /** Apply the year filter and let the dashboard re-render (read-only). */
  async applyYearFilter(year) {
    await this.yearInput.fill(String(year));
    await this.filterBtn.click();
    await this.waitReady();
  }

  /** True when the given KPI tile label is on screen. */
  kpiTileVisible(label) { return this.containsText(label); }

  /** True when the Bradford Factor risk card is on screen. */
  hasBradfordCard() { return this.containsText('Bradford Factor'); }

  /** Bradford risk-table row count (live data exists — 1 row was captured). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { AbsenceAnalyticsPage };
