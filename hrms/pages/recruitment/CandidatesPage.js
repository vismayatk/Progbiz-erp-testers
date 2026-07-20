'use strict';

const { BasePage, escapeRe } = require('../BasePage');

/**
 * Candidates (/candidates) — central candidate register.
 * Status buckets are BUTTONS with live counts ("New 0", "In Progress 0",
 * "Shortlisted 0", "Selected 0", "Rejected 0"), not links. "Add New" opens the
 * manual candidate form whose "Candidate Name" / "Phone Number" placeholder
 * inputs were captured in the crawl.
 *
 * Grid: Sl.No | Name | Email | Phone | Branch | Designation | Skills | Status |
 *       Added On | Action. NOTE: captured rowCount was 1 with an EMPTY first
 * row — do not treat rowCount 1 as data present; assert on cell text.
 */
class CandidatesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'candidates');

    // ── Toolbar ─────────────────────────────────────────────────────────────
    this.addNewBtn   = this.button('Add New');
    this.searchInput = this.main.locator('input[placeholder="Search Name/Phone"]').first();

    // ── Add-candidate form fields (modal-borne — anchored on page, not main) ─
    this.candidateNameInput = page.locator('input[placeholder="Candidate Name"]').first();
    this.phoneNumberInput   = page.locator('input[placeholder="Phone Number"]').first();
    // Four unlabeled selects were captured (branch/designation/status pickers,
    // list filters + add-form). Scope to the open modal to tell them apart.
    this.filterSelects = this.main.locator('select');
  }

  /**
   * A status-bucket button by base name ("New" | "In Progress" | "Shortlisted"
   * | "Selected" | "Rejected"). The live count suffix is tolerated; the ^…$
   * anchor keeps "New" from matching the "Add New" button.
   */
  bucket(name) {
    return this.main.locator('button, [role="tab"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRe(name)}\\s*\\d*\\s*$`, 'i') })
      .first();
  }

  /** Click a status bucket and let the grid re-render. */
  async selectBucket(name) {
    await this.bucket(name).click();
    await this.waitReady();
  }

  /** The live count shown on a bucket button (e.g. "Shortlisted 3" → 3). */
  async bucketCount(name) {
    const txt = (await this.bucket(name).innerText().catch(() => '')).trim();
    const m = txt.match(/(\d+)\s*$/);
    return m ? Number(m[1]) : 0;
  }

  /** Open the Add-New candidate form and wait for its named fields. Nothing is saved. */
  async openAddForm() {
    await this.addNewBtn.click();
    await this.candidateNameInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.page.waitForTimeout(300);
  }

  /** Dismiss the Add-New form WITHOUT saving. */
  async closeAddForm() {
    for (let i = 0; i < 2 && await this.modal.isVisible().catch(() => false); i++) {
      const x = this.modal.locator('.btn-close, [aria-label="Close"], [data-bs-dismiss="modal"]').first();
      if (await x.count()) await x.click().catch(() => {});
      else {
        const cancel = this.modal.locator('button').filter({ hasText: /^\s*(cancel|close)\s*$/i }).first();
        if (await cancel.count()) await cancel.click().catch(() => {});
        else await this.page.keyboard.press('Escape').catch(() => {});
      }
      await this.modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    // Non-modal variant still showing the form → reload to discard it.
    if (await this.candidateNameInput.isVisible().catch(() => false)) await this.goto();
    await this.page.waitForTimeout(300);
  }

  /** Type into "Search Name/Phone" and let the list refresh. Read-only. */
  async search(term) {
    await this.searchInput.fill(term);
    await this.waitReady();
  }

  /** Current row count — remember: 1 empty placeholder row ≠ 1 candidate. */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { CandidatesPage };
