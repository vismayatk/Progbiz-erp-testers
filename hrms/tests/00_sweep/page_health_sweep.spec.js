'use strict';

/**
 * FULL PAGE-HEALTH SWEEP — accesses every HRMS sidebar page and reports blockers.
 *
 * The backbone of the "access every page, report every blocker" effort. It reads the
 * live route inventory (data/sweep-routes.json, captured from the signed-in sidebar),
 * visits each route, and classifies its health:
 *   • ERROR    — a server-error popup ("Oops… Error Code"), or a page-level error/exception
 *   • DENIED   — not-found / no-access / unauthorised
 *   • BLANK    — the page rendered (almost) no content
 *   • CONSOLE  — loaded, but emitted console errors during load
 *   • OK       — rendered content, no error signals
 * It RECORDS every page (does not hard-fail per page) and writes a consolidated report to
 * reports/page-sweep/<run>.{json,md}. Console errors and any error popup text are captured.
 *
 * This is the page-access + blocker layer. The per-page ACTION coverage (create/edit/
 * submit/approve with assertions) is layered on top module-by-module in the other specs.
 *
 * Run: npx playwright test -c hrms/playwright.config.js hrms/tests/00_sweep/page_health_sweep.spec.js
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const ROUTES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'sweep-routes.json'), 'utf8'));

function classify(finalUrl, bodyText, popup) {
  if (/\/login/i.test(finalUrl)) return 'AUTH-LAPSE';
  if (popup) return 'ERROR';                                   // Oops / server-error popup
  const t = (bodyText || '').toLowerCase();
  if (/(page not found|404 not found|no access|unauthor|forbidden|you (do not|don.t) have (access|permission)|access denied)/i.test(t)) return 'DENIED';
  if (/(oops|something went wrong|error code|unhandled|exception|an error occurred)/i.test(t)) return 'ERROR';
  if (t.replace(/\s/g, '').length < 60) return 'BLANK';
  return 'OK';
}

test.describe('HRMS full page-health sweep', () => {
  test('visit every sidebar page and record blockers', async ({ page }) => {
    test.setTimeout(30 * 60 * 1000);                           // long single pass

    const results = [];
    for (const { label, route } of ROUTES) {
      // Collect console errors for THIS page only.
      const consoleErrors = [];
      const onConsole = (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160)); };
      page.on('console', onConsole);

      let status = 'ERR', finalUrl = '', note = '', popupText = '';
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1800);
        finalUrl = page.url();
        // Error popup (SweetAlert / modal) visible?
        const popup = page.locator('.swal2-popup, .modal.show').filter({ hasText: /Oops|went wrong|Error Code|error/i }).first();
        if (await popup.isVisible().catch(() => false)) popupText = (await popup.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 140);
        const body = await page.locator('body').innerText().catch(() => '');
        status = classify(finalUrl, body, popupText);
        const heading = (await page.locator('h1, h2, h3').first().innerText().catch(() => '') || '').replace(/\s+/g, ' ').trim().slice(0, 50);
        if (heading) note = `“${heading}”`;
        // dismiss any popup so it doesn't bleed into the next page
        await page.locator('.swal2-confirm, .modal.show .btn-close, button:has-text("OK")').first().click({ timeout: 1500 }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
      } catch (e) {
        status = 'LOAD-FAIL';
        note = String(e).split('\n')[0].slice(0, 90);
      }
      page.off('console', onConsole);
      if (status === 'OK' && consoleErrors.length) status = 'CONSOLE';
      results.push({ route, label, status, finalUrl, popup: popupText, consoleErrors: consoleErrors.slice(0, 5), note });
      // re-auth if we got bounced
      if (status === 'AUTH-LAPSE') { await page.waitForTimeout(2000); }
    }

    // ---- write the report ----
    const outDir = path.join(__dirname, '..', '..', '..', 'reports', 'page-sweep');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(outDir, `sweep-${stamp}.json`), JSON.stringify(results, null, 2));

    const by = (s) => results.filter(r => r.status === s);
    const order = ['ERROR', 'LOAD-FAIL', 'DENIED', 'BLANK', 'CONSOLE', 'AUTH-LAPSE', 'OK'];
    const counts = order.map(s => `${s}: ${by(s).length}`).join(' · ');
    const md = [
      `# HRMS page-health sweep — ${stamp}`,
      `Env: ${BASE} · pages: ${results.length}`,
      '', `**${counts}**`, '',
      '## Blockers (ERROR / LOAD-FAIL / DENIED / BLANK)',
      '| Route | Label | Status | Detail |',
      '|---|---|---|---|',
      ...results.filter(r => ['ERROR', 'LOAD-FAIL', 'DENIED', 'BLANK'].includes(r.status))
        .map(r => `| \`${r.route}\` | ${r.label} | **${r.status}** | ${(r.popup || r.note || '').replace(/\|/g, '/')} |`),
      '', '## Console errors (loaded but noisy)',
      '| Route | Label | First console error |',
      '|---|---|---|',
      ...by('CONSOLE').map(r => `| \`${r.route}\` | ${r.label} | ${(r.consoleErrors[0] || '').replace(/\|/g, '/')} |`),
    ].join('\n');
    const mdPath = path.join(outDir, `sweep-${stamp}.md`);
    fs.writeFileSync(mdPath, md);

    console.log(`\n==== PAGE-HEALTH SWEEP ====\n${counts}\nReport: ${mdPath}`);
    for (const r of results.filter(r => ['ERROR', 'LOAD-FAIL', 'DENIED'].includes(r.status)))
      console.log(`  [${r.status}] ${r.route}  ${r.popup || r.note}`);

    // The sweep itself must have run across the whole inventory; blockers are reported, not fatal.
    expect(results.length, 'the sweep should have visited every route').toBe(ROUTES.length);
    expect(by('AUTH-LAPSE').length, 'the session should not have lapsed mid-sweep').toBeLessThan(ROUTES.length * 0.2);
  });
});
