'use strict';

/**
 * Asset Management — shared page object.
 *
 * The module's controls have steady ids (asset-entry-*, asset-category-*, asset-view-action-*,
 * asset-action-submit, asset-assign-*, asset-return-*, asset-maint-*, asset-status-*,
 * asset-depreciation-*, asset-bin-restore-*), read live on onetouch_test on 16 Nov 2026, so every
 * helper works by id. Nothing here is tied to tenant data: tests make their own QA_ category,
 * location and assets.
 *
 * Routes: assets, asset-entry(/id), asset-view/id, asset-categories, asset-locations,
 * asset-maintenance, asset-depreciation, asset-recycle-bin, asset-settings (see ROUTES in
 * tests/asset_pages.spec.js for the full list).
 */
const { dismissRateLimit } = require('../../common/helpers');

const BASE = process.env.BASE_URL || 'https://test.erp.progbiz.in';
const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();

class AssetPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.errors = [];      // script errors since the last goto()
    this.calls = [];       // failed app API calls since the last goto()
    page.on('pageerror', (e) => { if (!/Failed to fetch|download '/.test(e.message)) this.errors.push(e.message.split('\n')[0].slice(0, 300)); });
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|mono_download|Failed to fetch/.test(m.text())) this.errors.push(clean(m.text()).slice(0, 300)); });
    page.on('response', (r) => { if (r.status() >= 400 && r.status() !== 429 && /\/api\//.test(r.url())) this.calls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '').split('?')[0]}`); });
  }

  /** Open a route and wait until the page has drawn. Backs off once when the request limit shows. */
  async goto(route, wait = 2500) {
    const page = this.page;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.errors = []; this.calls = [];
      try { await page.goto(`${BASE}/${String(route).replace(/^\//, '')}`, { waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) { if (attempt === 2) throw e; await page.waitForTimeout(8000); continue; }
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(wait);
      if (!(await dismissRateLimit(page, 800))) return;
      await page.waitForTimeout(20000);            // "Too many requests": wait it out and load again
    }
  }

  /** Text of the content area (falls back to the body on pages without one, e.g. Access Denied). */
  async text(max = 4000) {
    const main = this.page.locator('main, .main-content').first();
    const loc = (await main.count()) ? main : this.page.locator('body');
    return clean(await loc.innerText({ timeout: 8000 }).catch(() => '')).slice(0, max);
  }

  /** The open window (Bootstrap modal). */
  modal() { return this.page.locator('.modal.show').last(); }

  /** What the app is saying right now: SweetAlert text and toasts. */
  async said() {
    return (await this.page.locator('.swal2-popup, .toast, .toast-message, [role=alert]').allInnerTexts().catch(() => [])).map(clean).filter(Boolean).join(' | ');
  }

  /** Press the confirm button of an open SweetAlert, if any. */
  async ok() {
    const b = this.page.locator('.swal2-confirm:visible');
    if (await b.count()) { await b.first().click().catch(() => {}); await this.page.waitForTimeout(900); return true; }
    return false;
  }

  /**
   * Set controls by id. Selects take the visible option text (a part of it is enough),
   * checkboxes and radios a boolean, file inputs a path.
   */
  async set(values, root) {
    const base = root || this.page;
    for (const [id, val] of Object.entries(values)) {
      const el = base.locator(`[id="${id}"]`).first();
      await el.waitFor({ state: 'attached', timeout: 15000 });
      const kind = await el.evaluate((e) => `${e.tagName}:${e.type || ''}`);
      if (/^SELECT/.test(kind)) {
        const opts = await el.locator('option').allInnerTexts();
        const o = opts.find((x) => clean(x) === val) || opts.find((x) => clean(x).includes(val));
        if (!o) throw new Error(`#${id} has no option "${val}" (has: ${opts.map(clean).slice(0, 10).join(' / ')})`);
        await el.selectOption({ label: o });
        await this.page.waitForTimeout(500);
      } else if (/checkbox|radio/.test(kind)) {
        if ((await el.isChecked()) !== !!val) await el.click({ force: true });
      } else if (/file/.test(kind)) {
        await el.setInputFiles(val);
      } else {
        await el.fill(String(val));
      }
    }
  }

  /** Click a control by id, wait, and return what the app said plus the calls that failed. */
  async press(id, wait = 2500, root) {
    this.calls = [];
    await (root || this.page).locator(`[id="${id}"]`).first().click();
    await this.page.waitForTimeout(wait);
    return { said: await this.said(), calls: [...this.calls], url: this.page.url().replace(BASE, '') };
  }

  /* ── masters ─────────────────────────────────────────────────────────────── */

  /** Add a category. Returns what the app said ('' when it saved and closed). */
  async addCategory({ code, name, prefix, warranty, life, salvage, serialUnique }) {
    await this.goto('asset-categories');
    await this.page.getByRole('button', { name: /Add Category/ }).click();
    await this.modal().waitFor({ state: 'visible', timeout: 10000 });
    const v = { 'asset-category-code': code, 'asset-category-name': name, 'asset-category-prefix': prefix };
    if (warranty !== undefined) v['asset-category-warranty'] = warranty;
    if (life !== undefined) v['asset-category-useful-life'] = life;
    if (salvage !== undefined) v['asset-category-salvage'] = salvage;
    if (serialUnique) v['asset-category-serial-unique'] = true;
    await this.set(v, this.modal());
    const r = await this.press('asset-category-save', 2500, this.modal());
    const open = await this.page.locator('.modal.show').count();
    await this.ok();
    if (open) await this.page.locator('#asset-category-cancel').click().catch(() => {});
    return { ...r, saved: !open };
  }

  /** Delete a master row by its text (a master in use is deactivated by the app instead). */
  async deleteMasterRow(route, text) {
    await this.goto(route);
    const row = this.page.locator('table tbody tr').filter({ hasText: text }).first();
    if (!(await row.count())) return false;
    await row.locator('button[title=Delete]').click();
    await this.page.waitForTimeout(800);
    await this.ok();
    await this.page.waitForTimeout(1200);
    return true;
  }

  async addLocation({ code, name, branch }) {
    await this.goto('asset-locations');
    await this.page.getByRole('button', { name: /Add Location/ }).click();
    await this.modal().waitFor({ state: 'visible', timeout: 10000 });
    const opts = (await this.modal().locator('#asset-location-branch option').allInnerTexts()).map(clean).filter((o) => o && !/choose/i.test(o));
    await this.set({ 'asset-location-branch': branch || opts[0], 'asset-location-code': code, 'asset-location-name': name }, this.modal());
    const r = await this.press('asset-location-save', 2500, this.modal());
    const open = await this.page.locator('.modal.show').count();
    await this.ok();
    if (open) await this.page.locator('#asset-location-cancel').click().catch(() => {});
    return { ...r, saved: !open };
  }

  /* ── assets ──────────────────────────────────────────────────────────────── */

  /** The first real branch offered on the New Asset form. */
  async firstBranch() {
    const opts = (await this.page.locator('#asset-entry-branch option').allInnerTexts()).map(clean);
    return opts.find((o) => o && !/^choose$/i.test(o));
  }

  /**
   * Fill and save the New Asset form. `fields` are ids without the "asset-entry-" prefix,
   * e.g. { name, category, serial, cost, 'purchase-date': '2026-10-15' }.
   * Returns { saved, id, said, calls }.
   */
  async newAsset(fields) {
    await this.goto('asset-entry', 3000);
    const v = { 'asset-entry-branch': fields.branch || await this.firstBranch() };
    for (const [k, val] of Object.entries(fields)) if (k !== 'branch') v[`asset-entry-${k}`] = val;
    // the category decides which Type / Product / custom fields exist, so set it before the rest
    const first = {}; for (const k of ['asset-entry-branch', 'asset-entry-category']) if (v[k] !== undefined) { first[k] = v[k]; delete v[k]; }
    await this.set(first); await this.page.waitForTimeout(700);
    await this.set(v);
    const r = await this.press('asset-entry-save', 3500);
    const m = /asset-view\/(\d+)/.exec(r.url);
    await this.ok();
    return { saved: !!m, id: m ? Number(m[1]) : null, said: r.said, calls: r.calls };
  }

  async open(id) { await this.goto(`asset-view/${id}`, 2800); }

  /** Asset code shown in the page heading ("Asset IT-0001"). */
  async code() { return clean(await this.page.locator('h1, .page-title').first().innerText()).replace(/^Asset\s+/, ''); }

  /** Names of the action buttons on the asset page, e.g. ['Edit', 'Assign', 'Transfer', …]. */
  async actions() {
    return (await this.page.locator('button[id^="asset-view-action-"]:visible, a[id^="asset-view-action-"]:visible').allInnerTexts()).map(clean).filter(Boolean);
  }

  /** The badges under the asset name: status first, then condition, ownership… */
  async badges() {
    return this.page.evaluate(() => {
      const t = (x) => (x || '').replace(/\s+/g, ' ').trim();
      const h = [...document.querySelectorAll('main .badge, .main-content .badge')].filter((b) => b.offsetParent && !b.closest('table, .nav, .tab-content'));
      return h.map((b) => t(b.innerText)).filter(Boolean);
    });
  }

  /** The "Holder:" text of the summary strip. */
  async holder() { return ((await this.text(1500)).match(/Holder:\s*(.*?)\s*Location:/) || [])[1] || ''; }

  /**
   * Run one of the asset page's actions that open a window (Assign, Transfer, Return, Maintenance,
   * Mark Lost, Mark Found, Mark Damaged, Deactivate, Reactivate): click it, fill the window, submit.
   * Returns { said, calls, open } — `open` is true when the window stayed open (refused).
   */
  async action(name, values = {}) {
    const btn = this.page.locator('button[id^="asset-view-action-"], a[id^="asset-view-action-"]').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
    await btn.click();
    await this.modal().waitFor({ state: 'visible', timeout: 10000 });
    await this.page.waitForTimeout(600);
    // radios first: they decide which other fields the window shows
    const radios = Object.fromEntries(Object.entries(values).filter(([k]) => /-type-\d$/.test(k)));
    const rest = Object.fromEntries(Object.entries(values).filter(([k]) => !/-type-\d$/.test(k)));
    if (Object.keys(radios).length) { await this.set(radios, this.modal()); await this.page.waitForTimeout(700); }
    await this.set(rest, this.modal());
    const r = await this.press('asset-action-submit', 2800, this.modal());
    const open = (await this.page.locator('.modal.show').count()) > 0;
    await this.ok();
    if (open) await this.page.locator('#asset-action-cancel').click().catch(() => {});
    return { ...r, open };
  }

  /** Text of one tab of the asset page (Custody, Maintenance, Finance, History…). */
  async tab(name) {
    await this.page.locator('.nav-tabs .nav-link').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first().click();
    await this.page.waitForTimeout(1500);
    const t = await this.text(9000);
    return t.slice(t.lastIndexOf('History') + 7).trim();
  }

  /** Delete an asset that has no history (the app offers Delete only then). Returns true when it went. */
  async remove(id) {
    await this.open(id);
    const del = this.page.locator('#asset-view-action-delete');
    if (!(await del.count())) return false;
    await del.click();
    await this.page.waitForTimeout(900);
    await this.ok();
    await this.page.waitForTimeout(2000);
    return /\/assets$/.test(this.page.url());
  }

  /**
   * Deactivate an asset (the way to retire one that has a history and so cannot be deleted).
   * It then shows an "Inactive" badge, offers only Reactivate and leaves the register's default view.
   */
  async deactivate(id, remarks = 'Automated test clean-up') {
    await this.open(id);
    if (!(await this.page.locator('#asset-view-action-deactivate').count())) return false;
    const r = await this.action('Deactivate', { 'asset-status-remarks': remarks });
    return !r.open;
  }

  /** Ids of the assets listed on the register right now (rows are <tr id="asset-list-row-ID">). */
  async listedIds() {
    return this.page.locator('tr[id^="asset-list-row-"]').evaluateAll((rs) => rs.map((r) => Number(r.id.replace('asset-list-row-', ''))));
  }

  /** Search the register (default view: active assets only) and return the rows' text. */
  async searchRegister(text) {
    await this.goto('assets', 2500);
    await this.page.locator('#asset-list-filter-search').fill(text);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(2500);
    return this.page.locator('tr[id^="asset-list-row-"]').evaluateAll((rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  }

  /* ── depreciation ────────────────────────────────────────────────────────── */

  /** Preview a month's depreciation (never posts). Returns the preview rows as arrays of cell text. */
  async previewDepreciation(month, branch) {
    await this.goto('asset-depreciation', 3000);
    const opts = (await this.page.locator('#asset-depreciation-branch option').allInnerTexts()).map(clean).filter((o) => o && !/^choose$/i.test(o));
    await this.set({ 'asset-depreciation-branch': branch || opts[0], 'asset-depreciation-kind': 'Depreciation' });
    await this.page.locator('#asset-depreciation-month').fill(month);
    const r = await this.press('asset-depreciation-preview', 3500);
    await this.ok();
    const rows = await this.page.locator('table tbody tr').evaluateAll((rs) => rs.filter((x) => x.offsetParent).map((x) => [...x.querySelectorAll('td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim())));
    return { rows, said: r.said, calls: r.calls };
  }
}

/** yyyy-mm-dd of a date, in local time. */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** "1,715.28" -> 1715.28 */
const num = (s) => Number(String(s).replace(/[^0-9.-]/g, ''));

module.exports = { AssetPage, BASE, clean, iso, num };
