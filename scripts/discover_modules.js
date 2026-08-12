'use strict';
/**
 * Full-app module discovery.
 *
 * Logs in once, walks the entire left navigation (including collapsed
 * submenus), and records every module + route the tenant actually exposes.
 * Then probes the specific controls the suite is currently failing on so
 * replacement selectors are grounded in the real DOM instead of guesswork.
 *
 * READ-ONLY: navigates and reads. It never submits a form, saves, or deletes.
 *
 *   node scripts/discover_modules.js
 *
 * Output: scripts/discovery_report.json  (+ screenshots/discovery_*.png)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');

const BASE = process.env.BASE_URL || 'https://devtest.progbiz.in';
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};

const OUT = path.join(__dirname, 'discovery_report.json');
const SHOTS = path.join(__dirname, '..', 'screenshots');

/** Routes the existing suite claims to cover, per the module inventory. */
const KNOWN_ROUTES = [
  '/home', '/leads', '/followups', '/crm-dashboard', '/enquiry', '/quotations',
  '/lead-sources', '/lead-status', '/bulk-lead-transfer', '/item-categories',
  '/item', '/items', '/task', '/my-tasks', '/delegated-tasks',
  '/daily-activity-report', '/created-tasks', '/unscheduled-tasks', '/todo-list',
  '/calendar', '/projects', '/project', '/project-notes', '/project-attachments',
  '/project-expenses', '/project-incomes',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const report = { base: BASE, company: C.company, capturedAt: new Date().toISOString() };

  try {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── 1. Login ──────────────────────────────────────────────────────────
    const login = new LoginPage(page);
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2500);
    report.landedOn = page.url();
    console.log('landed on', report.landedOn);

    // ── 2. Expand every collapsible nav group, then harvest links ─────────
    // The sidebar hides submenus behind accordions; click each toggle so the
    // child <a href> elements are actually present in the DOM.
    const toggles = page.locator(
      'nav a, nav [data-bs-toggle], .sidebar a, .sidebar [data-bs-toggle], ' +
      '#sidebar a, [class*="sidebar" i] a, [class*="menu" i] > li > a'
    );
    const tCount = await toggles.count().catch(() => 0);
    console.log(`nav candidates: ${tCount}`);
    for (let i = 0; i < Math.min(tCount, 80); i++) {
      const t = toggles.nth(i);
      const href = await t.getAttribute('href').catch(() => null);
      // Only click things that expand in place (no href, or href="#").
      if (!href || href === '#' || href === 'javascript:void(0)') {
        await t.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(180);
      }
    }
    await page.waitForTimeout(800);

    report.nav = await page.evaluate(() => {
      const vis = (e) => e.getClientRects().length > 0;
      const seen = new Map();
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') || '';
        if (!href || href === '#' || href.startsWith('javascript')) continue;
        let p;
        try { p = new URL(href, location.origin).pathname; } catch { continue; }
        if (p === '/' || p === '/login') continue;
        const txt = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (!txt || txt.length > 60) continue;
        // Walk up for the parent accordion heading, so we can group by module.
        let group = '';
        let n = a.parentElement;
        for (let d = 0; d < 6 && n; d++, n = n.parentElement) {
          const head = n.previousElementSibling;
          if (head && /^(a|button|h\d|span|div)$/i.test(head.tagName)) {
            const ht = (head.textContent || '').replace(/\s+/g, ' ').trim();
            if (ht && ht.length < 40 && ht !== txt) { group = ht; break; }
          }
        }
        if (!seen.has(p)) seen.set(p, { path: p, text: txt, group, visible: vis(a) });
      }
      return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
    });
    console.log(`discovered ${report.nav.length} distinct routes`);
    await page.screenshot({ path: path.join(SHOTS, 'discovery_nav.png'), fullPage: true }).catch(() => {});

    // ── 3. Classify: new vs already covered ──────────────────────────────
    const found = report.nav.map((n) => n.path);
    report.newRoutes = found.filter((p) => !KNOWN_ROUTES.includes(p));
    report.missingRoutes = KNOWN_ROUTES.filter((p) => !found.includes(p));
    report.knownRoutes = found.filter((p) => KNOWN_ROUTES.includes(p));

    // ── 4. Probe the broken item picker on the live enquiry form ─────────
    await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3500);
    report.enquiryForm = await page.evaluate(() => {
      const el = document.querySelector('#item-search-input');
      const dump = (n, depth) => {
        const out = [];
        let cur = n;
        for (let i = 0; i < depth && cur; i++, cur = cur.parentElement) {
          out.push({
            level: i,
            tag: cur.tagName,
            id: cur.id || null,
            class: cur.className && cur.className.toString ? cur.className.toString().slice(0, 160) : null,
          });
        }
        return out;
      };
      const iconsNear = (n) => {
        if (!n) return [];
        let scope = n;
        for (let i = 0; i < 4 && scope.parentElement; i++) scope = scope.parentElement;
        return [...scope.querySelectorAll('i,svg,button,span[class*="icon" i]')]
          .slice(0, 25)
          .map((e) => ({
            tag: e.tagName,
            class: (e.getAttribute('class') || '').slice(0, 120),
            id: e.id || null,
            title: e.getAttribute('title') || e.getAttribute('aria-label') || null,
          }));
      };
      return {
        itemSearchInputPresent: !!el,
        ancestry: dump(el, 6),
        controlsNearItemSearch: iconsNear(el),
        anyInputGroup: !!document.querySelector('.input-group'),
        inputGroupCount: document.querySelectorAll('.input-group').length,
        remixIconCount: document.querySelectorAll('[class*="ri-"]').length,
        searchIconVariants: [...new Set(
          [...document.querySelectorAll('[class*="search" i]')]
            .map((e) => (e.getAttribute('class') || '').trim())
            .filter(Boolean)
        )].slice(0, 20),
        allFormIds: [...document.querySelectorAll('input[id],select[id],textarea[id],button[id]')]
          .map((e) => ({ tag: e.tagName, id: e.id, type: e.type || null }))
          .slice(0, 80),
      };
    });
    await page.screenshot({ path: path.join(SHOTS, 'discovery_enquiry.png'), fullPage: true }).catch(() => {});

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(`\n✅ wrote ${OUT}`);
    console.log(`   routes found: ${report.nav.length}`);
    console.log(`   NEW (not in suite): ${report.newRoutes.length}`);
    console.log(`   covered-but-absent: ${report.missingRoutes.length}`);
  } catch (e) {
    console.log('ERR:', e.message);
    report.error = e.message;
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})();
