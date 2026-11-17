'use strict';
/**
 * Step 3 of the workflow scout (READ-ONLY): the detail pages are reached by buttons, not links. This clicks only
 * navigation buttons (View, Tasks, Template, Phases, Status) and the tabs of the project overview, never Save /
 * Edit / Delete / Start / Add. After each page: screenshot (viewport + full), text and tab list.
 * Run:  node scripts/video/workflow/03_scout_detail.js
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

(async () => {
  const dir = path.join(L.OUT, 'scout', 'detail');
  L.ensureDir(dir);
  const nav = JSON.parse(fs.readFileSync(path.join(L.OUT, 'scout', 'nav.json'), 'utf8'));
  const mod = nav.find(n => /^workflows\//.test(n.href)).href.split('/')[1];
  const { browser, page } = await L.openApp();
  const log = [];
  const snap = async (name, full = false) => {
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: full });
    const text = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(dir, `${name}.text.txt`), text);
    log.push({ name, url: new URL(page.url()).pathname });
    console.log(name.padEnd(28), new URL(page.url()).pathname);
  };
  const settle = async () => { await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(2500); };
  try {
    // --- types -> Template
    await L.visit(page, `/workflow-types/${mod}`, { settleMs: 2500 });
    await page.locator('table tbody tr').nth(3).getByText('Template', { exact: true }).click();   // NON SUBSIDY ONGRID (8 phases, 16 tasks)
    await settle(); await snap('type_template', true);

    // --- list -> Status, Phases buttons
    await L.visit(page, `/workflows/${mod}`, { settleMs: 2500 });
    await page.getByRole('button', { name: /Phases/ }).first().click().catch(async () => { await page.getByText('Phases', { exact: true }).first().click(); });
    await settle(); await snap('list_phases', true);
    await L.visit(page, `/workflows/${mod}`, { settleMs: 2500 });
    await page.getByText('Status', { exact: true }).first().click();
    await settle(); await snap('list_status', true);

    // --- list -> row View (overview) and its tabs
    await L.visit(page, `/workflows/${mod}`, { settleMs: 2500 });
    await page.locator('table tbody tr').first().locator('button[data-bs-title="View"]').click();
    await settle(); await snap('overview_0', true);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.nav-tabs .nav-link, [role="tab"], .nav-pills .nav-link')]
      .filter(e => e.offsetParent !== null && !e.closest('#sidebar, .sidebar, aside')).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
    console.log('overview tabs:', JSON.stringify(tabs));
    log.push({ tabs });
    let i = 1;
    for (const t of tabs) {
      await page.locator('.nav-tabs .nav-link, [role="tab"], .nav-pills .nav-link').filter({ hasText: t }).first().click();
      await snap(`overview_${String(i++).padStart(2, '0')}_${t.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`, false);
    }

    // --- list -> row Tasks
    await L.visit(page, `/workflows/${mod}`, { settleMs: 2500 });
    await page.locator('table tbody tr').first().locator('button[data-bs-title="Tasks"]').click();
    await settle(); await snap('row_tasks', true);
  } catch (e) { console.log('ERROR', String(e.message).split('\n')[0]); process.exitCode = 1; }
  finally {
    fs.writeFileSync(path.join(dir, 'log.json'), JSON.stringify(log, null, 1));
    await browser.close();
  }
})();
