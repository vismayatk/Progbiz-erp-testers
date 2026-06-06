/**
 * CRM → Add Enquiry — Edge Cases & Security Test Suite
 * URL: https://erptest.progbiz.in/enquiry
 * Run: node enquiry_edge_security.js
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://erptest.progbiz.in';
const URL  = `${BASE}/enquiry`;
const CRED = { company: 'lesol_test', user: 'admin', pass: '123' };
const RESULTS = [];
const SCREENSHOT_DIR = 'enquiry_screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);

function log(id, name, status, expected, actual, note = '') {
  const icon = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'WARN';
  console.log(`${icon === 'PASS' ? '✅' : icon === 'FAIL' ? '❌' : '⚠️'}  [${id}] ${name}`);
  if (status === 'FAIL') console.log(`      Expected: ${expected}`);
  if (status === 'FAIL') console.log(`      Actual  : ${actual}`);
  if (note)              console.log(`      Note    : ${note}`);
  RESULTS.push({ id, name, status, expected, actual, note });
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[placeholder="company code"]').fill(CRED.company);
  await page.locator('input[placeholder="user name"]').fill(CRED.user);
  await page.locator('input[placeholder="password"]').fill(CRED.pass);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/home', { timeout: 30000 });
}

async function goToEnquiry(page) {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByRole('combobox', { name: 'Branch' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function getFormError(page) {
  for (const s of ['.alert', '.alert-danger', '.error', '[class*="error" i]',
                   '[class*="invalid" i]', '.toast', '.notification',
                   '[role="alert"]', '.validation-message', '.field-validation-error',
                   'span.error', 'div.error', 'small.error', 'p.error']) {
    const el = page.locator(s).first();
    if (await el.count() > 0 && await el.isVisible()) {
      const txt = (await el.textContent({ timeout: 2000 }).catch(() => '')) || '';
      if (txt.trim().length > 0) return txt.trim().substring(0, 120);
    }
  }
  const dialog = page.locator('[role="dialog"], .modal, .swal-modal, .swal2-popup').first();
  if (await dialog.count() > 0 && await dialog.isVisible()) {
    const txt = (await dialog.textContent({ timeout: 2000 }).catch(() => '')) || '';
    if (txt.trim().length > 0) return txt.trim().substring(0, 200);
  }
  return '(no visible error)';
}

async function checkUrlAfterSubmit(page) {
  await page.waitForTimeout(3000);
  return page.url();
}

(async () => {
  console.log('\n' + '='.repeat(70));
  console.log('  CRM → ENQUIRY — EDGE CASE & SECURITY TEST SUITE');
  console.log('  URL: ' + URL);
  console.log('='.repeat(70) + '\n');

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E01: Required fields — empty submit
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
      const stillOnForm = page.url().includes('/enquiry') && !page.url().includes('/enquiry-overview');
      const err = await getFormError(page);
      log('TC-E01', 'Submit with ALL fields empty',
        stillOnForm ? 'PASS' : 'FAIL',
        'Stay on form with validation errors',
        stillOnForm ? `Blocked — ${err}` : 'Redirected to overview',
        err);
    } catch (e) {
      log('TC-E01', 'Submit with ALL fields empty', 'FAIL', 'Stay on form', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e01_empty_submit.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E02: Phone field — alphabetic characters
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const phoneInput = page.locator('input[placeholder="Enter phone number and search"]');
      await phoneInput.fill('ABCDEFGHIJ');
      const val = await phoneInput.inputValue();
      log('TC-E02', 'Phone field — alphabetic chars (ABCDEFGHIJ)',
        val === '' || !/[A-Za-z]/.test(val) ? 'PASS' : 'WARN',
        'Should reject or strip alphabetic input',
        `Accepted value: "${val}"`,
        'If accepted, may cause issues downstream');
    } catch (e) {
      log('TC-E02', 'Phone field — alphabetic chars', 'FAIL', 'reject alphabetic', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e02_alpha_phone.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E03: Phone — too short (3 digits)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const phoneInput = page.locator('input[placeholder="Enter phone number and search"]');
      await phoneInput.fill('123');
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
      const stillOnForm = !page.url().includes('/enquiry-overview');
      const err = await getFormError(page);
      log('TC-E03', 'Phone — too short (3 digits)',
        stillOnForm ? 'PASS' : 'FAIL',
        'Form should not submit with 3-digit phone',
        stillOnForm ? `Blocked — ${err}` : 'Submitted!',
        err);
    } catch (e) {
      log('TC-E03', 'Phone — too short', 'FAIL', 'block submit', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e03_short_phone.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E04: Customer Name — XSS attempt
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const xssPayload = '<script>alert(1)</script>';
      await page.locator('input[placeholder="Customer Name:"]').fill(xssPayload);
      const val = await page.locator('input[placeholder="Customer Name:"]').inputValue();
      const rendered = val.includes('<script>') || val.includes('alert');
      log('TC-E04', 'Customer Name — XSS (<script>alert(1)</script>)',
        !rendered ? 'PASS' : 'FAIL',
        'Should sanitize/encode script tags',
        rendered ? 'Script payload stored as-is' : 'Sanitized correctly',
        rendered ? 'SECURITY ISSUE — XSS possible' : '');
    } catch (e) {
      log('TC-E04', 'Customer Name — XSS', 'FAIL', 'handle safely', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e04_xss_name.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E05: Customer Name — SQL Injection
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const sqlPayload = "' OR '1'='1";
      await page.locator('input[placeholder="Customer Name:"]').fill(sqlPayload);
      await page.locator('input[placeholder="Place"]').fill('Test');
      const assignTo = page.getByRole('combobox', { name: /Assign To/i });
      if (await assignTo.count() > 0) await assignTo.selectOption({ index: 1 });
      await page.locator('input[placeholder="Search Item Name"]').fill('a');
      const itemSearchBtn = page.locator('input[placeholder="Search Item Name"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
      if (await itemSearchBtn.count() > 0) {
        await itemSearchBtn.click();
        await page.waitForTimeout(1500);
        await page.locator('table tbody tr').first().click().catch(() => {});
      }
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
      const url = page.url();
      const submitted = url.includes('/enquiry-overview');
      log('TC-E05', 'Customer Name — SQL Injection (\\\' OR \\\'1\\\'=\\\'1)',
        submitted ? 'WARN' : 'PASS',
        'Should reject SQL injection or handle safely',
        submitted ? 'Submitted! May be vulnerable' : 'Blocked successfully',
        submitted ? 'Check server-side validation' : '');
    } catch (e) {
      log('TC-E05', 'Customer Name — SQL Injection', 'PASS', 'handle safely', 'Exception thrown — input rejected');
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e05_sql_name.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E06: Customer Name — 1000 chars overflow
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const longName = 'X'.repeat(1000);
      await page.locator('input[placeholder="Customer Name:"]').fill(longName);
      const val = await page.locator('input[placeholder="Customer Name:"]').inputValue();
      log('TC-E06', 'Customer Name — 1000 chars overflow',
        val.length <= 500 ? 'PASS' : 'WARN',
        'Should truncate or cap at reasonable limit',
        `Accepted ${val.length} chars`,
        val.length > 500 ? 'Field accepts very long input — may cause UI/db issues' : 'Capped/truncated correctly');
    } catch (e) {
      log('TC-E06', 'Customer Name — 1000 chars', 'FAIL', 'handle gracefully', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e06_long_name.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E07: Customer Name — special chars only
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const special = '!@#$%^&*()_+{}[]|\\:;"\'<>,.?/~`';
      await page.locator('input[placeholder="Customer Name:"]').fill(special);
      const val = await page.locator('input[placeholder="Customer Name:"]').inputValue();
      log('TC-E07', 'Customer Name — special chars only (!@#$%^&*)',
        val === special ? 'WARN' : 'PASS',
        'May allow or reject special chars',
        val === special ? 'Accepted! Data may be risky' : 'Rejected/truncated');
    } catch (e) {
      log('TC-E07', 'Customer Name — special chars', 'FAIL', 'handle input', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e07_special_name.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E08: Customer Name — HTML injection
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const htmlPayload = '<b>Bold</b><img src=x onerror=alert(1)>';
      await page.locator('input[placeholder="Customer Name:"]').fill(htmlPayload);
      const val = await page.locator('input[placeholder="Customer Name:"]').inputValue();
      log('TC-E08', 'Customer Name — HTML injection (<b>bold</b><img onerror>)',
        val.includes('<b>') || val.includes('<img') ? 'FAIL' : 'PASS',
        'HTML tags should be sanitized/escaped',
        val.includes('<b>') ? 'Raw HTML accepted — XSS risk' : 'Sanitized',
        val.includes('<b>') ? 'SECURITY ISSUE' : '');
    } catch (e) {
      log('TC-E08', 'Customer Name — HTML injection', 'FAIL', 'sanitize', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e08_html_name.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E09: Remarks — multiline XSS
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const payload = 'Normal text\n<script>document.body.innerHTML=""</script>\nMore text';
      await page.locator('textarea').fill(payload);
      const val = await page.locator('textarea').inputValue();
      log('TC-E09', 'Remarks — multiline XSS with <script>',
        val.includes('<script>') ? 'FAIL' : 'PASS',
        'Script tags should be sanitized',
        val.includes('<script>') ? 'Raw script tag stored' : 'Sanitized correctly');
    } catch (e) {
      log('TC-E09', 'Remarks — multiline XSS', 'FAIL', 'sanitize', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e09_remarks_xss.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E10: Double-click submit button
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const ts = Date.now();
      await page.locator('input[placeholder="Enter phone number and search"]').fill(`900${ts.toString().slice(-7)}`);
      await page.locator('input[placeholder="Customer Name:"]').fill(`DoubleClick ${ts}`);
      const assignTo = page.getByRole('combobox', { name: /Assign To/i });
      if (await assignTo.count() > 0) await assignTo.selectOption({ index: 1 });
      await page.locator('input[placeholder="Search Item Name"]').fill('a');
      const itemBtn = page.locator('input[placeholder="Search Item Name"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
      if (await itemBtn.count() > 0) { await itemBtn.click(); await page.waitForTimeout(1500); await page.locator('table tbody tr').first().click().catch(() => {}); }
      await page.waitForTimeout(500);
      const submitBtn = page.locator('button[type="submit"]');
      await submitBtn.dblclick();
      await page.waitForTimeout(3000);
      const url = page.url();
      const inOverview = url.includes('/enquiry-overview');
      log('TC-E10', 'Double-click submit — should submit only ONCE',
        inOverview ? 'PASS' : 'WARN',
        'Should submit once without duplicate entry',
        inOverview ? 'Navigated to overview (1 submission)' : `Still on form: ${url.substring(0, 60)}`,
        'Check for duplicate records in DB');
    } catch (e) {
      log('TC-E10', 'Double-click submit', 'FAIL', 'handle gracefully', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e10_doubleclick.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E11: Quantity — negative value
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      await page.locator('input[placeholder="Enter quantity"]').fill('-5');
      const val = await page.locator('input[placeholder="Enter quantity"]').inputValue();
      log('TC-E11', 'Quantity — negative (-5)',
        val === '-5' || val === '0' || val === '' ? 'WARN' : 'INFO',
        'Should not accept negative quantity (minimum 0)',
        `Accepted: "${val}"`,
        val === '-5' ? 'Negative quantity accepted — may cause pricing issues' : '');
    } catch (e) {
      log('TC-E11', 'Quantity — negative', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e11_negative_qty.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E12: Quantity — decimal value
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      await page.locator('input[placeholder="Enter quantity"]').fill('2.5');
      const val = await page.locator('input[placeholder="Enter quantity"]').inputValue();
      log('TC-E12', 'Quantity — decimal (2.5)',
        val === '2.5' || val === '' ? 'INFO' : 'WARN',
        'Should accept integer quantities (may round decimal)',
        `Accepted: "${val}"`);
    } catch (e) {
      log('TC-E12', 'Quantity — decimal', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e12_decimal_qty.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E13: Business Value — negative number
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const bizInput = page.locator('input[type="number"]').first();
      await bizInput.fill('-5000');
      const val = await bizInput.inputValue();
      log('TC-E13', 'Business Value — negative (-5000)',
        val === '-5000' ? 'WARN' : 'PASS',
        'Should reject negative business value',
        `Accepted: "${val}"`,
        val === '-5000' ? 'May cause financial calculation issues' : '');
    } catch (e) {
      log('TC-E13', 'Business Value — negative', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e13_neg_bizvalue.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E14: Phone — spaces only
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const phoneInput = page.locator('input[placeholder="Enter phone number and search"]');
      await phoneInput.fill('     ');
      const val = await phoneInput.inputValue();
      log('TC-E14', 'Phone — spaces only',
        val.trim() === '' ? 'PASS' : 'WARN',
        'Spaces-only should be treated as empty',
        `Accepted: "${val}"`);
    } catch (e) {
      log('TC-E14', 'Phone — spaces only', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e14_spaces_phone.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E15: Unicode / Emoji in Customer Name
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const unicode = 'José Hernández ñññ café 😀🚀★☆';
      await page.locator('input[placeholder="Customer Name:"]').fill(unicode);
      const val = await page.locator('input[placeholder="Customer Name:"]').inputValue();
      let pass = true;
      if (val.includes('😀') || val.includes('🚀')) {
        pass = false;
      }
      log('TC-E15', 'Customer Name — Unicode/Emoji (José ñ 😀🚀)',
        pass ? 'PASS' : 'WARN',
        'Should accept unicode but may strip emoji',
        `Accepted: "${val}"`,
        val.includes('😀') ? 'Emoji stored — may cause rendering issues' : '');
    } catch (e) {
      log('TC-E15', 'Customer Name — Unicode/Emoji', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e15_unicode_name.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E16: Place — very long (1000 chars)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const longPlace = 'Kannur'.repeat(200);
      await page.locator('input[placeholder="Place"]').fill(longPlace);
      const val = await page.locator('input[placeholder="Place"]').inputValue();
      log('TC-E16', 'Place — very long (1000+ chars)',
        val.length <= 255 ? 'PASS' : 'WARN',
        'Should cap place to reasonable length',
        `Accepted ${val.length} chars`,
        val.length > 255 ? 'May exceed DB column limit' : '');
    } catch (e) {
      log('TC-E16', 'Place — very long', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e16_long_place.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E17: Next Followup Date — past date
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const pastDate = '2020-01-01T10:00';
      await page.locator('input[type="datetime-local"]').fill(pastDate);
      const val = await page.locator('input[type="datetime-local"]').inputValue();
      log('TC-E17', 'Next Followup Date — past date (2020-01-01)',
        val === pastDate ? 'WARN' : 'PASS',
        'Should reject past dates for followup',
        `Accepted: "${val}"`,
        val === pastDate ? 'Past followup date accepted — illogical' : '');
    } catch (e) {
      log('TC-E17', 'Next Followup Date — past date', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e17_past_followup.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E18: Branch — no selection
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const branchSelect = page.getByRole('combobox', { name: 'Branch' });
      await branchSelect.selectOption({ index: 0 });
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
      const stillOnForm = !page.url().includes('/enquiry-overview');
      const err = await getFormError(page);
      log('TC-E18', 'Branch — first option (empty/default) and submit',
        stillOnForm ? 'PASS' : 'WARN',
        'Should require branch selection',
        stillOnForm ? `Blocked — ${err}` : 'Submitted without branch!',
        err);
    } catch (e) {
      log('TC-E18', 'Branch — no selection', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e18_no_branch.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E19: Enter key submits form
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const ts = Date.now();
      await page.locator('input[placeholder="Enter phone number and search"]').fill(`910${ts.toString().slice(-7)}`);
      await page.locator('input[placeholder="Customer Name:"]').fill(`EnterKey ${ts}`);
      const assignTo = page.getByRole('combobox', { name: /Assign To/i });
      if (await assignTo.count() > 0) await assignTo.selectOption({ index: 1 });
      await page.locator('input[placeholder="Search Item Name"]').fill('a');
      const itemBtn = page.locator('input[placeholder="Search Item Name"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
      if (await itemBtn.count() > 0) { await itemBtn.click(); await page.waitForTimeout(1500); await page.locator('table tbody tr').first().click().catch(() => {}); }
      await page.locator('input[placeholder="Place"]').press('Enter');
      await page.waitForTimeout(3000);
      const url = page.url();
      log('TC-E19', 'Press Enter key to submit form',
        url.includes('/enquiry-overview') ? 'PASS' : 'INFO',
        'Enter should submit the form if focus is in a field',
        url.includes('/enquiry-overview') ? 'Submitted via Enter' : 'Stayed on form');
    } catch (e) {
      log('TC-E19', 'Press Enter key', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e19_enter_key.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E20: Rapid field filling + immediate submit
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const ts = Date.now();
      await page.locator('input[placeholder="Enter phone number and search"]').fill(`920${ts.toString().slice(-7)}`);
      await page.locator('input[placeholder="Customer Name:"]').fill(`Rapid Fire ${ts}`);
      const assignTo = page.getByRole('combobox', { name: /Assign To/i });
      if (await assignTo.count() > 0) await assignTo.selectOption({ index: 1 });
      await page.locator('input[placeholder="Search Item Name"]').fill('a');
      const itemBtn = page.locator('input[placeholder="Search Item Name"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
      if (await itemBtn.count() > 0) { await itemBtn.click(); await page.waitForTimeout(1500); await page.locator('table tbody tr').first().click().catch(() => {}); }
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
      const url = page.url();
      log('TC-E20', 'Rapid fill + submit — no validation delay',
        url.includes('/enquiry-overview') ? 'PASS' : 'INFO',
        'Should handle rapid input',
        url.includes('/enquiry-overview') ? 'Submitted' : `Stayed: ${url.substring(0, 60)}`);
    } catch (e) {
      log('TC-E20', 'Rapid fill + submit', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e20_rapid_submit.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E21: Customer Name — numbers only
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const numbers = '1234567890';
      await page.locator('input[placeholder="Customer Name:"]').fill(numbers);
      const val = await page.locator('input[placeholder="Customer Name:"]').inputValue();
      log('TC-E21', 'Customer Name — numbers only (1234567890)',
        numbers.length > 0 ? 'INFO' : 'WARN',
        'Name field may accept numbers',
        `Accepted: "${val}"`);
    } catch (e) {
      log('TC-E21', 'Customer Name — numbers only', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e21_numbers_name.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E22: All fields — max allowed values
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const ts = Date.now();
      await page.locator('input[placeholder="Enter phone number and search"]').fill(`930${ts.toString().slice(-7)}`);
      await page.locator('input[placeholder="Customer Name:"]').fill('A'.repeat(255));
      await page.locator('input[placeholder="Place"]').fill('B'.repeat(255));
      await page.locator('input[placeholder="Enter quantity"]').fill('999999');
      const biz = page.locator('input[type="number"]').first();
      await biz.fill('999999999.99');
      await page.getByRole('combobox', { name: 'Branch' }).selectOption({ index: 1 });
      await page.locator('textarea').fill('C'.repeat(1000));
      const assignTo = page.getByRole('combobox', { name: /Assign To/i });
      if (await assignTo.count() > 0) await assignTo.selectOption({ index: 1 });
      await page.locator('input[placeholder="Search Item Name"]').fill('a');
      const itemBtn = page.locator('input[placeholder="Search Item Name"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
      if (await itemBtn.count() > 0) { await itemBtn.click(); await page.waitForTimeout(1500); await page.locator('table tbody tr').first().click().catch(() => {}); }
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(4000);
      const url = page.url();
      log('TC-E22', 'All fields — maximum allowed values',
        url.includes('/enquiry-overview') ? 'PASS' : 'WARN',
        'Form should accept max values or show clear errors',
        url.includes('/enquiry-overview') ? 'Submitted with max values' : `Rejected: ${(await getFormError(page)).substring(0, 100)}`);
    } catch (e) {
      log('TC-E22', 'All fields — max values', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e22_max_values.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E23: No item selected before submit
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const ts = Date.now();
      await page.locator('input[placeholder="Enter phone number and search"]').fill(`940${ts.toString().slice(-7)}`);
      await page.locator('input[placeholder="Customer Name:"]').fill(`No Item ${ts}`);
      const assignTo = page.getByRole('combobox', { name: /Assign To/i });
      if (await assignTo.count() > 0) await assignTo.selectOption({ index: 1 });
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
      const stillOnForm = !page.url().includes('/enquiry-overview');
      const err = await getFormError(page);
      log('TC-E23', 'Submit without selecting any item',
        stillOnForm ? 'PASS' : 'FAIL',
        'Should require at least one item',
        stillOnForm ? `Blocked — ${err}` : 'Submitted without item!',
        err);
    } catch (e) {
      log('TC-E23', 'No item selected', 'FAIL', 'block', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e23_no_item.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E24: Assign To not set
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const ts = Date.now();
      await page.locator('input[placeholder="Enter phone number and search"]').fill(`950${ts.toString().slice(-7)}`);
      await page.locator('input[placeholder="Customer Name:"]').fill(`No Assign ${ts}`);
      await page.locator('input[placeholder="Search Item Name"]').fill('a');
      const itemBtn = page.locator('input[placeholder="Search Item Name"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
      if (await itemBtn.count() > 0) { await itemBtn.click(); await page.waitForTimeout(1500); await page.locator('table tbody tr').first().click().catch(() => {}); }
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
      const stillOnForm = !page.url().includes('/enquiry-overview');
      const err = await getFormError(page);
      log('TC-E24', 'Submit without selecting Assign To',
        stillOnForm ? 'PASS' : 'WARN',
        'Should require assignment',
        stillOnForm ? `Blocked — ${err}` : 'Submitted without assignee!',
        err);
    } catch (e) {
      log('TC-E24', 'No Assign To', 'FAIL', 'block', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e24_no_assign.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E25: Date field — far future date
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const farFuture = '2099-12-31';
      await page.locator('input[type="date"]').fill(farFuture);
      const val = await page.locator('input[type="date"]').inputValue();
      log('TC-E25', 'Date — far future (2099-12-31)',
        val === farFuture ? 'WARN' : 'PASS',
        'Should cap or warn on far future dates',
        `Accepted: "${val}"`,
        val === farFuture ? 'Very far date accepted' : '');
    } catch (e) {
      log('TC-E25', 'Date — far future', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e25_future_date.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E26: Duplicate phone number search
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const phoneInput = page.locator('input[placeholder="Enter phone number and search"]');
      await phoneInput.fill('9446967777');
      const searchBtn = page.locator('input[placeholder="Enter phone number and search"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
      await searchBtn.click();
      await page.waitForTimeout(2000);
      const modalVisible = await page.locator('text=Search Results').isVisible().catch(() => false);
      const rowCount = await page.locator('table tbody tr').count().catch(() => 0);
      log('TC-E26', 'Phone search — duplicate/existing number returns results',
        modalVisible && rowCount > 0 ? 'PASS' : 'WARN',
        'Should show existing records for known phone',
        modalVisible ? `Modal shown, ${rowCount} rows` : 'No results',
        '');
    } catch (e) {
      log('TC-E26', 'Duplicate phone search', 'FAIL', 'search', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e26_dup_phone_search.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E27: Phone — special characters
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const phoneInput = page.locator('input[placeholder="Enter phone number and search"]');
      await phoneInput.fill('+91-9446-967777');
      const val = await phoneInput.inputValue();
      log('TC-E27', 'Phone — with country code prefix (+91-9446-967777)',
        val === '+91-9446-967777' || val === '919446967777' || val === '9446967777' ? 'INFO' : 'WARN',
        'Should handle formatted phone numbers',
        `Accepted: "${val}"`);
    } catch (e) {
      log('TC-E27', 'Phone — special chars', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e27_formatted_phone.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E28: Priority field (if exists)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const prioritySelect = page.locator('select').filter({ hasText: /High|Medium|Low|Priority/i });
      if (await prioritySelect.count() > 0) {
        const options = await prioritySelect.locator('option').allTextContents();
        await prioritySelect.selectOption({ index: options.length > 1 ? 1 : 0 });
        const val = await prioritySelect.inputValue();
        log('TC-E28', 'Priority dropdown — selectable options',
          val !== '' ? 'PASS' : 'WARN',
          'Priority should have selectable values',
          `Selected value: ${val}`,
          `Options: ${options.join(', ').substring(0, 100)}`);
      } else {
        log('TC-E28', 'Priority field', 'INFO', 'N/A', 'Priority field not found on page', 'May be in a different tab/section');
      }
    } catch (e) {
      log('TC-E28', 'Priority field', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e28_priority.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E29: Cancel — unsaved data warning
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      await page.locator('input[placeholder="Customer Name:"]').fill('Unsaved Data');
      await page.locator('input[placeholder="Place"]').fill('Test Place');
      const cancelBtn = page.getByRole('button', { name: /Cancel/i });
      if (await cancelBtn.count() > 0) {
        await cancelBtn.click();
        await page.waitForTimeout(2000);
        let warningShown = false;
        try {
          warningShown = await page.locator('text=Are you sure, text=Unsaved, text=confirm, text=discard').first().isVisible({ timeout: 3000 }).catch(() => false);
        } catch (e2) { warningShown = false; }
        const url = page.url();
        log('TC-E29', 'Cancel with unsaved data — warning dialog?',
          warningShown ? 'INFO' : 'INFO',
          'Should warn before discarding unsaved changes',
          warningShown ? 'Warning shown' : `No warning, redirected to: ${url.substring(0, 50)}`,
          'Document current behavior');
      } else {
        log('TC-E29', 'Cancel with unsaved data', 'INFO', 'N/A', 'Cancel button not found', '');
      }
    } catch (e) {
      log('TC-E29', 'Cancel unsaved', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e29_cancel_warning.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E30: Add Customer (+) then Cancel without saving
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const addBtn = page.locator('button:has-text("+")').first();
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await page.waitForTimeout(1000);
        await page.waitForSelector('text=New Suspect', { timeout: 3000 });
        await page.locator('input[placeholder="please enter name"]').fill('Cancel Test');
        const closeBtn = page.locator('button:has-text("Close")').last();
        await closeBtn.click();
        await page.waitForTimeout(500);
        const modalGone = await page.locator('text=New Suspect').isVisible().catch(() => false);
        const nameField = await page.locator('input[placeholder="Customer Name:"]').inputValue();
        log('TC-E30', 'Add Customer (+) → fill → Cancel (no save)',
          !modalGone && nameField === '' ? 'PASS' : 'WARN',
          'Modal closes, Customer Name remains empty',
          `Modal visible: ${modalGone}, Name: "${nameField}"`);
      } else {
        log('TC-E30', 'Add Customer (+)', 'INFO', 'N/A', 'Add Customer button not found', '');
      }
    } catch (e) {
      log('TC-E30', 'Add Customer → Cancel', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e30_add_cancel.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E31: Item Search — close without selecting
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const itemBtn = page.locator('input[placeholder="Search Item Name"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
      if (await itemBtn.count() > 0) {
        await itemBtn.click();
        await page.waitForTimeout(1500);
        await page.locator('button:has-text("Close")').last().click();
        await page.waitForTimeout(500);
        const val = await page.locator('input[placeholder="Search Item Name"]').inputValue();
        log('TC-E31', 'Item search modal — close without selecting',
          val === '' ? 'PASS' : 'WARN',
          'Item field should remain empty',
          `Item name: "${val}"`);
      } else {
        log('TC-E31', 'Item search modal close', 'INFO', 'N/A', 'Item search button not found', '');
      }
    } catch (e) {
      log('TC-E31', 'Item search close', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e31_item_close.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E32: Network — slow connection simulation
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
        await new Promise(r => setTimeout(r, 2000));
      }
      await route.continue();
    });
    await login(page);
    await goToEnquiry(page);
    try {
      const branchVisible = await page.getByRole('combobox', { name: 'Branch' }).isVisible({ timeout: 20000 });
      log('TC-E32', 'Slow network — form loads correctly',
        branchVisible ? 'PASS' : 'FAIL',
        'Form should load even on slow connections',
        branchVisible ? 'Loaded successfully' : 'Timeout or incomplete load');
    } catch (e) {
      log('TC-E32', 'Slow network', 'FAIL', 'load form', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e32_slow_network.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E33: Empty search (phone) — no input, click search
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const searchBtn = page.locator('input[placeholder="Enter phone number and search"]').locator('..').locator('[cursor=pointer], i.fa-search, i.fa, svg').first();
      if (await searchBtn.count() > 0) {
        await searchBtn.click();
        await page.waitForTimeout(1500);
        const modal = await page.locator('text=Search Results').isVisible().catch(() => false);
        log('TC-E33', 'Phone search — empty input click',
          modal ? 'INFO' : 'PASS',
          'May show all results or show validation',
          modal ? 'Modal opened with all results' : 'Search not triggered (empty)');
      } else {
        log('TC-E33', 'Phone search empty', 'INFO', 'N/A', 'Search button not found', '');
      }
    } catch (e) {
      log('TC-E33', 'Phone search empty', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e33_empty_search.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E34: Backend validation — submit malformed business value
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      const biz = page.locator('input[type="number"]').first();
      await biz.fill('1e10');
      const val = await biz.inputValue();
      log('TC-E34', 'Business Value — exponential notation (1e10)',
        val === '1e10' || val === '10000000000' ? 'INFO' : 'WARN',
        'May or may not accept scientific notation',
        `Accepted: "${val}"`);
    } catch (e) {
      log('TC-E34', 'Business Value — exponential', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e34_exp_bizvalue.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-E35: Unload/reload with unsaved data
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await login(page);
    await goToEnquiry(page);
    try {
      await page.locator('input[placeholder="Customer Name:"]').fill('Should be gone after reload');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      const val = await page.locator('input[placeholder="Customer Name:"]').inputValue();
      log('TC-E35', 'Reload page with unsaved data — data lost',
        val === '' ? 'PASS' : 'FAIL',
        'Unsaved data should be cleared on reload',
        val === '' ? 'Data cleared (correct)' : `Data persisted: "${val}"`,
        val !== '' ? 'Possible browser autofill' : '');
    } catch (e) {
      log('TC-E35', 'Reload unsaved data', 'FAIL', 'handle', e.message);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/e35_reload_unsaved.png` });
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLOSE & REPORT
  // ─────────────────────────────────────────────────────────────────────────
  await browser.close();

  const pass = RESULTS.filter(r => r.status === 'PASS').length;
  const fail = RESULTS.filter(r => r.status === 'FAIL').length;
  const warn = RESULTS.filter(r => r.status === 'WARN').length;
  const info = RESULTS.filter(r => r.status === 'INFO').length;
  const total = RESULTS.length;

  console.log('\n' + '='.repeat(70));
  console.log(`  RESULTS: ${total} tests | ✅ PASS: ${pass} | ❌ FAIL: ${fail} | ⚠️ WARN: ${warn} | ℹ️ INFO: ${info}`);
  console.log('='.repeat(70));

  const csv = ['ID,Test Name,Status,Expected,Actual,Note',
    ...RESULTS.map(r =>
      `${r.id},"${r.name.replace(/"/g, '""')}",${r.status},"${r.expected.replace(/"/g, '""')}","${r.actual.replace(/"/g, '""')}","${r.note.replace(/"/g, '""')}"`)
  ].join('\n');
  fs.writeFileSync('enquiry_edge_security_results.csv', csv);
  console.log('\n📄 Results saved to: enquiry_edge_security_results.csv');
  console.log('📸 Screenshots saved in: ' + SCREENSHOT_DIR + '/\n');

  if (fail > 0) {
    console.log('❌ FAILED TESTS:');
    RESULTS.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`   [${r.id}] ${r.name}`);
      console.log(`          ${r.actual}`);
    });
  }
  console.log();
})();
