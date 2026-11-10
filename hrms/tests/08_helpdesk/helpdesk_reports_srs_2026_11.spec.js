'use strict';

/**
 * Helpdesk Analytics Reports — SRS change E1 (new, 02→09 Nov 2026).
 * Source: Z:\hrms documents\SRS\SRS-ESS-Recruitment-Changes-2026-11-09.docx
 *
 * Three new HelpdeskAdmin reports in the Reports hub:
 *   /helpdesk-ticket-summary-report       (Ticket Summary)
 *   /helpdesk-agent-performance-report     (Agent Performance)
 *   /helpdesk-sla-compliance-report        (SLA Compliance)
 * Each opens on a filter card (Branch / Agent / Category / Priority / Period) with
 * a green "View Report"; after viewing there is Go Back + Export Data.
 *
 * LIVE FINDING — DEFECT (2026-11-10, amit@pbhrms / HelpdeskAdmin): "View Report"
 * raises a server error — "Oops something went wrong — Error Code: <random>" — on
 * ALL THREE reports. It is consistent with the default Period = "All Time", and
 * still fires intermittently with a bounded Period (e.g. "This Month"); changing
 * the Period select auto-runs the report and can raise the same error. So the
 * filter cards render, but REPORT GENERATION itself is currently broken/unreliable.
 * The generation check is a documented `test.fixme` below — un-skip once the dev
 * fixes the report query. (Matches the SRS note that these were auto-built and not
 * yet run by a developer.)
 *
 * Run: npx playwright test -c hrms/playwright.config.js hrms/tests/08_helpdesk/helpdesk_reports_srs_2026_11.spec.js
 */
const { test, expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

const REPORTS = [
  { route: '/helpdesk-ticket-summary-report', title: /Helpdesk Ticket Summary Report/i },
  { route: '/helpdesk-agent-performance-report', title: /Helpdesk Agent Performance Report/i },
  { route: '/helpdesk-sla-compliance-report', title: /Helpdesk SLA Compliance Report/i },
];

const viewReportBtn = (page) => page.locator('button, a.btn').filter({ hasText: /^\s*View Report\s*$/i }).first();
const oopsPopup     = (page) => page.locator('.swal2-popup, .modal.show').filter({ hasText: /Oops|went wrong|Error Code/i }).first();
const periodSelect  = (page) => page.locator('select').filter({ has: page.locator('option', { hasText: /This Month|All Time/i }) }).first();

test.describe('Helpdesk Analytics Reports SRS 2026-11 — E1', () => {

  for (const r of REPORTS) {
    test(`E1 ${r.route} opens on its filter card (Branch/Agent/Category/Priority/Period + View Report)`, async ({ page }) => {
      const fk = new FormKit(page);
      await fk.gotoReady(`${BASE}${r.route}`, { ready: 'select' });
      await expect(page.locator('h1, h2, h3').filter({ hasText: r.title }).first(),
        'the report page should show its title').toBeVisible({ timeout: 20000 });
      // Filter card: the five named filters + View Report.
      for (const lab of ['Branch', 'Agent', 'Category', 'Priority', 'Period']) {
        await expect(page.getByText(new RegExp(`^\\s*${lab}\\s*$`, 'i')).first(), `filter "${lab}" present`).toBeVisible();
      }
      await expect(viewReportBtn(page), 'a View Report button should be present').toBeVisible({ timeout: 10000 });
    });

  }

  // ── Documented live DEFECT — report generation server-errors on all three reports ──
  // As of 2026-11-10, "View Report" raises "Oops something went wrong — Error Code: <random>"
  // consistently with the default Period "All Time" and intermittently with a bounded Period;
  // changing the Period select also auto-runs the report and can raise the same error. The
  // filter cards render, but no report body (tiles / tables / Go Back / Export) is reliably
  // produced. Un-skip once the dev fixes the report query — the body asserts the happy path
  // (no server error, Go Back + Export present) across all three reports with a bounded period.
  test.fixme('E1 DEFECT: View Report should generate the report (Go Back + Export) without a server error', async ({ page }) => {
    const fk = new FormKit(page);
    for (const r of REPORTS) {
      await fk.gotoReady(`${BASE}${r.route}`, { ready: 'select' });
      const period = periodSelect(page);
      await fk.setSelect(period, 'This Month', 'Period', { loose: true });
      await page.locator('.swal2-confirm, button:has-text("OK")').first().click().catch(() => {}); // clear any auto-run error
      await viewReportBtn(page).click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(5000);
      expect(await oopsPopup(page).isVisible().catch(() => false),
        `${r.route}: View Report should not raise the "Oops something went wrong" server error`).toBeFalsy();
      await expect(page.locator('a, button').filter({ hasText: /Go Back/i }).first(),
        `${r.route}: the report results should offer Go Back`).toBeVisible({ timeout: 15000 });
      await expect(page.locator('a, button').filter({ hasText: /Export/i }).first(),
        `${r.route}: the report results should offer Export`).toBeVisible({ timeout: 10000 });
    }
  });

});
