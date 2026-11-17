'use strict';
/**
 * Close the remaining questions, still without mutating anything.
 *
 *  1. Request 3 — "last invoice only" could not be distinguished on a tenant
 *     with a single invoice. Walk the client list for one with several, and
 *     count the edit controls against the rows.
 *  2. Request 12 — #assignTenantsModal exists in the DOM even with no support
 *     users. A hidden modal is still readable, so its fields answer whether
 *     the assignment UI is built.
 *  3. Request 4 — read the block confirmation modal's wording and buttons.
 *  4. Request 1 — establish whether this app confirms via pre-rendered modals
 *     or via SweetAlert created on click, which decides whether the absence of
 *     a modal on payment-pending means "no confirmation" or just "not yet built".
 *
 *   SUPPORT_USERNAME=superadmin SUPPORT_PASSWORD=... node scripts/qa/support/verify_support_functions2.js
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

const results = [];
const rec = (id, t, status, d) => {
  results.push({ id, title: t, status, detail: d });
  const m = { WORKS: '✅', BROKEN: '❌', UNVERIFIABLE: '⚪', PARTIAL: '🟡' }[status] || '·';
  console.log(`  ${m} ${id.padEnd(8)} ${status.padEnd(13)} ${t}${d ? ` — ${d}` : ''}`);
};

/** Read every modal in the DOM including hidden ones, with full field detail. */
const allModals = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('.modal, [role="dialog"]')].map((m) => ({
    id: m.id || '(anon)',
    shown: m.classList.contains('show'),
    title: clean(m.querySelector('.modal-title')?.innerText).slice(0, 80),
    body: clean(m.querySelector('.modal-body')?.innerText).slice(0, 300),
    buttons: [...m.querySelectorAll('button, a.btn')].map((b) => clean(b.innerText)).filter(Boolean),
    fields: [...m.querySelectorAll('input, select, textarea')]
      .filter((e) => e.type !== 'hidden')
      .map((e) => ({
        id: e.id || null, type: e.type || e.tagName.toLowerCase(),
        placeholder: e.getAttribute('placeholder') || null,
        label: clean(e.closest('.form-group,.col,.mb-3,div')?.querySelector('label')?.innerText).slice(0, 36),
      })),
    tables: [...m.querySelectorAll('table')].map((t) =>
      [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean)),
  }));
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const ev = {};
  const shot = async (n) => {
    const p = path.join(REPO, 'reports', 'qa', 'shots', 'support', `v2_${n}.png`);
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

    // ══ 1. Find a tenant with more than one invoice ═══════════════════════
    console.log('\n══ REQUEST 3 · "last invoice only", on a tenant with several invoices ══');
    await page.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    const rowCount = await page.locator('table tbody tr').count().catch(() => 0);
    console.log(`     scanning up to ${Math.min(rowCount, 8)} clients for one with multiple invoices…`);

    ev.invoiceScan = [];
    let found = null;
    for (let i = 0; i < Math.min(rowCount, 8); i++) {
      await page.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(4000);
      await page.locator('table tbody tr').nth(i).locator('a:has(i.ri-pencil-line)').first()
        .click({ timeout: 9000 }).catch(() => {});
      await page.waitForTimeout(5500);
      const info = await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const on = (e) => e.getClientRects().length > 0;
        const t = [...document.querySelectorAll('table')].filter(on)[0];
        const rows = t ? [...t.querySelectorAll('tbody tr')] : [];
        const editBtns = [...document.querySelectorAll('[data-bs-title]')].filter(on)
          .filter((b) => /edit start date/i.test(b.getAttribute('data-bs-title') || ''));
        // Which row does each edit control belong to?
        const rowOfBtn = editBtns.map((b) => {
          const tr = b.closest('tr');
          return tr ? rows.indexOf(tr) : -1;
        });
        return {
          url: location.pathname,
          name: clean(document.querySelector('h1,h2,h3,.card-title')?.innerText).slice(0, 40),
          invoiceRows: rows.length,
          editControls: editBtns.length,
          controlRowIndexes: rowOfBtn,
          invoiceDates: rows.map((r) => {
            const c = [...r.querySelectorAll('td')];
            return clean(c[1]?.innerText || '');
          }),
        };
      }).catch(() => null);
      if (!info) continue;
      ev.invoiceScan.push(info);
      console.log(`       client ${i + 1}: ${info.invoiceRows} invoice(s), ${info.editControls} edit control(s) ${info.url}`);
      if (info.invoiceRows > 1) { found = info; break; }
    }

    if (found) {
      const onlyLast = found.editControls === 1 &&
        found.controlRowIndexes[0] === found.invoiceRows - 1;
      const onlyFirst = found.editControls === 1 && found.controlRowIndexes[0] === 0;
      ev.request3 = found;
      await shot('multi_invoice_client');
      rec('REQ-03a', 'Edit-start-date offered on one invoice row only',
        found.editControls === 1 ? 'WORKS' : 'BROKEN',
        `${found.invoiceRows} invoice rows, ${found.editControls} control(s) at row index ${JSON.stringify(found.controlRowIndexes)}` +
        (onlyLast ? ' — on the LAST row' : onlyFirst ? ' — on the FIRST row (list may be newest-first)' : ''));
    } else {
      rec('REQ-03a', 'Edit-start-date offered on the last invoice only', 'UNVERIFIABLE',
        `no client among the first ${Math.min(rowCount, 8)} had more than one invoice`);
    }

    // ══ 2. Block confirmation modal wording (request 4) ═══════════════════
    console.log('\n══ REQUEST 4 · Block confirmation ══');
    ev.editClientModals = await page.evaluate(allModals);
    const blockModal = ev.editClientModals.find((m) => /block/i.test(`${m.id} ${m.title} ${m.body}`));
    rec('REQ-04', 'Block Tenant asks for confirmation',
      blockModal ? 'WORKS' : 'UNVERIFIABLE',
      blockModal
        ? `modal #${blockModal.id} "${blockModal.title}" · body: "${blockModal.body.slice(0, 90)}" · buttons: ${blockModal.buttons.join(', ')}`
        : 'no block confirmation modal found in the DOM');
    console.log(`     modals on edit-client: ${JSON.stringify(ev.editClientModals.map((m) => m.id))}`);

    // ══ 3. Tenant assignment modal (request 12) ══════════════════════════
    console.log('\n══ REQUEST 12 · assignTenantsModal ══');
    await page.goto(`${BASE}/support-users`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    ev.supportModals = await page.evaluate(allModals);
    const assign = ev.supportModals.find((m) => /assigntenant/i.test(m.id));
    rec('REQ-12', 'Tenant-assignment UI is built',
      assign ? 'WORKS' : 'BROKEN',
      assign
        ? `modal #${assign.id} "${assign.title}" · fields: ${assign.fields.map((f) => f.label || f.placeholder || f.id || f.type).join(', ') || '(none rendered until opened)'} · grids: ${JSON.stringify(assign.tables)} · buttons: ${assign.buttons.join(', ')}`
        : 'no assignTenantsModal found');

    // ══ 4. How does this app confirm? (request 1) ════════════════════════
    console.log('\n══ REQUEST 1 · confirmation mechanism used by this app ══');
    ev.confirmMechanism = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll('script')].map((s) => s.src || '').filter(Boolean);
      return {
        hasSweetAlertScript: scripts.some((s) => /sweetalert|swal/i.test(s)),
        swalGlobal: typeof window.Swal !== 'undefined',
        scriptSample: scripts.filter((s) => /swal|sweet|alert/i.test(s)).slice(0, 3),
      };
    });
    await page.goto(`${BASE}/client-payment-pending`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    ev.paymentPendingModals = await page.evaluate(allModals);
    ev.paymentPendingSwal = await page.evaluate(() => typeof window.Swal !== 'undefined');
    console.log(`     SweetAlert available on the page: ${ev.paymentPendingSwal}`);
    console.log(`     pre-rendered modals on payment-pending: ${JSON.stringify(ev.paymentPendingModals.map((m) => m.id))}`);
    rec('REQ-01', 'Approve payment confirmation',
      ev.paymentPendingSwal ? 'PARTIAL' : 'UNVERIFIABLE',
      ev.paymentPendingSwal
        ? 'SweetAlert IS loaded on this page, so a confirmation can be raised on click without appearing in the DOM beforehand. Its presence cannot be proven without clicking Approve on a live invoice.'
        : `no SweetAlert and no pre-rendered approve modal — a confirmation may genuinely be missing, but proving it requires clicking Approve (${ev.paymentPendingModals.length} modal(s) in DOM)`);

  } catch (e) {
    console.log('\nERR:', e.message);
    rec('FATAL', 'aborted', 'UNVERIFIABLE', e.message.split('\n')[0].slice(0, 130));
  } finally {
    await browser.close();
  }

  const w = results.filter((r) => r.status === 'WORKS').length;
  const b = results.filter((r) => r.status === 'BROKEN').length;
  const p = results.filter((r) => r.status === 'PARTIAL').length;
  const u = results.filter((r) => r.status === 'UNVERIFIABLE').length;
  console.log(`\n═══ ${w} works · ${b} broken · ${p} partial · ${u} unverifiable ═══`);
  console.log('    nothing was approved, blocked, saved or created');
  const out = path.join(REPO, 'reports', 'qa', 'raw', 'support-function-verify2.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ results, evidence: ev }, null, 2));
  console.log(`    wrote ${path.relative(REPO, out)}`);
})();
