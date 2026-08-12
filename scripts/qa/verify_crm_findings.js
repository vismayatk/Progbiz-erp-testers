'use strict';
/**
 * Confirm (or kill) the candidate findings from the CRM sweep before they go
 * into a report. Each check runs twice where the result could be timing-
 * dependent, because a finding seen once is a rumour.
 *
 * Read-only: navigates, reads the DOM, and tests client-side form validation
 * by clicking Save on an EMPTY form (which the app must reject — if it does
 * save, that is itself the finding and we record what happened).
 *
 *   node scripts/qa/verify_crm_findings.js
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
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const R = {};

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // ── 1. /quotation — <img> with an empty src ─────────────────────────────
    for (const pass of [1, 2]) {
      await page.goto(`${BASE}/quotation`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);
      const imgs = await page.evaluate(() =>
        [...document.querySelectorAll('img')].map((i) => ({
          src: i.getAttribute('src'),
          alt: i.getAttribute('alt'),
          broken: i.complete && i.naturalWidth === 0,
          cls: (i.getAttribute('class') || '').slice(0, 60),
          visible: i.getClientRects().length > 0,
        })).filter((i) => i.broken || i.src === '' || i.src === null)
      );
      R[`quotationBrokenImages_pass${pass}`] = imgs;
    }

    // ── 2. Column headers that look like internal field names ──────────────
    const colCheck = async (route) => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);
      return page.evaluate(() =>
        [...document.querySelectorAll('table')].map((t, i) => ({
          table: i,
          id: t.id || null,
          headers: [...t.querySelectorAll('thead th')]
            .map((h) => (h.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
        })).filter((t) => t.headers.length)
      );
    };
    R.enquiryTables = await colCheck('/enquiry');
    R.quotationTables = await colCheck('/quotation');

    // ── 3. /call-analysis — duplicate column header ────────────────────────
    R.callAnalysisTables = await colCheck('/call-analysis');

    // ── 4. /lead-status — nav label vs page heading ────────────────────────
    await page.goto(`${BASE}/lead-status`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    R.leadStatus = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const navLink = [...document.querySelectorAll('a[href]')]
        .find((a) => (a.getAttribute('href') || '').endsWith('/lead-status'));
      return {
        navLabel: clean(navLink && navLink.innerText),
        pageHeading: clean(document.querySelector('h1,h2,.page-title,.card-title')?.innerText).slice(0, 60),
        docTitle: clean(document.title),
        breadcrumb: clean(document.querySelector('.breadcrumb')?.innerText).slice(0, 80),
      };
    });

    // ── 5. /enquiry — does Save on an empty form validate, or crash/save? ──
    await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);
    const before = page.url();
    await page.locator('#btn-save-enquiry').click({ timeout: 10000 }).catch((e) => {
      R.saveClickError = e.message.split('\n')[0].slice(0, 120);
    });
    await page.waitForTimeout(3000);
    R.emptyFormSave = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return {
        url: location.pathname,
        // Client-side validation markers
        invalidFields: [...document.querySelectorAll('.is-invalid, .invalid-feedback, .error, [aria-invalid="true"]')]
          .map((e) => clean(e.innerText) || (e.id || e.tagName)).filter(Boolean).slice(0, 12),
        // SweetAlert / toast text
        alertText: clean([...document.querySelectorAll('.swal2-popup, .toast, .alert')]
          .map((e) => e.innerText).join(' | ')).slice(0, 300),
        bodyMentionsRequired: /required|mandatory|please (enter|select|fill)/i.test(document.body.innerText),
      };
    });
    R.emptyFormSave.navigatedAway = page.url() !== before;
    await page.screenshot({ path: 'reports/qa/shots/crm/_verify_empty_save.png', fullPage: true }).catch(() => {});

    const out = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'crm-verification.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(R, null, 2));
    console.log(JSON.stringify(R, null, 2));
    console.log('\n✅ wrote reports/qa/raw/crm-verification.json');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
