'use strict';

/**
 * Base page object for all HRMS pages.
 * Encapsulates the SPA shell: navigation, settle-waits, page header,
 * breadcrumb, action buttons, data-grid helpers and modal helpers.
 */
class BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} [route] default route for goto()
   */
  constructor(page, route = '') {
    this.page = page;
    this.route = route.replace(/^\//, '');
    this.baseUrl = process.env.HRMS_BASE_URL || 'https://hrms-erp.progbiz.in';

    // App shell — captured skeleton (hrms/data/nav.json): body > #app > .page >
    // header.app-header + aside#sidebar.app-sidebar + div.main-content.app-content.
    // The content region must NEVER contain the sidebar, or tab()/button()
    // lookups leak into side-menu links; hasNot guards against wrapper matches.
    this.sidebar    = page.locator('aside, [class*="app-sidebar" i], [class*="side-menu" i]').first();
    this.main       = page.locator('main, .main-content, [class*="content-wrapper" i], [class*="page-content" i]')
                          .filter({ hasNot: page.locator('aside, [class*="app-sidebar" i], [class*="side-menu" i]') })
                          .first();
    this.pageTitle  = this.main.locator('h1, .page-title, [class*="page-header" i] h2, h2').first();
    this.breadcrumb = this.main.locator('.breadcrumb, [class*="breadcrumb" i], nav[aria-label="breadcrumb"]').first();
    // First visible data grid on the page
    this.grid       = this.main.locator('table').first();
    this.gridHeaders = this.grid.locator('thead th, thead td');
    this.gridRows    = this.grid.locator('tbody tr');
    // Generic modal (bootstrap-style)
    this.modal      = page.locator('.modal.show, .modal[style*="display: block"], [role="dialog"]:visible').first();
    // SweetAlert2 popup — this build raises swal validation/confirm dialogs whose
    // backdrop (.swal2-backdrop-show) covers the page and blocks clicks beneath.
    this.swal       = page.locator('.swal2-container');
  }

  /** Navigate to this page's route (or an explicit one) and wait until the SPA settles. */
  async goto(route = this.route) {
    await this.page.goto(`${this.baseUrl}/${route.replace(/^\//, '')}`, {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    await this.waitReady();
    // If the session expired the SPA bounces to /login — surface that clearly.
    if (this.page.url().includes('/login')) {
      throw new Error(`Not authenticated — bounced to /login while opening /${route}`);
    }
  }

  /** Wait for network-idle plus any "Loading…" placeholder to clear. */
  async waitReady() {
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await this.page.waitForFunction(
      () => !/loading/i.test((document.body.innerText || '').slice(0, 500)),
      { timeout: 15000 },
    ).catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** A visible button (or link styled as one) in the content area by accessible name. */
  button(name) {
    return this.main.locator('button, a.btn, [role="button"]')
      .filter({ hasText: typeof name === 'string' ? new RegExp(`^\\s*${escapeRe(name)}\\s*$`, 'i') : name })
      .first();
  }

  /** Loose variant — matches buttons whose text CONTAINS the given name. */
  buttonContaining(name) {
    return this.main.locator('button, a.btn, [role="button"]')
      .filter({ hasText: typeof name === 'string' ? new RegExp(escapeRe(name), 'i') : name })
      .first();
  }

  /** Tab item by text (nav-tabs / pills / role=tab). */
  tab(name) {
    return this.main.locator('[role="tab"], .nav-tabs a, .nav-tabs button, .nav-pills a, .nav-pills button')
      .filter({ hasText: new RegExp(escapeRe(name), 'i') })
      .first();
  }

  /** Text of all header cells of the first grid. */
  async gridHeaderTexts() {
    const n = await this.gridHeaders.count();
    const out = [];
    for (let i = 0; i < n; i++) out.push((await this.gridHeaders.nth(i).innerText()).trim());
    return out.filter(Boolean);
  }

  /** Fill an ng-select / native select / input identified by placeholder, name or id. */
  input(hint) {
    return this.main.locator(
      `input[placeholder*="${hint}" i], input[name*="${hint}" i], input[id*="${hint}" i], ` +
      `select[name*="${hint}" i], select[id*="${hint}" i], textarea[name*="${hint}" i], textarea[id*="${hint}" i]`,
    ).first();
  }

  /** Assert-friendly: does the content area currently show this text? */
  async containsText(text) {
    const body = await this.main.innerText().catch(() => '');
    return new RegExp(escapeRe(text), 'i').test(body);
  }

  /**
   * Best-effort dismissal of the open modal WITHOUT saving:
   * close X → Cancel/Close text button → Escape, retried once, waiting for
   * the modal to hide after each attempt. Shared by every POM so the dismiss
   * selector chain lives in ONE place.
   * NOTE: the crawl never captured an open modal, so these selectors are
   * guarded fallbacks (bootstrap conventions), not crawl-verified captures.
   * Callers with a non-modal (inline/panel) variant must follow up with their
   * own editor-visible check and reload the route if it is still open.
   */
  /**
   * Dismiss an open SweetAlert2 popup (OK/confirm-style validation alerts)
   * WITHOUT accepting any destructive action: prefers the visible Cancel/close,
   * falls back to the confirm button only for plain OK alerts, then Escape.
   */
  async dismissSweetAlert() {
    if (!await this.swal.isVisible().catch(() => false)) return;
    const cancel = this.swal.locator('.swal2-cancel:visible, .swal2-close:visible').first();
    if (await cancel.count()) await cancel.click().catch(() => {});
    else {
      const ok = this.swal.locator('.swal2-confirm:visible').first();
      if (await ok.count()) await ok.click().catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
    }
    await this.swal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async dismissModal() {
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
  }
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = { BasePage, escapeRe };
