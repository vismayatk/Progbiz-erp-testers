'use strict';

/**
 * Sales Targets — /sales-targets
 *
 * A grid of one row per sales executive: a "Spread Helper" amount box
 * (#spread-amount-{execId}), a spread button (#btn-spread-{execId}), twelve
 * monthly target inputs (#target-amount-{execId}-{0..11}) and a computed
 * Total cell. Page-level actions are #btn-copy-previous-year and
 * #btn-save-targets.
 *
 * Executive ids are tenant data, so nothing here hardcodes them — call
 * executiveIds() and work from what the page actually renders.
 *
 * NOTE ON SAVING: save() exists but no spec calls it. Saving overwrites the
 * live targets of real executives, and there is no per-record isolation to
 * fall back on. Only use it against a throwaway tenant.
 */
class SalesTargetsPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://test.erp.progbiz.in';

    this.grid = page.locator('table').first();
    this.copyPreviousYearBtn = page.locator('#btn-copy-previous-year');
    this.saveBtn = page.locator('#btn-save-targets');
    this.branchSelect = page.locator('#target-branch');
    this.yearSelect = page.locator('#target-year');
    this.modeSelect = page.locator('#target-mode');
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/sales-targets`, {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    // The grid renders after a data call; wait for a real row, not the shell.
    await this.page.locator('[id^="spread-amount-"]').first()
      .waitFor({ state: 'visible', timeout: 30000 });
    await this.page.waitForTimeout(800);
  }

  /** Executive ids present in the grid, derived from the spread inputs. */
  async executiveIds() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('[id^="spread-amount-"]')]
        .map((e) => e.id.replace('spread-amount-', ''))
    );
  }

  /** Visible name in the first cell of an executive's row. */
  async executiveName(execId) {
    return this.page.evaluate((id) => {
      const tr = document.querySelector(`#spread-amount-${id}`).closest('tr');
      return (tr.querySelector('td')?.innerText || '').replace(/\s+/g, ' ').trim();
    }, execId);
  }

  /**
   * Enter an annual amount and spread it across the twelve months.
   * Returns the resulting monthly values as numbers.
   */
  async spread(execId, amount) {
    await this.page.locator(`#spread-amount-${execId}`).fill(String(amount));
    await this.page.locator(`#btn-spread-${execId}`).click({ timeout: 10000 });
    await this.page.waitForTimeout(900);
    return this.monthlyValues(execId);
  }

  /** The twelve monthly target inputs as numbers (blank counts as 0). */
  async monthlyValues(execId) {
    return this.page.evaluate((id) => {
      const out = [];
      for (let m = 0; m < 12; m++) {
        const el = document.querySelector(`#target-amount-${id}-${m}`);
        const v = el ? parseFloat(el.value) : NaN;
        out.push(Number.isFinite(v) ? v : 0);
      }
      return out;
    }, execId);
  }

  /** Sum of the twelve monthly cells, rounded to paise to avoid float noise. */
  async monthlyTotal(execId) {
    const months = await this.monthlyValues(execId);
    return Math.round(months.reduce((a, b) => a + b, 0) * 100) / 100;
  }

  /** Raw text of the Total cell (last cell of the row) — may be formatted. */
  async totalCellText(execId) {
    return this.page.evaluate((id) => {
      const tr = document.querySelector(`#spread-amount-${id}`).closest('tr');
      const cells = [...tr.querySelectorAll('td')];
      return (cells[cells.length - 1].innerText || '').replace(/\s+/g, ' ').trim();
    }, execId);
  }

  /** Total cell parsed to a number, stripping thousands separators. */
  async totalCellValue(execId) {
    const t = await this.totalCellText(execId);
    const n = parseFloat(String(t).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }

  /** Click "Copy previous year" — fills the form; does not persist. */
  async copyPreviousYear() {
    await this.copyPreviousYearBtn.click({ timeout: 10000 });
    await this.page.waitForTimeout(2000);
  }

  /**
   * Persist the grid. Deliberately unused by the specs — see the class note.
   * @param {{ iAcceptThisOverwritesLiveTargets: boolean }} opts
   */
  async save(opts = {}) {
    if (!opts.iAcceptThisOverwritesLiveTargets) {
      throw new Error(
        'SalesTargetsPage.save() overwrites live targets for real executives. ' +
        'Pass { iAcceptThisOverwritesLiveTargets: true } and only on a throwaway tenant.'
      );
    }
    await this.saveBtn.click({ timeout: 15000 });
    await this.page.waitForTimeout(4000);
  }
}

module.exports = { SalesTargetsPage };
