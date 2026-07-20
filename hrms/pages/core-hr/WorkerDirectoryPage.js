'use strict';

const { BasePage } = require('../BasePage');

/**
 * /worker-directory — read-only employee directory (Core HR).
 * No data grid: results render as cards (or an org chart via the view toggle).
 * Search is button-triggered, not live-typed.
 */
class WorkerDirectoryPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'worker-directory');

    // ── View toggle (top-right) ────────────────────────────────────────────
    this.cardsBtn    = this.button('Cards');
    this.orgChartBtn = this.button('Org Chart');

    // ── Filters ────────────────────────────────────────────────────────────
    this.branchSelect = this.main.locator('select').first();    // "-- All branches --", no id
    this.searchInput  = page.locator('input[placeholder="Name, designation or department"]');
    this.searchBtn    = this.button('Search');

    // Documented empty state (empty tenant OR a no-match search)
    this.emptyState = this.main.getByText('No employees match the current filters.').first();
  }

  /** Switch to the card view. */
  async switchToCards() {
    await this.cardsBtn.click();
    await this.waitReady();
  }

  /** Switch to the organisation-chart view. */
  async switchToOrgChart() {
    await this.orgChartBtn.click();
    await this.waitReady();
  }

  /** Run a directory search (fills the box, clicks "Search"). Read-only. */
  async search(term) {
    await this.searchInput.fill(term);
    await this.searchBtn.click();
    await this.waitReady();
  }
}

module.exports = { WorkerDirectoryPage };
