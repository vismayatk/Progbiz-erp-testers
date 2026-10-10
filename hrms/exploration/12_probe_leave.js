'use strict';
/** Probe the 6 failing leave interactions for ground-truth selectors/behaviour. */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: 'hrms/.auth/state.json', viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500); };

  const probeFilterHosts = async (label, selectors) => {
    const out = await page.evaluate((sels) => {
      const res = {};
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) { res[sel] = 'ABSENT'; continue; }
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const inOffcanvas = el.closest('.offcanvas');
        res[sel] = {
          visibility: cs.visibility, display: cs.display,
          inViewport: r.y >= 0 && r.y < 900 && r.x >= 0 && r.x < 1600,
          offcanvas: inOffcanvas ? (inOffcanvas.id || inOffcanvas.className.slice(0, 40)) : null,
          offcanvasShown: inOffcanvas ? inOffcanvas.classList.contains('show') : null,
        };
      }
      return res;
    }, selectors);
    console.log(`\n=== ${label} (${page.url()})`);
    console.log(JSON.stringify(out, null, 1));
  };

  // 1. leave-approval — Delegate approvals → #custodianname
  await page.goto('https://hrms-erp.progbiz.in/leave-approval', { waitUntil: 'domcontentloaded' }); await settle();
  await page.locator('.main-content button, .main-content a.btn').filter({ hasText: /Delegate approvals/i }).first()
    .click({ timeout: 8000 }).catch(e => console.log('delegate click failed:', e.message.split('\n')[0]));
  await page.waitForTimeout(1500);
  await probeFilterHosts('leave-approval AFTER Delegate click', ['#custodianname', '.offcanvas.show', '.modal.show']);

  // 2/3. leave-ledger — employee search input
  await page.goto('https://hrms-erp.progbiz.in/leave-ledger', { waitUntil: 'domcontentloaded' }); await settle();
  await probeFilterHosts('leave-ledger', ['input[placeholder="All (search name / ID)"]', 'input[list="ledgerEmp"]', '#filterOffcanvas', '[title="Filter"]']);

  // 4. leave-attendance-sync — number (year) input
  await page.goto('https://hrms-erp.progbiz.in/leave-attendance-sync', { waitUntil: 'domcontentloaded' }); await settle();
  await probeFilterHosts('leave-attendance-sync', ['input[type="number"]', '#filterOffcanvas', '[title="Filter"]']);

  // 5. holiday-list — Calendar button target
  await page.goto('https://hrms-erp.progbiz.in/holiday-list', { waitUntil: 'domcontentloaded' }); await settle();
  const beforeUrl = page.url();
  await page.locator('.main-content button, .main-content a.btn').filter({ hasText: /^\s*Calendar\s*$/i }).first()
    .click({ timeout: 8000 }).catch(e => console.log('calendar click failed:', e.message.split('\n')[0]));
  await page.waitForTimeout(2000);
  console.log(`\n=== holiday-list Calendar: ${beforeUrl} -> ${page.url()}`);

  // 6. absence-analytics — KPI tile labels
  await page.goto('https://hrms-erp.progbiz.in/absence-analytics', { waitUntil: 'domcontentloaded' }); await settle();
  const labels = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = (el) => (el.innerText || '').trim().replace(/\s+/g, ' ');
    const cards = Array.from(document.querySelectorAll('.main-content .card, .main-content [class*="tile" i], .main-content [class*="kpi" i], .main-content [class*="stat" i]'))
      .filter(vis).map(c => txt(c).slice(0, 80)).filter(Boolean).slice(0, 20);
    return cards;
  });
  console.log('\n=== absence-analytics cards/tiles:', JSON.stringify(labels, null, 1));

  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
