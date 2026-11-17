'use strict';
/**
 * Close out the remaining unknowns in the change-request study:
 *   - does the home "Expiring soon" card lead to a real page? (request 10)
 *   - is there a tenant-assignment UI for support users? (request 12)
 *   - how does the tenant-tokens tenant picker behave? (request 6)
 *   - is there a billing-period master page? (request 9)
 *
 * Navigation and reading only. Quick Action links and stat cards are followed
 * because that IS the navigation; no Save, Approve or Block is ever pressed.
 *
 *   SUPPORT_USERNAME=superadmin SUPPORT_PASSWORD=... node scripts/qa/support/study_remaining.js
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

const describe = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  return {
    url: location.pathname,
    heading: clean(document.querySelector('h1,h2,h3,.card-title,.page-title')?.innerText).slice(0, 70),
    grids: [...document.querySelectorAll('table')].filter(on).map((t) => ({
      columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean),
      rows: t.querySelectorAll('tbody tr').length,
      firstRow: [...(t.querySelector('tbody tr')?.querySelectorAll('td') || [])].map((c) => clean(c.innerText).slice(0, 22)),
    })).filter((g) => g.columns.length),
    fields: [...document.querySelectorAll('input[id],select[id],textarea[id]')].filter(on)
      .filter((e) => e.type !== 'hidden').map((e) => ({ id: e.id, tag: e.tagName.toLowerCase() })),
    buttons: [...document.querySelectorAll('button, a.btn')].filter(on)
      .map((b) => clean(b.innerText) || b.getAttribute('data-bs-title') || b.id).filter(Boolean).slice(0, 14),
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

    // ── 1. Home: what are the cards linked to? ────────────────────────────
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    S.homeLinks = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return [...document.querySelectorAll('a, .card, [role="button"]')].filter(on)
        .map((e) => ({
          text: clean(e.innerText).slice(0, 60),
          href: e.getAttribute('href') || null,
          clickable: e.tagName === 'A' || e.hasAttribute('role') || /cursor:\s*pointer/.test(e.getAttribute('style') || '')
            || getComputedStyle(e).cursor === 'pointer',
        })).filter((e) => e.text).slice(0, 24);
    });
    console.log('══ HOME cards / links ══');
    S.homeLinks.forEach((l) => console.log(`   href=${String(l.href).padEnd(26)} pointer=${String(l.clickable).padEnd(5)} ${l.text.slice(0, 52)}`));

    // Follow the "Expiring soon" card if it is navigable (request 10).
    const expCard = page.locator('a:has-text("Expiring soon"), .card:has-text("Expiring soon")').first();
    if (await expCard.count().catch(() => 0)) {
      const before = page.url();
      await expCard.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(5000);
      S.expiringSoon = await page.evaluate(describe);
      S.expiringSoon.navigated = page.url() !== before;
      await shot('expiring_soon');
      console.log('\n══ "Expiring soon" card ══');
      console.log('   navigated:', S.expiringSoon.navigated, '→', S.expiringSoon.url);
      console.log('   heading:', S.expiringSoon.heading, '| grids:', JSON.stringify(S.expiringSoon.grids.map((g) => g.columns)));
    }

    // ── 2. Candidate routes for the expiry list and billing periods ───────
    S.routeProbe = {};
    for (const r of ['/upcoming-expiry', '/expiring-soon', '/client-expiry', '/billing-periods',
                     '/billing-period-master', '/countries', '/country']) {
      const resp = await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => null);
      await page.waitForTimeout(3000);
      const d = await page.evaluate(describe).catch(() => ({}));
      const dead = /nothing at this address/i.test(await page.evaluate(() => document.body.innerText).catch(() => ''));
      S.routeProbe[r] = { http: resp ? resp.status() : null, dead, heading: d.heading, grids: (d.grids || []).map((g) => g.columns) };
      console.log(`   ${r.padEnd(24)} ${dead ? 'DEAD' : `OK  heading="${d.heading}" grids=${(d.grids || []).length}`}`);
    }

    // ── 3. Support user: is there a tenant-assignment UI? (request 12) ────
    await page.goto(`${BASE}/support-users`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4500);
    S.supportUsers = await page.evaluate(describe);
    S.supportUsersMarkup = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)[0];
      if (!t) return null;
      const cols = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText));
      const ti = cols.findIndex((c) => /tenant/i.test(c));
      const rows = [...t.querySelectorAll('tbody tr')];
      return {
        columns: cols, rowCount: rows.length, tenantColumnIndex: ti,
        tenantCellMarkup: ti >= 0 && rows.length
          ? clean([...rows[0].querySelectorAll('td')][ti]?.innerHTML || '').slice(0, 260) : null,
        actionCellMarkup: rows.length
          ? clean([...rows[0].querySelectorAll('td')].slice(-1)[0]?.innerHTML || '').slice(0, 260) : null,
      };
    });
    await shot('support_users_detail');
    console.log('\n══ /support-users ══');
    console.log('   grid:', JSON.stringify(S.supportUsersMarkup?.columns));
    console.log('   rows:', S.supportUsersMarkup?.rowCount, '| Tenants column index:', S.supportUsersMarkup?.tenantColumnIndex);
    console.log('   tenant cell markup:', JSON.stringify(S.supportUsersMarkup?.tenantCellMarkup || '(no rows)').slice(0, 200));

    // ── 4. tenant-tokens picker (request 6) ───────────────────────────────
    await page.goto(`${BASE}/tenant-tokens`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4500);
    S.tenantTokens = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return {
        fullText: clean(document.body.innerText).slice(0, 300),
        inputs: [...document.querySelectorAll('input')].filter(on)
          .map((i) => ({ id: i.id || null, placeholder: i.getAttribute('placeholder'), readOnly: i.readOnly })),
        modals: [...document.querySelectorAll('.modal')].map((m) => m.id || '(anon)').slice(0, 6),
        buttons: [...document.querySelectorAll('button, a.btn')].filter(on)
          .map((b) => clean(b.innerText) || b.id).filter(Boolean).slice(0, 10),
      };
    });
    await shot('tenant_tokens_detail');
    console.log('\n══ /tenant-tokens ══');
    console.log('   text:', S.tenantTokens.fullText.slice(0, 160));
    console.log('   inputs:', JSON.stringify(S.tenantTokens.inputs));
    console.log('   modals in DOM:', JSON.stringify(S.tenantTokens.modals));

  } catch (e) {
    console.log('\nERR:', e.message);
    S.error = e.message;
  } finally {
    await browser.close();
  }

  const out = path.join(REPO, 'reports', 'qa', 'raw', 'support-remaining-study.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(S, null, 2));
  console.log(`\n✅ wrote ${path.relative(REPO, out)} — read-only throughout`);
})();
