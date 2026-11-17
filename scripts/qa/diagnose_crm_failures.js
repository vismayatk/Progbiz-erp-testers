'use strict';
/**
 * Diagnose the five failed functional checks.
 *
 * Each one has two possible explanations — the app is wrong, or the test drove
 * the UI wrong. Reporting the second kind as a bug is how a QA report loses
 * credibility, so this dumps the real DOM state for each case and lets the
 * evidence decide.
 *
 * Read-only.
 *   node scripts/qa/diagnose_crm_failures.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};
const KNOWN_CUSTOMER = 'QA_1786563441530';   // created by the functional run
const KNOWN_ENQ = 'ENQ-412';

const allTables = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const onScreen = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  return [...document.querySelectorAll('table')].map((t, i) => ({
    idx: i,
    visible: onScreen(t),
    headers: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
    bodyRows: [...t.querySelectorAll('tbody tr')].slice(0, 6)
      .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText).slice(0, 24))),
    rowCount: t.querySelectorAll('tbody tr').length,
  })).filter((t) => t.headers.length || t.rowCount);
};

async function openFilter(page) {
  await page.locator('#btn-toggle-filter, button:has-text("Filter")').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1600);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const D = {};
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // ══ A. Date Added = Today — what is actually returned? ═════════════════
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    D.leadsUnfiltered = await page.evaluate(allTables);

    await openFilter(page);
    D.dateSelect = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const onScreen = (e) => e.getClientRects().length > 0;
      const panel = [...document.querySelectorAll('.offcanvas.show')].filter(onScreen)[0] || document.body;
      const sels = [...panel.querySelectorAll('select')].filter(onScreen);
      const found = sels.map((s) => {
        const grp = s.closest('.form-group, .col, .mb-3, div');
        const lbl = grp && grp.querySelector('label');
        return { id: s.id, label: lbl ? clean(lbl.innerText) : null, value: s.value };
      });
      const target = sels.find((s) => {
        const grp = s.closest('.form-group, .col, .mb-3, div');
        const lbl = grp && grp.querySelector('label');
        return lbl && clean(lbl.innerText) === 'date added';
      });
      if (target) {
        const o = [...target.options].find((x) => clean(x.text) === 'today');
        if (o) { target.value = o.value; target.dispatchEvent(new Event('change', { bubbles: true })); }
        return { allSelects: found, chosenId: target.id, chosenValue: target.value, ok: !!o };
      }
      return { allSelects: found, ok: false };
    });
    await page.locator('#btn-apply-filter').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4000);
    D.leadsDateToday = await page.evaluate(allTables);
    D.leadsDateTodayUrl = page.url().replace(BASE, '');
    await page.screenshot({ path: 'reports/qa/shots/crm/_diag_date_today.png', fullPage: true }).catch(() => {});

    // ══ B. Name search — is the search box wired to a "search by" select? ══
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    await openFilter(page);
    D.searchControls = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const onScreen = (e) => e.getClientRects().length > 0;
      const panel = [...document.querySelectorAll('.offcanvas.show')].filter(onScreen)[0] || document.body;
      return [...panel.querySelectorAll('input,select')].filter(onScreen).slice(0, 8).map((e) => ({
        id: e.id, tag: e.tagName.toLowerCase(), type: e.type,
        placeholder: e.getAttribute('placeholder'),
        value: e.value,
        optionTexts: e.tagName === 'SELECT' ? [...e.options].map((o) => clean(o.text)).slice(0, 6) : null,
      }));
    });
    // Drive it properly: search-by = Name, match = Contains, then the text box.
    D.searchAttempt = await page.evaluate((term) => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const onScreen = (e) => e.getClientRects().length > 0;
      const panel = [...document.querySelectorAll('.offcanvas.show')].filter(onScreen)[0] || document.body;
      const by = panel.querySelector('#lead-customer-search-by');
      const mode = panel.querySelector('#lead-customer-contains');
      const notes = {};
      if (by) {
        const o = [...by.options].find((x) => clean(x.text) === 'name');
        if (o) { by.value = o.value; by.dispatchEvent(new Event('change', { bubbles: true })); notes.by = o.text; }
      }
      if (mode) {
        const o = [...mode.options].find((x) => clean(x.text) === 'contains');
        if (o) { mode.value = o.value; mode.dispatchEvent(new Event('change', { bubbles: true })); notes.mode = o.text; }
      }
      const boxes = [...panel.querySelectorAll('input[type="text"], input:not([type])')].filter(onScreen);
      notes.textBoxes = boxes.map((b) => ({ id: b.id, ph: b.getAttribute('placeholder') }));
      if (boxes[0]) {
        boxes[0].value = term;
        boxes[0].dispatchEvent(new Event('input', { bubbles: true }));
        boxes[0].dispatchEvent(new Event('change', { bubbles: true }));
        notes.filled = boxes[0].id || '(no id)';
      }
      return notes;
    }, KNOWN_CUSTOMER);
    await page.locator('#btn-apply-filter').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4000);
    D.searchResult = await page.evaluate(allTables);
    await page.screenshot({ path: 'reports/qa/shots/crm/_diag_search.png', fullPage: true }).catch(() => {});

    // ══ C. Follow-up modal — what actually opens it? ═══════════════════════
    await page.goto(`${BASE}/followups`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    D.followupPageControls = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const onScreen = (e) => e.getClientRects().length > 0;
      return [...document.querySelectorAll('button,a')].filter(onScreen)
        .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 26), href: b.getAttribute('href') }))
        .filter((b) => b.text || b.id).slice(0, 26);
    });
    // Try the row-level "Followup" action.
    const fuBtn = page.locator('a:has-text("Followup"), button:has-text("Followup")').first();
    D.followupBtnCount = await page.locator('a:has-text("Followup"), button:has-text("Followup")').count().catch(() => 0);
    await fuBtn.click({ timeout: 8000 }).catch((e) => { D.followupClickErr = e.message.split('\n')[0].slice(0, 100); });
    await page.waitForTimeout(3000);
    D.afterFollowupClick = await page.evaluate(() => ({
      url: location.pathname,
      openModals: [...document.querySelectorAll('.modal.show, .offcanvas.show')]
        .map((m) => ({ id: m.id || null, title: (m.querySelector('.modal-title')?.innerText || '').trim().slice(0, 40) })),
    }));
    await page.screenshot({ path: 'reports/qa/shots/crm/_diag_followup.png', fullPage: true }).catch(() => {});

    // ══ D. Next Followup = Today — inspect the returned row ════════════════
    await page.goto(`${BASE}/followups`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    D.followupsUnfiltered = await page.evaluate(allTables);
    await openFilter(page);
    D.nextFuSelect = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const onScreen = (e) => e.getClientRects().length > 0;
      const panel = [...document.querySelectorAll('.offcanvas.show')].filter(onScreen)[0] || document.body;
      const sels = [...panel.querySelectorAll('select')].filter(onScreen);
      const target = sels.find((s) => {
        const grp = s.closest('.form-group, .col, .mb-3, div');
        const lbl = grp && grp.querySelector('label');
        return lbl && clean(lbl.innerText) === 'next followup date';
      });
      if (!target) return { ok: false, labels: sels.map((s) => {
        const g = s.closest('.form-group,.col,.mb-3,div'); const l = g && g.querySelector('label');
        return l ? clean(l.innerText) : null; }) };
      const o = [...target.options].find((x) => clean(x.text) === 'today');
      if (o) { target.value = o.value; target.dispatchEvent(new Event('change', { bubbles: true })); }
      return { ok: !!o, id: target.id, value: target.value, options: [...target.options].map((x) => x.text.trim()) };
    });
    await page.locator('#btn-apply-filter').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4000);
    D.followupsToday = await page.evaluate(allTables);
    await page.screenshot({ path: 'reports/qa/shots/crm/_diag_fu_today.png', fullPage: true }).catch(() => {});

    const out = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'crm-diagnosis.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ knownCustomer: KNOWN_CUSTOMER, knownEnq: KNOWN_ENQ, ...D }, null, 2));
    console.log('✅ wrote reports/qa/raw/crm-diagnosis.json');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
