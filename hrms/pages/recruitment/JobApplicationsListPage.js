'use strict';

const { BasePage } = require('../BasePage');

/**
 * Job Applications (/job-applications-list) — "Applicant Details" inbox.
 * No toolbar buttons/filters/inputs at page level: every action lives in the
 * table's per-row action columns (Details | Schedule Interview | Reject).
 *
 * Grid: Sl.No | Name | Position Applied For | Phone | Email | Details |
 *       Status | Schedule Interview | Reject  (captured empty — handle 0 rows).
 */
class JobApplicationsListPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'job-applications-list');
    // Grid + headers come from BasePage (this.grid / this.gridRows / this.gridHeaders).
  }

  /** Current data-row count (0 is the documented baseline state). */
  rowCount() { return this.gridRows.count(); }

  /** The clickable "Details" control inside row `index` (read-only viewer). */
  detailsControl(index = 0) {
    return this.gridRows.nth(index).locator('button, a, [role="button"]')
      .filter({ hasText: /details/i }).first();
  }

  /**
   * Open the read-only application details for row `index`.
   * NON-DESTRUCTIVE — never touches Schedule Interview / Reject.
   */
  async openDetails(index = 0) {
    await this.detailsControl(index).click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** Dismiss the details view without acting on the application. */
  async closeDetails() {
    await this.dismissModal();
    await this.page.waitForTimeout(300);
  }
}

module.exports = { JobApplicationsListPage };
