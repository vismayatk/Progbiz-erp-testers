'use strict';

/**
 * Complaints — new module, first seen in the 2026-09-18 re-audit (absent from
 * the 2026-09-07 nav crawl). Ticket-style: /complaints lists them under four
 * inbox buttons (All / My team inbox / Assigned to me / Added by me), "New
 * complaint" opens the full-page /add-complaint form (not a modal), and Save is
 * "Create complaint". A complaint also becomes a "Complaint" task in My Tasks
 * whose action opens /complaint-detail/{id}.
 *
 * /add-complaint, as read live on 2026-09-18 — no ids on any control:
 *   select   "Complaint type *"      (Choose / Plant not working …)   required
 *   select   "Branch *"              (Choose / Kannur / Kasargod)     required
 *   input    "Subject *"             ph "Short summary of the complaint"  required
 *   textarea "Description"           ph "Details"
 *   select   "Priority"              (Normal / Medium / High)
 *   input    "Customer (optional)"   ph "Search a customer to tag"  (+ search icon)
 *   buttons  Cancel · Create complaint
 * Selects are found by their label (`label → following::select[1]`) and driven
 * with native selectOption/fill: this is a Blazor form, and assigning `.value`
 * in page.evaluate does not reach Blazor's bound model.
 */
const INBOX = /^(All|My team inbox|Assigned to me|Added by me)\s*\d*$/i;

class ComplaintsPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';
    this.rows    = page.locator('table tbody tr');
    this.subject     = page.locator('input[placeholder="Short summary of the complaint"]');
    this.description = page.locator('textarea[placeholder="Details"]');
    this.createBtn   = page.locator('button', { hasText: /^\s*Create complaint\s*$/i });
  }

  /** The select that follows a visible label starting with `text`. */
  selectAfter(text) {
    return this.page.locator('label:visible').filter({ hasText: new RegExp(`^\\s*${text}`, 'i') })
      .first().locator('xpath=following::select[1]');
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/complaints`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.page.waitForTimeout(3500);
  }

  async gotoNew() {
    await this.page.goto(`${this.baseUrl}/add-complaint`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.page.waitForTimeout(3500);
  }

  /** The inbox buttons on /complaints, e.g. "All 6", "My team inbox 0". */
  async tabs() {
    const labels = await this.page.locator('button:visible, a:visible').allInnerTexts().catch(() => []);
    return labels.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => INBOX.test(t));
  }

  /** Describe /add-complaint's form so a caller can see what changed if this breaks. */
  async describeForm() {
    return this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
      const label = (e) => clean(e.closest('.form-group,.mb-3,.mb-2,.col,.col-md-6,.col-md-4,.col-12,div')?.querySelector('label')?.innerText || e.placeholder || '');
      return {
        controls: [...document.querySelectorAll('input,select,textarea')].filter(on).filter((e) => !['hidden', 'submit', 'button', 'file'].includes(e.type))
          .map((e) => ({ tag: e.tagName, type: e.type || null, label: label(e), required: e.required, options: e.tagName === 'SELECT' ? [...e.options].map((o) => clean(o.text)).slice(0, 6) : undefined })),
        buttons: [...document.querySelectorAll('button, a.btn')].filter(on).map((b) => clean(b.innerText)).filter(Boolean),
      };
    });
  }

  /**
   * Fill /add-complaint and submit. Sets the two required selects (Complaint
   * type, Branch) to their first real option, Subject to `name` (prefixed
   * QA_ by the caller), a Description, and Priority "Normal". Customer is
   * optional and left untagged — the save/data-flow under test doesn't need
   * it, and leaving it out keeps a customer's record free of test complaints.
   * Returns { submitted, chosen, navigated, posts, alert, validation } so the
   * spec decides pass/fail without this page object guessing at severity.
   */
  async create(name) {
    const page = this.page;
    await this.gotoNew();

    const chosen = {};
    for (const label of ['Complaint type', 'Branch']) {
      const sel = this.selectAfter(label);
      const opt = await sel.locator('option').evaluateAll((os) => os
        .map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
        .find((o) => o.value && o.value !== '0' && !/^(choose|select)/i.test(o.text))).catch(() => null);
      if (opt) { await sel.selectOption(opt.value); chosen[label] = opt.text; }
      await page.waitForTimeout(400);
    }
    await this.selectAfter('Priority').selectOption({ label: 'Normal' }).catch(() => {});
    await this.subject.fill(name);
    await this.description.fill(`Automated element-audit complaint — safe to delete (${name})`).catch(() => {});
    await page.waitForTimeout(600);

    const before = page.url();
    const reqs = [];
    const onReq = (r) => { if (/\/api\//.test(r.url()) && ['POST', 'PUT'].includes(r.method())) reqs.push(r.url().split('?')[0].slice(-60)); };
    page.on('request', onReq);
    const submitted = await this.createBtn.first().click({ timeout: 12000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(6000);
    page.off('request', onReq);

    const after = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return {
        alert: clean([...document.querySelectorAll('.swal2-popup,.toast,.alert')].map((e) => e.innerText).join(' | ')).slice(0, 160),
        validation: [...document.querySelectorAll('.validation-message,.invalid-feedback,.text-danger,.field-validation-error')].map((e) => clean(e.innerText)).filter((t) => t && t.length < 100).slice(0, 6),
      };
    });
    await page.locator('.swal2-confirm').click({ timeout: 1500 }).catch(() => {});

    return {
      submitted, chosen, posts: reqs,
      navigated: page.url() !== before && !/\/add-complaint/.test(page.url()),
      alert: after.alert, validation: after.validation,
    };
  }

  /** Search every inbox on /complaints for a name; returns { tab, row } or null. */
  async findAcrossTabs(needle) {
    await this.goto();
    const scan = async () => {
      await this.page.selectOption('#page_size', '100').catch(() => {});
      await this.page.waitForTimeout(1500);
      const rows = await this.page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
      return rows.find((r) => r.includes(needle)) || null;
    };
    let hit = await scan();
    if (hit) return { tab: '(default view)', row: hit };

    for (const label of await this.tabs()) {
      await this.page.locator('button:visible, a:visible').filter({ hasText: new RegExp(`^\\s*${label.replace(/\s*\d+$/, '')}\\s*\\d*\\s*$`, 'i') })
        .first().click({ timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(2500);
      hit = await scan();
      if (hit) return { tab: label, row: hit };
    }
    return null;
  }
}

module.exports = { ComplaintsPage };
