'use strict';

/**
 * Master — Client Settings effects  (CSE-01 .. CSE-20)
 * /client-setting drives what other pages show. Each test flips ONE option, checks the page it
 * should change, then restores it (ClientSettingsPage.withSettings restores in `finally`, so a
 * failing check still leaves the tenant as it was) and checks the page went back.
 *
 * Observed behaviour (onetouch_test, 13 Oct 2026):
 *   Need Business Value      -> #business-value on /enquiry
 *   Need Lead Quality        -> #lead-quality on /enquiry
 *   Need Lead Source         -> #leadsource on /enquiry     (Require adds "*" to its label)
 *   Need Remark / Place / Quantity -> #enquiry-description / #Place / #new-item-quantity on /enquiry
 *   Repeat Business (B2B)    -> "B2B Dashboard" + "Repeat Accounts" in the sidebar
 *   Quotation Payment Term / Grouping / Quantity -> #paymentterm / #item-group / #item-quantity on /quotation
 *   Quotation Default T&C    -> #terms-and-condition prefilled on /quotation
 * Not covered yet (needs a saved record, ask the product team first): Default Task On Enquiry,
 * Quotation "Need Place", Require Quantity/Remark/Place/Business Value/Lead Quality blocking Save,
 * First Response SLA, Search Only My Own Customers (needs the second user).
 *
 * SAFETY: onetouch_test only. Never touches AI Call Analysis or the Monitoring Agent section
 * (ClientSettingsPage refuses). Runs serially — one admin session on the tenant at a time.
 *
 * Run:  npx playwright test erp/master/tests/client_settings_effects.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { ClientSettingsPage, SECTIONS } = require('../pages/ClientSettingsPage');
const { dismissRateLimit } = require('../../common/helpers');

const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};
const BASE = process.env.BASE_URL || 'https://test.erp.progbiz.in';

// Every option the page had on 13 Oct 2026. A missing id means a setting was removed or renamed.
const KNOWN_OPTIONS = [
  'enq-assign-automatically', 'enq-is-single-assignee', 'list-only-assignable', 'enq-need-lead-source', 'enq-require-lead-source',
  'enq-need-remark', 'enq-require-remark', 'enq-require-followup-description', 'enq-need-quantity', 'enq-require-quantity',
  'enq-need-item-description', 'enq-require-item-description', 'enq-need-place', 'enq-require-place', 'is-business-value',
  'require-business-value', 'enq-need-lead-quality', 'enq-require-lead-quality', 'PreventLeadCreation', 'AllowRepeatBusiness',
  'RestrictCustomerSearchToOwn', 'IncludeCustomFieldInSearch', 'first-response-sla', 'auto-reassign-sla', 'sla-lead-sources',
  'enable-ai-call-analysis', 'achievement-basis', 'default-task-on-enquiry',
  'quot-quantity-in-quotation', 'quot-payment-term', 'grouping-quotation', 'quot-need-place', 'quot-default-terms',
];

// One switch -> one field on one form. shownWhen = the switch value that makes the field appear.
const FIELD_EFFECTS = [
  { id: 'CSE-02', name: 'Need Business Value',    option: 'is-business-value',          form: 'enquiry',   field: '#business-value',       shownWhen: true },
  { id: 'CSE-03', name: 'Need Lead Quality',      option: 'enq-need-lead-quality',      form: 'enquiry',   field: '#lead-quality',         shownWhen: true },
  { id: 'CSE-04', name: 'Need Lead Source',       option: 'enq-need-lead-source',       form: 'enquiry',   field: '#leadsource',           shownWhen: true },
  { id: 'CSE-05', name: 'Need Remark',            option: 'enq-need-remark',            form: 'enquiry',   field: '#enquiry-description',  shownWhen: true },
  { id: 'CSE-06', name: 'Need Place',             option: 'enq-need-place',             form: 'enquiry',   field: '#Place',                shownWhen: true },
  { id: 'CSE-07', name: 'Need Quantity',          option: 'enq-need-quantity',          form: 'enquiry',   field: '#new-item-quantity',    shownWhen: true },
  { id: 'CSE-09', name: 'Quotation Payment Term', option: 'quot-payment-term',          form: 'quotation', field: '#paymentterm',          shownWhen: true },
  { id: 'CSE-10', name: 'Grouping In Quotation',  option: 'grouping-quotation',         form: 'quotation', field: '#item-group',           shownWhen: true },
  { id: 'CSE-11', name: 'Quantity In Quotation',  option: 'quot-quantity-in-quotation', form: 'quotation', field: '#item-quantity',        shownWhen: true },
];
const FORMS = {
  enquiry:   { path: '/enquiry',   ready: '#TxtCustomer' },
  quotation: { path: '/quotation', ready: '#quotation-no' },
};

async function openForm(page, form) {
  // the tenant throttles bursts: back off and reload, up to three times, before waiting for the form
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE}${FORMS[form].path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    if (!(await dismissRateLimit(page))) break;
    await page.waitForTimeout(15000 * (attempt + 1));
  }
  await page.locator(FORMS[form].ready).waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);   // conditional fields draw after the form shell
}
async function expectShown(page, selector, shown, why) {
  const el = page.locator(selector).first();
  if (shown) await expect(el, why).toBeVisible({ timeout: 10000 });
  else await expect(el, why).toBeHidden({ timeout: 10000 });
}

test.describe('Master — Client Settings effects', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
  test.skip(C.company !== 'onetouch_test', 'Client Settings may only be changed on onetouch_test');

  /** @type {Record<string, any>} */
  let startState;
  let settings;
  let page;

  // One login for the whole file: logging in again for every test, plus two saves each, trips
  // the tenant's "Too many requests" throttle.
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    settings = new ClientSettingsPage(page);
  });
  test.afterAll(async () => { await page?.close(); });

  test('CSE-01 | Client Settings lists every known option in its three sections', async () => {
    await settings.goto();
    await expect(page.getByRole('heading', { name: /Tenant Settings/i }).first()).toBeVisible();
    for (const s of Object.values(SECTIONS)) {
      await expect(page.locator('.accordion-button').filter({ hasText: s.title }), `section ${s.title}`).toBeVisible();
      await expect(page.locator(s.save), `Save button ${s.save}`).toBeAttached();
    }
    const missing = [];
    for (const id of KNOWN_OPTIONS) if (!(await page.locator(`#${id}`).count())) missing.push(id);
    expect(missing, `options removed or renamed since 13 Oct 2026: ${missing.join(', ')}`).toEqual([]);
    startState = {};
    for (const name of Object.keys(SECTIONS)) startState[name] = await settings.readSection(name);
  });

  for (const e of FIELD_EFFECTS) {
    test(`${e.id} | ${e.name} ${e.shownWhen ? 'shows' : 'hides'} ${e.field} on ${FORMS[e.form].path}`, async () => {
      await settings.goto();
      const original = Boolean(await settings.get(e.option));
      const flipped = !original;
      await settings.withSettings({ [e.option]: flipped }, async () => {
        await openForm(page, e.form);
        await expectShown(page, e.field, flipped === e.shownWhen, `${e.name} = ${flipped ? 'on' : 'off'}`);
      });
      // restored: the page must be back to how it was before the test
      await openForm(page, e.form);
      await expectShown(page, e.field, original === e.shownWhen, `${e.name} restored to ${original ? 'on' : 'off'}`);
    });
  }

  test('CSE-08 | Require Lead Source marks the Lead Source label as mandatory', async () => {
    await settings.goto();
    const original = Boolean(await settings.get('enq-require-lead-source'));
    const label = () => page.locator('label[for="leadsource"]').first();
    await settings.withSettings({ 'enq-require-lead-source': !original }, async () => {
      await openForm(page, 'enquiry');
      const text = (await label().innerText()).trim();
      expect(/\*/.test(text), `label "${text}" with Require Lead Source ${!original ? 'on' : 'off'}`).toBe(!original);
    });
    await openForm(page, 'enquiry');
    expect(/\*/.test(await label().innerText())).toBe(original);
  });

  test('CSE-12 | Quotation Default Terms And Conditions prefill a new quotation', async () => {
    await settings.goto();
    const original = String(await settings.get('quot-default-terms'));
    const terms = `QA_TERMS_${Date.now()}`;
    await settings.withSettings({ 'quot-default-terms': terms }, async () => {
      await openForm(page, 'quotation');
      await expect(page.locator('#terms-and-condition')).toHaveValue(new RegExp(terms), { timeout: 10000 });
    });
    await openForm(page, 'quotation');
    const now = await page.locator('#terms-and-condition').inputValue();
    expect(now.includes(terms), 'the test terms must be gone once the setting is restored').toBe(false);
    expect(await (async () => { await settings.goto(); return String(await settings.get('quot-default-terms')); })()).toBe(original);
  });

  test('CSE-13 | Repeat Business (B2B) adds B2B Dashboard and Repeat Accounts to the menu', async () => {
    await settings.goto();
    const original = Boolean(await settings.get('AllowRepeatBusiness'));
    const menu = () => page.evaluate(() => [...document.querySelectorAll('aside a[href], .app-sidebar a[href]')]
      .map((a) => a.getAttribute('href') || '').filter((h) => /b2b-dashboard|repeat-accounts/.test(h)).length);
    const home = async () => { await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' }); await page.locator('aside a[href], .app-sidebar a[href]').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(1500); };
    await settings.withSettings({ AllowRepeatBusiness: !original }, async () => {
      await home();
      expect(await menu(), `menu entries with Repeat Business ${!original ? 'on' : 'off'}`).toBe(!original ? 2 : 0);
    });
    await home();
    expect(await menu()).toBe(original ? 2 : 0);
  });

  test('CSE-14 | an option saved from the page survives a reload, and restoring puts it back', async () => {
    // Low-impact switch: Include Custom Fields In Lead Search By Default is only a default on /leads.
    await settings.goto();
    const original = Boolean(await settings.get('IncludeCustomFieldInSearch'));
    await settings.withSettings({ IncludeCustomFieldInSearch: !original }, async () => {
      await settings.goto();
      await settings.expand('enquiry');
      expect(Boolean(await settings.get('IncludeCustomFieldInSearch'))).toBe(!original);
      await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded' });
      // the checkbox sits inside the collapsed filter panel: read its state without opening it
      const box = page.locator('#include-custom-field-search');
      await expect(box).toBeAttached({ timeout: 30000 });
      await expect(box, 'Leads search checkbox default follows the setting').toBeChecked({ checked: !original, timeout: 15000 });
    });
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#include-custom-field-search')).toBeAttached({ timeout: 30000 });
    await expect(page.locator('#include-custom-field-search')).toBeChecked({ checked: original, timeout: 15000 });
  });

  test('CSE-99 | after all effects, every Client Setting equals its value at the start of the run', async () => {
    test.skip(!startState, 'CSE-01 did not record the starting state');
    await settings.goto();
    const changed = [];
    for (const name of Object.keys(SECTIONS)) {
      const now = await settings.readSection(name);
      for (const [id, v] of Object.entries(startState[name])) if (String(now[id]) !== String(v)) changed.push(`${id}: ${v} -> ${now[id]}`);
    }
    expect(changed, 'a test left a tenant setting changed').toEqual([]);
  });
});
