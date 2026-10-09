'use strict';

/**
 * FormKit — label-anchored form helpers for the HRMS Blazor build.
 *
 * Many create/request forms on hrms-test render fields with NO stable id or name;
 * the only reliable anchor is the visible label (e.g. "Email *") or a known option
 * text inside a <select> (e.g. "Male"). These helpers find the control from those
 * anchors, fill/select it, wait for Blazor's async cascades, and assert the value
 * stuck — the same discipline as EmployeesPage but reusable by every module POM.
 *
 * All helpers are scope-aware: pass the open modal/dialog locator as `scope` so an
 * ambiguous field matches the form you mean, not a filter select on the list page.
 *
 * Usage: `const fk = new FormKit(page);`  then `fk.fieldByLabel(scope, 'Email')`.
 */
const { test, expect } = require('@playwright/test');

/**
 * Wait up to `timeout` ms for `locator` to become visible; resolve true/false.
 * NOTE: Playwright's `locator.isVisible({ timeout })` IGNORES the timeout and returns
 * immediately — never use it as a wait. Use this instead.
 */
async function waitVisible(locator, timeout = 5000) {
  return locator.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
}

class FormKit {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) { this.page = page; }

  /**
   * Navigate to `url` and wait until the page is genuinely ready to interact with.
   * The HRMS Blazor tenant can be slow and sometimes paints a blank/skeleton shell
   * first, so this: goes to the URL, lets the network settle (best-effort — SignalR
   * never reaches full idle), waits a fixed settle buffer, and — when given a `ready`
   * anchor (CSS selector or text RegExp) — waits for it, reloading up to `tries` times
   * if the page came up empty. Use this instead of a bare `page.goto` before any step.
   *
   * @param {string} url
   * @param {{ready?: string|RegExp, settle?: number, tries?: number, timeout?: number}} opts
   */
  async gotoReady(url, { ready = null, settle = 2500, tries = 3, timeout = 20000 } = {}) {
    for (let attempt = 1; attempt <= tries; attempt++) {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await this.page.waitForTimeout(settle);
      if (/\/login/i.test(this.page.url())) { await this.page.waitForTimeout(2000); continue; }  // auth lapse → retry
      if (!ready) return;
      const loc = ready instanceof RegExp ? this.page.getByText(ready).first() : this.page.locator(ready).first();
      if (await waitVisible(loc, timeout)) return;
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});   // blank/skeleton → re-render
      await this.page.waitForTimeout(settle);
    }
    if (ready) {
      const loc = ready instanceof RegExp ? this.page.getByText(ready).first() : this.page.locator(ready).first();
      await expect(loc, `page ${url} should become ready`).toBeVisible({ timeout });
    }
  }

  /**
   * The open form container (first visible). HRMS create/edit forms open as a
   * Bootstrap modal, a [role=dialog], OR a Bootstrap **offcanvas** slide-in panel
   * (`.offcanvas.show`, e.g. the Recruitment "Add New" candidate panel). All three
   * must be recognised so `scope()` targets the form and field lookups don't leak
   * onto the list/filter bar behind it (which carries look-alike Name/Email/Dept
   * controls and silently corrupts the save).
   */
  openForm() {
    return this.page.locator('.modal.show, .modal[style*="display: block"], [role="dialog"], .offcanvas.show').first();
  }

  /**
   * Resolve the form scope after a launcher click: HRMS create forms are EITHER a
   * modal/dialog OR a routed full page. Waits up to `modalWait` for a modal; if one
   * shows, that is the scope (so label lookups never hit the list behind it); else
   * falls back to the page body (routed form). Pass `ready` (a selector expected in
   * the form) to confirm the form actually rendered before returning.
   */
  async scope({ ready = null, timeout = 15000, modalWait = 12000 } = {}) {
    const modal = this.openForm();
    let hasModal;
    if (ready) {
      // Race: a modal/offcanvas opening vs. the ready control appearing on a routed/inline
      // form — so routed forms don't pay the full modalWait, and slow modals are still caught.
      await Promise.race([
        modal.waitFor({ state: 'visible', timeout: modalWait }),
        this.page.locator(ready).first().waitFor({ state: 'visible', timeout: modalWait }),
      ]).catch(() => {});
      // A generic `ready` (e.g. 'select') can also match a control on the LIST behind the form,
      // winning the race before the modal finishes opening — so allow a short grace for a modal.
      hasModal = await waitVisible(modal, 2500);
    } else {
      hasModal = await waitVisible(modal, modalWait);
    }
    const s = hasModal ? modal : this.page.locator('body');
    if (ready) await expect(s.locator(ready).first(), 'the create form should render').toBeVisible({ timeout });
    return s;
  }

  /**
   * The input/select/textarea that FOLLOWS a label's text in DOM order.
   * `labelText` is a plain substring of the visible label (e.g. "Email", "Name").
   * `tag` restricts the control type ("input" | "select" | "textarea").
   * `scope` defaults to the whole page; pass the open modal to disambiguate.
   *
   * Uses Playwright text matching (browser XPath is 1.0 — no regex functions).
   */
  fieldByLabel(scope, labelText, tag = 'input') {
    const root = scope || this.page;
    // The label element carrying the text, then the next matching control after it.
    return root.getByText(labelText, { exact: false }).first()
      .locator(`xpath=following::${tag}[1]`).first();
  }

  /** A <select> within scope that offers a known option text (anchor). */
  selectWithOption(scope, anchorText) {
    const root = scope || this.page;
    return root.locator('select').filter({ has: this.page.locator('option', { hasText: anchorText }) }).first();
  }

  /** Text of the currently selected option. */
  async picked(sel) {
    return (await sel.locator('option:checked').textContent().catch(() => '') || '').trim();
  }

  /** Native-set a value and fire input+change so Blazor's binding updates (coord input is flaky here). */
  async setInput(locator, value, name) {
    await test.step(`Fill "${name}" = "${value}"`, async () => {
      await expect(locator, `"${name}" visible`).toBeVisible();
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.fill('').catch(() => {});
      await locator.fill(String(value));
      await locator.evaluate(el => el.blur()).catch(() => {});
      await this.page.waitForTimeout(150);
      await expect(locator, `"${name}" holds "${value}"`).toHaveValue(String(value));
    });
  }

  /** Select by exact/loose label on a <select> located however you pass it. */
  async setSelect(sel, label, name, { loose = false } = {}) {
    await test.step(`Select "${name}" = "${label}"`, async () => {
      await expect(sel, `"${name}" select visible`).toBeVisible();
      await expect(sel, `"${name}" enabled`).toBeEnabled({ timeout: 10000 });
      if (loose) {
        const want = String(label).toLowerCase();
        const match = (await sel.locator('option').allTextContents())
          .map(t => t.trim()).find(t => t.toLowerCase().includes(want) && !/^(choose|select|--)/i.test(t));
        expect(match, `an option matching "${label}" for "${name}"`).toBeTruthy();
        await sel.selectOption({ label: match });
      } else {
        await sel.selectOption({ label });
      }
      await this.page.waitForTimeout(150);
      expect((await this.picked(sel)).toLowerCase(), `"${name}" shows "${label}"`).toContain(String(label).toLowerCase());
    });
  }

  /** Wait until a (cascaded) select becomes enabled and has real options, then select. */
  async setCascade(sel, label, name, { index = null, loose = true } = {}) {
    await test.step(`Select "${name}" = "${label ?? `index ${index}`}"`, async () => {
      await expect(sel, `"${name}" visible`).toBeVisible({ timeout: 15000 });
      await expect(sel, `"${name}" becomes enabled`).toBeEnabled({ timeout: 15000 });
      await expect.poll(async () => sel.locator('option').count(),
        { timeout: 15000, message: `"${name}" options should load` }).toBeGreaterThan(1);
      if (index !== null) { await sel.selectOption({ index }); }
      else if (loose) {
        const want = String(label).toLowerCase();
        const match = (await sel.locator('option').allTextContents())
          .map(t => t.trim()).find(t => t.toLowerCase().includes(want) && !/^(choose|select|--|pick)/i.test(t));
        expect(match, `an option matching "${label}" for "${name}"`).toBeTruthy();
        await sel.selectOption({ label: match });
      } else { await sel.selectOption({ label }); }
      await this.page.waitForTimeout(200);
      expect(await this.picked(sel), `"${name}" is set`).not.toMatch(/^(choose|select|--|pick|$)/i);
    });
  }

  /**
   * Robustly pick a cascaded dropdown by the VALUE you want: polls every <select>
   * in `scope` until one currently offers an option containing `text`, then selects
   * it. Immune to label position, modal-vs-body scope, and async cascade loading —
   * the right select is simply the one that offers the value. Use for chained
   * dropdowns whose options load after a parent is chosen.
   */
  async pickByOption(scope, text, name) {
    await test.step(`Select "${name}" ≈ "${text}"`, async () => {
      const want = String(text).toLowerCase();
      const selects = scope.locator('select');
      let idx = -1;
      await expect.poll(async () => {
        const n = await selects.count();
        for (let i = 0; i < n; i++) {
          const opts = (await selects.nth(i).locator('option').allTextContents()).map(o => o.trim());
          if (opts.some(o => o.toLowerCase().includes(want) && !/^(choose|select|--|pick|code|—)/i.test(o))) { idx = i; return true; }
        }
        return false;
      }, { timeout: 15000, message: `a <select> offering "${text}" for "${name}"` }).toBe(true);
      const target = selects.nth(idx);
      const match = (await target.locator('option').allTextContents()).map(t => t.trim())
        .find(t => t.toLowerCase().includes(want) && !/^(choose|select|--|pick|code|—)/i.test(t));
      await target.selectOption({ label: match });
      await this.page.waitForTimeout(250);
      expect((await this.picked(target)).toLowerCase(), `"${name}" is set to ≈ "${text}"`).toContain(want);
    });
  }

  /** Tick a checkbox and assert. */
  async check(chk, name) {
    await test.step(`Enable "${name}"`, async () => {
      await chk.scrollIntoViewIfNeeded().catch(() => {});
      if (!(await chk.isChecked().catch(() => false))) {
        await chk.check().catch(async () => chk.click({ force: true }).catch(() => {}));
      }
      await expect(chk, `"${name}" checked`).toBeChecked();
    });
  }

  /** Upload a file to a file input. */
  async upload(fileInput, filePath, name) {
    await test.step(`Upload "${name}"`, async () => {
      await fileInput.setInputFiles(filePath);
      await this.page.waitForTimeout(300);
    });
  }

  /**
   * Click a Save/Submit button and confirm success. A real success is a toast
   * matching `successRe`, a URL change, OR — ONLY when a modal was actually open
   * before the click — that modal closing. For inline/routed forms (no modal) the
   * modal-close branch is NOT used, so a form that silently fails is caught rather
   * than passed (an inline modal locator is always "hidden" and would otherwise
   * resolve instantly). Pass `requireToast` to demand a success toast specifically.
   */
  async saveAndConfirm(btn, { name = 'Save', successRe = /success|saved|created|added|submitted|scheduled|updated/i, requireToast = false } = {}) {
    return test.step(`${name} and confirm success`, async () => {
      await expect(btn, `"${name}" button visible`).toBeVisible();
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      const hadModal = await this.openForm().isVisible().catch(() => false);
      const beforeUrl = this.page.url();
      await btn.click();
      const races = [
        this.page.getByText(successRe).first().waitFor({ state: 'visible', timeout: 25000 }).then(() => 'toast').catch(() => null),
      ];
      if (!requireToast) {
        races.push(this.page.waitForFunction(u => window.location.href !== u, beforeUrl, { timeout: 25000 }).then(() => 'redirect').catch(() => null));
        if (hadModal) races.push(this.openForm().waitFor({ state: 'hidden', timeout: 25000 }).then(() => 'modal-closed').catch(() => null));
      }
      const how = await Promise.race(races);
      if (how) return how;
      // No positive signal — fail only if a validation error is actually visible;
      // otherwise defer to the caller's persisted-after-reload assertion (the real gate).
      const errs = await this.visibleErrors();
      if (errs) throw new Error(`${name} failed with validation error(s): ${errs}`);
      return 'no-signal';
    });
  }

  /**
   * The primary submit button within `scope`: a button whose text carries a save
   * verb (Save / Create / Submit / Schedule / Publish / Send / Generate / Add /
   * Refer / Raise / Assign / Initiate) and is NOT a cancel/close/back control.
   * Tolerates multi-word labels like "Save Candidate" or "Schedule Interview".
   */
  saveButton(scope, verbRe = /save|create|submit|schedule|publish|send|generate|^add|refer|raise|assign|initiate|upload|apply/i) {
    const negRe = /cancel|close|back|discard|reset|go back|skip|previous|next|filter|clear|search/i;
    return scope.locator('button, a.btn, [role="button"]')
      .filter({ hasText: verbRe })
      .filter({ hasNotText: negRe })
      .last();
  }

  /** Concatenated visible validation/error text (for failure diagnostics). */
  async visibleErrors() {
    const els = this.page.locator('.invalid-feedback, .text-danger, .validation-message, .field-validation-error, .swal2-html-container, [role="alert"]');
    const n = await els.count().catch(() => 0);
    const out = [];
    for (let i = 0; i < Math.min(n, 30); i++) {
      if (await els.nth(i).isVisible().catch(() => false)) {
        const t = (await els.nth(i).innerText().catch(() => '')).trim();
        if (t) out.push(t);
      }
    }
    return out.join(' | ');
  }
}

module.exports = { FormKit, waitVisible };
