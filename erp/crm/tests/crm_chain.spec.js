'use strict';

/**
 * CRM — Enquiry → Follow-up → Quotation chain  (CH-01 .. CH-10)
 *
 * The per-page specs each verify one screen. This one verifies that a record
 * survives its journey: an enquiry created here must reach the Leads listing,
 * convert to a quotation carrying its customer and items, and register on the
 * home page. Those hand-offs are where this build actually breaks, and no
 * single-page test can see them.
 *
 * Runs serially and carries state forward — it is one story, not ten
 * independent checks, and re-seeding an enquiry per assertion would both slow
 * the run and litter the tenant.
 *
 * DATA: one enquiry and one quotation per run, prefixed QA_CHAIN_ and
 * described "safe to delete". Nothing existing is touched.
 *
 * Run:  npm run test:chain
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { EnquiryPage } = require('../pages/EnquiryPage');
const { CrmChainPage } = require('../pages/CrmChainPage');
const { QuotationPage } = require('../pages/QuotationPage');
const { setFutureQuotationFollowup } = require('../pages/EnquiryPage');
const { tenant } = require('../../common/tenantData');
const T = tenant();

const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123456',
};

test.describe.configure({ mode: 'serial', timeout: 240_000 });

const NAME = `QA_CHAIN_${Date.now()}`;
let chain;                 // CrmChainPage
let enquiryPath = null;    // /enquiry-overview/<id>
let quotationFormPath = null; // /quotation/0/<enquiryId> — the prefilled form
let quotationPath = null;  // /quotation-view/<id>
let homeBefore = null;

test.describe('CRM — Enquiry → Follow-up → Quotation chain', () => {
  test.beforeEach(async ({ page }) => {
    await new LoginPage(page).login(C.company, C.username, C.password);
    chain = new CrmChainPage(page);
  });

  test('CH-01 | Enquiry saves with a line item and opens its overview', async ({ page }) => {
    homeBefore = await chain.homeCounters();
    console.log(`  home before: ${JSON.stringify(homeBefore)}`);

    const enq = new EnquiryPage(page);
    await enq.openAddForm();
    await page.waitForTimeout(1500);
    await page.locator('#TxtCustomer').fill(NAME);
    await page.locator('#customer-phone').fill(String(Date.now()).slice(-10));

    // Selects are Blazor-bound: drive them natively, never by assigning .value.
    // #followup matters beyond this test: setting a Followup Status is what
    // schedules the next follow-up, and that is what puts the record on
    // /followups and on the home page's Today's Schedule. Leaving it unset
    // makes CH-05 and CH-10 fail for a reason that has nothing to do with them.
    await enq.selectLeadSource();   // a real source — never the junk "All"/blank ones
    for (const id of ['#assignto', '#followup']) {
      const sel = page.locator(id);
      if (!(await sel.count().catch(() => 0))) continue;
      const opts = await sel.locator('option').evaluateAll((os) =>
        os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
          .filter((o) => o.value && o.value !== '0' && !/^choose/i.test(o.text)));
      if (opts.length) await sel.selectOption(opts[0].value).catch(() => {});
    }

    // Choosing a Followup Status conditionally renders a required Lead Quality
    // here too — the same pattern as the follow-up modal. It must be set after
    // the status, or the save is refused ("Please choose lead quality").
    await page.waitForTimeout(1500);
    const quality = page.locator('#lead-quality');
    if (await quality.count().catch(() => 0)) {
      const qOpts = await quality.locator('option').evaluateAll((os) =>
        os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
          .filter((o) => o.value && o.value !== '0' && !/^choose/i.test(o.text)));
      if (qOpts.length) await quality.selectOption(qOpts[0].value).catch(() => {});
    }

    // The item picker is a <select> committed with #btn-add-item; the enquiry
    // will not save without a line item.
    await enq.addItem(T.item, '2');

    await page.locator('#btn-save-enquiry').click({ timeout: 15000 });
    await page.waitForTimeout(6500);
    enquiryPath = page.url().replace(chain.baseUrl, '');
    expect(enquiryPath, `enquiry did not reach an overview: ${enquiryPath}`)
      .toMatch(/^\/enquiry-overview\//);
    console.log(`  ✅ ${NAME} → ${enquiryPath}`);
  });

  test('CH-02 | Enquiry appears in the Leads listing', async () => {
    test.skip(!enquiryPath, 'enquiry was not created');
    // Listings are tab-scoped; a new enquiry lands under "In Follow Up", not
    // on the default view — search every tab before calling it missing.
    const hit = await chain.findAcrossTabs('/leads', NAME);
    expect(hit, `"${NAME}" not found in /leads under any tab`).toBeTruthy();
    console.log(`  ✅ under "${hit.tab}": ${hit.row.slice(0, 6).join(' | ')}`);
  });

  test('CH-03 | Follow-up modal opens on the enquiry', async () => {
    test.skip(!enquiryPath, 'enquiry was not created');
    await chain.goto(enquiryPath);
    expect(await chain.hasFollowupControl(), '#btn-add-followup missing on the enquiry overview')
      .toBe(true);
    console.log('  ✅ follow-up control present');
  });

  test('CH-04 | Follow-up saves from the enquiry', async () => {
    // KNOWN DEFECT CH-F1 (root cause found 2026-09-07): the modal pre-fills
    // "Next FollowUp Date" with the current minute but sets its min to the
    // next minute, so the form is invalid the moment it opens. The browser's
    // constraint validation blocks the type=submit Save before Blazor runs —
    // no request, no app message, only a transient native bubble. Saving works
    // as soon as a later date is chosen or "Not Required" is ticked (CH-04b).
    // This test exercises the default state a user lands in, so it fails until
    // the default value respects the minimum; Playwright then reports it as
    // unexpectedly passing and this marker comes off.
    // Evidence: reports/qa/shots/crm/CH-F1-rc-1-awaiting.png, raw/ch-f1-rootcause-lesol_test.json
    test.fail(true, 'CH-F1 — default Next FollowUp Date is below its own min; browser blocks Save');
    test.skip(!enquiryPath, 'enquiry was not created');

    const r = await chain.addFollowup(enquiryPath);
    console.log(`  ${r.detail}`);
    expect(r.opened, 'follow-up modal did not open').toBe(true);
    expect(r.saved, `modal stayed open — ${r.detail}`).toBe(true);
  });

  test('CH-04b | Follow-up saves once a valid Next FollowUp Date is chosen', async () => {
    // The same modal with the only thing changed being the date: proves the
    // save path, the API and the data flow are fine, and isolates CH-F1 to the
    // pre-filled default.
    test.skip(!enquiryPath, 'enquiry was not created');
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 16);
    const r = await chain.addFollowup(enquiryPath, { nextFollowupDate: tomorrow });
    console.log(`  ${r.detail}`);
    expect(r.opened, 'follow-up modal did not open').toBe(true);
    expect(r.postCount, 'Save issued no request').toBeGreaterThan(0);
    expect(r.saved, 'modal stayed open after Save').toBe(true);
  });

  test('CH-05 | Record reaches the FollowUps listing', async () => {
    test.skip(!enquiryPath, 'enquiry was not created');
    // Independent of CH-04: the enquiry itself is tracked as a follow-up due
    // today, which is what /followups lists.
    const hit = await chain.findAcrossTabs('/followups', NAME);
    expect(hit, `"${NAME}" not found in /followups under any tab`).toBeTruthy();
    console.log(`  ✅ under "${hit.tab}": ${hit.row.slice(0, 6).join(' | ')}`);
  });

  test('CH-06 | Quotation form opens prefilled from the enquiry', async ({ page }) => {
    test.skip(!enquiryPath, 'enquiry was not created');
    await chain.goto(enquiryPath);

    // "Create Quotation" is NOT a top-level button on this build: it lives in
    // the #btn-enquiry-actions dropdown alongside Edit Enquiry, Transfer To
    // Branch and Merge Duplicate. Looking for a bare button finds nothing.
    await page.locator('#btn-enquiry-actions').click({ timeout: 10000 });
    await page.waitForTimeout(2200);
    const createQuotation = page.locator('.dropdown-menu.show a, .dropdown-menu.show button')
      .filter({ hasText: /create quotation/i }).first();
    expect(await createQuotation.count(),
      'no "Create Quotation" item in the #btn-enquiry-actions menu').toBeGreaterThan(0);
    await createQuotation.click({ timeout: 12000 });
    await page.waitForTimeout(7000);

    expect(page.url(), 'did not reach the quotation form').toMatch(/\/quotation\//);
    // Playwright gives every test a fresh page, so serial mode carries
    // variables but NOT browser state. Remember the prefilled form's URL so
    // CH-07 can return to it instead of starting from /home.
    quotationFormPath = page.url().replace(chain.baseUrl, '');

    const state = await page.evaluate(() => {
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)[0];
      return {
        customer: document.querySelector('#customerNameInput')?.value
          || document.querySelector('#TxtCustomer')?.value || '',
        itemRows: t ? t.querySelectorAll('tbody tr').length : 0,
      };
    });
    expect(state.customer, 'quotation did not inherit the customer').toContain(NAME);
    expect(state.itemRows, 'quotation inherited no line items').toBeGreaterThan(0);
    console.log(`  ✅ prefilled: customer="${state.customer}" itemRows=${state.itemRows}`);
  });

  test('CH-07 | Quotation saves and opens its overview', async ({ page }) => {
    test.skip(!quotationFormPath, 'quotation form was not reached in CH-06');
    // Fresh page per test — reopen the prefilled form before saving.
    await chain.goto(quotationFormPath);
    // Use the id alone. A `button:has-text("Save")` fallback matches
    // #cf-new-option-save inside a dormant custom-field modal, and .first()
    // then picks that hidden button and times out.
    const saveBtn = page.locator('#btn-save-quotation');
    await saveBtn.waitFor({ state: 'visible', timeout: 30000 });
    // The default Next FollowUp Date can sit below its own minimum (QT-F1) — set a future one.
    await setFutureQuotationFollowup(page);
    await saveBtn.click({ timeout: 15000 });
    await page.waitForTimeout(7000);
    quotationPath = page.url().replace(chain.baseUrl, '');
    expect(quotationPath, `quotation did not reach an overview: ${quotationPath}`)
      .toMatch(/\/quotation-view\//);
    console.log(`  ✅ → ${quotationPath}`);
  });

  test('CH-08 | Quotation appears in the Quotations listing', async () => {
    test.skip(!quotationPath, 'quotation was not created');
    let hit;
    if (T.routes.quotations) {
      hit = await chain.findAcrossTabs(T.routes.quotations, NAME);
    } else {
      // no /quotations route on this tenant: quotations are listed in /leads (Type = Quotation)
      await new QuotationPage(chain.page).gotoQuotationList();
      const g = await chain.readGrid();
      const row = g.rows.find((r) => r.join(' ').includes(NAME));
      hit = row ? { tab: 'Leads, Type = Quotation', row } : null;
    }
    expect(hit, `"${NAME}" not found in the quotation listing`).toBeTruthy();
    console.log(`  ✅ under "${hit.tab}": ${hit.row.slice(0, 6).join(' | ')}`);
  });

  test('CH-09 | Follow-up control moves to the quotation after conversion', async () => {
    test.skip(!enquiryPath || !quotationPath, 'chain incomplete');

    // By design on this build: converting removes the control from the enquiry
    // and surfaces it on the quotation. Asserting both halves keeps that
    // documented, so a future change in either direction is caught.
    await chain.goto(enquiryPath);
    const onEnquiry = await chain.hasFollowupControl();
    await chain.goto(quotationPath);
    const onQuotation = await chain.hasFollowupControl();

    expect(onEnquiry, 'follow-up control still on the enquiry after conversion').toBe(false);
    expect(onQuotation, 'follow-up control not present on the quotation').toBe(true);
    console.log('  ✅ control moved: enquiry=absent, quotation=present');
  });

  test('CH-10 | Home page reflects the new record', async () => {
    test.skip(!enquiryPath, 'enquiry was not created');
    const after = await chain.homeCounters();
    const delta = {};
    for (const k of ['pendingTasks', 'delayedTasks', 'completedTasks', 'unscheduled']) {
      if (homeBefore?.[k] !== null && after[k] !== null) delta[k] = after[k] - homeBefore[k];
    }
    const brief = (o) => JSON.stringify({ ...o, scheduleText: undefined });
    console.log(`  counters: ${brief(homeBefore)} → ${brief(after)} = ${JSON.stringify(delta)}`);
    console.log(`  schedule (first 160): "${(after.scheduleText || '').slice(0, 160)}"`);

    // Home's four cards are task counters (Pending/Delayed/Completed/
    // Unscheduled Tasks), not CRM-lead counters — a new enquiry/follow-up is
    // not a "task" in that taxonomy, so nothing here has to move. Log it for
    // visibility (it WOULD catch a real regression in the numbers
    // themselves) but gate the test on Today's Schedule, which is what
    // actually reflects a new CRM record on this build.
    const moved = Object.values(delta).some((v) => v !== 0);
    if (!moved) console.log('  ⓘ no task counter moved — expected, an enquiry/follow-up is not a Task Management task');
    expect(after.scheduleText, "Today's Schedule does not mention the new record").toContain(NAME);
    console.log(`  ✅ Today's Schedule lists ${NAME}`);
  });
});
