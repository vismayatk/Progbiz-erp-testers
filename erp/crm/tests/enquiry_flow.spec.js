'use strict';

/**
 * CRM Enquiry Flow — End-to-End Positive Test Suite
 *
 * Covers:
 *   1. Login
 *   2. Create Enquiry
 *   3. Add Follow-up
 *   4. Convert to Quotation
 *   5. Status transitions: In Follow-up → Won → Lost
 *
 * Run:
 *   npx playwright test tests/enquiry_flow.spec.js --headed
 */

require('dotenv').config();

const { test, expect } = require('@playwright/test');
const { LoginPage }    = require('../../common/LoginPage');
const { EnquiryPage }  = require('../pages/EnquiryPage');
const { FollowUpPage } = require('../pages/FollowUpPage');
const { QuotationPage }= require('../pages/QuotationPage');
const { LeadTransferPage } = require('../pages/LeadTransferPage');
const { LeadSourcesPage }  = require('../pages/LeadSourcesPage');
const { LeadStatusPage }   = require('../pages/LeadStatusPage');
const { ItemCategoryPage } = require('../../item/pages/ItemCategoryPage');
const { ItemPage }         = require('../../item/pages/ItemPage');
const { screenshot }   = require('../../common/helpers');
const { testData }     = require('../../common/testData');

// ── Shared state across tests in this file ──────────────────────────────────
let enquiryUrl = '';

// ── Credentials ─────────────────────────────────────────────────────────────
const CREDS = {
  company:  process.env.COMPANY_CODE  || 'skiolo_test',
  username: process.env.CRM_USERNAME  || 'admin',
  password: process.env.PASSWORD      || '123',
};

// ══════════════════════════════════════════════════════════════════════════════
// SUITE
// ══════════════════════════════════════════════════════════════════════════════

test.describe('CRM Enquiry Flow — Positive Tests', () => {

  // --------------------------------------------------------------------------
  // TC-01  Login
  // --------------------------------------------------------------------------
  test('TC-01 | Login with valid credentials', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-01 | Login with valid credentials');
    console.log('═══════════════════════════════════════');

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);

    expect(page.url()).not.toContain('/login');
    console.log('  ✅ ASSERT: URL no longer contains /login');

    await screenshot(page, 'tc01_login_success');
  });

  // --------------------------------------------------------------------------
  // TC-02  Create Enquiry
  // --------------------------------------------------------------------------
  test('TC-02 | Create a new enquiry with valid data', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-02 | Create new enquiry');
    console.log('═══════════════════════════════════════');

    const loginPage   = new LoginPage(page);
    const enquiryPage = new EnquiryPage(page);

    // Login first
    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);

    // Navigate to enquiry list and open creation form
    await enquiryPage.gotoList();
    await enquiryPage.clickAddNew();

    // Fill and submit
    await enquiryPage.fillAndCreate(testData.enquiry);

    // Wait for navigation / redirect after save
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // Verify success message (check before URL capture so toast is still visible)
    const msg = await enquiryPage.getSuccessMessage();

    // Capture URL of created enquiry for later tests
    enquiryUrl = page.url();
    console.log(`  📌 Enquiry URL after save: ${enquiryUrl}`);
    await screenshot(page, 'tc02_enquiry_created');

    // Log page title for debugging
    const title = await page.title();
    console.log(`  📄 Page title: "${title}"`);

    // The old `urlChanged` was true on BOTH success and failure URLs (neither contains
    // /create|/new|/add), so it never failed. A real save redirects to /enquiry-overview/{id}.
    expect(enquiryUrl, `Enquiry should redirect to /enquiry-overview/{id} after save. URL: ${enquiryUrl}, Alert: "${msg}"`)
      .toMatch(/enquiry-overview\/\d+/i);
    await expect(page.locator('body')).toContainText(testData.enquiry.customerName);
    console.log(`  ✅ ASSERT: Enquiry created — overview ${enquiryUrl} shows "${testData.enquiry.customerName}"`);
  });

  // --------------------------------------------------------------------------
  // TC-02B  Create Enquiry for an EXISTING customer (search & choose)
  // --------------------------------------------------------------------------
  test('TC-02B | Create enquiry for an existing customer (search & choose)', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-02B | Create enquiry — existing customer');
    console.log('═══════════════════════════════════════');

    const loginPage   = new LoginPage(page);
    const enquiryPage = new EnquiryPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);

    // Find a real existing customer to search for
    const existing = await enquiryPage.getExistingCustomerFromLeads();
    console.log(`  👥 Existing customer: name="${existing?.name}" phone="${existing?.phone}"`);
    expect(existing && existing.phone, 'Need at least one existing customer in /leads').toBeTruthy();

    // Open the form and create using the SEARCH + CHOOSE path
    await enquiryPage.clickAddNew();
    await enquiryPage.fillAndCreateWithExisting(existing.phone, testData.enquiry);

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    const msg = await enquiryPage.getSuccessMessage();
    enquiryUrl = page.url();   // share with downstream tests (works even if TC-02 new-customer path is broken)
    console.log(`  📌 Existing-customer enquiry URL: ${enquiryUrl}`);
    await screenshot(page, 'tc02b_existing_enquiry');

    // The `|| msg !== null` fallback passed on failed saves (error toasts also match).
    // Require the overview redirect AND the chosen customer's phone to appear on it.
    expect(enquiryUrl, `Expected redirect to enquiry-overview but got ${enquiryUrl}`).toMatch(/enquiry-overview\/\d+/i);
    const digits = (await page.evaluate(() => document.body.innerText)).replace(/\D/g, '');
    expect(digits, `Chosen existing customer phone ${existing.phone} not shown on the created enquiry`).toContain(existing.phone);
    console.log(`  ✅ ASSERT: Existing-customer enquiry created — overview shows phone ${existing.phone}`);
  });

  // --------------------------------------------------------------------------
  // TC-03  Open Created Enquiry
  // --------------------------------------------------------------------------
  test('TC-03 | Open the created enquiry from the list', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-03 | Open created enquiry');
    console.log('═══════════════════════════════════════');

    const loginPage   = new LoginPage(page);
    const enquiryPage = new EnquiryPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);

    if (enquiryUrl && !enquiryUrl.includes('/login')) {
      // Use direct URL from previous test
      console.log(`  🔗 Navigating directly to enquiry: ${enquiryUrl}`);
      await page.goto(enquiryUrl, { waitUntil: 'domcontentloaded' });
    } else {
      // Fallback: open first row from listing
      await enquiryPage.openFirstEnquiry();
    }

    // The old ternary fed toMatch a regex that matches any string (tautology), and
    // body.length>100 is true on any app-shell page. Assert the overview actually opened:
    // the URL is an enquiry-overview and its overview-only Followup control rendered.
    expect(page.url(), `Expected enquiry-overview, still on: ${page.url()}`).toMatch(/enquiry-overview/i);
    await expect(page.locator('#btn-add-followup'), 'overview Followup control did not render').toBeVisible({ timeout: 15000 });
    console.log(`  ✅ ASSERT: Opened enquiry overview — URL: ${page.url()}`);

    await screenshot(page, 'tc03_enquiry_opened');
  });

  // --------------------------------------------------------------------------
  // TC-04  Add Follow-up
  // --------------------------------------------------------------------------
  test('TC-04 | Add a follow-up to the enquiry', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-04 | Add Follow-up');
    console.log('═══════════════════════════════════════');

    const loginPage    = new LoginPage(page);
    const enquiryPage  = new EnquiryPage(page);
    const followUpPage = new FollowUpPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);

    // Open the enquiry
    if (enquiryUrl && !enquiryUrl.includes('/login')) {
      await page.goto(enquiryUrl, { waitUntil: 'domcontentloaded' });
    } else {
      await enquiryPage.openFirstEnquiry();
      // record which enquiry we used — adding a follow-up re-orders /leads, so
      // TC-05 must revisit THIS enquiry, not whatever floats to the top next
      enquiryUrl = page.url();
    }

    const beforeCount = await followUpPage.getFollowUpCount();

    await followUpPage.clickAddFollowUp();
    await followUpPage.fillAndSave(testData.followUp);

    const msg = await followUpPage.getSuccessMessage();
    await screenshot(page, 'tc04_followup_created');

    // Reload page to see updated listing
    await page.reload({ waitUntil: 'domcontentloaded' });
    const afterCount = await followUpPage.getFollowUpCount();

    // The `hasSuccess = msg !== null` fallback passed on error toasts too. Require the
    // history to actually GROW and the latest entry to carry the note we wrote.
    const rowAdded = afterCount > beforeCount;
    expect(rowAdded,
      `Expected a new follow-up row after save. rows before=${beforeCount}, after=${afterCount}, alert="${msg}"`
    ).toBeTruthy();
    const latest = await followUpPage.getLatestFollowUpText();
    expect(latest, 'latest follow-up should contain the note just created').toContain(testData.followUp.notes);
    console.log(`  ✅ ASSERT: Follow-up added — rows ${beforeCount}→${afterCount}, note round-tripped`);
  });

  // --------------------------------------------------------------------------
  // TC-05  Verify Follow-up is Visible in Listing
  // --------------------------------------------------------------------------
  test('TC-05 | Verify follow-up is visible in the follow-up listing', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-05 | Verify follow-up listing');
    console.log('═══════════════════════════════════════');

    const loginPage    = new LoginPage(page);
    const enquiryPage  = new EnquiryPage(page);
    const followUpPage = new FollowUpPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);

    if (enquiryUrl && !enquiryUrl.includes('/login')) {
      await page.goto(enquiryUrl, { waitUntil: 'domcontentloaded' });
    } else {
      await enquiryPage.openFirstEnquiry();
    }

    // count>0 also matches an empty-state placeholder li. Assert the LATEST entry carries
    // the note created in TC-04 — a real listing round-trip.
    const latestText = await followUpPage.getLatestFollowUpText();
    console.log(`  📝 Latest follow-up excerpt: "${latestText?.substring(0, 80)}"`);
    expect(latestText, 'latest follow-up should contain the note created in TC-04').toContain(testData.followUp.notes);
    console.log('  ✅ ASSERT: follow-up from TC-04 is visible in the listing');

    await screenshot(page, 'tc05_followup_listing');
  });

  // --------------------------------------------------------------------------
  // TC-06  Convert Enquiry to Quotation
  // --------------------------------------------------------------------------
  test('TC-06 | Convert enquiry to quotation', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-06 | Convert to Quotation');
    console.log('═══════════════════════════════════════');

    const loginPage     = new LoginPage(page);
    const enquiryPage   = new EnquiryPage(page);
    const quotationPage = new QuotationPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);

    if (enquiryUrl && !enquiryUrl.includes('/login')) {
      await page.goto(enquiryUrl, { waitUntil: 'domcontentloaded' });
    } else {
      await enquiryPage.openFirstEnquiry();
    }

    await enquiryPage.convertToQuotation();

    const msg      = await quotationPage.getSuccessMessage();
    const quotNo   = await quotationPage.getQuotationNumber();
    await screenshot(page, 'tc06_quotation_created');

    // `urlChanged = url.includes('quot')` was already true once the create form opened,
    // so it hid a failed save. A real save leaves the unsaved /quotation/0/ create form.
    const stillOnNewForm = /\/quotation\/0\//.test(page.url());
    const savedOk        = msg !== null && /success|saved|created|generated/i.test(msg);
    const hasRealQuotNo  = quotNo !== null && /QUO/i.test(quotNo);
    expect(savedOk || hasRealQuotNo || (page.url().includes('quot') && !stillOnNewForm),
      `Expected a SAVED quotation, not just the create form. Alert:"${msg}" QuotNo:"${quotNo}" URL:${page.url()}`
    ).toBeTruthy();
    console.log(`  ✅ ASSERT: Quotation generated — alert="${msg}", quotNo="${quotNo}"`);
  });

  // --------------------------------------------------------------------------
  // TC-07  Verify Quotation in Listing
  // --------------------------------------------------------------------------
  test('TC-07 | Verify quotation appears in quotation listing', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-07 | Verify quotation listing');
    console.log('═══════════════════════════════════════');

    const loginPage     = new LoginPage(page);
    const quotationPage = new QuotationPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);
    // The unfiltered /leads master lists enquiries (ENQ-x) — quotations only surface
    // behind the Type=Quotation filter, where rows carry their QUO-x numbers.
    await quotationPage.gotoQuotationList();

    const rows = await page.$$eval('table tbody tr', trs => trs.map(tr => (tr.innerText || '').trim()));
    const quotationRows = rows.filter(r => /QUO[-\s]?\d/i.test(r));
    console.log(`  🧾 quotation rows (Type=Quotation): ${quotationRows.length} / ${rows.length}`);
    expect(quotationRows.length, 'Type=Quotation filter should list at least one QUO# row (TC-06 just converted one)').toBeGreaterThan(0);
    console.log('  ✅ ASSERT: quotation listing shows QUO# rows');

    await screenshot(page, 'tc07_quotation_listing');
  });

  // --------------------------------------------------------------------------
  // TC-08  Status → "In Follow-up"
  // --------------------------------------------------------------------------
  test('TC-08 | Update enquiry status to "In Follow-up"', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-08 | Status → In Follow-up');
    console.log('═══════════════════════════════════════');

    await _runStatusTransition(page, 'In Follow-up', 'tc08_status_in_followup');
  });

  // --------------------------------------------------------------------------
  // TC-09  Status → "Won"
  // --------------------------------------------------------------------------
  test('TC-09 | Update enquiry status to "Won"', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-09 | Status → Won');
    console.log('═══════════════════════════════════════');

    await _runStatusTransition(page, 'Won', 'tc09_status_won');
  });

  // --------------------------------------------------------------------------
  // TC-10  Status → "Lost"
  // --------------------------------------------------------------------------
  test('TC-10 | Update enquiry status to "Lost"', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-10 | Status → Lost');
    console.log('═══════════════════════════════════════');

    await _runStatusTransition(page, 'Lost', 'tc10_status_lost');
  });

  // --------------------------------------------------------------------------
  // TC-11  Verify Enquiries Visible in Listing Page
  // --------------------------------------------------------------------------
  test('TC-11 | Verify records are visible in enquiry listing', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-11 | Verify enquiry listing');
    console.log('═══════════════════════════════════════');

    const loginPage   = new LoginPage(page);
    const enquiryPage = new EnquiryPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);
    await enquiryPage.gotoList();

    // /leads is always pre-populated, so count>0 proved nothing about this run. Require the
    // specific enquiry created in TC-02 (unique "Test Customer <ts>") to be listed.
    // The table AJAX-loads several seconds after domcontentloaded — poll for it.
    const wanted = testData.enquiry.customerName;
    let found = false;
    for (let i = 0; i < 8 && !found; i++) {
      found = await page.evaluate((name) =>
        [...document.querySelectorAll('table tbody tr')].some(tr => (tr.textContent || '').includes(name)), wanted);
      if (!found) await page.waitForTimeout(1500);
    }
    console.log(`  🔎 "${wanted}" listed in /leads: ${found}`);
    expect(found, `Enquiry for "${wanted}" (created in TC-02) not visible in /leads listing`).toBeTruthy();
    console.log('  ✅ ASSERT: created enquiry is visible in the /leads listing');

    await screenshot(page, 'tc11_enquiry_listing');
  });

  // --------------------------------------------------------------------------
  // TC-12  Lead Transfer — transfer a lead to an executive & verify the assignee
  // --------------------------------------------------------------------------
  test('TC-12 | Lead Transfer — transfer a lead to an executive and verify the new assignee', async ({ page }) => {
    test.setTimeout(240_000);   // page is slow + Apply-Filters retries through intermittent backend errors
    console.log('\n═══════════════════════════════════════');
    console.log('TC-12 | Lead Transfer (CRM → Lead Transfer)');
    console.log('═══════════════════════════════════════');

    const loginPage = new LoginPage(page);
    const transfer  = new LeadTransferPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);

    await transfer.goto();
    const rows = await transfer.applyFilters();
    expect(rows, 'Lead Transfer list did not load (backend ExpectedStartOfValueNotFound?)').toBeGreaterThan(0);

    // Pick the first lead and a target executive different from its current assignee
    const lead = await transfer.getFirstLead();
    console.log(`  🎯 Lead ${lead.number} (${lead.phone}) currently assigned to "${lead.assignee}"`);
    const execs = ['VIGNESH', 'SHAMAL', 'JASEEM', 'Biju', 'Arshida', 'Shaju Ummar'];
    const target = execs.find(e => e.toLowerCase() !== (lead.assignee || '').toLowerCase()) || 'VIGNESH';
    console.log(`  ➡️  Transferring to "${target}"`);

    const result = await transfer.transferFirstLeadTo(target);
    await screenshot(page, 'tc12_transfer_result');
    // A backend error on transfer is a real (backend) failure — surface it.
    if (result && /oops|something went wrong|error code/i.test(result)) {
      throw new Error(`Lead transfer failed (backend): "${result}"`);
    }

    // PRIMARY assertion: re-search the lead and confirm its Current Assignee changed.
    const newAssignee = await transfer.assigneeOf(lead.phone);
    console.log(`  🔎 After transfer, ${lead.number} assignee = "${newAssignee}" (toast: ${JSON.stringify(result)})`);
    expect((newAssignee || '').toLowerCase().includes(target.toLowerCase()),
      `Expected assignee "${target}" but found "${newAssignee}". Transfer toast: "${result}"`
    ).toBeTruthy();
    console.log(`  ✅ ASSERT: ${lead.number} reassigned "${lead.assignee}" → "${newAssignee}"`);
  });

  // --------------------------------------------------------------------------
  // TC-13  CRM → Settings → Lead Sources — create & verify in list
  // --------------------------------------------------------------------------
  test('TC-13 | Lead Sources (Settings) — create a lead source and verify it lists', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-13 | CRM → Settings → Lead Sources');
    console.log('═══════════════════════════════════════');

    const loginPage = new LoginPage(page);
    const sources   = new LeadSourcesPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);
    await sources.goto();

    // Name field enforces maxlength 30
    expect(await sources.nameMaxLength()).toBe(30);

    // Name field enforces maxlength 30 (already asserted above)
    // 1) Create a uniquely-named source → succeeds (re-runnable: name is unique per run)
    const name = `AutoSrc ${Date.now()}`.slice(0, 30);
    const msg1 = await sources.create(name);
    expect(msg1, `First create should succeed, got: "${msg1}"`).toBeFalsy();
    console.log(`  ✅ ASSERT: Lead source "${name}" created`);

    // 2) Duplicate must be REJECTED — this also proves #1 actually persisted
    const msg2 = await sources.create(name);
    expect(/exist|already|duplicate/i.test(msg2 || ''),
      `Duplicate lead source should be rejected, but got: "${msg2}"`).toBeTruthy();
    console.log(`  ✅ ASSERT: Duplicate rejected — "${msg2}"`);

    // 3) EDIT (pencil) — rename via the prefilled modal
    const newName = `${name} E`.slice(0, 30);
    const em = await sources.edit(name, newName);
    expect(em, `Edit should succeed, got: "${em}"`).toBeFalsy();
    expect(await sources.existsInList(newName), `Renamed "${newName}" not found`).toBeTruthy();
    console.log(`  ✅ ASSERT: Edited "${name}" → "${newName}"`);

    // 4) DELETE (trash) — confirm, then verify the row is gone
    const gone = await sources.delete(newName);
    await screenshot(page, 'tc13_lead_source');
    expect(gone, `"${newName}" should be deleted`).toBeTruthy();
    console.log(`  ✅ ASSERT: Deleted "${newName}"`);
  });

  // --------------------------------------------------------------------------
  // TC-14  CRM → Settings → Lead Status — create a followup status (with Nature)
  // --------------------------------------------------------------------------
  test('TC-14 | Lead Status (Settings) — create a followup status with a Nature', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-14 | CRM → Settings → Lead Status');
    console.log('═══════════════════════════════════════');

    const loginPage = new LoginPage(page);
    const statuses  = new LeadStatusPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);
    await statuses.goto();

    // 1) Create uniquely-named status → succeeds (re-runnable)
    const name = `AutoStat ${Date.now()}`.slice(0, 30);
    const msg1 = await statuses.create(name, 'In Followup');
    expect(msg1, `First create should succeed, got: "${msg1}"`).toBeFalsy();
    console.log(`  ✅ ASSERT: Followup status "${name}" created`);

    // 2) Duplicate must be REJECTED — proves #1 persisted
    const msg2 = await statuses.create(name, 'In Followup');
    expect(/exist|already|duplicate/i.test(msg2 || ''),
      `Duplicate followup status should be rejected, but got: "${msg2}"`).toBeTruthy();
    console.log(`  ✅ ASSERT: Duplicate rejected — "${msg2}"`);

    // 3) EDIT → rename
    const newName = `${name} E`.slice(0, 30);
    const em = await statuses.edit(name, newName);
    expect(em, `Edit should succeed, got: "${em}"`).toBeFalsy();
    expect(await statuses.existsInList(newName), `Renamed "${newName}" not found`).toBeTruthy();
    console.log(`  ✅ ASSERT: Edited "${name}" → "${newName}"`);

    // 4) DELETE → verify gone
    const gone = await statuses.delete(newName);
    await screenshot(page, 'tc14_lead_status');
    expect(gone, `"${newName}" should be deleted`).toBeTruthy();
    console.log(`  ✅ ASSERT: Deleted "${newName}"`);
  });

  // --------------------------------------------------------------------------
  // TC-15  Inventory → Settings → Item Categories — create + duplicate rejection
  // --------------------------------------------------------------------------
  test('TC-15 | Item Categories — create a category and verify duplicates are rejected', async ({ page }) => {
    console.log('\n═══════════════════════════════════════');
    console.log('TC-15 | Item Categories (unique constraint)');
    console.log('═══════════════════════════════════════');

    const loginPage = new LoginPage(page);
    const cats      = new ItemCategoryPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);
    await cats.goto();

    const name = `AutoCat ${Date.now()}`.slice(0, 30);
    const msg1 = await cats.create(name);
    expect(msg1, `First create should succeed, got: "${msg1}"`).toBeFalsy();
    console.log(`  ✅ ASSERT: Item category "${name}" created`);

    const msg2 = await cats.create(name);
    expect(/exist|already|duplicate/i.test(msg2 || ''),
      `Duplicate item category should be rejected, but got: "${msg2}"`).toBeTruthy();
    console.log(`  ✅ ASSERT: Duplicate rejected — "${msg2}"`);

    // 3) EDIT → rename
    const newName = `${name} E`.slice(0, 30);
    const em = await cats.edit(name, newName);
    expect(em, `Edit should succeed, got: "${em}"`).toBeFalsy();
    expect(await cats.existsInList(newName), `Renamed "${newName}" not found`).toBeTruthy();
    console.log(`  ✅ ASSERT: Edited "${name}" → "${newName}"`);

    // 4) DELETE → verify gone
    const gone = await cats.delete(newName);
    await screenshot(page, 'tc15_item_category');
    expect(gone, `"${newName}" should be deleted`).toBeTruthy();
    console.log(`  ✅ ASSERT: Deleted "${newName}"`);
  });

  // --------------------------------------------------------------------------
  // TC-16  Inventory → Items — create an item, verify duplicate rejected, delete
  // --------------------------------------------------------------------------
  test('TC-16 | Items — create a Product, verify duplicates are rejected, then delete', async ({ page }) => {
    test.setTimeout(180_000);
    console.log('\n═══════════════════════════════════════');
    console.log('TC-16 | Inventory → Items (Product form)');
    console.log('═══════════════════════════════════════');

    const loginPage = new LoginPage(page);
    const items     = new ItemPage(page);

    await loginPage.goto();
    await loginPage.login(CREDS.company, CREDS.username, CREDS.password);

    // 1) Create a uniquely-named item (Category "Solar") → succeeds (re-runnable)
    const name = `AutoItem ${Date.now()}`.slice(0, 40);
    const msg1 = await items.create(name, 'Solar');
    expect(msg1, `First create should succeed, got: "${msg1}"`).toBeFalsy();
    console.log(`  ✅ ASSERT: Item "${name}" created`);

    // 2) Duplicate must be REJECTED (item names are unique)
    const msg2 = await items.create(name, 'Solar');
    await screenshot(page, 'tc16_item');
    expect(/exist|already|duplicate/i.test(msg2 || ''),
      `Duplicate item should be rejected, but got: "${msg2}"`).toBeTruthy();
    console.log(`  ✅ ASSERT: Duplicate rejected — "${msg2}"`);

    // 3) DELETE → clean up so the test is re-runnable (skipped where the tenant
    //    exposes no Delete action on the /items list, e.g. dev)
    const gone = await items.delete(name);
    if (gone === null) {
      console.log('  ℹ️  Items delete not available on this tenant — create + duplicate verified');
    } else {
      expect(gone, `"${name}" should be deleted`).toBeTruthy();
      console.log(`  ✅ ASSERT: Deleted "${name}"`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SHARED HELPER for status transition tests
// ══════════════════════════════════════════════════════════════════════════════

async function _runStatusTransition(page, status, screenshotName) {
  const loginPage   = new LoginPage(page);
  const enquiryPage = new EnquiryPage(page);

  await loginPage.goto();
  await loginPage.login(CREDS.company, CREDS.username, CREDS.password);

  // Create a FRESH enquiry for this transition (the shared TC-02/02B enquiry is
  // converted to a quotation in TC-06, after which its "Followup" button
  // disappears). Prefer the EXISTING-customer path; if the tenant has no leads
  // yet (e.g. running this test standalone on a fresh tenant), SELF-SEED by
  // creating a new customer so the test is self-contained.
  const existing = await enquiryPage.getExistingCustomerFromLeads();
  await enquiryPage.clickAddNew();
  if (existing && existing.phone) {
    console.log(`  👥 Using existing customer (${existing.phone})`);
    await enquiryPage.fillAndCreateWithExisting(existing.phone, testData.enquiry);
  } else {
    const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    console.log('  🌱 No existing customer — seeding a new one');
    await enquiryPage.fillAndCreate({
      ...testData.enquiry,
      customerName: `Status ${status} ${uniq}`,
      mobile:       '9' + uniq.slice(-9),
      email:        `cust${uniq}@example.com`,
    });
  }
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  await enquiryPage.updateStatus(status);

  const msg = await enquiryPage.getSuccessMessage();
  await screenshot(page, screenshotName);

  // The old `hasSuccess = msg !== null` fallback passed on any toast (incl. errors), so the
  // status transition was never really verified. Re-read the PERSISTED status after reload.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const currentStatus = await enquiryPage.getCurrentStatus();
  const expectedLabel = enquiryPage.statusLabelFor(status);   // Won→"Got the business", etc.
  expect(currentStatus.toLowerCase(),
    `Status "${status}" should persist as "${expectedLabel}". Alert: "${msg}", Status field: "${currentStatus}"`
  ).toContain(expectedLabel.toLowerCase());

  console.log(`  ✅ ASSERT: Status "${status}" persisted as "${currentStatus}"`);
}
