'use strict';

/**
 * Diagnostic script — logs real URLs, button text, form field names,
 * and table structure from the live CRM so we can fix the POM selectors.
 *
 * Run:  node diagnostic.js
 */

require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

const BASE  = process.env.BASE_URL      || 'https://erptest.progbiz.in';
const CO    = process.env.COMPANY_CODE  || 'skiolo_test';
const USER  = process.env.CRM_USERNAME  || 'admin';
const PASS  = process.env.PASSWORD      || '123';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page    = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // ── 1. Login ───────────────────────────────────────────────────────────────
  console.log('\n🔐 Logging in...');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="company_code"], input[id*="company" i]').first().fill(CO);
  await page.locator('input[name="username"], input[id*="user" i]').first().fill(USER);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"], button:has-text("Login")').first().click();
  await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 20000 });
  console.log('✅ Logged in — URL:', page.url());
  await page.screenshot({ path: 'diag_01_dashboard.png' });

  // ── 2. Enquiry Listing ─────────────────────────────────────────────────────
  console.log('\n📋 Navigating to /enquiry ...');
  await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  console.log('URL:', page.url());
  await page.screenshot({ path: 'diag_02_enquiry_list.png' });

  // Print all buttons / links visible on listing page
  const listBtns = await page.evaluate(() =>
    [...document.querySelectorAll('a, button')]
      .filter(el => el.offsetParent !== null)
      .map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0, 60), href: el.href || '', cls: el.className }))
      .filter(b => b.text.length > 0)
      .slice(0, 40)
  );
  console.log('\n🔘 Visible buttons/links on Enquiry List:');
  listBtns.forEach(b => console.log(`  [${b.tag}] "${b.text}" cls="${b.cls}" href="${b.href}"`));

  // Print table/row structure
  const tableInfo = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr, .table tbody tr');
    if (!rows.length) return 'NO TABLE ROWS FOUND';
    const first = rows[0];
    return {
      rowCount: rows.length,
      firstRowHTML: first.innerHTML.substring(0, 800),
      firstRowLinks: [...first.querySelectorAll('a, button')].map(el => ({
        tag: el.tagName, text: el.textContent.trim(), href: el.href || '', cls: el.className
      }))
    };
  });
  console.log('\n📊 Table info:', JSON.stringify(tableInfo, null, 2));

  // ── 3. Add New Enquiry Form ────────────────────────────────────────────────
  console.log('\n➕ Looking for Add New button...');
  const addNewInfo = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('a, button')]
      .filter(el => /add|new|create/i.test(el.textContent) && el.offsetParent);
    return candidates.map(el => ({
      tag: el.tagName, text: el.textContent.trim(), href: el.href || '',
      id: el.id, cls: el.className
    }));
  });
  console.log('Add New candidates:', JSON.stringify(addNewInfo, null, 2));

  // Click the first "Add New" type button
  try {
    const addBtn = page.getByRole('link', { name: /add|new/i }).or(
                   page.getByRole('button', { name: /add|new/i })).first();
    await addBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    console.log('\n📝 Add New Form URL:', page.url());
    await page.screenshot({ path: 'diag_03_enquiry_form.png' });

    // Print all form inputs
    const formFields = await page.evaluate(() =>
      [...document.querySelectorAll('input, select, textarea')]
        .filter(el => el.offsetParent !== null)
        .map(el => ({
          tag: el.tagName, type: el.type || '', name: el.name,
          id: el.id, placeholder: el.placeholder, cls: el.className.substring(0, 50)
        }))
    );
    console.log('\n🗂  Form fields:');
    formFields.forEach(f => console.log(`  [${f.tag}] name="${f.name}" id="${f.id}" type="${f.type}" placeholder="${f.placeholder}"`));

    // Print all buttons in the form
    const formBtns = await page.evaluate(() =>
      [...document.querySelectorAll('button, input[type="submit"]')]
        .filter(el => el.offsetParent !== null)
        .map(el => ({ tag: el.tagName, text: el.textContent.trim(), type: el.type, id: el.id, cls: el.className }))
    );
    console.log('\n🔘 Form buttons:');
    formBtns.forEach(b => console.log(`  [${b.tag}] type="${b.type}" text="${b.text}" id="${b.id}"`));

  } catch (e) {
    console.log('⚠️  Could not open Add New form:', e.message);
  }

  // ── 4. Open First Enquiry from List ────────────────────────────────────────
  console.log('\n🔗 Going back to list to open first enquiry...');
  await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  try {
    // Try clicking first row link
    const firstLink = page.locator('table tbody tr').first().locator('a').first();
    const count = await firstLink.count();
    if (count > 0) {
      await firstLink.click();
    } else {
      // Click first row itself
      await page.locator('table tbody tr').first().click();
    }
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    console.log('Detail page URL:', page.url());
    await page.screenshot({ path: 'diag_04_enquiry_detail.png' });

    // Print detail page buttons
    const detailBtns = await page.evaluate(() =>
      [...document.querySelectorAll('a, button')]
        .filter(el => el.offsetParent !== null && el.textContent.trim().length > 0)
        .map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0, 80), href: el.href || '', id: el.id, cls: el.className }))
        .slice(0, 50)
    );
    console.log('\n🔘 Detail page buttons/links:');
    detailBtns.forEach(b => console.log(`  [${b.tag}] "${b.text}" id="${b.id}" cls="${b.cls}"`));

    // Print status dropdown options if any
    const statusOptions = await page.evaluate(() => {
      const sel = [...document.querySelectorAll('select')]
        .find(s => /status/i.test(s.name + s.id + s.className));
      if (!sel) return null;
      return { name: sel.name, id: sel.id, options: [...sel.options].map(o => o.text) };
    });
    console.log('\n📌 Status dropdown:', JSON.stringify(statusOptions, null, 2));

    // Follow-up section
    const followUpInfo = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('a, button')]
        .filter(el => /follow/i.test(el.textContent) && el.offsetParent);
      return candidates.map(el => ({ tag: el.tagName, text: el.textContent.trim(), href: el.href || '', cls: el.className }));
    });
    console.log('\n📞 Follow-up buttons:', JSON.stringify(followUpInfo, null, 2));

  } catch (e) {
    console.log('⚠️  Could not open detail page:', e.message);
  }

  // ── Save summary ───────────────────────────────────────────────────────────
  console.log('\n\n📸 Screenshots: diag_01_dashboard.png, diag_02_enquiry_list.png, diag_03_enquiry_form.png, diag_04_enquiry_detail.png');
  console.log('📄 Review the output above to update POM selectors.\n');

  await browser.close();
})();
