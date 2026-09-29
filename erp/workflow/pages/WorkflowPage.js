'use strict';

/**
 * Work Flow module — the engine that replaced Project Management.
 *
 * Projects is one instance of a configurable workflow module identified by a
 * GUID that DIFFERS PER TENANT (and some tenants, e.g. skiolo_dev, have no
 * module at all). Nothing here hardcodes the id: resolveModuleId() derives it
 * from /workflow-modules by following the "Types" action, which lands on
 * /workflow-types/<guid>. Specs must call it first and skip when it is null.
 *
 * Route map (all GUID-scoped except cost types):
 *   /workflow-modules                     module registry ("customisation" root)
 *   /workflow-types/<id>                  types + per-type Template (phases/tasks)
 *   /workflows/<id>                       listing — tabs: Created / Ongoing / On Hold / Finished / Dropped
 *   /workflow/<id>                        New Project form
 *   /workflow-overview/<projectGuid>      13-tab project overview
 *   /workflow-dashboard/<id>              dashboard
 *   /workflow-status-report/<id>          status report
 *
 * The listing OPENS ON THE ONGOING TAB, so a freshly created project (status
 * "Created") is not on the default view — look for it under the Created tab.
 */
class WorkflowPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://dev.erp.progbiz.in';
    this.moduleId = null;
  }

  /* ── module resolution ─────────────────────────────────────────────────── */

  /**
   * Derive the Projects workflow GUID from the module registry.
   * Returns null when the tenant has no workflow module configured.
   */
  async resolveModuleId() {
    await this.page.goto(`${this.baseUrl}/workflow-modules`, {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    await this.page.waitForTimeout(4500);
    const hasRow = await this.page.locator('table tbody tr').count().catch(() => 0);
    if (!hasRow) return null;
    await this.page.locator('table tbody tr').first()
      .locator('a:has-text("Types"), button:has-text("Types")').first()
      .click({ timeout: 9000 }).catch(() => {});
    await this.page.waitForTimeout(4500);
    const m = this.page.url().match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    this.moduleId = m ? m[1] : null;
    return this.moduleId;
  }

  /* ── navigation ────────────────────────────────────────────────────────── */

  async _goto(path) {
    await this.page.goto(`${this.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.page.waitForTimeout(4500);
  }
  gotoTypes()        { return this._goto(`/workflow-types/${this.moduleId}`); }
  gotoListing()      { return this._goto(`/workflows/${this.moduleId}`); }
  gotoNew()          { return this._goto(`/workflow/${this.moduleId}`); }
  gotoDashboard()    { return this._goto(`/workflow-dashboard/${this.moduleId}`); }
  gotoStatusReport() { return this._goto(`/workflow-status-report/${this.moduleId}`); }

  /* ── grid reading ──────────────────────────────────────────────────────── */

  /** The page's dominant visible grid as {columns, rows[][]}. */
  async readGrid() {
    return this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => {
        if (e.getClientRects().length === 0) return false;
        const s = getComputedStyle(e);
        return s.display !== 'none' && s.visibility !== 'hidden';
      };
      const t = [...document.querySelectorAll('table')].filter(on)
        .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
      if (!t) return { columns: [], rows: [] };
      return {
        columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
        rows: [...t.querySelectorAll('tbody tr')]
          .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText)))
          .filter((c) => !(c.length <= 2 && /no data|no record/i.test(c.join(' ')))),
      };
    });
  }

  /**
   * Types with their template sizes:
   * [{type, phases, tasks, records}]
   */
  async readTypes() {
    await this.gotoTypes();
    const g = await this.readGrid();
    const idx = (name) => g.columns.findIndex((c) => new RegExp(`^${name}$`, 'i').test(c));
    const ti = idx('Type'), pi = idx('Phases'), ki = idx('Tasks'), ri = idx('Records');
    return g.rows.map((r) => ({
      type: r[ti], phases: parseInt(r[pi], 10) || 0,
      tasks: parseInt(r[ki], 10) || 0, records: parseInt(r[ri], 10) || 0,
    })).filter((t) => t.type);
  }

  /* ── project creation ──────────────────────────────────────────────────── */

  /**
   * Create a project of the given type. The Customer field is a
   * search-and-pick — typing alone leaves the underlying id unset and the form
   * (correctly) refuses to save — so this drives the Search Results modal.
   * Returns the overview path on success.
   */
  async createProject({ name, type, dealAmount = '50000' }) {
    const page = this.page;
    await this.gotoNew();

    // Selects and dated/text inputs are labelled but mostly id-less, so
    // locate every control through its label.
    await page.evaluate(({ name, type, dealAmount }) => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const on = (e) => e.getClientRects().length > 0;
      const groupOf = (labelText) => [...document.querySelectorAll('.form-group,.col,.mb-3,.row > div')]
        .find((g) => {
          const l = g.querySelector('label');
          return l && clean(l.innerText).startsWith(clean(labelText));
        });
      const pick = (labelText, wanted) => {
        const s = groupOf(labelText)?.querySelector('select');
        if (!s || !on(s)) return;
        const opts = [...s.options].filter((o) =>
          o.value && !/^choose$/i.test(o.text.trim()) && !/create new/i.test(o.text));
        const hit = (wanted && opts.find((o) => clean(o.text) === clean(wanted))) || opts[0];
        if (!hit) return;
        s.value = hit.value;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const fill = (labelText, value) => {
        const e = groupOf(labelText)?.querySelector('input:not([type=checkbox]),textarea');
        if (!e || !on(e)) return;
        e.value = value;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const d = new Date();
      fill('Name', name);
      pick('Branch');
      pick('Type', type);
      pick('Executive');
      fill('Deal Date', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      fill('Deal Amount', dealAmount);
      fill('Description', 'Automated flow test — safe to delete');
    }, { name, type, dealAmount });

    // Customer: search → modal → first row.
    const custGroup = page.locator('div.input-group')
      .filter({ has: page.locator('input[placeholder="Search and pick"]') }).first();
    await custGroup.locator('input').fill('a');
    await page.waitForTimeout(500);
    await custGroup.locator('[title="Search"]').first().click({ timeout: 9000 });
    await page.waitForTimeout(3500);
    await page.locator('.modal.show tbody tr').first()
      .waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('.modal.show tbody tr').first().click({ timeout: 9000 });
    await page.waitForTimeout(2500);

    const before = page.url();
    await page.locator('button:has-text("Create")').first().click({ timeout: 15000 });
    await page.waitForTimeout(7000);
    if (page.url() === before) {
      const alert = await page.evaluate(() =>
        [...document.querySelectorAll('.swal2-popup,.toast,.alert')]
          .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 200));
      throw new Error(`project creation did not navigate — still on the form. Alert: "${alert}"`);
    }
    return page.url().replace(this.baseUrl, '');
  }

  /* ── created project ───────────────────────────────────────────────────── */

  /**
   * Find a project row under a listing status tab (default "Created" — the
   * tab where new projects land). Raises the page size first so pagination
   * cannot hide it.
   */
  async findInListing(name, tab = 'Created') {
    await this.gotoListing();
    await this.page.locator(`button:has-text("${tab}"), a:has-text("${tab}")`).first()
      .click({ timeout: 9000 }).catch(() => {});
    await this.page.waitForTimeout(3500);
    await this.page.selectOption('#page_size', '100').catch(() => {});
    await this.page.waitForTimeout(3500);
    const g = await this.readGrid();
    return g.rows.find((r) => r.join(' ').includes(name)) || null;
  }

  /** Open one of the overview's 13 tabs and return its grid. */
  async readOverviewTab(overviewPath, tabName) {
    if (!this.page.url().includes(overviewPath)) {
      await this._goto(overviewPath);
      await this.page.waitForTimeout(1500);
    }
    await this.page.locator(`.nav-link:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`)
      .first().click({ timeout: 9000 });
    await this.page.waitForTimeout(3800);
    return this.readGrid();
  }

  /** Does the page (dashboard / status report) mention the project? */
  async pageMentions(name) {
    return this.page.evaluate((n) => (document.body.innerText || '').includes(n), name);
  }
}

module.exports = { WorkflowPage };
