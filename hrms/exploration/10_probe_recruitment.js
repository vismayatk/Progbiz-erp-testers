'use strict';
/** Probe the 3 failing recruitment interactions: what actually happens on click. */
const { chromium } = require('playwright');

const dump = async (page, label) => {
  const state = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = (el) => (el.innerText || '').trim().replace(/\s+/g, ' ');
    const modals = Array.from(document.querySelectorAll('.modal.show, .swal2-container, .offcanvas.show, [role="dialog"]'))
      .filter(vis).map(m => ({ cls: m.className.toString().slice(0, 70), text: txt(m).slice(0, 220) }));
    const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea'))
      .filter(vis).slice(0, 25).map(i => i.getAttribute('placeholder') || i.id || i.name || i.type);
    const tabs = Array.from(document.querySelectorAll('[role="tab"], .nav-tabs a, .nav-tabs button, .nav-pills a, .nav-pills button'))
      .filter(vis).map(txt).filter(Boolean);
    return { modals, inputs, tabs, bodyStart: txt(document.body).slice(0, 260) };
  });
  console.log(`\n--- ${label} | url=${page.url()}`);
  console.log(JSON.stringify(state, null, 1));
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: 'hrms/.auth/state.json', viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500); };

  // 1. vacancy-list: click the "Candidates" tab
  await page.goto('https://hrms-erp.progbiz.in/vacancy-list', { waitUntil: 'domcontentloaded' }); await settle();
  await dump(page, 'vacancy-list BEFORE tab click');
  await page.locator('.main-content [role="tab"], .main-content .nav-tabs a, .main-content .nav-tabs button, .main-content .nav-pills a, .main-content .nav-pills button')
    .filter({ hasText: /Candidates/i }).first().click({ timeout: 8000 }).catch(e => console.log('tab click failed:', e.message.split('\n')[0]));
  await settle();
  await dump(page, 'vacancy-list AFTER Candidates tab click');

  // 2. candidates: click "Add New"
  await page.goto('https://hrms-erp.progbiz.in/candidates', { waitUntil: 'domcontentloaded' }); await settle();
  await page.locator('.main-content button, .main-content a.btn').filter({ hasText: /Add New/i }).first()
    .click({ timeout: 8000 }).catch(e => console.log('Add New click failed:', e.message.split('\n')[0]));
  await settle();
  await dump(page, 'candidates AFTER Add New click');

  // 3. recruitment-pipeline: click "Configure Stages"
  await page.goto('https://hrms-erp.progbiz.in/recruitment-pipeline', { waitUntil: 'domcontentloaded' }); await settle();
  await page.locator('.main-content button, .main-content a.btn').filter({ hasText: /Configure Stages/i }).first()
    .click({ timeout: 8000 }).catch(e => console.log('Configure Stages click failed:', e.message.split('\n')[0]));
  await settle();
  await dump(page, 'recruitment-pipeline AFTER Configure Stages click');

  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
