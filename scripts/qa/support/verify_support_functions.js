'use strict';
/**
 * Verify which support-console functions actually work — without approving a
 * live invoice or blocking a real customer.
 *
 * Method, in order of increasing risk, stopping before anything irreversible:
 *
 *  A. Pure comparison. Does /upcoming-expiry exclude tenants already sitting
 *     on /client-payment-pending? Both lists are read and diffed. (Request 10)
 *
 *  B. DOM inspection. A confirmation dialog is markup, and Blazor renders it
 *     into the page before it is shown. So the presence of an approve/block
 *     confirmation modal can be established by reading the DOM rather than by
 *     pressing the button. (Requests 1 and 4)
 *
 *  C. Open-and-cancel. The "Edit start date" control opens a dialog; opening a
 *     dialog changes nothing. The fields inside answer whether it asks for the
 *     Start Date alone, and whether it is offered on every invoice row or only
 *     the last. Escape is pressed immediately; Save is never touched. (Request 3)
 *
 * Never attempted: approving a payment, blocking a tenant, saving a date,
 * creating a support user. Those mutate a shared environment with 226 live
 * tenants and need an explicit decision from the account owner.
 *
 *   SUPPORT_USERNAME=superadmin SUPPORT_PASSWORD=... node scripts/qa/support/verify_support_functions.js
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
  console.log(`  ${m} ${id.padEnd(6)} ${status.padEnd(13)} ${t}${d ? ` — ${d}` : ''}`);
};

const readGrid = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const t = [...document.querySelectorAll('table')].filter(on)
    .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  if (!t) return { columns: [], rows: [] };
  return {
    columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
    rows: [...t.querySelectorAll('tbody tr')]
      .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText)))
      .filter((c) => !(c.length <= 2 && /no data|no record/i.test(c.join(' ')))),
  };
};

/** Every modal in the DOM, shown or not, with its title and buttons. */
const readModals = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('.modal, [role="dialog"], .swal2-container')].map((m) => ({
    id: m.id || null,
    shown: m.classList.contains('show') || getComputedStyle(m).display === 'block',
    title: clean(m.querySelector('.modal-title, .swal2-title')?.innerText).slice(0, 70),
    body: clean(m.querySelector('.modal-body, .swal2-html-container')?.innerText).slice(0, 220),
    buttons: [...m.querySelectorAll('button, a.btn')].map((b) => clean(b.innerText)).filter(Boolean).slice(0, 6),
    fields: [...m.querySelectorAll('input, select, textarea')]
      .filter((e) => e.type !== 'hidden')
      .map((e) => ({
        id: e.id || null, type: e.type || e.tagName.toLowerCase(),
        label: clean(e.closest('.form-group,.col,.mb-3,div')?.querySelector('label')?.innerText).slice(0, 34),
      })),
  }));
};

/** Set page size to its maximum so list comparisons are not truncated. */
async function maxPage(page) {
  const has = await page.locator('#page_size').count().catch(() => 0);
  if (!has) return null;
  const opts = await page.locator('#page_size option').allTextContents().catch(() => []);
  const big = opts.map((o) => parseInt(o, 10)).filter(Boolean).sort((a, b) => b - a)[0];
  if (big) { await page.selectOption('#page_size', String(big)).catch(() => {}); await page.waitForTimeout(3500); }
  return big;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const ev = {};
  const shot = async (n) => {
    const p = path.join(REPO, 'reports', 'qa', 'shots', 'support', `verify_${n}.png`);
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

    // ══ A. Request 10 — does the expiry list exclude payment-pending? ══════
    console.log('\n══ REQUEST 10 · Upcoming expiry excludes payment-pending tenants ══');
    await page.goto(`${BASE}/client-payment-pending`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    const ppSize = await maxPage(page);
    const pp = await page.evaluate(readGrid);
    const ppNameIdx = pp.columns.findIndex((c) => /tenant name/i.test(c));
    const ppNames = ppNameIdx >= 0 ? pp.rows.map((r) => (r[ppNameIdx] || '').trim()).filter(Boolean) : [];

    await page.goto(`${BASE}/upcoming-expiry`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    const ueSize = await maxPage(page);
    const ue = await page.evaluate(readGrid);
    const ueNameIdx = ue.columns.findIndex((c) => /tenant name/i.test(c));
    const ueNames = ueNameIdx >= 0 ? ue.rows.map((r) => (r[ueNameIdx] || '').trim()).filter(Boolean) : [];
    await shot('upcoming_expiry');

    const overlap = ueNames.filter((n) => ppNames.includes(n));
    ev.request10 = {
      paymentPending: { pageSize: ppSize, listed: ppNames.length, sample: ppNames.slice(0, 5) },
      upcomingExpiry: { pageSize: ueSize, listed: ueNames.length, sample: ueNames.slice(0, 5) },
      overlap,
    };
    console.log(`     payment-pending: ${ppNames.length} tenant(s) listed (page size ${ppSize})`);
    console.log(`     upcoming-expiry: ${ueNames.length} tenant(s) listed (page size ${ueSize})`);
    rec('REQ-10', 'Upcoming expiry excludes tenants already in payment-pending',
      ppNames.length && ueNames.length ? (overlap.length === 0 ? 'WORKS' : 'BROKEN') : 'UNVERIFIABLE',
      overlap.length
        ? `${overlap.length} tenant(s) appear in BOTH lists: ${overlap.slice(0, 4).join(', ')}`
        : (ppNames.length && ueNames.length ? 'no overlap between the two lists' : 'one of the lists was empty'));

    // ══ B. Requests 1 & 4 — is a confirmation dialog wired up? ════════════
    console.log('\n══ REQUEST 1 · Approve payment confirmation ══');
    await page.goto(`${BASE}/client-payment-pending`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    ev.approveModals = await page.evaluate(readModals);
    const approveModal = ev.approveModals.find((m) =>
      /approve|confirm|verify/i.test(`${m.id || ''} ${m.title} ${m.body}`));
    console.log(`     modals present in DOM: ${JSON.stringify(ev.approveModals.map((m) => m.id || m.title || '(anon)'))}`);
    rec('REQ-01', 'Approve control has a confirmation dialog wired into the page',
      approveModal ? 'WORKS' : 'UNVERIFIABLE',
      approveModal
        ? `modal "${approveModal.id || approveModal.title}" · buttons: ${approveModal.buttons.join(', ')}`
        : 'no approve/confirm modal found in the DOM — it may be created only on click (SweetAlert), which cannot be checked without approving a live invoice');

    // ══ C. Requests 3 & 4 on edit-client ══════════════════════════════════
    console.log('\n══ REQUESTS 3 & 4 · edit-client controls ══');
    await page.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    await page.locator('table tbody tr').first().locator('a:has(i.ri-pencil-line)').first()
      .click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(6000);
    ev.editClientUrl = page.url().replace(BASE, '');
    console.log(`     opened ${ev.editClientUrl}`);

    // Block control: does it read Block or Unblock, and is a confirm wired?
    ev.blockControl = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const b = [...document.querySelectorAll('button, a.btn')]
        .find((x) => /block/i.test(x.innerText || ''));
      return b ? {
        text: clean(b.innerText), icon: (b.querySelector('i') || {}).className || null,
        disabled: b.disabled || b.classList.contains('disabled'),
      } : null;
    });
    ev.editClientModals = await page.evaluate(readModals);
    const blockModal = ev.editClientModals.find((m) => /block/i.test(`${m.id || ''} ${m.title} ${m.body}`));
    rec('REQ-04', 'Block / Unblock control present on edit-client',
      ev.blockControl ? 'PARTIAL' : 'BROKEN',
      ev.blockControl
        ? `button reads "${ev.blockControl.text}" (${ev.blockControl.icon}) · confirmation modal in DOM: ${blockModal ? 'yes' : 'no'} · whether blocking removes the tenant from payment-pending NOT tested`
        : 'no block control found');

    // Edit start date: is it on every invoice row or only the last?
    ev.startDateButtons = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const btns = [...document.querySelectorAll('[data-bs-title], button, a.btn')].filter(on)
        .filter((b) => /edit start date/i.test(b.getAttribute('data-bs-title') || b.innerText || ''));
      const t = [...document.querySelectorAll('table')].filter(on)[0];
      return {
        count: btns.length,
        invoiceRowCount: t ? t.querySelectorAll('tbody tr').length : 0,
        invoiceColumns: t ? [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)) : [],
      };
    });
    console.log(`     "Edit start date" controls: ${ev.startDateButtons.count} · invoice rows: ${ev.startDateButtons.invoiceRowCount}`);
    rec('REQ-03a', 'Edit-start-date offered on the last invoice only',
      ev.startDateButtons.invoiceRowCount > 0
        ? (ev.startDateButtons.count === 1 ? 'WORKS' : 'PARTIAL')
        : 'UNVERIFIABLE',
      `${ev.startDateButtons.count} control(s) for ${ev.startDateButtons.invoiceRowCount} invoice row(s)` +
      (ev.startDateButtons.invoiceRowCount === 1 ? ' — this tenant has only one invoice, so "last only" cannot be distinguished from "all rows"' : ''));

    // Open the date dialog, read it, cancel. Nothing is saved.
    if (ev.startDateButtons.count > 0) {
      await page.locator('[data-bs-title="Edit start date"]').first().click({ timeout: 9000 }).catch(() => {});
      await page.waitForTimeout(3000);
      ev.startDateDialog = (await page.evaluate(readModals)).filter((m) => m.shown);
      await shot('edit_start_date_dialog');
      const d = ev.startDateDialog[0];
      rec('REQ-03b', 'Edit-start-date dialog asks for the Start Date only',
        d ? (d.fields.length === 1 ? 'WORKS' : 'PARTIAL') : 'UNVERIFIABLE',
        d
          ? `"${d.title}" · ${d.fields.length} field(s): ${d.fields.map((f) => f.label || f.id || f.type).join(', ')} · buttons: ${d.buttons.join(', ')}`
          : 'no dialog appeared on click');
      // Leave without saving.
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(1200);
      const stillOpen = (await page.evaluate(readModals)).filter((m) => m.shown).length;
      console.log(`     dialog dismissed without saving (open modals now: ${stillOpen})`);
    }

    // ══ D. Request 12 — is there a tenant-assignment UI? ══════════════════
    console.log('\n══ REQUEST 12 · Support user tenant assignment ══');
    await page.goto(`${BASE}/support-users`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    ev.supportUsers = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)[0];
      return {
        rowCount: t ? t.querySelectorAll('tbody tr').length : 0,
        columns: t ? [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)) : [],
        modals: [...document.querySelectorAll('.modal')].map((m) => ({
          id: m.id || '(anon)',
          title: clean(m.querySelector('.modal-title')?.innerText).slice(0, 60),
        })),
        formFields: [...document.querySelectorAll('input,select,textarea')].filter(on)
          .filter((e) => e.type !== 'hidden')
          .map((e) => clean(e.closest('.form-group,.col,.mb-3,div')?.querySelector('label')?.innerText).slice(0, 30) || e.id)
          .filter(Boolean),
      };
    });
    await shot('support_users');
    const hasTenantAssignUI = ev.supportUsers.modals.some((m) => /tenant/i.test(`${m.id} ${m.title}`))
      || ev.supportUsers.formFields.some((f) => /tenant/i.test(f));
    rec('REQ-12', 'Tenant-assignment UI for support users',
      ev.supportUsers.rowCount === 0 ? 'UNVERIFIABLE' : (hasTenantAssignUI ? 'WORKS' : 'BROKEN'),
      `${ev.supportUsers.rowCount} support user(s) exist · modals: ${JSON.stringify(ev.supportUsers.modals.map((m) => m.id))} · ` +
      (ev.supportUsers.rowCount === 0
        ? 'with no support users created there is no row whose assignment UI could be opened'
        : `tenant-related UI found: ${hasTenantAssignUI}`));

  } catch (e) {
    console.log('\nERR:', e.message);
    rec('FATAL', 'run aborted', 'UNVERIFIABLE', e.message.split('\n')[0].slice(0, 130));
  } finally {
    await browser.close();
  }

  const w = results.filter((r) => r.status === 'WORKS').length;
  const b = results.filter((r) => r.status === 'BROKEN').length;
  const p = results.filter((r) => r.status === 'PARTIAL').length;
  const u = results.filter((r) => r.status === 'UNVERIFIABLE').length;
  console.log(`\n═══ ${w} works · ${b} broken · ${p} partial · ${u} unverifiable ═══`);
  console.log('    nothing was approved, blocked, saved or created');
  const out = path.join(REPO, 'reports', 'qa', 'raw', 'support-function-verify.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ results, evidence: ev }, null, 2));
  console.log(`    wrote ${path.relative(REPO, out)}`);
})();
