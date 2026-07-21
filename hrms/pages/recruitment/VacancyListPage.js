'use strict';

const { BasePage } = require('../BasePage');

/**
 * Hiring — Job Openings (/vacancy-list).
 * Recruiter workspace for vacancies. The tab strip (Job Openings / Candidates /
 * Talent Pools) is a set of ROUTER LINKS, not in-page panels — probed live:
 * "Candidates" navigates to /candidates and "Talent Pools" to /talent-pool,
 * where the strip no longer exists. A native select filters by opening status;
 * "0 published · 0 total" counters sit above the grid.
 *
 * Grid: Candidates | Job Opening | Hiring Lead | Created On | Status | Action
 * (captured empty — handle 0 rows).
 */
class VacancyListPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'vacancy-list');

    // ── Toolbar / filters ────────────────────────────────────────────────────
    this.addJobOpeningBtn = this.button('Add Job Opening');
    // Options: All | Open | Draft | On Hold | Filled | Cancelled
    this.statusFilter = this.main.locator('select').first();
    // "N published · N total · Show Draft & Open" counter line
    this.publishSummary = this.main.getByText(/\d+\s*published\s*·\s*\d+\s*total/i).first();

    // ── Tabs (router links — each navigates to its own route) ───────────────
    this.jobOpeningsTab = this.tab('Job Openings');
    this.candidatesTab  = this.tab('Candidates');
    this.talentPoolsTab = this.tab('Talent Pools');
  }

  /** Where each hiring tab navigates (probed live on this build). */
  static get TAB_ROUTES() {
    return { 'Job Openings': 'vacancy-list', 'Candidates': 'candidates', 'Talent Pools': 'talent-pool' };
  }

  /**
   * Click a hiring tab and wait for its route. "Job Openings" stays on
   * /vacancy-list; the other two LEAVE this page (call goto() to come back).
   */
  async switchTab(name) {
    const route = VacancyListPage.TAB_ROUTES[name];
    await this.tab(name).click();
    if (route) await this.page.waitForURL(new RegExp(`/${route}(\\?|$)`), { timeout: 20000 }).catch(() => {});
    await this.waitReady();
  }

  /** Open the create-opening form via "Add Job Opening". Nothing is saved. */
  async openCreateForm() {
    await this.addJobOpeningBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** True when the create dialog (or an inline create form) is on screen. */
  async createFormVisible() {
    if (await this.modal.isVisible().catch(() => false)) return true;
    return this.main.locator('button').filter({ hasText: /^\s*(save|submit)\s*$/i }).first()
      .isVisible().catch(() => false);
  }

  /** Dismiss the create form WITHOUT saving (close X / Cancel / Escape / reload). */
  async closeCreateForm() {
    await this.dismissModal();
    // Inline (non-modal) form still open → reload the route to discard it.
    if (await this.createFormVisible()) await this.goto();
    await this.page.waitForTimeout(300);
  }

  /** Filter openings by status label (e.g. "Open"). Read-only. */
  async filterByStatus(label) {
    await this.statusFilter.selectOption({ label });
    await this.waitReady();
  }

  /** The "N published · N total" counter text (assertion target). */
  async publishSummaryText() {
    return (await this.publishSummary.innerText().catch(() => '')).trim();
  }

  /** Current data-row count (0 is a valid, documented state). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { VacancyListPage };
