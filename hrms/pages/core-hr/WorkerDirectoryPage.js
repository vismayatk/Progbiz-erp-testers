'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');

/**
 * /worker-directory — read-only employee directory (Core HR).
 *
 * Live build (hrms-test, Sept 2026):
 *  - Stats strip: Headcount · On probation · Joined this month · Departments.
 *  - Filters: Branch select ("-- All branches --"), Department select
 *    ("-- All departments --"), search box (placeholder "Name, code, designation
 *    or department"), "Search" button, checkbox #wd-include-exited
 *    ("Include employees who have left").
 *  - View toggle: "Cards" | "List" (the older build called the 2nd view "Org Chart").
 *  - Cards view: one `.wd-card` per person — initials avatar, name link
 *    (→ /employee-view/<guid>), designation, employee code, branch,
 *    "Reports To: <name>", phone (tel:) and email (mailto:) icon links.
 *    Footer: "Showing 1 to N of N entries" + page-size buttons 12/24/48/96.
 *  - List view: table Employee | Code | Designation | Department | Branch |
 *    Reports to | Joined | Phone | Email.
 *  - Employees load lazily ("Loading employees…" placeholder) and, like every
 *    Blazor list here, results can render a beat after Search — always poll.
 *  - Search is button-triggered (not live) and matches name AND employee code.
 */
class WorkerDirectoryPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'worker-directory');

    // ── View toggle (top-right) ────────────────────────────────────────────
    // NOTE: page-scoped — BasePage.main does not wrap this page's content on the live build.
    this.cardsBtn    = page.locator('button, a.btn, [role="button"]').filter({ hasText: /^\s*Cards\s*$/i }).first();
    this.listBtn     = page.locator('button, a.btn, [role="button"]').filter({ hasText: /^\s*List\s*$/i }).first();
    this.orgChartBtn = this.listBtn;                              // legacy name (build renamed "Org Chart" → "List")

    // ── Filters ────────────────────────────────────────────────────────────
    this.branchSelect     = page.locator('select').filter({ has: page.locator('option', { hasText: /All branches/i }) }).first();
    this.departmentSelect = page.locator('select').filter({ has: page.locator('option', { hasText: /All departments/i }) }).first();
    this.searchInput      = page.locator('input[placeholder*="Name, code" i], input[placeholder*="Name, designation" i]').first();
    this.searchBtn        = page.locator('button, a.btn, [role="button"]').filter({ hasText: /^\s*Search\s*$/i }).first();
    this.includeExitedChk = page.locator('#wd-include-exited');

    // ── Results ────────────────────────────────────────────────────────────
    this.cards          = page.locator('.wd-card');
    this.loadingText    = page.getByText(/Loading employees/i).first();
    // Documented empty state (empty tenant OR a no-match search)
    this.emptyState = page.getByText('No employees match the current filters.').first();
  }

  // ── Loading / views ──────────────────────────────────────────────────────

  /**
   * Wait until the directory has actually loaded: the "Loading employees…"
   * placeholder is gone and the Branch filter has its options (they populate
   * only after the data arrives).
   */
  async waitForDirectory(timeout = 60000) {
    await expect.poll(async () => {
      const loading = await this.loadingText.isVisible().catch(() => false);
      const opts    = await this.branchSelect.locator('option').count().catch(() => 0);
      return !loading && opts > 1;
    }, { timeout, message: 'the Worker Directory should finish loading (placeholder gone, Branch options present)' }).toBe(true);
    await this.page.waitForTimeout(300);
  }

  /** Open the directory and wait for it to load. */
  async open() {
    await this.goto();
    await this.waitForDirectory();
  }

  /** Switch to the card view. */
  async switchToCards() {
    await this.cardsBtn.click();
    await this.waitReady();
  }

  /** Switch to the list (table) view. */
  async switchToList() {
    await this.listBtn.click();
    await this.waitReady();
  }

  /** Legacy alias — the second view is now called "List". */
  async switchToOrgChart() { return this.switchToList(); }

  // ── Filters / search ─────────────────────────────────────────────────────

  /** Pick a Branch filter value by its label (e.g. "Main Branch"). */
  async filterBranch(label) {
    await this.branchSelect.selectOption({ label });
    await this.page.waitForTimeout(200);
  }

  /** Pick a Department filter value by its label. */
  async filterDepartment(label) {
    await this.departmentSelect.selectOption({ label });
    await this.page.waitForTimeout(200);
  }

  /** Run a directory search (fills the box, clicks "Search"). Read-only. */
  async search(term) {
    await this.searchInput.fill(term);
    await this.searchBtn.click();
    await this.waitReady();
  }

  /**
   * Search and POLL until either result cards or the empty state render
   * (the grid is blank for a moment after Search). Returns the card count.
   */
  async searchAndWait(term, timeout = 20000) {
    await this.search(term);
    await expect.poll(async () => {
      const n = await this.cards.count();
      if (n > 0) return n;
      return (await this.emptyState.isVisible().catch(() => false)) ? 0 : -1;
    }, { timeout, message: `results (or the empty state) should render after searching "${term}"` }).toBeGreaterThanOrEqual(0);
    return this.cards.count();
  }

  // ── Card / list readers ──────────────────────────────────────────────────

  /** The card whose text carries this employee code. */
  cardFor(code) { return this.cards.filter({ hasText: code }).first(); }

  /**
   * The "Showing 1 to N of M entries" count parsed from the results footer,
   * or null when the footer is absent. Read from body text because the numbers
   * render in separate spans (so getByText can't match the whole phrase).
   */
  async resultsCount() {
    const body = (await this.page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const m = body.match(/Showing\s+\d+\s+to\s+\d+\s+of\s+(\d+)\s+entr(?:y|ies)/i);
    return m ? Number(m[1]) : null;
  }

  /**
   * Read one worker card into a plain object:
   * { name, designation, code, department, branch, reportsTo, phone, email, profileHref }.
   */
  async readCard(card) {
    return card.evaluate(el => {
      const q = sel => el.querySelector(sel);
      const nameA  = q('a[href*="/employee-view/"]');
      const lines  = [...el.querySelectorAll('.flex-fill > div')].map(d => (d.innerText || '').trim()).filter(Boolean);
      const tel    = q('a[href^="tel:"]');
      const mail   = q('a[href^="mailto:"]');
      const after  = lines.slice(1);                                    // lines after the name row
      const reports = after.find(t => /^Reports To:/i.test(t)) || '';
      // The card shows "Department | Branch" on one line (e.g. "Testing | Main Branch");
      // older builds showed the branch alone.
      const place  = (after[2] || '').split('|').map(s => s.trim());
      return {
        name:        nameA ? nameA.innerText.trim() : (lines[0] || ''),
        designation: after[0] || '',
        code:        after[1] || '',
        department:  place.length > 1 ? place[0] : '',
        branch:      place[place.length - 1] || '',
        reportsTo:   reports.replace(/^Reports To:\s*/i, ''),
        phone:       tel  ? (tel.getAttribute('title')  || tel.getAttribute('href').replace(/^tel:/, ''))       : '',
        email:       mail ? (mail.getAttribute('title') || mail.getAttribute('href').replace(/^mailto:/, '')) : '',
        profileHref: nameA ? nameA.getAttribute('href') : '',
      };
    });
  }

  /** Read every currently-rendered worker card (see readCard for the shape). */
  async readAllCards() {
    const n = await this.cards.count();
    const out = [];
    for (let i = 0; i < n; i++) out.push(await this.readCard(this.cards.nth(i)));
    return out;
  }

  /** Header texts of the List-view table. */
  async listHeaders() {
    const table = this.page.locator('table').filter({ has: this.page.locator('th', { hasText: /^Code$/ }) }).first();
    return (await table.locator('thead th, thead td').allInnerTexts()).map(t => t.trim()).filter(Boolean);
  }

  /**
   * In List view, the row for this employee code as an object keyed by header
   * (Employee, Code, Designation, Department, Branch, "Reports to", Joined, Phone, Email).
   * Polls because the table fills asynchronously. Returns null when absent.
   */
  async listRowFor(code, timeout = 15000) {
    const table = this.page.locator('table').filter({ has: this.page.locator('th', { hasText: /^Code$/ }) }).first();
    const row   = table.locator('tbody tr').filter({ hasText: code }).first();
    const ok = await row.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!ok) return null;
    const headers = await this.listHeaders();
    const cells   = (await row.locator('td').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
    const out = {};
    headers.forEach((h, i) => { out[h] = cells[i] ?? ''; });
    return out;
  }
}

module.exports = { WorkerDirectoryPage };
