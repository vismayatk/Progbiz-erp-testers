'use strict';
/**
 * Reach and study the edit-client form, plus the superadmin home page and the
 * membership package editor.
 *
 * The Action pencil on /clients carries no href — the handler is bound in
 * Blazor — so the form can only be reached by clicking it. That click is pure
 * navigation: it opens an editor. Nothing is typed and Save is never pressed,
 * so the tenant is left exactly as found.
 *
 *   SUPPORT_USERNAME=superadmin SUPPORT_PASSWORD=... node scripts/qa/support/study_edit_client.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE = process.env.SUPPORT_BASE_URL || 'https://dev.erp.progbiz.in';
const USER = process.env.SUPPORT_USERNAME;
const PASS = process.env.SUPPORT_PASSWORD;
const REPO = path.join(__dirname, '..', '..', '..');
if (!USER || !PASS) { console.error('Set SUPPORT_USERNAME / SUPPORT_PASSWORD'); process.exit(2); }

const formInventory = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const labelFor = (e) => clean(
    (e.labels && e.labels[0] && e.labels[0].innerText) ||
    e.closest('.form-group,.col,.mb-3,.row > div')?.querySelector('label')?.innerText || ''
  ).slice(0, 40);
  return {
    url: location.pathname,
    heading: clean(document.querySelector('h1,h2,h3,.card-title,.page-title')?.innerText).slice(0, 80),
    fieldsInOrder: [...document.querySelectorAll('input,select,textarea')].filter(on)
      .filter((e) => e.type !== 'hidden')
      .map((e) => ({ id: e.id || null, tag: e.tagName.toLowerCase(), type: e.type || null, label: labelFor(e) })),
    buttons: [...document.querySelectorAll('button, a.btn')].filter(on)
      .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 34),
        title: b.getAttribute('data-bs-title') || b.getAttribute('title') || null,
        icon: (b.querySelector('i') || {}).className || null })).filter((b) => b.id || b.text || b.title || b.icon),
    tables: [...document.querySelectorAll('table')].filter(on).map((t) => ({
      columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean),
      rowCount: t.querySelectorAll('tbody tr').length,
      firstRow: [...(t.querySelector('tbody tr')?.querySelectorAll('td') || [])].map((c) => clean(c.innerText).slice(0, 24)),
    })).filter((t) => t.columns.length),
    tabs: [...document.querySelectorAll('.nav-link, [role="tab"]')].filter(on)
      .map((e) => clean(e.innerText).slice(0, 30)).filter(Boolean),
    bodyChars: clean(document.body.innerText).length,
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const S = {};
  const shot = async (n) => {
    const p = path.join(REPO, 'reports', 'qa', 'shots', 'support', `${n}.png`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  };

  try {
    await page.goto(`${BASE}/support-login/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#signin-username').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#signin-username').fill(USER);
    await page.locator('#signin-password').fill(PASS);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(6000);

    // ── Superadmin home, in full ───────────────────────────────────────────
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4500);
    S.home = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return {
        fullText: clean(document.body.innerText),
        cards: [...document.querySelectorAll('.card, .widget, .tile')].filter(on)
          .map((c) => clean(c.innerText).slice(0, 120)).filter(Boolean),
        anyNumbers: (clean(document.body.innerText).match(/\b\d[\d,]*\.?\d*\b/g) || []).slice(0, 12),
      };
    });
    await shot('home_full');
    console.log('══ SUPERADMIN HOME ══');
    console.log('  text:', S.home.fullText.slice(0, 500));
    console.log('  cards:', JSON.stringify(S.home.cards).slice(0, 300));

    // ── Open edit-client by clicking the Action pencil (navigation only) ──
    await page.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    const before = page.url();
    await page.locator('table tbody tr').first().locator('a:has(i.ri-pencil-line)').first()
      .click({ timeout: 10000 }).catch((e) => { S.pencilClickError = e.message.split('\n')[0].slice(0, 110); });
    await page.waitForTimeout(6000);
    S.editClient = await page.evaluate(formInventory);
    S.editClient.navigatedFrom = before.replace(BASE, '');
    await shot('edit_client_full');
    console.log('\n══ EDIT CLIENT ══');
    console.log('  url:', S.editClient.url, '| heading:', S.editClient.heading, '| fields:', S.editClient.fieldsInOrder.length);
    S.editClient.fieldsInOrder.forEach((f, i) =>
      console.log(`   ${String(i + 1).padStart(2)}. ${(f.label || '(no label)').padEnd(32)} ${f.tag}#${f.id || '-'}`));
    console.log('  tabs:', JSON.stringify(S.editClient.tabs));
    console.log('  buttons:', JSON.stringify(S.editClient.buttons.map((b) => b.text || b.title || b.id).slice(0, 14)));
    console.log('  grids:', JSON.stringify(S.editClient.tables.map((t) => ({ cols: t.columns, rows: t.rowCount }))));

    // ── Membership package editor — where feature/role toggles live ───────
    await page.goto(`${BASE}/membership-packages`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4500);
    await page.locator('table tbody tr').first().locator('a:has(i.ri-pencil-line), a.btn').first()
      .click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(6000);
    S.membershipPackage = await page.evaluate(formInventory);
    await shot('membership_package_full');
    console.log('\n══ MEMBERSHIP PACKAGE EDITOR ══');
    console.log('  url:', S.membershipPackage.url, '| heading:', S.membershipPackage.heading,
      '| fields:', S.membershipPackage.fieldsInOrder.length);
    const checkboxes = S.membershipPackage.fieldsInOrder.filter((f) => f.type === 'checkbox');
    console.log(`  checkbox/feature toggles: ${checkboxes.length}`);
    console.log('  sample toggles:', JSON.stringify(checkboxes.slice(0, 18).map((f) => f.label || f.id)));

  } catch (e) {
    console.log('\nERR:', e.message);
    S.error = e.message;
  } finally {
    await browser.close();
  }

  const out = path.join(REPO, 'reports', 'qa', 'raw', 'support-edit-client-study.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(S, null, 2));
  console.log(`\n✅ wrote ${path.relative(REPO, out)} — no Save was pressed, no tenant modified`);
})();
