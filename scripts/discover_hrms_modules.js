'use strict';
/**
 * HRMS module/submodule discovery — mirrors scripts/discover_modules.js (the
 * ERP nav crawler) but for the HRMS tenant. Logs in once, expands every
 * collapsible sidebar section, and records every route the tenant actually
 * exposes, grouped by its parent nav heading ("module") so we can report a
 * modules-and-submodules count rather than just a flat route list.
 *
 * READ-ONLY: navigates and reads. It never submits a form, saves, or deletes.
 *
 * Point it at a specific host/tenant via env (not written to .env):
 *   HRMS_BASE_URL=https://hrms-test.progbiz.in \
 *   HRMS_COMPANY_CODE=pbhrms HRMS_USERNAME=admin HRMS_PASSWORD=123456 \
 *   node scripts/discover_hrms_modules.js
 *
 * Output: scripts/discovery_report_hrms.json (+ screenshots/discovery_hrms_nav.png)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { HrmsLoginPage } = require('../hrms/pages/HrmsLoginPage');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-erp.progbiz.in';
const C = {
  company:  process.env.HRMS_COMPANY_CODE,
  username: process.env.HRMS_USERNAME,
  password: process.env.HRMS_PASSWORD,
};

const OUT = path.join(__dirname, 'discovery_report_hrms.json');
const SHOTS = path.join(__dirname, '..', 'screenshots');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const report = { base: BASE, company: C.company, capturedAt: new Date().toISOString() };

  try {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── 1. Login ──────────────────────────────────────────────────────────
    const login = new HrmsLoginPage(page);
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2500);
    report.landedOn = page.url();
    console.log('landed on', report.landedOn);

    // ── 2. Expand every collapsible nav group, then harvest links ─────────
    const toggles = page.locator(
      'nav a, nav [data-bs-toggle], .sidebar a, .sidebar [data-bs-toggle], ' +
      '#sidebar a, [class*="sidebar" i] a, [class*="menu" i] > li > a'
    );
    const tCount = await toggles.count().catch(() => 0);
    console.log(`nav candidates: ${tCount}`);
    for (let i = 0; i < Math.min(tCount, 120); i++) {
      const t = toggles.nth(i);
      const href = await t.getAttribute('href').catch(() => null);
      if (!href || href === '#' || href === 'javascript:void(0)') {
        await t.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(150);
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
      return [...seen.values()].sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.path.localeCompare(b.path));
    });
    console.log(`discovered ${report.nav.length} distinct routes`);
    await page.screenshot({ path: path.join(SHOTS, 'discovery_hrms_nav.png'), fullPage: true }).catch(() => {});

    // ── 3. Group into modules → submodules ─────────────────────────────────
    const byGroup = new Map();
    for (const n of report.nav) {
      const g = n.group || '(ungrouped)';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(n);
    }
    report.moduleCount = byGroup.size;
    report.submoduleCount = report.nav.length;
    report.modules = [...byGroup.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([group, items]) => ({ module: group, submoduleCount: items.length, submodules: items.map((i) => ({ text: i.text, path: i.path, visible: i.visible })) }));

    console.log(`\n=== ${report.moduleCount} modules, ${report.submoduleCount} submodules ===`);
    for (const m of report.modules) {
      console.log(`  ${m.module}  (${m.submoduleCount})`);
      for (const s of m.submodules) console.log(`    - ${s.text}  →  ${s.path}`);
    }

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(`\nWrote ${OUT}`);
  } catch (e) {
    console.log('ERROR', e.message.split('\n')[0]);
    report.error = e.message;
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})();
