'use strict';

/**
 * ACTION-REACHABILITY SWEEP — the "do every action" layer, non-destructive.
 *
 * For every page in the live inventory (data/sweep-routes.json) it finds the page's
 * PRIMARY create/action launcher (Add New / New … / Create / Schedule / Apply /
 * Generate / Raise / Assign / Initiate / Upload), clicks it, and records whether its
 * form actually opens:
 *   • FORM-OPENS — a modal / offcanvas / routed create form rendered (with inputs)
 *   • ERROR      — clicking the launcher raised a server-error popup ("Oops…")
 *   • NO-FORM    — the launcher was clicked but nothing opened (potential blocker)
 *   • NO-ACTION  — the page has no top-level create launcher (read-only / list page)
 * It only ever OPENS a blank create form and then cancels — it NEVER submits, and it
 * never touches row-level edit/delete/submit controls, so it is safe and repeatable.
 * Report → reports/action-sweep/<run>.{json,md}.
 *
 * Run: npx playwright test -c hrms/playwright.config.js hrms/tests/00_sweep/action_reachability_sweep.spec.js --retries=0
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
let ROUTES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'sweep-routes.json'), 'utf8'));
// Optional validation slice: SWEEP_FILTER (regex over route) then SWEEP_LIMIT (first N).
if (process.env.SWEEP_FILTER) ROUTES = ROUTES.filter(r => new RegExp(process.env.SWEEP_FILTER, 'i').test(r.route));
if (process.env.SWEEP_LIMIT) ROUTES = ROUTES.slice(0, Number(process.env.SWEEP_LIMIT));

// Top-level create/action launchers only (never row actions, never destructive verbs).
const LAUNCH = /(\bAdd\b|\bNew\b|\bCreate\b|\bSchedule\b|\bApply\b|\bGenerate\b|\bRaise\b|\bAssign\b|\bInitiate\b|\bUpload\b|\bRefer\b|\bBook\b|\bDeclare\b|\bRecord\b)/i;
const NEG = /cancel|close|back|discard|reset|go back|skip|previous|next|filter|clear|search|export|delete|remove|view report|logout|sign out/i;

test.describe('HRMS action-reachability sweep', () => {
  test('open every page\'s primary action and record whether its form opens', async ({ page }) => {
    test.setTimeout(40 * 60 * 1000);

    const content = () => page.locator('.app-content, .main-content, [class*="content-wrapper" i]').last();
    const results = [];

    for (const { label, route } of ROUTES) {
      let status = 'NO-ACTION', launcher = '', detail = '';
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(2500);
        const beforeUrl = page.url();

        // Blazor list pages often paint their action bar only after the list loads — wait for the
        // launcher to appear, reloading once if the page came up without it (mirrors clickLauncher).
        const btn = content().locator('button, a.btn, [role="button"]')
          .filter({ hasText: LAUNCH }).filter({ hasNotText: NEG }).first();
        let visible = await btn.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
        if (!visible) {
          await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(2500);
          visible = await btn.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
        }
        if (!visible) { status = 'NO-ACTION'; }
        else {
          launcher = (await btn.innerText().catch(() => '') || '').replace(/\s+/g, ' ').trim().slice(0, 30);
          await btn.click({ timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(2200);

          const oops = page.locator('.swal2-popup, .modal.show').filter({ hasText: /Oops|went wrong|Error Code/i }).first();
          const form = page.locator('.modal.show, .offcanvas.show, [role="dialog"]').first();
          const routed = page.url() !== beforeUrl;
          if (await oops.isVisible().catch(() => false)) {
            status = 'ERROR';
            detail = (await oops.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120);
          } else if (await form.isVisible().catch(() => false)) {
            const inputs = await form.locator('input, select, textarea').count().catch(() => 0);
            status = inputs > 0 ? 'FORM-OPENS' : 'NO-FORM';
            detail = `${inputs} fields`;
          } else if (routed) {
            const inputs = await content().locator('input, select, textarea').count().catch(() => 0);
            status = inputs > 0 ? 'FORM-OPENS' : 'NO-FORM';
            detail = `routed → ${page.url().replace(BASE, '')} (${inputs} fields)`;
          } else {
            status = 'NO-FORM';
          }
          // Close without saving.
          await page.locator('.swal2-confirm, .modal.show .btn-close, .offcanvas.show .btn-close, button:has-text("Cancel"), button:has-text("Close")').first().click({ timeout: 1500 }).catch(() => {});
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
        }
      } catch (e) {
        status = 'LOAD-FAIL';
        detail = String(e).split('\n')[0].slice(0, 80);
      }
      results.push({ route, label, status, launcher, detail });
    }

    // ---- report ----
    const outDir = path.join(__dirname, '..', '..', '..', 'reports', 'action-sweep');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(outDir, `action-${stamp}.json`), JSON.stringify(results, null, 2));

    const by = (s) => results.filter(r => r.status === s);
    const order = ['ERROR', 'NO-FORM', 'LOAD-FAIL', 'FORM-OPENS', 'NO-ACTION'];
    const counts = order.map(s => `${s}: ${by(s).length}`).join(' · ');
    const md = [
      `# HRMS action-reachability sweep — ${stamp}`,
      `Env: ${BASE} · pages: ${results.length}`, '', `**${counts}**`, '',
      '## Action blockers (ERROR / NO-FORM) — launcher present but action failed to open',
      '| Route | Label | Launcher | Status | Detail |',
      '|---|---|---|---|---|',
      ...results.filter(r => ['ERROR', 'NO-FORM', 'LOAD-FAIL'].includes(r.status))
        .map(r => `| \`${r.route}\` | ${r.label} | ${r.launcher} | **${r.status}** | ${(r.detail || '').replace(/\|/g, '/')} |`),
      '', `## Actions that opened cleanly (${by('FORM-OPENS').length})`,
      ...by('FORM-OPENS').map(r => `- \`${r.route}\` — ${r.launcher} (${r.detail})`),
    ].join('\n');
    const mdPath = path.join(outDir, `action-${stamp}.md`);
    fs.writeFileSync(mdPath, md);
    console.log(`\n==== ACTION SWEEP ====\n${counts}\nReport: ${mdPath}`);
    for (const r of results.filter(r => ['ERROR', 'NO-FORM', 'LOAD-FAIL'].includes(r.status)))
      console.log(`  [${r.status}] ${r.route}  (${r.launcher})  ${r.detail}`);

    expect(results.length, 'the sweep should have visited every route').toBe(ROUTES.length);
  });
});
