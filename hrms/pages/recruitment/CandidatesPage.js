'use strict';

const { BasePage, escapeRe } = require('../BasePage');

/**
 * Candidates (/candidates) — central candidate register.
 * Status buckets are BUTTONS with live counts ("New 0", "In Progress 0",
 * "Shortlisted 0", "Selected 0", "Rejected 0"), not links. "Add New" NAVIGATES
 * to the routed create form /candidate/0 (probed live) with fields
 * #TxtCandidateName, #TxtCandidateEmail and an "Enter phone number" input —
 * the "Candidate Name" / "Phone Number" placeholder inputs captured on the
 * LIST page are its filter row, not the create form.
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

    // ── List filter row (captured on /candidates itself) ────────────────────
    this.filterNameInput  = this.main.locator('input[placeholder="Candidate Name"]').first();
    this.filterPhoneInput = this.main.locator('input[placeholder="Phone Number"]').first();
    this.filterSelects    = this.main.locator('select');

    // ── Routed create form /candidate/0 (probed live) ───────────────────────
    this.candidateNameInput  = page.locator('#TxtCandidateName');
    this.candidateEmailInput = page.locator('#TxtCandidateEmail');
    this.phoneNumberInput    = page.locator('input[placeholder="Enter phone number"]').first();
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

  /** Open the Add-New candidate form (routed page /candidate/0). Nothing is saved. */
  async openAddForm() {
    await this.addNewBtn.click();
    await this.page.waitForURL(/\/candidate\/0(\?|$)/, { timeout: 20000 });
    await this.waitReady();
    await this.candidateNameInput.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** Leave the routed Add-New form WITHOUT saving — navigate back to the list. */
  async closeAddForm() {
    await this.goto();                     // back to /candidates, draft discarded
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
