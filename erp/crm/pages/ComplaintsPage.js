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
 *
 * Nov 2026 redesign (read live 14 Nov 2026):
 *   /complaints     a List / Board switch; seven tiles (.cmp-tile: Open, In progress, Overdue (SLA), Due in 4 hours,
 *                   Escalated, In team pool, Resolved); "Group by" SLA / Team / Status / Priority; the four inbox
 *                   chips (.cmp-sc, count in span.n); the table (.cmp-table). The Board has the columns Open,
 *                   Assigned, In Progress, Resolved, Closed (.cb-colhead: name + count).
 *   /add-complaint  sections headed by .cmp-ql-h: "Complaint type *" is now a set of choices, not a select (with
 *                   no active type it says "No active complaint types to choose from" and links to
 *                   /complaint-types); Subject * (input.cmp-subject, "0 / 100"); Description (folded behind an
 *                   "Add details" button until it is pressed); Attachments (Record
 *                   voice / Take photo / Attach files); Customer (optional) and Branch * (select); Priority is three
 *                   buttons (Normal active by default); Routing. Buttons: Cancel · Create & log another · Create complaint.
 */
const INBOX = /^(All|My team inbox|Assigned to me|Added by me)\s*\d*$/i;

class ComplaintsPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://test.erp.progbiz.in';
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

  /** The seven tiles above the list: { Open: 0, 'In progress': 0, 'Overdue (SLA)': 0, … }. Empty on the older layout. */
  async tiles() {
    return this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const out = {};
      for (const t of document.querySelectorAll('.cmp-tile')) {
        const k = clean((t.querySelector('.k') || {}).textContent); const v = clean((t.querySelector('.v') || {}).textContent);
        if (k) out[k] = /^\d+$/.test(v) ? Number(v) : v;
      }
      return out;
    });
  }

  /** The inbox chips with their counts: { All: 3, 'My team inbox': 0, 'Assigned to me': 1, 'Added by me': 3 }. */
  async inboxCounts() {
    const out = {};
    for (const t of await this.tabs()) { const m = t.match(/^(.*?)\s*(\d+)$/); if (m) out[m[1].trim()] = Number(m[2]); }
    return out;
  }

  /** Switch /complaints between its List and Board views (Nov 2026). False when the page has no such switch. */
  async setView(view) {
    const btn = this.page.locator('button:visible').filter({ hasText: new RegExp(`^\\s*${view}\\s*$`, 'i') }).first();
    if (!(await btn.count().catch(() => 0))) return false;
    await btn.click({ timeout: 8000 });
    await this.page.waitForTimeout(2500);
    return true;
  }

  /** Board view: the columns with their counts, in order — { Open: 0, Assigned: 0, 'In Progress': 0, Resolved: 0, Closed: 0 }. */
  async boardColumns() {
    return this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const out = {};
      for (const h of document.querySelectorAll('.cb-colhead')) {
        if (!h.getClientRects().length) continue;
        const name = clean((h.querySelector('.fw-semibold') || {}).textContent); const n = clean((h.querySelector('.badge') || {}).textContent);
        if (name) out[name] = /^\d+$/.test(n) ? Number(n) : n;
      }
      return out;
    });
  }

  /** The data rows of the list (the "No complaints found." row is not one). */
  async listRows() {
    return this.page.evaluate(() => [...document.querySelectorAll('table.cmp-table tbody tr, table tbody tr')]
      .filter((r) => r.getClientRects().length && r.querySelectorAll('td').length > 1)
      .map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  }

  /**
   * /add-complaint › "Complaint type *" as the form offers it now:
   *   { kind: 'select' | 'choices' | 'none', options: [names], notice }
   * 'select' is the older form (a dropdown), 'choices' the Nov 2026 form (one button per active type),
   * 'none' when the form says there is no active type to choose from.
   */
  async complaintTypeField() {
    const sel = this.selectAfter('Complaint type');
    if (await sel.count().catch(() => 0)) {
      const options = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
        .filter((o) => o.value && o.value !== '0' && !/^(choose|select)/i.test(o.text)).map((o) => o.text));
      return { kind: options.length ? 'select' : 'none', options, notice: '' };
    }
    return this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const head = [...document.querySelectorAll('.cmp-ql-h')].find((h) => /^complaint type/i.test(clean(h.textContent)));
      if (!head) return { kind: 'missing', options: [], notice: '' };
      // the choices sit between this heading and the next section heading
      const options = []; let notice = '';
      for (let e = head.nextElementSibling; e && !e.classList.contains('cmp-ql-h'); e = e.nextElementSibling) {
        if (/no active complaint types/i.test(e.textContent || '')) notice = clean(e.textContent);
        for (const b of e.matches('button, [role="button"]') ? [e] : e.querySelectorAll('button, [role="button"]')) { const t = clean(b.textContent); if (t) options.push(t); }
      }
      return { kind: options.length ? 'choices' : 'none', options, notice };
    });
  }

  /** Choose the first complaint type the form offers (either form). Returns its name, or '' when there is none. */
  async chooseFirstComplaintType() {
    const f = await this.complaintTypeField();
    if (f.kind === 'select') {
      const sel = this.selectAfter('Complaint type');
      await sel.selectOption({ label: f.options[0] });
      return f.options[0];
    }
    if (f.kind === 'choices') {
      const head = this.page.locator('.cmp-ql-h').filter({ hasText: /^\s*Complaint type/i }).first();
      await head.locator('xpath=following-sibling::*').locator('button, [role="button"]').filter({ hasText: f.options[0] }).first().click({ timeout: 8000 });
      return f.options[0];
    }
    return '';
  }

  /** Priority as the form shows it: { kind: 'select' | 'buttons', options, selected }. */
  async priorityField() {
    // Nov 2026 form: three buttons beside the "Priority" label. Looked for first, because "the select after the
    // label" would otherwise find a dropdown of some hidden dialog further down the page.
    const viaButtons = await this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const label = [...document.querySelectorAll('label')].find((l) => l.getClientRects().length && /^priority$/i.test(clean(l.textContent)));
      const btns = label ? [...label.parentElement.querySelectorAll('button')] : [];
      return { kind: 'buttons', options: btns.map((b) => clean(b.textContent)), selected: clean((btns.find((b) => b.classList.contains('active')) || {}).textContent) };
    });
    if (viaButtons.options.length) return viaButtons;
    const sel = this.selectAfter('Priority');
    if (await sel.count().catch(() => 0)) {
      return { kind: 'select', options: (await sel.locator('option').allTextContents()).map((o) => o.trim()), selected: await sel.evaluate((e) => (e.options[e.selectedIndex] || {}).text || '') };
    }
    return { kind: 'missing', options: [], selected: '' };
  }

  /** Nov 2026 form: the Description box is folded behind an "Add details" button. Open it (no-op when it is already open or absent). */
  async expandDetails() {
    if (await this.description.isVisible().catch(() => false)) return true;
    const btn = this.page.locator('button:visible').filter({ hasText: /^\s*Add details\s*$/i }).first();
    if (!(await btn.count().catch(() => 0))) return false;
    await btn.click({ timeout: 8000 }).catch(() => {});
    await this.description.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    return this.description.isVisible().catch(() => false);
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
    // Complaint type: a dropdown on the older form, a set of choices on the Nov 2026 one
    const type = await this.chooseFirstComplaintType().catch(() => '');
    if (type) chosen['Complaint type'] = type;
    await page.waitForTimeout(400);
    for (const label of ['Branch']) {
      const sel = this.selectAfter(label);
      const opt = await sel.locator('option').evaluateAll((os) => os
        .map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
        .find((o) => o.value && o.value !== '0' && !/^(choose|select)/i.test(o.text))).catch(() => null);
      if (opt) { await sel.selectOption(opt.value); chosen[label] = opt.text; }
      await page.waitForTimeout(400);
    }
    // Priority is a dropdown on the older form; on the Nov 2026 form it is three buttons and already on Normal
    if ((await this.priorityField()).kind === 'select') await this.selectAfter('Priority').selectOption({ label: 'Normal' }).catch(() => {});
    await this.subject.fill(name);
    await this.expandDetails();
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
