'use strict';
// Fix #16/#17 — Leads Report: period=All → View Report → page 2 → Export.
// Captures the page-2 rows on screen and the exported workbook for offline inspection.
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const OUTDIR = process.argv[2] || '.';
const rows = () => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim());
(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true })).newPage();
  const R = {};
  try {
    await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);
    await page.goto(`${BASE}/lead-reports`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
    const ctl = await page.evaluate(() => ({ selects: [...document.querySelectorAll('select')].filter((e) => e.getClientRects().length).map((s) => ({ id: s.id, opts: [...s.options].map((o) => o.text.trim()).slice(0, 8) })), buttons: [...document.querySelectorAll('button')].filter((e) => e.getClientRects().length).map((b) => b.innerText.trim()).filter(Boolean) }));
    console.log('  selects:', JSON.stringify(ctl.selects)); console.log('  buttons:', ctl.buttons.join(' | '));
    const per = page.locator('#crm-leads-period-type-select');
    if (await per.count()) { await per.selectOption({ label: 'All' }).catch(async () => { const v = await per.locator('option').evaluateAll((os) => os.find((o) => /^all/i.test(o.text.trim()))?.value); if (v) await per.selectOption(v); }); console.log('  period → All'); }
    await page.waitForTimeout(800);
    await page.locator('button:has-text("View Report")').first().click({ timeout: 8000 }).catch((e) => console.log('  View Report click:', e.message.split('\n')[0]));
    await page.waitForTimeout(6000);
    const pg1 = await page.evaluate(rows); const pager = await page.evaluate(() => (document.querySelector('.pagination, [class*="pagin"]')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100));
    const total = await page.evaluate(() => (document.body.innerText.match(/(?:total|showing|of)\s*[^\n]{0,40}\d+[^\n]{0,20}/i) || [''])[0].trim().slice(0, 80));
    console.log(`  page 1: ${pg1.length} rows · pager "${pager}" · "${total}"`); R.page1 = { rows: pg1.length, first: pg1[0]?.slice(0, 100), pager, total };
    // page 2
    const p2 = page.locator('.pagination a:has-text("2"), .pagination button:has-text("2"), .page-link:has-text("2"), [aria-label="Next"], a:has-text("Next"), button:has-text("Next")').first();
    if (await p2.count()) { await p2.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(5000); } else console.log('  no page-2 control');
    const pg2 = await page.evaluate(rows); const active = await page.evaluate(() => (document.querySelector('.pagination .active, .page-item.active')?.innerText || '').trim());
    console.log(`  page 2: ${pg2.length} rows · active page "${active}" · first: ${pg2[0]?.slice(0, 100)}`); R.page2 = { rows: pg2.length, first: pg2[0]?.slice(0, 100), active, sameAsPage1: pg1[0] === pg2[0] };
    // export
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), page.locator('button:has-text("Export"), a:has-text("Export"), button[title*="Export" i], [id*="export" i]').first().click({ timeout: 8000 }).catch((e) => console.log('  Export click:', e.message.split('\n')[0]))]);
    if (dl) { const f = path.join(OUTDIR, dl.suggestedFilename() || 'leads-export.xlsx'); await dl.saveAs(f); R.export = { file: f, size: fs.statSync(f).size }; console.log(`  export → ${f} (${R.export.size} bytes)`); }
    else { const a = await page.evaluate(() => (document.querySelector('.swal2-popup,.toast,.alert')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140)); console.log('  no download fired' + (a ? ' · alert="' + a + '"' : '')); R.export = { file: null, alert: a }; }
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0].slice(0, 160)); }
  finally { if (process.env.HEADED) await page.waitForTimeout(2500); await browser.close(); }
  fs.writeFileSync(path.join(OUTDIR, 'fix16_17.json'), JSON.stringify(R, null, 2));
})();
