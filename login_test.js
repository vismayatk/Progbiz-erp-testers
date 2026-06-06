/**
 * ERP LOGIN PAGE - Complete Edge Case Test Suite
 * URL: https://erptest.progbiz.in/login
 * Run: node login_test.js
 */

const { chromium } = require('playwright');
const fs = require('fs');

// ── CONFIG ──────────────────────────────────────────────────────────────────
const URL      = 'https://erptest.progbiz.in/login';
const VALID    = { company: 'lesol_test', username: 'admin', password: '123' };
const RESULTS  = [];

// ── HELPERS ─────────────────────────────────────────────────────────────────
function log(id, name, status, actual, expected, note = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon}  [${id}] ${name}`);
  if (status === 'FAIL') console.log(`      Expected : ${expected}`);
  if (status === 'FAIL') console.log(`      Actual   : ${actual}`);
  if (note)              console.log(`      Note     : ${note}`);
  RESULTS.push({ id, name, status, expected, actual, note });
}

async function openFreshPage(context) {
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  return page;
}

// Find the correct selectors for your ERP login form
async function detectSelectors(page) {
  const selectors = {
    company:  null,
    username: null,
    password: null,
    submit:   null,
  };

  // Company code field
  for (const s of ['[name="company_code"]','[name="company"]','[id*="company" i]',
                   '[placeholder*="company" i]','input:nth-of-type(1)']) {
    if (await page.locator(s).count() > 0) { selectors.company = s; break; }
  }
  // Username field
  for (const s of ['[name="username"]','[name="user"]','[id*="user" i]',
                   '[placeholder*="user" i]','input:nth-of-type(2)']) {
    if (await page.locator(s).count() > 0) { selectors.username = s; break; }
  }
  // Password field
  for (const s of ['[type="password"]','[name="password"]','[id*="pass" i]']) {
    if (await page.locator(s).count() > 0) { selectors.password = s; break; }
  }
  // Submit button
  for (const s of ['button[type="submit"]','input[type="submit"]',
                   'button:has-text("Login")','button:has-text("Sign In")',
                   'button:has-text("Log In")','[id*="login" i]']) {
    if (await page.locator(s).count() > 0) { selectors.submit = s; break; }
  }
  return selectors;
}

async function fillAndSubmit(page, sel, company, username, password) {
  if (company  !== null && sel.company)  await page.fill(sel.company,  company);
  if (username !== null && sel.username) await page.fill(sel.username, username);
  if (password !== null && sel.password) await page.fill(sel.password, password);
  if (sel.submit) await page.click(sel.submit);
  await page.waitForTimeout(2500);
}

async function isLoggedIn(page) {
  const url = page.url();
  return !url.includes('/login');
}

async function getError(page) {
  for (const s of ['.alert', '.alert-danger', '.error', '[class*="error" i]',
                   '[class*="invalid" i]', '.toast', '.notification',
                   '[role="alert"]']) {
    const el = page.locator(s).first();
    if (await el.count() > 0) {
      const txt = (await el.textContent()).trim();
      if (txt.length > 0) return txt;
    }
  }
  return '(no visible error message)';
}

// ── MAIN TEST RUNNER ─────────────────────────────────────────────────────────
(async () => {
  console.log('\n' + '='.repeat(60));
  console.log('  ERP LOGIN — EDGE CASE TEST SUITE');
  console.log('  URL: ' + URL);
  console.log('='.repeat(60) + '\n');

  const browser = await chromium.launch({
    headless: false,        // ← Change to true to run invisibly
    slowMo: 300,            // ← Slows actions so you can watch (ms)
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // Detect selectors once from a fresh page
  console.log('🔍 Detecting form field selectors...');
  const probePage = await openFreshPage(context);
  const SEL = await detectSelectors(probePage);
  console.log('   Company  :', SEL.company  || '❌ NOT FOUND');
  console.log('   Username :', SEL.username || '❌ NOT FOUND');
  console.log('   Password :', SEL.password || '❌ NOT FOUND');
  console.log('   Submit   :', SEL.submit   || '❌ NOT FOUND');
  await probePage.screenshot({ path: 'screenshot_login_page.png' });
  console.log('   📸 Screenshot saved: screenshot_login_page.png\n');
  await probePage.close();

  if (!SEL.company || !SEL.username || !SEL.password || !SEL.submit) {
    console.log('⚠️  Could not detect all selectors automatically.');
    console.log('   Open screenshot_login_page.png and check your form.');
    console.log('   Then update the detectSelectors() function above.\n');
  }

  console.log('─'.repeat(60));
  console.log('  RUNNING TESTS...');
  console.log('─'.repeat(60) + '\n');

  // ── TC-L01: Valid Login ──────────────────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, VALID.company, VALID.username, VALID.password);
    const loggedIn = await isLoggedIn(page);
    log('TC-L01', 'Valid credentials — should login successfully',
      loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'Redirected away from login' : 'Still on login page',
      'Redirect to dashboard');
    await page.screenshot({ path: 'tc_l01_valid_login.png' });
    await page.close();
  }

  // ── TC-L02: All fields empty ─────────────────────────────────────────────
  {
    const page = await openFreshPage(context);
    if (SEL.submit) await page.click(SEL.submit);
    await page.waitForTimeout(2000);
    const stillOnLogin = page.url().includes('/login') || page.url() === URL;
    const errMsg = await getError(page);
    log('TC-L02', 'All fields empty — click Login',
      stillOnLogin ? 'PASS' : 'FAIL',
      errMsg,
      'Stay on login with validation errors',
      'Error shown: ' + errMsg);
    await page.screenshot({ path: 'tc_l02_empty_fields.png' });
    await page.close();
  }

  // ── TC-L03: Wrong company code ───────────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, 'wrong_company_xyz', VALID.username, VALID.password);
    const loggedIn = await isLoggedIn(page);
    const errMsg = await getError(page);
    log('TC-L03', 'Wrong company code (wrong_company_xyz)',
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'LOGGED IN — SECURITY ISSUE!' : errMsg,
      'Error: invalid company or credentials');
    await page.screenshot({ path: 'tc_l03_wrong_company.png' });
    await page.close();
  }

  // ── TC-L04: Wrong username ───────────────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, VALID.company, 'wronguser', VALID.password);
    const loggedIn = await isLoggedIn(page);
    const errMsg = await getError(page);
    log('TC-L04', 'Wrong username (wronguser)',
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'LOGGED IN — SECURITY ISSUE!' : errMsg,
      'Error: invalid credentials');
    await page.screenshot({ path: 'tc_l04_wrong_username.png' });
    await page.close();
  }

  // ── TC-L05: Wrong password ───────────────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, VALID.company, VALID.username, 'wrongpass');
    const loggedIn = await isLoggedIn(page);
    const errMsg = await getError(page);
    log('TC-L05', 'Wrong password (wrongpass)',
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'LOGGED IN — SECURITY ISSUE!' : errMsg,
      'Error: invalid credentials');
    await page.screenshot({ path: 'tc_l05_wrong_password.png' });
    await page.close();
  }

  // ── TC-L06: Empty company code only ─────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, '', VALID.username, VALID.password);
    const loggedIn = await isLoggedIn(page);
    const errMsg = await getError(page);
    log('TC-L06', 'Company code empty (username + password filled)',
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'LOGGED IN — SECURITY ISSUE!' : errMsg,
      'Error: company code required');
    await page.screenshot({ path: 'tc_l06_empty_company.png' });
    await page.close();
  }

  // ── TC-L07: Empty username only ──────────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, VALID.company, '', VALID.password);
    const loggedIn = await isLoggedIn(page);
    const errMsg = await getError(page);
    log('TC-L07', 'Username empty (company + password filled)',
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'LOGGED IN — SECURITY ISSUE!' : errMsg,
      'Error: username required');
    await page.screenshot({ path: 'tc_l07_empty_username.png' });
    await page.close();
  }

  // ── TC-L08: Empty password only ─────────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, VALID.company, VALID.username, '');
    const loggedIn = await isLoggedIn(page);
    const errMsg = await getError(page);
    log('TC-L08', 'Password empty (company + username filled)',
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'LOGGED IN — SECURITY ISSUE!' : errMsg,
      'Error: password required');
    await page.screenshot({ path: 'tc_l08_empty_password.png' });
    await page.close();
  }

  // ── TC-L09: SQL Injection in username ────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, VALID.company, "' OR '1'='1", VALID.password);
    const loggedIn = await isLoggedIn(page);
    log('TC-L09', "SQL Injection in username (' OR '1'='1)",
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? '🚨 LOGGED IN — CRITICAL SECURITY VULNERABILITY!' : 'Blocked correctly',
      'Must NOT login — SQL injection must be blocked',
      loggedIn ? '🚨 REPORT THIS TO DEVELOPER IMMEDIATELY' : 'Safe');
    await page.screenshot({ path: 'tc_l09_sql_injection.png' });
    await page.close();
  }

  // ── TC-L10: SQL Injection in password ────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, VALID.company, VALID.username, "' OR '1'='1");
    const loggedIn = await isLoggedIn(page);
    log('TC-L10', "SQL Injection in password (' OR '1'='1)",
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? '🚨 LOGGED IN — CRITICAL SECURITY VULNERABILITY!' : 'Blocked correctly',
      'Must NOT login',
      loggedIn ? '🚨 REPORT THIS TO DEVELOPER IMMEDIATELY' : 'Safe');
    await page.screenshot({ path: 'tc_l10_sql_pwd.png' });
    await page.close();
  }

  // ── TC-L11: Spaces only in all fields ────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, '   ', '   ', '   ');
    const loggedIn = await isLoggedIn(page);
    log('TC-L11', 'Spaces only in all fields',
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'LOGGED IN — should not allow spaces-only' : 'Blocked',
      'Should trim and show required error');
    await page.screenshot({ path: 'tc_l11_spaces_only.png' });
    await page.close();
  }

  // ── TC-L12: Very long inputs (500 chars) ─────────────────────────────────
  {
    const page = await openFreshPage(context);
    const longStr = 'A'.repeat(500);
    await fillAndSubmit(page, SEL, longStr, longStr, longStr);
    const loggedIn = await isLoggedIn(page);
    const errMsg = await getError(page);
    log('TC-L12', 'Very long input (500 characters in each field)',
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'LOGGED IN with garbage input!' : errMsg,
      'Error or gracefully rejected');
    await page.screenshot({ path: 'tc_l12_long_input.png' });
    await page.close();
  }

  // ── TC-L13: Special characters in all fields ─────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, '!@#$%^&*()', '<script>alert(1)</script>', '{}[]|\\');
    const loggedIn = await isLoggedIn(page);
    log('TC-L13', 'Special characters & XSS attempt in all fields',
      !loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'LOGGED IN — SECURITY ISSUE!' : 'Blocked correctly',
      'Must not login or execute script');
    await page.screenshot({ path: 'tc_l13_special_chars.png' });
    await page.close();
  }

  // ── TC-L14: Case sensitivity check ───────────────────────────────────────
  {
    const page = await openFreshPage(context);
    await fillAndSubmit(page, SEL, VALID.company, 'ADMIN', VALID.password);
    const loggedIn = await isLoggedIn(page);
    log('TC-L14', 'Username in UPPERCASE (ADMIN)',
      true,  // just documenting behavior
      loggedIn ? 'LOGGED IN (case-insensitive)' : 'Failed (case-sensitive)',
      'Document whether login is case-sensitive',
      loggedIn ? 'Username is case-INSENSITIVE' : 'Username is case-SENSITIVE');
    await page.screenshot({ path: 'tc_l14_case_sensitivity.png' });
    await page.close();
  }

  // ── TC-L15: Double click submit ──────────────────────────────────────────
  {
    const page = await openFreshPage(context);
    if (SEL.company)  await page.fill(SEL.company,  VALID.company);
    if (SEL.username) await page.fill(SEL.username, VALID.username);
    if (SEL.password) await page.fill(SEL.password, VALID.password);
    if (SEL.submit)   await page.dblclick(SEL.submit);
    await page.waitForTimeout(3000);
    const loggedIn = await isLoggedIn(page);
    log('TC-L15', 'Double-click Login button',
      loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'Logged in (no error on double click)' : 'Failed or error on double click',
      'Should handle double-click gracefully, login once');
    await page.screenshot({ path: 'tc_l15_double_click.png' });
    await page.close();
  }

  // ── TC-L16: Press Enter key to submit ────────────────────────────────────
  {
    const page = await openFreshPage(context);
    if (SEL.company)  await page.fill(SEL.company,  VALID.company);
    if (SEL.username) await page.fill(SEL.username, VALID.username);
    if (SEL.password) await page.fill(SEL.password, VALID.password);
    if (SEL.password) await page.press(SEL.password, 'Enter');
    await page.waitForTimeout(3000);
    const loggedIn = await isLoggedIn(page);
    log('TC-L16', 'Press Enter key instead of clicking Login',
      loggedIn ? 'PASS' : 'FAIL',
      loggedIn ? 'Logged in via Enter key' : 'Enter key did not submit',
      'Enter key should submit the form');
    await page.screenshot({ path: 'tc_l16_enter_key.png' });
    await page.close();
  }

  // ── FINAL REPORT ────────────────────────────────────────────────────────
  await browser.close();

  const pass  = RESULTS.filter(r => r.status === 'PASS').length;
  const fail  = RESULTS.filter(r => r.status === 'FAIL').length;
  const total = RESULTS.length;

  console.log('\n' + '='.repeat(60));
  console.log(`  RESULTS: ${total} tests | ✅ PASS: ${pass} | ❌ FAIL: ${fail}`);
  console.log('='.repeat(60));

  // Save CSV report
  const csv = ['ID,Test Name,Status,Expected,Actual,Note',
    ...RESULTS.map(r =>
      `${r.id},"${r.name}",${r.status},"${r.expected}","${r.actual}","${r.note}"`)
  ].join('\n');
  fs.writeFileSync('login_test_results.csv', csv);
  console.log('\n📄 Results saved to: login_test_results.csv');
  console.log('📸 Screenshots saved for every test case\n');

  if (fail > 0) {
    console.log('❌ FAILED TESTS:');
    RESULTS.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`   [${r.id}] ${r.name}`);
      console.log(`          → ${r.actual}`);
    });
  }
})();
