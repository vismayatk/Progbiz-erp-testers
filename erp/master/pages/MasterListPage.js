'use strict';

/**
 * Simple master listings: a name, a Save, a pencil and a bin.
 *
 *   Item Packing Types · Departments        inline form on the listing page
 *   Designations · User Levels · Cost Types  modal form
 *   Teams                                    modal form, records shown as cards
 *   Payment Terms                            its own page (/payment-term)
 *
 * Every method that changes data only ever touches a row whose text contains the QA_ name the
 * caller passes in. remove()/cleanup() delete that row and nothing else.
 */
const { expect } = require('@playwright/test');
const { dismissRateLimit } = require('../../common/helpers');

const BASE = process.env.BASE_URL || 'https://test.erp.progbiz.in';
const PENCIL = '[title="Edit"], a:has(i.ri-pencil-line), button:has(i.ri-pencil-line), button:has-text("Edit")';
const BIN = '[title="Delete"], a:has(i.ri-delete-bin-5-fill), button:has(i.ri-delete-bin-5-fill), button:has-text("Delete")';
const CONFIRM = '.swal2-confirm:visible, .modal.show button:has-text("Yes"), .modal.show button:has-text("Confirm")';

/** One entry per master. `nameInput` is where the record's name goes. */
const MASTERS = {
  packing: {
    title: 'Item Packing Type', route: '/item-packing-types', nameInput: '#packingtypename', search: '#filter-name',
    saved: /Packaging Type Saved Successfully/i, deleted: /Packaging Type deleted successfully/i,
  },
  department: {
    title: 'Department', route: '/department', nameInput: '#departmentname',
    saved: /Department Saved Successfully/i, deleted: /Department deleted successfully/i,
  },
  designation: {
    title: 'Designation', route: '/designations', opener: /^\s*New Designation\s*$/i, nameInput: '#designation-name',
    saved: /Designation Saved Successfully/i, deleted: /Designation deleted successfully/i,
  },
  costtype: {
    title: 'Work Flow Cost Type', route: '/workflow-cost-types', opener: /^\s*New Cost Type\s*$/i, nameInput: '#cost-type-name', search: '#cost-type-search',
    // Posting Ledger is required: take the first real one
    extra: async (scope) => {
      const sel = scope.locator('#cost-type-ledger');
      const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: (o.textContent || '').trim() })).filter((o) => o.v && o.v !== '0' && !/^(choose|select|--)/i.test(o.t)));
      if (opts.length) await sel.selectOption(opts[0].v);
    },
    saved: /Saved Successfully/i, deleted: /Cost Type deleted successfully/i,
  },
  payterm: {
    title: 'Payment Term', route: '/payment-terms', opener: /^\s*New Payment Term\s*$/i, kind: 'page', nameInput: '#textbox',
    // a term needs at least one slab and the slab percentages must add up to 100
    // The first row is only an entry row: the green "+" adds the slab to the term, and Save counts added slabs.
    extra: async (scope, page) => {
      await scope.locator('input[placeholder="e.g. On installation"]').fill('QA slab');
      await scope.locator('input[type="text"]:visible').last().fill('100');
      await page.keyboard.press('Tab');                         // Blazor binds on blur
      // the "+" is the only icon-only (no text) button in the form
      await scope.locator('button[type="button"]').filter({ hasText: /^\s*$/ }).filter({ visible: true }).first().click();
      await page.waitForTimeout(800);
    },
    saved: null, deleted: null,
  },
  emailtpl: {
    title: 'Email Template', route: '/email-templates', opener: /^\s*New Template\s*$/i, kind: 'page', nameInput: '#template-name-text-box', search: '#filter-name',
    lower: true,   // the app stores template names in lower case
    noRename: true,   // the name is locked once saved: an edit changes the subject instead
    editExtra: async (scope, page) => { await page.locator('input[placeholder="Email Subject"]').fill('QA subject edited'); },
    extra: async (scope, page) => {
      await page.locator('input[placeholder="Email Subject"]').fill('QA subject');
      await page.locator('#txtTemplateBody').fill('QA body');
    },
    saved: /Template Saved Successfully/i, deleted: null,
  },
  customfield: {
    title: 'Custom Field', route: '/dynamic-fields', opener: /^\s*Add Custom Field\s*$/i, nameInput: '#cf-field-name', search: '#cf-search-input',
    // created INACTIVE so no live form picks the field up while it exists
    extra: async (scope) => {
      await scope.locator('#cf-width-select').selectOption({ label: '6' });
      await scope.locator('#cf-type-select').selectOption({ label: 'Text Box' });
      const active = scope.locator('#cf-is-active');
      if (await active.isChecked()) await active.click();
    },
    saved: /Successfully/i, deleted: /Custom field deleted successfully/i,
  },
  userlevel: {
    title: 'User Level', route: '/user-levels', opener: /^\s*Add Level\s*$/i, nameInput: '#ul-name-input',
    saved: null /* this page shows no toast on save */, deleted: null,
  },
};

class MasterListPage {
  /** @param {import('@playwright/test').Page} page  @param {keyof typeof MASTERS} key */
  constructor(page, key) {
    this.page = page;
    this.cfg = MASTERS[key];
    if (!this.cfg) throw new Error(`unknown master "${key}"`);
    this.writes = [];
    this.pageErrors = [];
    page.on('pageerror', (e) => { if (!/removeEventListener/.test(e.message) && !this.pageErrors.includes(e.message)) this.pageErrors.push(e.message); });
    page.on('request', (r) => {
      const u = r.url();
      const p = u.replace(BASE, '');
      // any non-GET app call that is not a read (the app uses POST for lists and counts too)
      if (u.startsWith(BASE) && !['GET', 'HEAD', 'OPTIONS'].includes(r.method()) && /^\/api\//.test(p) && !/\/(get|list|search|count|negotiate|notification)[\w-]*/i.test(p)) this.writes.push(`${r.method()} ${p}`);
    });
  }

  async goto() {
    const { page } = this;
    await page.goto(`${BASE}${this.cfg.route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (await dismissRateLimit(page)) { await page.waitForTimeout(15000); await page.goto(`${BASE}${this.cfg.route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.locator('main table, .main-content table, main .card, .main-content .card').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }

  /** The surface the form lives on: the open modal, or the page itself for inline forms. */
  async openForm() {
    const { page, cfg } = this;
    if (cfg.opener) {
      const before = page.url();
      await page.locator('main button, main a, .main-content button, .main-content a').filter({ hasText: cfg.opener }).filter({ visible: true }).first().click();
      if (cfg.kind === 'page') {
        await page.waitForFunction((u) => location.href !== u, before, { timeout: 15000 });
        await page.locator(cfg.nameInput).waitFor({ state: 'visible', timeout: 15000 });
        return page.locator('main, .main-content').first();
      }
      await expect(page.locator('.modal.show').last(), 'form did not open').toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(800);
      return page.locator('.modal.show').last();
    }
    return page.locator('main, .main-content').first();
  }

  async create(name) {
    const scope = await this.openForm();
    await scope.locator(this.cfg.nameInput).fill(name);
    if (this.cfg.extra) await this.cfg.extra(scope, this.page);
    return this.save(scope);
  }

  /** Click Save, return the toast text. */
  async save(scope) {
    this.writes.length = 0;
    await scope.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Create")').filter({ visible: true }).first().click();
    const toast = await this.toast();
    if (await this.page.locator('.modal.show').count()) await this.page.keyboard.press('Escape');
    return toast;
  }

  async toast() {
    const t = this.page.locator('.swal2-popup, .swal2-toast, .toast').filter({ hasText: /\w/ });
    await t.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    // not the confirmation dialog itself ("Are you sure you want to delete?")
    return (await t.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => !/^Super admin Home/.test(s) && !/are you sure/i.test(s)).join(' | ');
  }

  /** Rows (or cards) that contain this name. Reloads the listing first so the check is against the server. */
  async rows(name, { reload = true } = {}) {
    const { page, cfg } = this;
    if (reload) await this.goto();
    if (cfg.search) { const box = page.locator(cfg.search); await box.fill(name); await box.press('Enter'); await page.waitForTimeout(2200); }   // searches run on Enter
    else if (await page.locator('#page_size').count()) { await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(1500); }
    return page.locator('table tbody tr').filter({ hasText: name });
  }

  /** Open the edit form of the row, rename it, save. */
  async rename(name, newName) {
    const row = (await this.rows(name)).first();
    await row.locator(PENCIL).first().click();
    await this.page.waitForTimeout(1500);
    const inModal = this.cfg.opener && this.cfg.kind !== 'page';
    const scope = inModal ? this.page.locator('.modal.show').last() : this.page.locator('main, .main-content').first();
    const input = scope.locator(this.cfg.nameInput);
    await expect(input, 'edit form did not load the record').toHaveValue(new RegExp(name), { timeout: 10000 });
    await input.fill(newName);
    return this.save(scope);
  }

  /** Edit without renaming (for masters whose name is locked): open the row's edit form, change something else, save. */
  async editInPlace(name) {
    const row = (await this.rows(name)).first();
    await row.locator(PENCIL).first().click();
    await this.page.waitForTimeout(1500);
    const inModal = this.cfg.opener && this.cfg.kind !== 'page';
    const scope = inModal ? this.page.locator('.modal.show').last() : this.page.locator('main, .main-content').first();
    await expect(scope.locator(this.cfg.nameInput), 'edit form did not load the record').toHaveValue(new RegExp(name), { timeout: 10000 });
    await this.cfg.editExtra(scope, this.page);
    return this.save(scope);
  }

  /** Delete the row for exactly this name (confirm dialog included). Returns the toast text. */
  async remove(name) {
    const row = (await this.rows(name)).first();
    await row.locator(BIN).first().click();
    const dlg = this.page.locator('.swal2-popup:visible, .modal.show:visible').first();
    await expect(dlg, 'no delete confirmation').toContainText(/delete|remove/i, { timeout: 8000 });
    this.writes.length = 0;
    await this.page.locator(CONFIRM).first().click();
    await this.page.locator('.swal2-popup:visible').filter({ hasText: /are you sure/i }).first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    return this.toast();
  }

  /** Best-effort removal of everything a test created. Never throws. */
  async cleanup(...names) {
    for (const n of names) {
      try { if (await (await this.rows(n)).count()) await this.remove(n); } catch { /* leave it for the report */ }
    }
  }
}

module.exports = { MasterListPage, MASTERS, BASE };
