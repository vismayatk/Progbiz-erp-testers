'use strict';

/**
 * Client Settings ("Tenant Settings") — /client-setting
 *
 * Three collapsible sections, each saved by its own button:
 *   Enquiry Settings           #collapseOne          #enq-settings-save-btn
 *   Quotation Settings         #collapseTwo          #quot-settings-save-btn
 *   Monitoring Agent Settings  #collapseMonitoring   #mon-settings-save-btn
 * Every option is a plain input / select / textarea with a stable id
 * (enq-need-lead-quality, quot-payment-term, achievement-basis, …).
 *
 * CHANGING SETTINGS: allowed on onetouch_test only, and only as
 * change → check → restore. Specs must go through withSettings(), which
 * records the whole section first, applies the change, runs the check, and
 * restores every option of the section in `finally` — so a failing check
 * still leaves the tenant as it was.
 */
const { dismissRateLimit } = require('../../common/helpers');

const SECTIONS = {
  enquiry:    { title: /Enquiry Settings/i,          body: '#collapseOne',        save: '#enq-settings-save-btn' },
  quotation:  { title: /Quotation Settings/i,        body: '#collapseTwo',        save: '#quot-settings-save-btn' },
  monitoring: { title: /Monitoring Agent Settings/i, body: '#collapseMonitoring', save: '#mon-settings-save-btn' },
};
const ALLOWED_TENANTS = ['onetouch_test'];
// Never flipped by automation without asking: AI Call Analysis spends AI wallet
// tokens; Monitoring Agent settings drive the desktop agent on real machines.
const PROTECTED = /^(enable-ai-call-analysis|mon-)/;

class ClientSettingsPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://test.erp.progbiz.in';
    this.company = process.env.COMPANY_CODE || 'onetouch_test';
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/client-setting`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // the tenant throttles bursts ("Too many requests"): dismiss, back off, and reload once
    if (await dismissRateLimit(this.page)) {
      await this.page.waitForTimeout(15000);
      await this.page.goto(`${this.baseUrl}/client-setting`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    }
    await this.page.locator(SECTIONS.enquiry.save).waitFor({ state: 'attached', timeout: 30000 });
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    // values arrive after the form shell; wait until a known switch reflects data
    await this.page.waitForTimeout(1200);
  }

  /** Which section (enquiry / quotation / monitoring) holds this option. */
  async sectionOf(id) {
    for (const [name, s] of Object.entries(SECTIONS)) {
      if (await this.page.locator(`${s.body} #${id}`).count()) return name;
    }
    throw new Error(`Client Settings has no option #${id}`);
  }

  async expand(section) {
    const s = SECTIONS[section];
    const body = this.page.locator(s.body);
    if (!(await body.evaluate((e) => e.classList.contains('show')))) {
      await this.page.locator('.accordion-button').filter({ hasText: s.title }).click();
      await body.and(this.page.locator('.show')).waitFor({ state: 'visible', timeout: 10000 });
      await this.page.waitForTimeout(400);   // collapse animation
    }
  }

  /** Current value: boolean for switches, option text for dropdowns, string otherwise. */
  async get(id) {
    return this.page.locator(`#${id}`).evaluate((e) => (e.type === 'checkbox' ? e.checked
      : e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).text?.trim() : e.value));
  }

  /** Every option of a section, by id. */
  async readSection(section) {
    return this.page.locator(SECTIONS[section].body).evaluate((root) => {
      const o = {};
      for (const e of root.querySelectorAll('input[id], select[id], textarea[id]')) {
        if (['button', 'submit', 'hidden', 'reset'].includes(e.type)) continue;
        o[e.id] = e.type === 'checkbox' ? e.checked : e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).text?.trim() : e.value;
      }
      return o;
    });
  }

  async set(id, value) {
    const el = this.page.locator(`#${id}`);
    const kind = await el.evaluate((e) => (e.type === 'checkbox' ? 'switch' : e.tagName === 'SELECT' ? 'select' : 'text'));
    if (kind === 'switch') {
      if ((await el.isChecked()) !== Boolean(value)) await el.click();
    } else if (kind === 'select') {
      await el.selectOption({ label: String(value) });
    } else {
      await el.fill(String(value ?? ''));
    }
  }

  /** Click the section's Save and wait for the app to confirm. */
  async save(section) {
    const btn = this.page.locator(SECTIONS[section].save);
    await btn.scrollIntoViewIfNeeded();
    const saved = this.page.waitForResponse((r) => r.request().method() !== 'GET' && /\/api\//.test(r.url()), { timeout: 20000 })
      .catch(() => null);
    await btn.click();
    if (await dismissRateLimit(this.page)) {   // throttled: wait, then click Save again
      await this.page.waitForTimeout(15000);
      await btn.click();
    }
    const res = await saved;
    if (res && res.status() >= 400) throw new Error(`Saving ${section} settings failed: HTTP ${res.status()} ${res.url()}`);
    // the app confirms with a toast, e.g. "Enquiry settings saved successfully"
    await this.page.locator('.swal2-toast').filter({ hasText: /saved successfully/i }).first()
      .waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(500);
  }

  /**
   * Apply { id: value } (ids may span sections), save each touched section, then
   * reload and check every value stuck. Returns nothing; throws if a value didn't save.
   */
  async apply(values) {
    const bySection = {};
    for (const [id, v] of Object.entries(values)) (bySection[await this.sectionOf(id)] ||= {})[id] = v;
    for (const [section, vals] of Object.entries(bySection)) {
      await this.expand(section);
      for (const [id, v] of Object.entries(vals)) await this.set(id, v);
      await this.save(section);
    }
    await this.goto();
    const wrong = [];
    for (const [id, v] of Object.entries(values)) {
      const now = await this.get(id);
      if (String(now) !== String(v)) wrong.push(`${id}: wanted ${v}, got ${now}`);
    }
    if (wrong.length) throw new Error(`Client Settings did not save: ${wrong.join('; ')}`);
  }

  /**
   * Change settings, run `check`, restore. The restore covers every option of each
   * touched section (a "Require" switch can flip its "Need" partner), and runs in
   * `finally`, so a failing check never leaves the tenant changed.
   *
   *   await settings.withSettings({ 'is-business-value': true }, async () => { … });
   */
  async withSettings(values, check) {
    if (!ALLOWED_TENANTS.includes(this.company)) {
      throw new Error(`Client Settings changes are only allowed on ${ALLOWED_TENANTS.join(', ')} (tenant is ${this.company})`);
    }
    const blocked = Object.keys(values).filter((id) => PROTECTED.test(id));
    if (blocked.length) throw new Error(`Not changed without asking the QA lead: ${blocked.join(', ')}`);

    await this.goto();
    const sections = [...new Set(await Promise.all(Object.keys(values).map((id) => this.sectionOf(id))))];
    const before = {};
    for (const s of sections) Object.assign(before, await this.readSection(s));
    const changing = Object.fromEntries(Object.entries(values).filter(([id, v]) => String(before[id]) !== String(v)));
    try {
      if (Object.keys(changing).length) await this.apply(changing);
      return await check();
    } finally {
      await this.restore(before, sections);
    }
  }

  async restore(before, sections) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.goto();
      const now = {};
      for (const s of sections) Object.assign(now, await this.readSection(s));
      const diff = Object.fromEntries(Object.keys(before).filter((id) => String(before[id]) !== String(now[id])).map((id) => [id, before[id]]));
      if (!Object.keys(diff).length) return;
      try { await this.apply(diff); return; } catch (e) {
        if (attempt === 2) throw new Error(`RESTORE FAILED — fix by hand on ${this.company} /client-setting: ${JSON.stringify(diff)} (${e.message})`);
      }
    }
  }
}

module.exports = { ClientSettingsPage, SECTIONS };
