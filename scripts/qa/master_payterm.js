'use strict';
// Payment Term save: the slab row must be committed (icon button) before the
// 100 % validation counts it. Dump every button including icon-only ones,
// commit the row, save, verify in the listing.
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const NAME = `QA_payterm_${Date.now()}`;
(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const net = []; page.on('response', (r) => { const q = r.request(); if (['POST', 'PUT'].includes(q.method()) && /\/api\//.test(q.url()) && !/notification|negotiate/i.test(q.url())) net.push({ t: Date.now(), url: q.url().split('?')[0].replace(/^.*\/api\//, '/api/'), status: r.status() }); });
  try {
    await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);
    await page.goto(`${BASE}/payment-term`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4500);
    const btns = await page.evaluate(() => [...document.querySelectorAll('button, a[role=button], a.btn, [onclick], i.fa-plus, i.bi-plus, .fa-plus, .bi-plus-lg')].filter((e) => e.getClientRects().length).map((e) => ({ tag: e.tagName, text: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20), id: e.id, cls: String(e.className).slice(0, 50), title: e.title || e.getAttribute('aria-label') || '', icon: [...e.querySelectorAll('i,svg')].map((x) => x.className?.baseVal ?? x.className).join(' ').slice(0, 40) })));
    console.log('  all buttons:'); btns.forEach((b) => console.log(`    ${b.tag} "${b.text}" id=${b.id || '-'} cls="${b.cls}" title="${b.title}" icon="${b.icon}"`));
    const tables = await page.evaluate(() => [...document.querySelectorAll('form table, table')].map((t) => ({ head: [...t.querySelectorAll('thead th')].map((h) => h.innerText.trim()), rows: t.querySelectorAll('tbody tr').length })));
    console.log('  tables:', JSON.stringify(tables));
    const fi = page.locator('form input:visible, form textarea:visible, form select:visible');
    await page.fill('#textbox', NAME);
    await fi.nth(1).fill(`QA slab ${NAME.slice(-6)}`); await fi.nth(2).fill('QA detailed note'); await fi.nth(3).fill('1'); await fi.nth(4).selectOption({ index: 0 }); await fi.nth(5).fill('100');
    // commit the slab row: any button that is not Save/Go Back and looks like add
    const addBtn = btns.find((b) => !/save|go back|cancel/i.test(b.text) && /plus|add/i.test(`${b.text} ${b.icon} ${b.title} ${b.cls} ${b.id}`));
    console.log('  add-row candidate:', addBtn ? JSON.stringify(addBtn) : 'NONE');
    if (addBtn) { const l = addBtn.id ? page.locator(`#${addBtn.id}`) : addBtn.text ? page.locator(`${addBtn.tag.toLowerCase()}:visible`).filter({ hasText: addBtn.text }).first() : page.locator(`${addBtn.tag.toLowerCase()}:visible:has(i[class*="plus"]), ${addBtn.tag.toLowerCase()}:visible:has(svg)`).first();
      await l.click({ timeout: 5000 }).catch((e) => console.log('  add-row click failed:', e.message.split('\n')[0])); await page.waitForTimeout(2000);
      const t2 = await page.evaluate(() => [...document.querySelectorAll('form table, table')].map((t) => ({ head: [...t.querySelectorAll('thead th')].map((h) => h.innerText.trim()).slice(0, 6), rows: [...t.querySelectorAll('tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)) })));
      console.log('  tables after add-row:', JSON.stringify(t2)); }
    const t0 = Date.now(); await page.locator('form button:has-text("Save"), button:has-text("Save")').first().click(); await page.waitForTimeout(6000);
    const a = await page.evaluate(() => ({ url: location.pathname, alert: [...document.querySelectorAll('.swal2-popup,.toast,.alert')].map((e) => e.innerText).join(' | ').replace(/\s+/g, ' ').trim().slice(0, 140), validation: [...document.querySelectorAll('.validation-message,.invalid-feedback,.text-danger')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 6) }));
    console.log(`  after save: ${a.url} POSTs=${net.filter((n) => n.t >= t0).map((p) => p.status + ' ' + p.url).join(', ') || 'none'}${a.alert ? ' alert="' + a.alert + '"' : ''}${a.validation.length ? ' validation=' + JSON.stringify(a.validation) : ''}`);
    await page.locator('.swal2-confirm, button:has-text("OK")').first().click({ timeout: 1500 }).catch(() => {});
    await page.goto(`${BASE}/payment-terms`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
    const sb = page.locator('#filter-name, input[placeholder*="Search" i]').first(); if (await sb.count()) { await sb.fill(NAME); await page.keyboard.press('Enter'); await page.locator('button:has-text("Search"), [title="Search"]').first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(3500); }
    await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(2500);
    const rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    const hit = rows.find((r) => r.includes(NAME)); console.log(hit ? `  ✅ SAVED — in listing: ${hit.slice(0, 120)}` : `  ❌ NOT IN LISTING (${rows.length} rows)`);
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0].slice(0, 160)); }
  finally { if (process.env.HEADED) await page.waitForTimeout(3000); await browser.close(); }
})();
