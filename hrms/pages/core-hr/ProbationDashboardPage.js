'use strict';

const { BasePage, escapeRe } = require('../BasePage');

/**
 * /hrms/probation — probation management dashboard (Core HR).
 * KPI tiles: On Probation | Reviews Due (7d) | Overdue Reviews | Ending Soon (30d).
 * Grid ("Employees On Probation"): Employee | Branch | Start | End | Reviews |
 * Next Review | Days Left | Action. Empty-state ROW: "No one on probation."
 * "Report" / "Templates" are plain anchors; "Start Probation" is a button.
 */
class ProbationDashboardPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'hrms/probation');

    // ── Header actions (crawled hrefs) ─────────────────────────────────────
    this.reportLink        = this.main.locator('a[href="/hrms/probation-report"]').first();
    this.templatesLink     = this.main.locator('a[href="/hrms/probation-templates"]').first();
    this.startProbationBtn = this.button('Start Probation');
  }

  /**
   * KPI tile label element (e.g. "On Probation"). Anchored to the label so the
   * "Employees On Probation" card title never matches, but tolerant of the
   * numeric value sharing the same element ("0 On Probation").
   */
  kpiTile(label) {
    return this.main
      .getByText(new RegExp(`^\\s*\\d*%?\\s*${escapeRe(label)}\\s*$`, 'i'))
      .first();
  }

  /** Numeric text of a KPI tile — climbs ancestors until the value appears. */
  async kpiValue(label) {
    let node = this.kpiTile(label);
    for (let up = 0; up < 4; up++) {
      const txt = ((await node.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const m = txt.match(/\d+%?/);
      if (m) return m[0];
      node = node.locator('xpath=..');
    }
    return '';
  }

  /**
   * Open the Start-Probation picker (expected: modal to choose employee +
   * template). Nothing is ever confirmed/saved.
   * @returns {Promise<boolean>} true when a picker form actually revealed
   */
  async openStartProbation() {
    const before = await this._visibleControlCount();
    await this.startProbationBtn.click();
    const modalShown = await this.modal.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    await this.waitReady();
    if (modalShown) return true;
    if (this._currentPath() !== this.route) return true;
    return (await this._visibleControlCount()) > before;
  }

  /** Dismiss the Start-Probation picker WITHOUT confirming. */
  async closeModal() {
    if (await this.modal.isVisible().catch(() => false)) {
      const dismiss = this.modal
        .locator('.btn-close, [aria-label="Close"], button:has-text("Cancel"), button:has-text("Close")')
        .first();
      if (await dismiss.count()) await dismiss.click({ timeout: 5000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    } else if (this._currentPath() !== this.route) {
      await this.goto();
    }
    await this.page.waitForTimeout(300);
  }

  // ── private helpers ──────────────────────────────────────────────────────

  _currentPath() {
    return new URL(this.page.url()).pathname.replace(/^\//, '').replace(/\/$/, '');
  }

  _visibleControlCount() {
    return this.page.locator('input:visible, select:visible, textarea:visible').count();
  }
}

module.exports = { ProbationDashboardPage };
