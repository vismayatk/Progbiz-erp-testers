'use strict';

/**
 * CRM chain — the cross-record behaviour that only shows up when an enquiry is
 * followed through to a quotation.
 *
 * Three things learned the hard way on this build, all encoded here so no spec
 * has to rediscover them:
 *
 *  1. BLAZOR BINDING. Assigning `.value` from page.evaluate and dispatching a
 *     synthetic 'change' does NOT update Blazor's bound model — it reconciles
 *     from its own state, the control silently reverts, and Save fails with no
 *     message. Every control here is driven through Playwright's native
 *     selectOption/fill, which raise the events Blazor binds to.
 *
 *  2. TAB-SCOPED LISTINGS. /leads, /followups and /quotations open on a tab
 *     (In Follow Up, Today's, All), not on an unfiltered set. A new record can
 *     exist and still be absent from the default view, so findAcrossTabs()
 *     walks the tabs before concluding anything is missing.
 *
 *  3. CONVERSION MOVES THE FOLLOW-UP. Once an enquiry becomes a quotation,
 *     #btn-add-followup disappears from the enquiry overview and appears on
 *     /quotation-view instead. That is by design; a spec that keeps looking at
 *     the enquiry will report a false failure.
 */
class CrmChainPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://test.erp.progbiz.in';
    this.addFollowupBtn = page.locator('#btn-add-followup');
    this.followupModal = page.locator('#followupModal.show, .modal.show').first();
  }

  async goto(path) {
    await this.page.goto(`${this.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.page.waitForTimeout(4500);
  }

  /** The dominant visible grid as {columns, rows[][]}. */
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
   * Look for `needle` in a listing across every status tab, raising the page
   * size first so pagination cannot hide it.
   * @returns {Promise<{tab:string,row:string[]}|null>}
   */
  async findAcrossTabs(listingPath, needle) {
    await this.goto(listingPath);
    await this.page.selectOption('#page_size', '100').catch(() => {});
    await this.page.waitForTimeout(3000);

    const onDefault = await this.readGrid();
    const hit = onDefault.rows.find((r) => r.join(' ').includes(needle));
    if (hit) return { tab: '(default view)', row: hit };

    const tabs = await this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return [...document.querySelectorAll('[id^="tab-"], .nav-link, [role="tab"]')]
        .filter(on)
        .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 34) }))
        .filter((b) => b.text && !/switcher|theme/i.test(b.id || ''));
    });

    for (const t of tabs) {
      await this.page.locator(t.id ? `#${t.id}` : `text="${t.text}"`).first()
        .click({ timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(3000);
      await this.page.selectOption('#page_size', '100').catch(() => {});
      await this.page.waitForTimeout(2500);
      const g = await this.readGrid();
      const row = g.rows.find((r) => r.join(' ').includes(needle));
      if (row) return { tab: t.text, row };
    }
    return null;
  }

  /** Is the follow-up control present on the page currently open? */
  async hasFollowupControl() {
    return (await this.addFollowupBtn.count().catch(() => 0)) > 0
      && await this.addFollowupBtn.isVisible().catch(() => false);
  }

  /**
   * Open the Add FollowUp modal and fill it. Returns what was chosen plus
   * whether the modal closed — the caller decides whether that is a pass.
   *
   * Choosing a status conditionally renders a required "Lead Quality*" select,
   * so it must be filled AFTER the status, never before.
   */
  async addFollowup(recordPath, { nextFollowupDate = null, dateNotRequired = false } = {}) {
    const page = this.page;
    const out = { opened: false, status: null, leadQuality: null, saved: false, detail: '', dateDefault: null, dateMin: null };

    await this.goto(recordPath);
    if (!(await this.hasFollowupControl())) {
      out.detail = '#btn-add-followup not present on this record';
      return out;
    }
    await this.addFollowupBtn.click({ timeout: 10000 });
    await page.waitForTimeout(3500);
    out.opened = await this.followupModal.count().catch(() => 0) > 0;
    if (!out.opened) { out.detail = 'modal did not open'; return out; }

    const m = this.followupModal;
    const realOptions = (loc) => loc.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
        .filter((o) => o.value && o.value !== '0' && !/^choose|create new/i.test(o.text)));

    const status = m.locator('#followup-status');
    if (await status.count().catch(() => 0)) {
      const opts = await realOptions(status);
      if (opts.length) { await status.selectOption(opts[0].value); out.status = opts[0].text; }
    }

    // Required, and only rendered once a status is chosen.
    await page.waitForTimeout(1500);
    const quality = m.locator('#lead-quality');
    if (await quality.count().catch(() => 0)) {
      const opts = await realOptions(quality);
      if (opts.length) {
        await quality.selectOption(opts[0].value).catch(() => {});
        out.leadQuality = opts[0].text;
      }
    }

    // CH-F1 root cause: the modal pre-fills #next-followup-date with "now" but
    // sets min to "now + 1 min", so the form is invalid on open and the browser
    // blocks the submit before Blazor runs. Record that state as evidence, and
    // let the caller choose a real date (or tick "Not Required") to get past it.
    const date = m.locator('#next-followup-date');
    if (await date.count().catch(() => 0)) {
      const d = await date.evaluate((e) => ({ value: e.value, min: e.min, valid: e.validity.valid }));
      out.dateDefault = d.value; out.dateMin = d.min; out.dateValidOnOpen = d.valid;
      if (nextFollowupDate) await date.fill(nextFollowupDate).catch(() => {});
      else if (dateNotRequired) await m.locator('label:has-text("Not Required") input[type=checkbox], input[type=checkbox]').first().check().catch(() => {});
    }

    await m.locator('#business-value').fill('12345').catch(() => {});
    await m.locator('#followup-description')
      .fill('Automated chain follow-up — safe to delete').catch(() => {});
    await page.waitForTimeout(1200);

    // Watch the wire: a Save that issues no request is blocked client-side,
    // which is what separates "validation refused it" from "the button is dead".
    const posts = [];
    const onReq = (r) => { if (r.method() === 'POST') posts.push(r.url().split('?')[0].slice(-50)); };
    page.on('request', onReq);
    // Strict id: the modal also holds a hidden "Save" for the create-new-option
    // flow, and button:has-text("Save").first() picks that one and times out.
    await m.locator('#btn-save-followup').click({ timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(7000);
    page.off('request', onReq);

    const st = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return {
        stillOpen: !!document.querySelector('.modal.show'),
        alert: clean([...document.querySelectorAll('.swal2-popup,.toast,.alert')]
          .map((e) => e.innerText).join(' | ')).slice(0, 160),
        validation: [...document.querySelectorAll('.invalid-feedback,.is-invalid,.validation-message')]
          .map((e) => clean(e.innerText)).filter((t) => t && t.length < 80).slice(0, 4),
      };
    });

    out.saved = !st.stillOpen;
    out.postCount = posts.length;
    out.detail = `status="${out.status}" quality="${out.leadQuality}" `
      + `date=${out.dateDefault} min=${out.dateMin} validOnOpen=${out.dateValidOnOpen} `
      + `modalClosed=${out.saved} POSTs=${posts.length} `
      + `alert="${st.alert.slice(0, 50)}" validation=${JSON.stringify(st.validation)}`;
    return out;
  }

  /**
   * Home page counters, read by label.
   *
   * As of the 2026-09-18 re-audit the Home page's four summary cards are
   * task-oriented — "Pending Tasks", "Delayed Tasks", "Completed Tasks",
   * "Unscheduled" — not the CRM-lead cards ("New Leads", "Followups",
   * "Delayed", "Completed") this used to read. That old label set matched
   * nothing (`homeCounters()` returned all-null, silently), which is exactly
   * the kind of drift a body-text regex can't self-report — the labels
   * changed, "New Leads"/"Followups" don't exist on Home at all any more,
   * and a CRM enquiry/follow-up is not expected to move a *task* counter, so
   * callers should treat these as informational, not as the primary signal.
   * Today's Schedule (below) is the one that actually reflects a new CRM
   * record and is what CH-10 gates on.
   */
  async homeCounters() {
    await this.goto('/home');
    await this.page.waitForTimeout(2000);
    return this.page.evaluate(() => {
      const body = (document.body.innerText || '').replace(/\s+/g, ' ');
      const pick = (label) => {
        const m = body.match(new RegExp(label + '\\s+(\\d[\\d,]*)', 'i'));
        return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
      };
      return {
        pendingTasks: pick('Pending Tasks'), delayedTasks: pick('Delayed Tasks'),
        completedTasks: pick('Completed Tasks'), unscheduled: pick('Unscheduled'),
        // NOT truncated: a busy tenant can carry many entries, and slicing
        // here silently hides the record a caller is looking for.
        scheduleText: (() => {
          const c = [...document.querySelectorAll('.card, section')]
            .find((x) => /today'?s schedule/i.test(x.innerText || ''));
          return c ? (c.innerText || '').replace(/\s+/g, ' ').trim() : '';
        })(),
      };
    });
  }
}

module.exports = { CrmChainPage };
