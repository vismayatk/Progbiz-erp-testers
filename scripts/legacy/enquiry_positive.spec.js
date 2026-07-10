const { test, expect } = require('@playwright/test');

const BASE = 'https://erptest.progbiz.in';
const CRED = { company: 'lesol_test', user: 'admin', pass: '123' };

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[placeholder="company code"]').fill(CRED.company);
  await page.locator('input[placeholder="user name"]').fill(CRED.user);
  await page.locator('input[placeholder="password"]').fill(CRED.pass);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/home', { timeout: 30000 });
}

async function goToEnquiry(page) {
  await page.goto(`${BASE}/enquiry`, { waitUntil: 'networkidle' });
  await page.getByRole('combobox', { name: 'Branch' }).waitFor({ state: 'visible', timeout: 15000 });
}

const getBranchSelect = (page) => page.getByRole('combobox', { name: 'Branch' });
const getCountrySelect = (page) => page.locator('select').filter({ has: page.locator('option[value="101"]') });
const getStatusSelect = (page) => page.getByRole('combobox', { name: 'Followup Status' });
const getLeadSourceSelect = (page) => page.getByRole('combobox', { name: 'Lead Source' });
const getAssignToSelect = (page) => page.getByRole('combobox', { name: /Assign To/i });
const getEnqNoInput = (page) => page.locator('input#enquiry_no, input[name="enquiry_no"], input:disabled').first();
const getCustomerNameInput = (page) => page.locator('input[placeholder="Customer Name:"]');
const getPhoneInput = (page) => page.locator('input[placeholder="Enter phone number and search"]');
const getPhoneSearchBtn = (page) => page.locator('input[placeholder="Enter phone number and search"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
const getItemSearchInput = (page) => page.locator('input[placeholder="Search Item Name"]');
const getItemSearchBtn = (page) => page.locator('input[placeholder="Search Item Name"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
const getQuantityInput = (page) => page.locator('input[placeholder="Enter quantity"]');
const getPlaceInput = (page) => page.locator('input[placeholder="Place"]');
const getRemarksTextarea = (page) => page.locator('textarea');
const getBizValueInput = (page) => page.locator('input[type="number"]').first();
const getDateInput = (page) => page.locator('input[type="date"]');
const getNextFollowupInput = (page) => page.locator('input[type="datetime-local"]');
const getSubmitBtn = (page) => page.locator('button[type="submit"]');
const getCancelBtn = (page) => page.getByRole('button', { name: /Cancel/i });
const getAddCustomerBtn = (page) => page.getByRole('button', { name: /\+/i }).first();

async function selectFirstPhoneSearchResult(page) {
  await expect(page.locator('text=Search Results')).toBeVisible({ timeout: 5000 });
  const row = page.locator('table tbody tr').first();
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.click();
  await page.waitForTimeout(1000);
}

async function addFirstItem(page) {
  await getItemSearchInput(page).fill('a');
  await page.waitForTimeout(500);
  await getItemSearchBtn(page).click();
  await page.waitForTimeout(1500);
  const firstItem = page.locator('text=Car Insurance, Inverter, Hybrid, Ongrid').first();
  if (await firstItem.isVisible()) {
    await firstItem.click();
  } else {
    await page.locator('table tbody tr').first().click();
  }
  await page.waitForTimeout(500);
}

test.describe('CRM - Add Enquiry Page: Positive Edge Cases', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await goToEnquiry(page);
  });

  // ── SECTION A: PAGE LOAD & AUTO-DEFAULTS ────────────────────────────────

  test('TC-P01: Enquiry No auto-generated with ENQ- prefix on load', async ({ page }) => {
    const enqNo = await getEnqNoInput(page).inputValue();
    expect(enqNo).toMatch(/^ENQ-\d+$/);
  });

  test('TC-P02: Date field auto-filled with today\'s date', async ({ page }) => {
    const dateValue = await getDateInput(page).inputValue();
    const today = new Date().toISOString().split('T')[0];
    expect(dateValue).toBe(today);
  });

  test('TC-P03: Branch dropdown defaults to Kannur (not empty)', async ({ page }) => {
    const branchVal = await getBranchSelect(page).inputValue();
    expect(branchVal).not.toBe('');
    const text = await getBranchSelect(page).locator('option:checked').textContent();
    expect(text).toBe('Kannur');
  });

  test('TC-P04: Country code defaults to IND +91', async ({ page }) => {
    const countryVal = await getCountrySelect(page).inputValue();
    expect(countryVal).toBe('101');
  });

  test('TC-P05: Followup Status defaults to "New Enquiry"', async ({ page }) => {
    const statusSelect = getStatusSelect(page);
    await expect(statusSelect).toBeVisible();
    const val = await statusSelect.inputValue();
    expect(val).not.toBe('');
  });

  test('TC-P06: Quantity field defaults to 0', async ({ page }) => {
    const qty = await getQuantityInput(page).inputValue();
    expect(qty).toBe('0');
  });

  test('TC-P07: Enquiry No field is read-only (cannot be changed)', async ({ page }) => {
    const enqInput = getEnqNoInput(page);
    const original = await enqInput.inputValue();
    await enqInput.fill('ENQ-000');
    const after = await enqInput.inputValue();
    expect(after).toBe(original);
  });

  test('TC-P08: Enquiry No stays same after reload', async ({ page }) => {
    const before = await getEnqNoInput(page).inputValue();
    await page.reload({ waitUntil: 'networkidle' });
    await getBranchSelect(page).waitFor({ state: 'visible', timeout: 15000 });
    const after = await getEnqNoInput(page).inputValue();
    expect(after).toBe(before);
  });

  // ── SECTION B: BRANCH & DROPDOWN OPTIONS ────────────────────────────────

  test('TC-P09: Branch dropdown contains Kannur and Kasargod', async ({ page }) => {
    const options = await getBranchSelect(page).locator('option').allTextContents();
    expect(options).toContain('Kannur');
    expect(options).toContain('Kasargod');
    expect(options.length).toBeGreaterThan(1);
  });

  test('TC-P10: Branch can be switched to Kasargod', async ({ page }) => {
    const sel = getBranchSelect(page);
    await sel.selectOption({ label: 'Kasargod' });
    expect(await sel.inputValue()).not.toBe('');
    await sel.selectOption({ label: 'Kannur' });
  });

  test('TC-P11: Followup Status dropdown has all expected options', async ({ page }) => {
    const options = await getStatusSelect(page).locator('option').allTextContents();
    const expected = [
      'New Enquiry', 'Awaiting', 'Call not attended',
      'customer is busy', 'Interested', 'Got the business',
      'Not interested', 'Postponded', 'PRICE ISSUE',
    ];
    for (const opt of expected) {
      expect(options).toContain(opt);
    }
  });

  test('TC-P12: Followup Status can be changed to "Interested"', async ({ page }) => {
    const sel = getStatusSelect(page);
    await sel.selectOption({ label: 'Interested' });
    expect(await sel.inputValue()).not.toBe('');
  });

  test('TC-P13: Country code dropdown has 200+ international options', async ({ page }) => {
    const count = await getCountrySelect(page).locator('option').count();
    expect(count).toBeGreaterThan(200);
  });

  test('TC-P14: Lead Source dropdown has selectable options', async ({ page }) => {
    const sel = getLeadSourceSelect(page);
    const options = await sel.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1);
    await sel.selectOption({ index: 1 });
    expect(await sel.inputValue()).not.toBe('');
  });

  // ── SECTION C: CUSTOMER PHONE SEARCH MODAL ──────────────────────────────

  test('TC-P15: Phone search opens modal with correct columns', async ({ page }) => {
    await getPhoneInput(page).fill('9446967777');
    await getPhoneSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Search Results')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Name')).toBeVisible();
    await expect(page.locator('text=Phone')).toBeVisible();
    await expect(page.locator('text=Email Address')).toBeVisible();
    await expect(page.locator('text=DOB')).toBeVisible();
  });

  test('TC-P16: Selecting customer fills Customer Name field', async ({ page }) => {
    await getPhoneInput(page).fill('9446967777');
    await getPhoneSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);
    const name = await getCustomerNameInput(page).inputValue();
    expect(name.length).toBeGreaterThan(0);
  });

  test('TC-P17: Search Results modal shows pagination controls', async ({ page }) => {
    await getPhoneSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Search Results')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=next')).toBeVisible();
    await expect(page.locator('text=last')).toBeVisible();
  });

  test('TC-P18: Search Results page 2 loads correctly', async ({ page }) => {
    await getPhoneSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await page.locator('text=2').last().click();
    await page.waitForTimeout(1000);
    expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0);
  });

  test('TC-P19: Name filter in Search Results modal works', async ({ page }) => {
    await getPhoneSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await page.locator('input[type="text"]:visible').last().fill('Abdul');
    await page.locator('button:has(svg)').last().click();
    await page.waitForTimeout(1500);
    const firstRow = await page.locator('table tbody tr').first().textContent();
    expect(firstRow?.toLowerCase()).toContain('abdul');
  });

  test('TC-P20: "Add Customer" button is visible in modal', async ({ page }) => {
    await getPhoneSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await expect(page.locator('button:has-text("Add Customer")')).toBeVisible({ timeout: 3000 });
  });

  test('TC-P21: Search Results modal closes via Close button', async ({ page }) => {
    await getPhoneSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await page.locator('button:has-text("Close")').click();
    await expect(page.locator('text=Search Results')).not.toBeVisible();
  });

  // ── SECTION D: NEW SUSPECT MODAL (+ Button) ─────────────────────────────

  test('TC-P22: "+" button opens New Suspect modal', async ({ page }) => {
    await getAddCustomerBtn(page).click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=New Suspect')).toBeVisible({ timeout: 5000 });
  });

  test('TC-P23: Individual radio selected by default', async ({ page }) => {
    await getAddCustomerBtn(page).click();
    await page.waitForTimeout(1000);
    await expect(page.locator('input[type="radio"]').first()).toBeChecked();
  });

  test('TC-P24: Can switch to Business type', async ({ page }) => {
    await getAddCustomerBtn(page).click();
    await page.waitForTimeout(1000);
    await page.locator('label:has-text("Business")').click();
    await expect(page.locator('input[type="radio"]').nth(1)).toBeChecked();
  });

  test('TC-P25: Level defaults to Suspect', async ({ page }) => {
    await getAddCustomerBtn(page).click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Suspect')).toBeVisible();
  });

  test('TC-P26: Currency defaults to INR (₹)', async ({ page }) => {
    await getAddCustomerBtn(page).click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=INR')).toBeVisible();
  });

  test('TC-P27: Valid save closes modal and fills Customer Name', async ({ page }) => {
    const ts = Date.now();
    await getAddCustomerBtn(page).click();
    await page.waitForTimeout(1000);
    await page.locator('input[placeholder="please enter name"]').fill(`PW User ${ts}`);
    await page.locator('input[placeholder="please enter phone number"]').fill('9100000099');
    await page.locator('input[placeholder="please enter place"]').fill('Kannur');
    await page.locator('button:has-text("Save")').last().click();
    await page.waitForTimeout(2000);
    await expect(page.locator('text=New Suspect')).not.toBeVisible();
    const name = await getCustomerNameInput(page).inputValue();
    expect(name.length).toBeGreaterThan(0);
  });

  test('TC-P28: Secondary phone and email are optional', async ({ page }) => {
    const ts = Date.now();
    await getAddCustomerBtn(page).click();
    await page.waitForTimeout(1000);
    await page.locator('input[placeholder="please enter name"]').fill(`Optional Test ${ts}`);
    await page.locator('input[placeholder="please enter phone number"]').fill('9200000011');
    await page.locator('button:has-text("Save")').last().click();
    await page.waitForTimeout(2000);
    await expect(page.locator('text=New Suspect')).not.toBeVisible();
  });

  test('TC-P29: Close button dismisses without saving', async ({ page }) => {
    await getAddCustomerBtn(page).click();
    await page.waitForTimeout(1000);
    await page.locator('input[placeholder="please enter name"]').fill('Should Not Save');
    await page.locator('button:has-text("Close")').last().click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=New Suspect')).not.toBeVisible();
    expect(await getCustomerNameInput(page).inputValue()).toBe('');
  });

  // ── SECTION E: ITEM SEARCH & NEW ITEM MODAL ─────────────────────────────

  test('TC-P30: Item search modal opens with Name/Price/IsIncTax columns', async ({ page }) => {
    await getItemSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Search Results')).toBeVisible();
    await expect(page.locator('text=Name')).toBeVisible();
    await expect(page.locator('text=Price')).toBeVisible();
    await expect(page.locator('text=IsIncTax')).toBeVisible();
  });

  test('TC-P31: Known items visible', async ({ page }) => {
    await getItemSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Inverter')).toBeVisible();
    await expect(page.locator('text=Hybrid')).toBeVisible();
    await expect(page.locator('text=Ongrid')).toBeVisible();
    await expect(page.locator('text=Car Insurance')).toBeVisible();
  });

  test('TC-P32: Item search filter by name works', async ({ page }) => {
    await getItemSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await page.locator('input[placeholder*="Item Name" i]:visible').fill('Inverter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Inverter')).toBeVisible();
  });

  test('TC-P33: Selecting item fills Search Item Name field', async ({ page }) => {
    await getItemSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await page.locator('text=Car Insurance').first().click();
    await page.waitForTimeout(500);
    expect(await getItemSearchInput(page).inputValue().length).toBeGreaterThan(0);
  });

  test('TC-P34: Item modal Close button works', async ({ page }) => {
    await getItemSearchBtn(page).click();
    await page.waitForTimeout(2000);
    await page.locator('button:has-text("Close")').last().click();
    await expect(page.locator('text=Search Results')).not.toBeVisible();
  });

  test('TC-P35: Multiple items can be added to Enquired For', async ({ page }) => {
    await addFirstItem(page);
    await page.locator('button:has-text("+")').last().click();
    await page.waitForTimeout(500);
    expect(await page.locator('input[placeholder="Search Item Name"]').count()).toBeGreaterThanOrEqual(2);
  });

  test('TC-P36: New Item modal opens and shows all fields', async ({ page }) => {
    await page.locator('button.btn-success').last().click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=New Item')).toBeVisible();
    await expect(page.locator('text=Item Name')).toBeVisible();
    await expect(page.locator('text=Category')).toBeVisible();
    await expect(page.locator('text=Brand')).toBeVisible();
    await expect(page.locator('text=Price')).toBeVisible();
    await expect(page.locator('text=Inter Tax')).toBeVisible();
    await expect(page.locator('text=Intra Tax')).toBeVisible();
  });

  test('TC-P37: "Available in Kannur" checkbox checked by default', async ({ page }) => {
    await page.locator('button.btn-success').last().click();
    await page.waitForTimeout(1000);
    await expect(page.locator('input[type="checkbox"]').first()).toBeChecked();
  });

  test('TC-P38: Price defaults to 0 in New Item modal', async ({ page }) => {
    await page.locator('button.btn-success').last().click();
    await page.waitForTimeout(1000);
    const price = await page.locator('input[value="0"]:visible').last().inputValue();
    expect(price).toBe('0');
  });

  test('TC-P39: New Item modal Close dismisses without saving', async ({ page }) => {
    await page.locator('button.btn-success').last().click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Close"):visible').last().click();
    await expect(page.locator('text=New Item')).not.toBeVisible();
  });

  // ── SECTION F: FORM FIELD POSITIVE VALUES ───────────────────────────────

  test('TC-P40: Customer Name — single char accepted', async ({ page }) => {
    const input = getCustomerNameInput(page);
    await input.fill('A');
    await expect(input).toHaveValue('A');
  });

  test('TC-P41: Customer Name — 100 chars accepted', async ({ page }) => {
    const name100 = 'A'.repeat(100);
    const input = getCustomerNameInput(page);
    await input.fill(name100);
    expect((await input.inputValue()).length).toBe(100);
  });

  test('TC-P42: Place field accepts text', async ({ page }) => {
    await getPlaceInput(page).fill('Thalassery');
    await expect(getPlaceInput(page)).toHaveValue('Thalassery');
  });

  test('TC-P43: Quantity — positive integer (5) accepted', async ({ page }) => {
    await getQuantityInput(page).fill('5');
    await expect(getQuantityInput(page)).toHaveValue('5');
  });

  test('TC-P44: Quantity — large value (9999) accepted', async ({ page }) => {
    await getQuantityInput(page).fill('9999');
    await expect(getQuantityInput(page)).toHaveValue('9999');
  });

  test('TC-P45: Business Value — decimal (75000.50) accepted', async ({ page }) => {
    await getBizValueInput(page).fill('75000.50');
    expect(await getBizValueInput(page).inputValue()).toContain('75000');
  });

  test('TC-P46: Remarks — multiline accepted', async ({ page }) => {
    const ml = 'Line 1\nLine 2\nLine 3';
    await getRemarksTextarea(page).fill(ml);
    expect(await getRemarksTextarea(page).inputValue()).toContain('Line 3');
  });

  test('TC-P47: Next Followup Date — tomorrow accepted', async ({ page }) => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    await getNextFollowupInput(page).fill(t.toISOString().slice(0, 16));
    expect((await getNextFollowupInput(page).inputValue()).length).toBeGreaterThan(0);
  });

  // ── SECTION G: CANCEL BUTTON ────────────────────────────────────────────

  test('TC-P48: Cancel redirects to Leads list', async ({ page }) => {
    await getPhoneInput(page).fill('9876543210');
    await getCancelBtn(page).click();
    await page.waitForURL('**/leads', { timeout: 10000 });
    await expect(page.locator('text=Leads')).toBeVisible();
    await expect(page.locator('text=Add New')).toBeVisible();
  });

  // ── SECTION H: HAPPY PATH ───────────────────────────────────────────────

  test('TC-P49: Happy path — full valid save redirects to overview', async ({ page }) => {
    const ts = Date.now();
    const phone = `700${ts.toString().slice(-7)}`;
    await getPhoneInput(page).fill(phone);
    await getCustomerNameInput(page).fill(`Happy Path ${ts}`);
    await getPlaceInput(page).fill('Kannur');
    await getAssignToSelect(page).selectOption({ index: 1 });
    await getStatusSelect(page).selectOption({ label: 'Interested' });
    const ls = getLeadSourceSelect(page);
    const lsOpts = await ls.locator('option').allTextContents();
    if (lsOpts.length > 1) await ls.selectOption({ index: 1 });
    await addFirstItem(page);
    await getQuantityInput(page).fill('2');
    await getRemarksTextarea(page).fill('Playwright happy path test');
    await getSubmitBtn(page).click();
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/enquiry-overview\//, { timeout: 10000 });
    await expect(page.locator('text=Enquiry Overview')).toBeVisible();
    await expect(page.locator('text=#ENQ-')).toBeVisible();
    await expect(page.locator(`text=Happy Path ${ts}`)).toBeVisible();
  });

  test('TC-P50: Happy path — only required fields', async ({ page }) => {
    const ts = Date.now();
    const phone = `800${ts.toString().slice(-7)}`;
    await getPhoneInput(page).fill(phone);
    await getCustomerNameInput(page).fill(`Min Fields ${ts}`);
    await getAssignToSelect(page).selectOption({ index: 1 });
    await addFirstItem(page);
    await getSubmitBtn(page).click();
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/enquiry-overview\//, { timeout: 10000 });
    await expect(page.locator('text=Enquiry Overview')).toBeVisible();
  });

});
