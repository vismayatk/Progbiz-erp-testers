'use strict';

const { BasePage } = require('../BasePage');

/**
 * Talent Pool & Archive (/talent-pool).
 * Search archived/active candidates by name/email, skill and pool. Search is
 * BUTTON-driven — results load on "Search" click, not on keystroke. The Pool
 * select defaults to "Archived (talent pool)".
 *
 * Grid: Sl.No | Name | Designation | Skills | Tags | Status | Score | Action.
 * The grid initially renders a "Loading..." row (async fetch) — wait it out.
 */
class TalentPoolPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'talent-pool');

    // Body order from crawl: search input, then Skill select, then Pool select.
    this.searchInput = this.main.locator('input[placeholder="Name or email"]').first();
    this.skillSelect = this.main.locator('select').nth(0);   // default "— Any —"
    this.poolSelect  = this.main.locator('select').nth(1);   // Archived (talent pool) | Active | All
    this.searchBtn   = this.button('Search');
  }

  /** Wait for the async "Loading..." first row to clear. */
  async waitLoaded() {
    await this.gridRows.filter({ hasText: 'Loading...' }).first()
      .waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  }

  /**
   * Run a pool search (read-only query). All criteria optional.
   * @param {{query?: string, skill?: string, pool?: string}} [criteria]
   */
  async search({ query, skill, pool } = {}) {
    if (query !== undefined) await this.searchInput.fill(query);
    if (skill) await this.skillSelect.selectOption({ label: skill }).catch(() => {});
    if (pool)  await this.poolSelect.selectOption({ label: pool }).catch(() => {});
    await this.searchBtn.click();
    await this.waitReady();
    await this.waitLoaded();
  }

  /** Switch the Pool filter ("Archived (talent pool)" | "Active" | "All"). */
  async setPool(label) {
    await this.poolSelect.selectOption({ label });
    await this.waitReady();
  }

  /** Current data-row count (after waitLoaded; 0 is valid). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { TalentPoolPage };
