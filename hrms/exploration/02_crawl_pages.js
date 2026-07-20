'use strict';
/**
 * HRMS exploration — step 2
 * Visit every HRMS page and capture its functional anatomy:
 * header, breadcrumb, tabs, action buttons, table columns, filters, forms,
 * empty states and in-page links (to map page connections).
 *
 * Usage: node 02_crawl_pages.js <groupKey>   (core-hr | recruitment | attendance | leave | ess)
 * Output: hrms/data/pages/<route>.json + hrms/screenshots/<group>/<route>.png
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://hrms-erp.progbiz.in';
const DATA = path.join(__dirname, '..', 'data', 'pages');
const SHOTS = path.join(__dirname, '..', 'screenshots');

const GROUPS = {
  'core-hr': [
    'employees', 'sections', 'worker-directory', 'salary-revisions',
    'employee-salary-process', 'employee-deduction', 'employee-remark',
    'hrms/probation', 'hrms/probation-templates', 'hrms/probation-report',
    'resigned-employees', 'upload-employee',
    'letters/templates', 'letters/generate',
    'approvals', 'approval/config',
    'employee-deduction-report', 'employee-remark-report',
  ],
  recruitment: [
    'requisition-list', 'vacancy-list', 'current-openings', 'job-applications-list',
    'candidates', 'assessment-list', 'interview-schedules', 'offer-list',
    'recruitment-pipeline', 'communication-templates', 'talent-pool',
    'candidate-status', 'interview-rounds',
    'onboarding-templates', 'onboarding-pipeline',
  ],
  attendance: [
    'shifts', 'shift-roster', 'attendance-log', 'data-from-device',
    'add-visit-report', 'regularization', 'overtime-approval',
    'attendance-finalization', 'geofences', 'timesheet', 'attendance-report-pack',
    'approval-operation', 'approval-operation-report',
    'approval-absent', 'approval-absent-report',
  ],
  leave: [
    'leave-types', 'leave-patterns', 'leave-policy', 'leave-assignment-list',
    'leave-request-list', 'leave-approval', 'my-leave-policy', 'leave-balances',
    'leave-ledger', 'leave-attendance-sync', 'leave-encashment',
    'leave-encashment-approval', 'leave-delegation', 'employee-handover',
    'comp-offs', 'comp-off-management', 'holiday-list', 'holiday-assignment-list',
    'leave-reports', 'absence-analytics', 'leave-calendar',
  ],
  ess: [
    'ess', 'ess/profile', 'ess/requests', 'ess/leave', 'my-handover',
    'ess/attendance', 'ess/locations', 'ess/documents', 'ess/letters',
    'ess/payslips', 'ess/probation',
  ],
};

const groupKey = process.argv[2];
const routes = GROUPS[groupKey];
if (!routes) { console.error('Unknown group. Use one of: ' + Object.keys(GROUPS).join(', ')); process.exit(1); }

const safe = (r) => r.replace(/[\/]/g, '__');

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(path.join(SHOTS, groupKey), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();

  // login once
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const company = page.locator('#companycode, input[name="company_code"], input[id*="company" i]').first();
  await company.waitFor({ state: 'visible', timeout: 45000 });
  await company.fill('Hrms');
  await page.locator('#signin-username, input[name="username"], input[id*="user" i]').first().fill('vismaya');
  await page.locator('#signin-password, input[type="password"]').first().fill('123');
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 });
  await page.waitForTimeout(2500);
  console.log(`✅ logged in — crawling group "${groupKey}" (${routes.length} routes)`);

  for (const route of routes) {
    const t0 = Date.now();
    try {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1800);

      const info = await page.evaluate(() => {
        const txt = (el) => (el && el.innerText || '').trim().replace(/\s+/g, ' ');
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const inSidebar = (el) => !!el.closest('nav, aside, .sidebar, [class*="sidebar" i], header, [class*="topbar" i], [class*="navbar" i]');

        const main = document.querySelector('main, .main-content, [class*="content-wrapper" i], [class*="page-content" i]') || document.body;

        const headers = Array.from(main.querySelectorAll('h1,h2,h3,h4,.page-title,[class*="page-header" i] *'))
          .filter(vis).map(txt).filter(Boolean).slice(0, 12);

        const breadcrumb = txt(main.querySelector('.breadcrumb, [class*="breadcrumb" i], nav[aria-label="breadcrumb"]'));

        const tabs = Array.from(main.querySelectorAll('[role="tab"], .nav-tabs a, .nav-tabs button, .nav-pills a, .nav-pills button, [class*="tab-item" i]'))
          .filter(vis).map(txt).filter(Boolean).slice(0, 25);

        const buttons = Array.from(main.querySelectorAll('button, a.btn, [class*="btn" i][role="button"]'))
          .filter(v => vis(v) && !inSidebar(v)).map(txt).filter(t => t && t.length < 45);
        const uniqButtons = [...new Set(buttons)].slice(0, 40);

        const tables = Array.from(main.querySelectorAll('table')).filter(vis).slice(0, 4).map(t => ({
          headers: Array.from(t.querySelectorAll('thead th, thead td')).map(txt).filter(Boolean).slice(0, 25),
          rowCount: t.querySelectorAll('tbody tr').length,
          firstRow: Array.from((t.querySelector('tbody tr') || { querySelectorAll: () => [] }).querySelectorAll('td')).map(txt).slice(0, 12),
        }));

        const inputs = Array.from(main.querySelectorAll('input:not([type=hidden]), select, textarea'))
          .filter(v => vis(v) && !inSidebar(v)).slice(0, 40).map(i => ({
            tag: i.tagName.toLowerCase(), type: i.type || undefined, id: i.id || undefined,
            name: i.getAttribute('name') || undefined,
            placeholder: i.getAttribute('placeholder') || undefined,
          }));

        const selectsNg = Array.from(main.querySelectorAll('ng-select, [class*="ng-select" i]'))
          .filter(vis).slice(0, 20).map(s => txt(s).slice(0, 60));

        const links = Array.from(main.querySelectorAll('a[href]'))
          .filter(v => vis(v) && !inSidebar(v))
          .map(a => ({ text: txt(a).slice(0, 50), href: a.getAttribute('href') }))
          .filter(l => l.href && !l.href.startsWith('javascript') && l.href !== '#').slice(0, 30);

        const cards = Array.from(main.querySelectorAll('.card-title, [class*="stat" i] [class*="title" i], [class*="widget" i] [class*="title" i]'))
          .filter(vis).map(txt).filter(Boolean).slice(0, 15);

        const emptyState = txt(main.querySelector('[class*="empty" i], [class*="no-data" i], .dataTables_empty'));

        const bodySnippet = txt(main).slice(0, 900);

        return { headers, breadcrumb, tabs, buttons: uniqButtons, tables, inputs, selectsNg, links, cards, emptyState, bodySnippet };
      });

      const rec = { route, finalUrl: page.url(), group: groupKey, ...info };
      fs.writeFileSync(path.join(DATA, `${safe(route)}.json`), JSON.stringify(rec, null, 2));
      await page.screenshot({ path: path.join(SHOTS, groupKey, `${safe(route)}.png`), fullPage: false });
      console.log(`  ✓ ${route}  (${Date.now() - t0}ms)  h:[${info.headers[0] || ''}] tables:${info.tables.length} tabs:${info.tabs.length}`);
    } catch (e) {
      fs.writeFileSync(path.join(DATA, `${safe(route)}.json`), JSON.stringify({ route, group: groupKey, error: e.message }, null, 2));
      console.log(`  ✗ ${route} — ${e.message.split('\n')[0].slice(0, 80)}`);
    }
  }

  await browser.close();
  console.log('done:', groupKey);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
