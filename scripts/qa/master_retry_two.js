'use strict';
// Targeted save for the two masters with multi-part forms: Payment Term (milestone
// rows must sum to 100 %) and Supplier (needs a Source of Supply). Fills every
// required control explicitly, saves, and looks the record up in the listing.
//   HEADED=1 node scripts/qa/master_retry_two.js
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, REPO = path.join(__dirname, '..', '..');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const STAMP = Date.now(); const OUT = {};
const afterSave = () => ({ url: location.pathname, alert: [...document.querySelectorAll('.swal2-popup,.toast,.alert')].map((e) => e.innerText).join(' | ').replace(/\s+/g, ' ').trim().slice(0, 140),
  validation: [...document.querySelectorAll('.validation-message,.invalid-feedback,.text-danger,.field-validation-error')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 6), error: /oops|went wrong|error code|exception/i.test(document.body.innerText) });
const verify = async (page, listing, NAME) => { await page.goto(`${BASE}${listing}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(4000);
  const sb = page.locator('#filter-name, input[placeholder*="Search" i], input[id*="search" i]').first();
  if (await sb.count()) { await sb.fill(NAME).catch(() => {}); await page.keyboard.press('Enter').catch(() => {}); await page.locator('button:has-text("Search"), [title="Search"]').first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(3500); }
  await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(2500);
  const rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  const hit = rows.find((r) => r.includes(NAME)); console.log(hit ? `  ✅ SAVED — in listing: ${hit.slice(0, 120)}` : `  ❌ NOT IN LISTING (${rows.length} rows)`); return !!hit; };

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const net = []; page.on('response', (r) => { const q = r.request(); if (['POST', 'PUT'].includes(q.method()) && /\/api\//.test(q.url()) && !/notification|negotiate/i.test(q.url())) net.push({ t: Date.now(), url: q.url().split('?')[0].replace(/^.*\/api\//, '/api/'), status: r.status() }); });
  const posts = (t0) => net.filter((n) => n.t >= t0).map((p) => p.status + ' ' + p.url).join(', ') || 'none';
  try {
    await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);

    // ── Payment Term ──
    { const NAME = `QA_payterm_${STAMP}`; console.log(`\n══ /payment-term ══`);
      await page.goto(`${BASE}/payment-term`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4500);
      // show every control with its surrounding text so the numeric ones can be told apart
      const ctl = await page.evaluate(() => [...document.querySelectorAll('form input:not([type=hidden]), form textarea, form select')].filter((e) => e.getClientRects().length).map((e, i) => ({ i, tag: e.tagName, type: e.type, id: e.id, ph: e.placeholder || '', ctx: (e.closest('td')?.closest('table')?.querySelectorAll('thead th')[[...e.closest('tr')?.children || []].indexOf(e.closest('td'))]?.innerText || e.closest('.form-group,.mb-3,.col,.col-md-6,.col-md-4,.col-md-3,div')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) })));
      ctl.forEach((c) => console.log(`    [${c.i}] ${c.tag.toLowerCase().padEnd(8)} ${c.type.padEnd(8)} #${(c.id || '-').padEnd(10)} ph="${c.ph}" ctx="${c.ctx}"`));
      const fi = page.locator('form input:visible, form textarea:visible, form select:visible');
      await page.fill('#textbox', NAME);
      for (const c of ctl) { const el = fi.nth(c.i); const k = `${c.ph} ${c.ctx}`.toLowerCase();
        if (c.id === 'textbox') continue;
        if (c.tag === 'SELECT') { await el.selectOption({ index: 1 }).catch(() => {}); continue; }
        if (c.tag === 'TEXTAREA') { await el.fill(`QA description ${STAMP}`).catch(() => {}); continue; }
        if (/installation|title|milestone|term/.test(k) && c.type !== 'number') { await el.fill(`QA milestone ${STAMP}`).catch(() => {}); continue; }
        if (/percent|%/.test(k)) { await el.fill('100').catch(() => {}); continue; }
        if (/day|duration|period|after|no\.?/.test(k) || c.type === 'number') { await el.fill(c.type === 'number' && !/percent/.test(k) ? '1' : '100').catch(() => {}); continue; } }
      // If nothing matched "percent", the unlabelled numerics are (percentage, days) in order.
      const nums = page.locator('form input[type=number]:visible, form input:visible:not([type]):not(#textbox)');
      const snap = await page.evaluate(() => [...document.querySelectorAll('form input')].filter((e) => e.getClientRects().length && !['hidden'].includes(e.type)).map((e) => ({ id: e.id, v: e.value })));
      console.log('  values now:', JSON.stringify(snap));
      const t0 = Date.now(); await page.locator('form button:has-text("Save"), button:has-text("Save")').first().click(); await page.waitForTimeout(6000);
      const a = await page.evaluate(afterSave); console.log(`  after save: ${a.url} POSTs=${posts(t0)}${a.alert ? ' alert="' + a.alert + '"' : ''}${a.validation.length ? ' validation=' + JSON.stringify(a.validation) : ''}${a.error ? ' ERROR' : ''}`);
      await page.locator('.swal2-confirm, button:has-text("OK")').first().click({ timeout: 1500 }).catch(() => {});
      OUT.paymentTerm = { name: NAME, controls: ctl, values: snap, after: a, posts: posts(t0), listed: await verify(page, '/payment-terms', NAME) }; }

    // ── Supplier ──
    { const NAME = `QA_supplier_${STAMP}`; console.log(`\n══ /supplier ══`);
      await page.goto(`${BASE}/supplier`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4500);
      const sos = await page.evaluate(() => { const lab = [...document.querySelectorAll('label, span, div, th, td')].find((e) => /source of supply/i.test(e.innerText || '') && e.innerText.trim().length < 40);
        if (!lab) return { found: false }; const box = lab.closest('.form-group,.mb-3,.col,.col-md-6,.col-md-4,.col-md-3,.row,div'); return { found: true, labelTag: lab.tagName, html: (box?.outerHTML || '').replace(/\s+/g, ' ').slice(0, 700) }; });
      console.log('  Source of Supply control:', sos.found ? sos.html : 'NOT FOUND in DOM');
      await page.fill('#company-name', NAME); await page.fill('#sup-display-name', NAME);
      await page.fill('#emailAddress', `qa${STAMP}@example.com`); await page.fill('#address', `QA address ${STAMP}`);
      await page.fill('#contact-person', `QA Contact ${STAMP}`); await page.fill('#contact-no', String(STAMP).slice(-10)); await page.fill('#contact-email', `qa.c${STAMP}@example.com`);
      await page.locator('input[placeholder="please enter phone number"]').first().fill(String(STAMP).slice(-10)).catch(() => {});
      await page.selectOption('#country', { label: 'India' }).catch(() => page.selectOption('#country', { index: 1 }).catch(() => {})); await page.waitForTimeout(1500);
      await page.selectOption('#state', { index: 1 }).catch(() => {});
      // Source of Supply: try a native select near the label, then a radio, then a custom dropdown.
      const sosSel = page.locator('xpath=//*[self::label or self::span or self::div][contains(normalize-space(.),"Source of Supply") and string-length(normalize-space(.))<40]/ancestor::div[1]//select').first();
      const sosRadio = page.locator('xpath=//*[self::label or self::span or self::div][contains(normalize-space(.),"Source of Supply") and string-length(normalize-space(.))<40]/ancestor::div[1]//input[@type="radio"]').first();
      if (await sosSel.count()) { await sosSel.selectOption({ index: 1 }); console.log('  Source of Supply: native select → option 1'); }
      else if (await sosRadio.count()) { await sosRadio.check(); console.log('  Source of Supply: radio → first'); }
      else { const dd = page.locator('xpath=//*[self::label or self::span or self::div][contains(normalize-space(.),"Source of Supply") and string-length(normalize-space(.))<40]/ancestor::div[1]//*[self::button or self::input or contains(@class,"dropdown") or contains(@class,"select")]').first();
        if (await dd.count()) { await dd.click(); await page.waitForTimeout(1200); const it = page.locator('.dropdown-menu.show li, .dropdown-menu.show a, [role=option], .dropdown-item, li').filter({ hasText: /\S/ }).first(); if (await it.count()) { console.log('  Source of Supply: custom dropdown → "' + (await it.innerText()).trim().slice(0, 30) + '"'); await it.click(); } else console.log('  Source of Supply: dropdown opened but no items'); }
        else console.log('  Source of Supply: no control located'); }
      await page.waitForTimeout(800);
      const t0 = Date.now(); await page.locator('form button:has-text("Save"), button:has-text("Save")').first().click(); await page.waitForTimeout(6000);
      const a = await page.evaluate(afterSave); console.log(`  after save: ${a.url} POSTs=${posts(t0)}${a.alert ? ' alert="' + a.alert + '"' : ''}${a.validation.length ? ' validation=' + JSON.stringify(a.validation) : ''}${a.error ? ' ERROR' : ''}`);
      await page.locator('.swal2-confirm, button:has-text("OK")').first().click({ timeout: 1500 }).catch(() => {});
      OUT.supplier = { name: NAME, sourceOfSupply: sos, after: a, posts: posts(t0), listed: await verify(page, '/suppliers', NAME) }; }
  } catch (e) { console.log('\nFATAL:', e.message.split('\n')[0].slice(0, 160)); }
  finally { if (process.env.HEADED) await page.waitForTimeout(3000); await browser.close(); }
  const out = path.join(REPO, 'reports', 'qa', 'raw', `master-retry-${String(C.company).replace(/\W+/g, '_')}.json`);
  fs.writeFileSync(out, JSON.stringify(OUT, null, 2)); console.log(`\n  ${path.relative(REPO, out)}`);
})();
