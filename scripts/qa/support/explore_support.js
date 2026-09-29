'use strict';
/**
 * Study the support / superadmin console.
 *
 * This account administers EVERY tenant — it can approve payments, block
 * tenants and create clients. So this script is deliberately the most
 * conservative in the suite: it navigates and reads, and it clicks nothing.
 * Not a filter, not a tab, not a row action. Understanding the surface does
 * not require touching it, and a stray click here has consequences that
 * cannot be undone from a test harness.
 *
 * Credentials come from the environment so they never land in a file:
 *   SUPPORT_USERNAME=superadmin SUPPORT_PASSWORD=... node scripts/qa/support/explore_support.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE = process.env.SUPPORT_BASE_URL || 'https://dev.erp.progbiz.in';
const USER = process.env.SUPPORT_USERNAME;
const PASS = process.env.SUPPORT_PASSWORD;
const REPO = path.join(__dirname, '..', '..', '..');

if (!USER || !PASS) {
  console.error('Set SUPPORT_USERNAME and SUPPORT_PASSWORD in the environment.');
  process.exit(2);
}

/** Anything that could change state. Present only so we can prove we avoided it. */
const MUTATING = /approve|block|unblock|delete|remove|save|submit|confirm|verify|activate|deactivate|reset|send/i;

const describePage = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const tables = [...document.querySelectorAll('table')].filter(on).map((t) => ({
    columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean),
    rowCount: t.querySelectorAll('tbody tr').length,
    firstRow: [...(t.querySelector('tbody tr')?.querySelectorAll('td') || [])]
      .map((c) => clean(c.innerText).slice(0, 26)),
  })).filter((t) => t.columns.length);
  return {
    heading: clean(document.querySelector('h1,h2,h3,.card-title,.page-title')?.innerText).slice(0, 90),
    breadcrumb: clean(document.querySelector('.breadcrumb')?.innerText).slice(0, 100),
    tables,
    fields: [...document.querySelectorAll('input[id],select[id],textarea[id]')].filter(on)
      .filter((e) => e.type !== 'hidden')
      .map((e) => ({
        id: e.id, tag: e.tagName.toLowerCase(), type: e.type || null,
        label: clean((e.labels && e.labels[0] && e.labels[0].innerText) ||
          e.closest('.form-group,.col,.mb-3,div')?.querySelector('label')?.innerText).slice(0, 34),
        required: e.required || false,
        optionCount: e.tagName === 'SELECT' ? e.options.length : null,
        sampleOptions: e.tagName === 'SELECT'
          ? [...e.options].slice(0, 6).map((o) => clean(o.text).slice(0, 24)) : null,
      })),
    buttons: [...document.querySelectorAll('button, a.btn')].filter(on)
      .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 30) }))
      .filter((b) => b.id || b.text),
    links: [...new Set([...document.querySelectorAll('a[href]')].filter(on)
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && h.startsWith('/') && !h.startsWith('//')))].slice(0, 60),
    errorText: /oops|went wrong|error code|nothing at this address|unauthor/i
      .exec(document.body.innerText)?.[0] || null,
    bodyChars: clean(document.body.innerText).length,
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const report = { base: BASE, capturedAt: new Date().toISOString(), pages: {}, clickedAnything: false };

  try {
    // ── Login ──────────────────────────────────────────────────────────────
    await page.goto(`${BASE}/support-login/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#signin-username').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#signin-username').fill(USER);
    await page.locator('#signin-password').fill(PASS);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(6000);
    report.landedOn = page.url().replace(BASE, '');
    console.log(`logged in → ${report.landedOn}`);
    if (/support-login/i.test(report.landedOn)) {
      console.log('❌ still on the login page — credentials rejected or the form changed');
      throw new Error('support login failed');
    }

    // ── Harvest the navigation ─────────────────────────────────────────────
    const nav = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const seen = new Map();
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') || '';
        if (!href.startsWith('/') || href.startsWith('//')) continue;
        const p = href.split('?')[0].replace(/\/$/, '') || '/';
        if (/support-login|logout|signout/i.test(p)) continue;
        if (!seen.has(p)) seen.set(p, { path: p, text: clean(a.innerText).slice(0, 40), visible: on(a) });
      }
      return [...seen.values()];
    });
    report.nav = nav;
    console.log(`nav links found: ${nav.length}`);

    // Routes named in the change requests, so the study covers them even if
    // they are not linked from the landing page.
    const REQUESTED = [
      '/client-payment-pending', '/add-client', '/edit-client', '/clients',
      '/tenant-tokens', '/tax-classifications', '/billing-period',
      '/membership-package', '/membership-packages', '/support-users',
      '/support-home', '/home', '/tenants', '/invoices', '/tenant-invoice',
    ];
    const routes = [...new Set([...nav.map((n) => n.path), ...REQUESTED])];
    console.log(`pages to study: ${routes.length}\n`);

    // ── Visit each page. Navigate and read only. ──────────────────────────
    for (const [i, r] of routes.entries()) {
      process.stdout.write(`  [${String(i + 1).padStart(2)}/${routes.length}] ${r.padEnd(30)}`);
      const resp = await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 40000 })
        .catch(() => null);
      await page.waitForTimeout(3800);
      const d = await page.evaluate(describePage).catch((e) => ({ probeError: e.message }));
      d.http = resp ? resp.status() : null;
      d.landed = page.url().replace(BASE, '');
      d.mutatingControls = (d.buttons || [])
        .filter((b) => MUTATING.test(b.text || '') || MUTATING.test(b.id || ''))
        .map((b) => b.id || b.text);
      report.pages[r] = d;

      const shotPath = path.join(REPO, 'reports', 'qa', 'shots', 'support', `${r.replace(/\W+/g, '_')}.png`);
      fs.mkdirSync(path.dirname(shotPath), { recursive: true });
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});

      const flag = d.errorText ? `⚠️  ${d.errorText}`
        : `grids=${(d.tables || []).length} fields=${(d.fields || []).length} btns=${(d.buttons || []).length}`;
      console.log(` ${flag}`);
    }
  } catch (e) {
    console.log('\nERR:', e.message);
    report.error = e.message;
  } finally {
    await browser.close();
  }

  const out = path.join(REPO, 'reports', 'qa', 'raw', 'support-console-study.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\n✅ wrote ${path.relative(REPO, out)}`);
  console.log('   no control was clicked — navigation and reading only');
})();
