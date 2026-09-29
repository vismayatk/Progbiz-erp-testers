'use strict';

/**
 * New pages found by the 2026-09-18 re-audit (fresh nav crawl vs the
 * 2026-09-07 baseline in scripts/discovery_report.json) that are NOT part of
 * Complaints (see crm_complaints.spec.js, which gets real save/data-flow
 * coverage because it's a whole new module).
 *
 * These are smoke + empty-state checks, same contract as crm_new_modules.spec.js:
 * the page must load, show its grid (or an explicit empty state), and not
 * show a backend error — nothing here submits a form or saves a record.
 * Read `docs/qa/QA_METHOD.md` before adding interaction beyond this.
 *
 * Scope note: Accounts / Purchase / Sales / Stock Movements / Inventory /
 * Whatsapp are explicitly out of this repo's deep-test scope (per the QA
 * brief — CRM, Task Management, Workflow, Dashboards and Master are the
 * modules under test). The handful of routes below from those groups are
 * included anyway because a fresh module (Complaints) touches Purchase/Sales
 * ("Supplier Refund", "Customer Refund" appeared alongside it) and Whatsapp
 * grew four new pages in the same audit — cheap to smoke-check once they're
 * already being crawled, without expanding this repo's real test scope.
 *
 * Run:  npx playwright test erp/crm/tests/erp_new_pages_2026-09.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');

const BASE = process.env.BASE_URL;
const C = {
  company:  process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};

async function login(page) {
  await new LoginPage(page).login(C.company, C.username, C.password);
  await page.waitForTimeout(1200);
}

/** Land on a route and report what its content is showing — grid(s) or an
 *  explicit empty state. Mirrors crm_new_modules.spec.js's gridState(). */
async function pageState(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);
  return page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const onScreen = (e) => {
      if (e.getClientRects().length === 0) return false;
      const s = getComputedStyle(e);
      return s.display !== 'none' && s.visibility !== 'hidden';
    };
    const tables = [...document.querySelectorAll('table')].filter(onScreen);
    const bodyText = clean(document.body.innerText);
    return {
      bouncedToLogin: /\/login/i.test(location.pathname),
      tableCount: tables.length,
      totalRows: tables.reduce((n, t) => n + t.querySelectorAll('tbody tr').length, 0),
      hasChart: !!document.querySelector('[id^="apexcharts"], svg.apexcharts-svg'),
      emptyState: /(no records|no data|nothing found|no result)/i.test(bodyText),
      pageHasError: /oops|went wrong|error code|unhandled|exception/i.test(bodyText),
      stuckLoading: /\bloading\.\.\.|please wait\b/i.test(bodyText),
      bodyChars: bodyText.length,
    };
  });
}

test.describe('ERP — new pages found 2026-09-18', () => {
  test.describe.configure({ timeout: 200_000 });

  const PAGES = [
    // Complaints module's Master-side config — deliberately read-only here:
    // "Save settings"/"Save" on this page rewrites the tenant's escalation
    // rules (SLA %, notify chain), not a record this run created.
    { id: 'NP-01', route: '/complaint-types',    name: 'Complaint Types',            group: 'Complaints' },
    { id: 'NP-02', route: '/complaint-dashboard', name: 'Complaint Dashboard',        group: 'Dashboards', chart: true },
    { id: 'NP-03', route: '/b2b-dashboard',       name: 'B2B Dashboard',              group: 'CRM',        chart: true },
    { id: 'NP-04', route: '/repeat-accounts',     name: 'Repeat Accounts',            group: 'CRM' },
    { id: 'NP-05', route: '/screen-tracker',      name: 'Screen Tracker',             group: 'Task Management', noGrid: true },
    { id: 'NP-06', route: '/labour-actualisation', name: 'Labour Cost Actualisation', group: 'Work Flow',  noGrid: true },
    // Cost rates come from real employee salary records — read-only for the
    // same reason as Complaint Types: "Save" here edits live payroll data.
    { id: 'NP-07', route: '/workflow-cost-rates', name: 'Work Flow Cost Rates',       group: 'Work Flow' },
    { id: 'NP-08', route: '/supplier-refunds',    name: 'Supplier Refund',            group: 'Purchase' },
    { id: 'NP-09', route: '/customer-refunds',    name: 'Customer Refund',            group: 'Sales' },
    { id: 'NP-10', route: '/blocked-contacts',    name: 'Blocked Contacts',           group: 'Whatsapp' },
    { id: 'NP-11', route: '/instagram-accounts',  name: 'Instagram Accounts',         group: 'Whatsapp' },
    { id: 'NP-12', route: '/whatsapp-expenses',   name: 'Message Expenses',           group: 'Whatsapp' },
    { id: 'NP-13', route: '/whatsapp-message-rates', name: 'Message Rates',           group: 'Whatsapp' },
  ];

  for (const p of PAGES) {
    test(`${p.id} | ${p.name} (${p.group}) loads with no backend error`, async ({ page }) => {
      await login(page);
      const s = await pageState(page, p.route);
      console.log(`  ${p.route} → tables=${s.tableCount} rows=${s.totalRows} chart=${s.hasChart} empty=${s.emptyState} bodyChars=${s.bodyChars}`);

      // KNOWN DEFECT NP-F1 (found 2026-09-21): /whatsapp-expenses never leaves
      // its "Loading…" placeholder. Confirmed live over a 15s poll — the body
      // stays at the same fixed nav-only length (356 chars) the whole time,
      // it isn't a slow-render race the 4s check is just too strict for.
      if (p.id === 'NP-12') {
        test.fail(true, 'NP-F1 — /whatsapp-expenses is stuck on "Loading…" indefinitely (confirmed over 15s, not a slow render)');
      }

      expect(s.bouncedToLogin, `${p.route} bounced to /login — session or permission issue`).toBe(false);
      expect(s.pageHasError, `${p.route} shows a backend error on screen`).toBe(false);
      expect(s.stuckLoading, `${p.route} is still on "Loading…" after 4s`).toBe(false);

      if (p.noGrid) {
        // Screen Tracker / Labour Cost Actualisation render their content
        // outside a <table> (a timeline / a report canvas) — just prove the
        // page actually rendered something rather than a blank shell.
        expect(s.bodyChars, `${p.route} rendered no content`).toBeGreaterThan(200);
      } else if (p.chart) {
        expect(s.hasChart || s.tableCount > 0, `${p.route} shows neither a chart nor a table`).toBe(true);
      } else {
        // A listing must show its grid — or say plainly that it's empty.
        // Headers over a silent body is what a broken load looks like too.
        expect(s.tableCount > 0 || s.emptyState, `${p.route} shows neither a grid nor an empty-state message`).toBe(true);
      }
    });
  }
});
