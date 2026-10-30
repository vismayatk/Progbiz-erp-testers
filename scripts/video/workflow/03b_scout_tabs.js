'use strict';
/**
 * Step 3b (READ-ONLY): open every tab of a project overview and every tab of a type template, one fresh visit each
 * (some tabs navigate to their own page). Only tab / navigation clicks. Saves viewport screenshot + text per tab.
 * Run:  node scripts/video/workflow/03b_scout_tabs.js
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const OVERVIEW = '/workflow-overview/86478880-42ce-440b-bfa6-26892ffa33dc';
const TEMPLATE = '/workflow-type/62253a4f-a102-4176-bcf1-f8b95630fd70';
const OV_TABS = ['Phases', 'Tasks', 'Checklist', 'Payment Summary', 'Collections', 'Invoices', 'Expenses', 'Costing', 'Material', 'Time', 'Activities', 'Maintenances', 'Payment Terms', 'Complaints', 'Notes', 'Attachments'];
const TP_TABS = ['Tasks', 'Payment Terms', 'Members', 'Maintenance Schedule', 'Custom Fields'];

(async () => {
  const dir = path.join(L.OUT, 'scout', 'tabs');
  L.ensureDir(dir);
  const { browser, page } = await L.openApp();
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const one = async (base, tab, prefix) => {
    await L.visit(page, base, { settleMs: 2500 });
    const loc = page.locator('a, button, li, div, span').filter({ hasText: new RegExp('^\\s*' + tab + '\\s*$') });
    const n = await loc.count();
    let clicked = false;
    for (let i = 0; i < n && !clicked; i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const inSidebar = await el.evaluate(e => !!e.closest('#sidebar, .sidebar, aside, .app-sidebar, nav.app-sidebar')).catch(() => true);
      if (inSidebar) continue;
      await el.click({ timeout: 5000 }).catch(() => {}); clicked = true;
    }
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(dir, `${prefix}_${slug(tab)}.png`) });
    const text = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(dir, `${prefix}_${slug(tab)}.text.txt`), text);
    console.log(`${prefix}:${tab}`.padEnd(34), clicked ? 'clicked' : 'NOT FOUND', new URL(page.url()).pathname.slice(0, 60));
  };
  try {
    for (const t of OV_TABS) await one(OVERVIEW, t, 'ov');
    for (const t of TP_TABS) await one(TEMPLATE, t, 'tp');
  } catch (e) { console.log('ERROR', String(e.message).split('\n')[0]); process.exitCode = 1; }
  finally { await browser.close(); }
})();
