'use strict';

const { expect } = require('@playwright/test');
const path = require('path');
const { FormKit } = require('../FormKit');

/**
 * The CANDIDATE-side pre-boarding portal — a public, token-gated page reached by the URL that HR
 * copies with "Copy Pre-boarding Link" on /offer-acceptance (no login):
 *   https://<host>/candidate-preboarding/<token>
 *
 * It greets "Welcome, <name>" and asks the joiner to submit Basic details (Full name, DOB, Address,
 * Aadhaar, PAN, Emergency contact), Bank details (Bank name, Account holder, Account number, IFSC,
 * Branch) and a nominee/dependent block, plus documents — then Submit. After submission (and HR
 * approval) the page becomes a read-only copy of what was submitted.
 *
 * The exact editable DOM is only present on an un-submitted, still-valid invite, so the fill is
 * deliberately resilient: it sets the fields it can name, then sweeps EVERY remaining required
 * control (text / date / select / file) with a sensible default so validation passes regardless of
 * the precise field set.
 */
class CandidatePreboardingPage {
  constructor(page) {
    this.page = page;
    this.fk = new FormKit(page);
  }

  async open(url) {
    expect(url, 'a candidate-preboarding URL').toMatch(/\/candidate-preboarding\//);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(this.page.locator('h1, h2, h3').filter({ hasText: /Welcome/i }).first(),
      'the candidate "Welcome, …" heading').toBeVisible({ timeout: 30000 });
    // wait for Blazor to hydrate the form controls
    await expect.poll(async () => this.page.locator('input:not([type="hidden"]):not([type="search"]), select, textarea').count(),
      { timeout: 30000, message: 'the pre-boarding form controls should render' }).toBeGreaterThan(3);
    await this.page.waitForTimeout(1200);
  }

  async isReadOnly() {
    const t = await this.page.locator('body').innerText().catch(() => '');
    return /read-only copy|cannot be edited|already (been )?submitted|your details have been approved|thank you/i.test(t);
  }

  /** The visible label text sitting next to each form control, in DOM order (labels aren't `for`-linked). */
  async _labels() {
    return this.page.locator('input:not([type="hidden"]), select, textarea').evaluateAll(els => els.map(e => {
      let labelText = '', node = e;
      for (let up = 0; up < 4 && node; up++) {
        node = node.parentElement; if (!node) break;
        const cand = node.querySelector('label, .form-label, small, span');
        if (cand && cand.innerText && cand.innerText.trim()) { labelText = cand.innerText.trim(); break; }
        if (node.firstChild && node.firstChild.nodeType === 3 && node.firstChild.textContent.trim()) { labelText = node.firstChild.textContent.trim(); break; }
      }
      return labelText.replace(/\s+/g, ' ').trim();
    }));
  }

  /** Map a control's visible label to the right test value (order of checks matters — specific first). */
  _valueForLabel(lab, d) {
    const l = lab.toLowerCase();
    if (/confirm account number/.test(l)) return d.accountNumber;
    if (/account number/.test(l)) return d.accountNumber;
    if (/account holder/.test(l)) return d.accountHolder;
    if (/bank name/.test(l)) return d.bankName;
    if (/ifsc/.test(l)) return d.ifsc;
    if (/branch/.test(l)) return d.branch;
    if (/full name/.test(l)) return d.fullName;
    if (/date of birth|^dob/.test(l)) return d.dob;
    if (/aadhaar/.test(l)) return d.aadhaar;
    if (/pan/.test(l)) return d.pan;
    if (/emergency contact name/.test(l)) return d.emergencyName;
    if (/emergency contact (number|phone)/.test(l)) return d.emergencyPhone;
    if (/age/.test(l)) return d.nomineeAge;
    if (/phone|mobile/.test(l)) return d.nomineePhone;       // nominee phone
    if (/address/.test(l)) return d.address;                  // basic + nominee address
    if (/^name\b|nominee name/.test(l)) return d.nomineeName; // nominee name (plain "Name *")
    return null;
  }

  /**
   * Fill the whole form with valid test data (label-driven; robust to field reordering). Documents
   * are optional on this form, so uploads are best-effort. Leaves the form ready to submit.
   */
  async fill(d) {
    const fs = require('fs');
    // Document uploads accept images only (JPG/JPEG/PNG) — a PDF is rejected and blocks submit.
    const tinyFile = path.join(__dirname, '..', '..', 'fixtures', 'sample-doc.png');
    const controls = this.page.locator('input:not([type="hidden"]), select, textarea');
    const n = await controls.count();
    const labels = await this._labels();

    for (let i = 0; i < n; i++) {
      const el = controls.nth(i);
      const type = await el.evaluate(e => e.type).catch(() => '');
      if (await el.isDisabled().catch(() => true)) continue;
      const lab = labels[i] || '';

      if (type === 'file') {                       // documents — optional; attach best-effort
        if (fs.existsSync(tinyFile)) { await el.setInputFiles(tinyFile).catch(() => {}); await this.page.waitForTimeout(250); }
        continue;
      }
      if (type === 'select-one') {                 // country-code selects (Emergency / Nominee phone)
        const opts = (await el.locator('option').allTextContents()).map(t => t.trim());
        const pick = opts.find(o => /\+91\b/.test(o) || /\bIND\b/.test(o)) || opts.find(o => o && !/^code$/i.test(o) && !/^(--|choose|select)/i.test(o));
        if (pick) await el.selectOption({ label: pick }).catch(() => {});
        continue;
      }
      const val = this._valueForLabel(lab, d);
      if (val == null) continue;
      try {
        await el.scrollIntoViewIfNeeded();
        await el.fill(''); await el.fill(String(val));
        await el.evaluate(e => e.blur()).catch(() => {});
      } catch { /* leave for the dump to reveal */ }
    }
    // let the document uploads (auto-POSTed on selection) finish before submit
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(600);
  }

  /** Dump every form control (for debugging selector mismatches on the real editable form). */
  async dumpControls() {
    const ctrls = await this.page.locator('input, select, textarea').evaluateAll(els => els.map((e, i) => ({
      i, tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', name: e.name || '',
      ph: e.placeholder || '', req: e.required || false, disabled: e.disabled || false,
      val: (e.value || '').slice(0, 20),
      label: (e.labels && e.labels[0] && e.labels[0].innerText.trim().slice(0, 40)) || '',
      opts: e.tagName.toLowerCase() === 'select' ? Array.from(e.options).slice(0, 5).map(o => o.text.trim()) : undefined,
    })));
    console.log('  🔎 CANDIDATE FORM CONTROLS:');
    for (const c of ctrls) console.log('     ', JSON.stringify(c));
    const errs = (await this.page.locator('.invalid-feedback, .text-danger, .validation-message').allTextContents().catch(() => [])).map(t => t.trim()).filter(Boolean);
    if (errs.length) console.log('  🔎 VALIDATION MESSAGES:', JSON.stringify(errs.slice(0, 12)));
  }

  /**
   * Submit the form. Success is keyed off the server accepting the submission
   * (POST /api/preboarding/submit-candidate-preboarding → 2xx), then corroborated by the page's
   * thank-you / read-only state. Returns { ok, status, errors, body }.
   */
  async submit() {
    const btn = this.page.locator('button, a.btn').filter({ hasText: /submit details|^\s*submit\s*$|finish|complete/i })
      .filter({ hasNotText: /cancel|back/i }).last();
    await expect(btn, 'the "Submit details" button').toBeVisible({ timeout: 15000 });
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    const [resp] = await Promise.all([
      this.page.waitForResponse(r => /submit-candidate-preboarding|preboarding\/submit/i.test(r.url()), { timeout: 30000 }).catch(() => null),
      btn.click(),
    ]);
    // handle an optional confirm dialog, then (re)wait for the submit response if it came after
    const dlg = this.page.locator('.swal2-popup:visible, .modal.show:visible, [role="dialog"]:visible').first();
    if (!resp && await dlg.isVisible().catch(() => false)) {
      const ok = dlg.locator('button').filter({ hasText: /confirm|yes|submit|ok|proceed/i }).filter({ hasNotText: /cancel|no/i }).first();
      if (await ok.count()) { await ok.click().catch(() => {}); }
    }
    await this.page.waitForTimeout(1800);
    let status = resp ? resp.status() : null;
    let ok = resp ? resp.ok() : false;
    const body = (await this.page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!ok) ok = /thank you|submitted|success|received|read-only copy|your details have been (submitted|saved|approved)/i.test(body);
    const errs = (await this.page.locator('.text-danger, .invalid-feedback, .validation-message').allTextContents().catch(() => []))
      .map(t => t.trim()).filter(t => t && t !== '*');
    return { ok, status, errors: [...new Set(errs)].slice(0, 8), body: body.slice(0, 200) };
  }
}

module.exports = { CandidatePreboardingPage };
