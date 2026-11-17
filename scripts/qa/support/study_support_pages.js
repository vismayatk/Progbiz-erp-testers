'use strict';
/**
 * Deep study of the support console pages named in the change requests.
 *
 * Establishes what already exists before anyone estimates building it —
 * several of the requested features appear to be partly present, and the
 * cheapest change is the one already written.
 *
 * Still read-only: navigates, reads the DOM, and opens the edit form for one
 * client WITHOUT saving. No approve, no block, no save, no delete.
 *
 *   SUPPORT_USERNAME=superadmin SUPPORT_PASSWORD=... node scripts/qa/support/study_support_pages.js
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

/** Full form inventory — labels matter for the "align the controls" request. */
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
    heading: clean(document.querySelector('h1,h2,h3,.card-title,.page-title')?.innerText).slice(0, 80),
    // Order matters: it is what "align the controls same like add-client" is about.
    fieldsInOrder: [...document.querySelectorAll('input,select,textarea')].filter(on)
      .filter((e) => e.type !== 'hidden')
      .map((e) => ({ id: e.id || null, tag: e.tagName.toLowerCase(), type: e.type || null, label: labelFor(e) })),
    buttons: [...document.querySelectorAll('button, a.btn')].filter(on)
      .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 34) })).filter((b) => b.id || b.text),
    tables: [...document.querySelectorAll('table')].filter(on).map((t) => ({
      columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean),
      rowCount: t.querySelectorAll('tbody tr').length,
      firstRowHTMLSample: clean(t.querySelector('tbody tr')?.innerHTML || '').slice(0, 400),
    })).filter((t) => t.columns.length),
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
    console.log('logged in →', page.url().replace(BASE, ''));

    // ── /home : what does the Support Console landing page actually hold? ──
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4000);
    S.home = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return { fullText: clean(document.body.innerText).slice(0, 900) };
    });
    await shot('home_detail');
    console.log('\n══ /home (Support Console) ══');
    console.log('  ', S.home.fullText.slice(0, 400));

    // ── /clients : find how a client is opened for editing ────────────────
    await page.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4500);
    S.clients = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)[0];
      const rows = t ? [...t.querySelectorAll('tbody tr')] : [];
      return {
        columns: t ? [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)) : [],
        rowCount: rows.length,
        // How does the Action column open a client?
        actionMarkup: rows.slice(0, 2).map((r) => {
          const cells = [...r.querySelectorAll('td')];
          const last = cells[cells.length - 1];
          return last ? clean(last.innerHTML).slice(0, 320) : '';
        }),
        anchorHrefs: [...new Set(rows.flatMap((r) =>
          [...r.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))))].slice(0, 6),
        onclicks: [...new Set(rows.flatMap((r) =>
          [...r.querySelectorAll('[onclick]')].map((a) => (a.getAttribute('onclick') || '').slice(0, 90))))].slice(0, 4),
      };
    });
    await shot('clients_detail');
    console.log('\n══ /clients ══');
    console.log('   columns:', JSON.stringify(S.clients.columns));
    console.log('   action markup:', JSON.stringify(S.clients.actionMarkup[0] || '').slice(0, 300));
    console.log('   hrefs:', JSON.stringify(S.clients.anchorHrefs));
    console.log('   onclick:', JSON.stringify(S.clients.onclicks));

    // ── /client-payment-pending : does an Approve control already exist? ──
    await page.goto(`${BASE}/client-payment-pending`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4500);
    S.paymentPending = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)[0];
      if (!t) return null;
      const cols = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText));
      const ai = cols.findIndex((c) => /approve/i.test(c));
      const rows = [...t.querySelectorAll('tbody tr')];
      return {
        columns: cols,
        approveColumnIndex: ai,
        rowCount: rows.length,
        approveCellMarkup: ai >= 0 ? rows.slice(0, 3).map((r) => {
          const c = [...r.querySelectorAll('td')][ai];
          return c ? clean(c.innerHTML).slice(0, 240) : '(no cell)';
        }) : null,
        firstRow: rows.length ? [...rows[0].querySelectorAll('td')].map((c) => clean(c.innerText).slice(0, 20)) : [],
      };
    });
    await shot('client_payment_pending_detail');
    console.log('\n══ /client-payment-pending ══');
    console.log('   columns:', JSON.stringify(S.paymentPending?.columns));
    console.log('   Approve column index:', S.paymentPending?.approveColumnIndex);
    console.log('   Approve cell markup:', JSON.stringify(S.paymentPending?.approveCellMarkup?.[0] || '').slice(0, 260));

    // ── /add-client : the reference layout for request #2 ─────────────────
    await page.goto(`${BASE}/add-client`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4500);
    S.addClient = await page.evaluate(formInventory);
    await shot('add_client_detail');
    console.log('\n══ /add-client ══');
    console.log('   heading:', S.addClient.heading, '| fields:', S.addClient.fieldsInOrder.length);
    S.addClient.fieldsInOrder.forEach((f, i) =>
      console.log(`     ${String(i + 1).padStart(2)}. ${(f.label || '(no label)').padEnd(30)} ${f.tag}#${f.id || '-'}`));
    console.log('   buttons:', JSON.stringify(S.addClient.buttons.map((b) => b.id || b.text)));

    // ── /edit-client : try the id patterns the listing suggests ───────────
    const candidates = [];
    for (const h of (S.clients.anchorHrefs || [])) if (/edit|client/i.test(h)) candidates.push(h);
    const oc = (S.clients.onclicks || []).join(' ');
    const idMatch = oc.match(/['"]([0-9a-f]{8}-[0-9a-f-]{27,})['"]/i) || oc.match(/\((\d{1,10})\)/);
    if (idMatch) candidates.push(`/edit-client/${idMatch[1]}`);
    S.editClientCandidates = [...new Set(candidates)];
    console.log('\n══ /edit-client candidates ══', JSON.stringify(S.editClientCandidates));

    for (const c of S.editClientCandidates.slice(0, 3)) {
      const resp = await page.goto(`${BASE}${c}`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => null);
      await page.waitForTimeout(4500);
      const inv = await page.evaluate(formInventory);
      const dead = /nothing at this address/i.test(await page.evaluate(() => document.body.innerText));
      console.log(`   ${c} → http=${resp ? resp.status() : '?'} fields=${inv.fieldsInOrder.length} dead=${dead}`);
      if (!dead && inv.fieldsInOrder.length > 3) {
        S.editClient = { route: c, ...inv };
        await shot('edit_client_detail');
        break;
      }
    }
    if (S.editClient) {
      console.log('\n══ /edit-client ══');
      console.log('   route:', S.editClient.route, '| fields:', S.editClient.fieldsInOrder.length);
      S.editClient.fieldsInOrder.forEach((f, i) =>
        console.log(`     ${String(i + 1).padStart(2)}. ${(f.label || '(no label)').padEnd(30)} ${f.tag}#${f.id || '-'}`));
      console.log('   buttons:', JSON.stringify(S.editClient.buttons.map((b) => b.id || b.text)));
      console.log('   grids:', JSON.stringify(S.editClient.tables.map((t) => t.columns)));
    }

    // ── Remaining pages named in the requests ─────────────────────────────
    for (const [key, route] of [
      ['tenantTokens', '/tenant-tokens'],
      ['taxClassifications', '/tax-classifications'],
      ['membershipPackages', '/membership-packages'],
      ['supportUsers', '/support-users'],
    ]) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(4200);
      S[key] = await page.evaluate(formInventory);
      await shot(route.replace(/\W+/g, '_') + '_detail');
      console.log(`\n══ ${route} ══`);
      console.log('   heading:', S[key].heading, '| fields:', S[key].fieldsInOrder.length);
      S[key].fieldsInOrder.slice(0, 12).forEach((f) =>
        console.log(`     - ${(f.label || '(no label)').padEnd(28)} ${f.tag}#${f.id || '-'}`));
      console.log('   buttons:', JSON.stringify(S[key].buttons.map((b) => b.id || b.text).slice(0, 8)));
      if (S[key].tables.length) console.log('   grid cols:', JSON.stringify(S[key].tables[0].columns));
    }

  } catch (e) {
    console.log('\nERR:', e.message);
    S.error = e.message;
  } finally {
    await browser.close();
  }

  const out = path.join(REPO, 'reports', 'qa', 'raw', 'support-pages-study.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(S, null, 2));
  console.log(`\n✅ wrote ${path.relative(REPO, out)} — nothing was saved or approved`);
})();
