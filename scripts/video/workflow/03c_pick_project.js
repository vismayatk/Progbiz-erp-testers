'use strict';
/**
 * Step 3c (READ-ONLY): find a project whose overview tabs actually hold data (so the video does not show empty
 * "No Data" screens). Opens the first N rows of a status tab with the row's View button, clicks each data tab and
 * counts which ones are non-empty. Only navigation / tab clicks.
 * Run:  node scripts/video/workflow/03c_pick_project.js [Finished|Ongoing] [N]
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const TABS = ['Collections', 'Invoices', 'Expenses', 'Costing', 'Material', 'Time', 'Activities', 'Maintenances', 'Complaints', 'Notes', 'Attachments', 'Checklist'];
(async () => {
  const status = process.argv[2] || 'Finished';
  const N = +(process.argv[3] || 8);
  const nav = JSON.parse(fs.readFileSync(path.join(L.OUT, 'scout', 'nav.json'), 'utf8'));
  const mod = nav.find(n => /^workflows\//.test(n.href)).href.split('/')[1];
  const { browser, page } = await L.openApp();
  const res = [];
  const clickTab = async t => {
    const loc = page.locator('a, button, li, div, span').filter({ hasText: new RegExp('^\\s*' + t + '\\s*$') });
    for (let i = 0; i < await loc.count(); i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      if (await el.evaluate(e => !!e.closest('#sidebar, .sidebar, aside, .app-sidebar')).catch(() => true)) continue;
      await el.click({ timeout: 4000 }).catch(() => {}); return true;
    }
    return false;
  };
  try {
    for (let r = 0; r < N; r++) {
      await L.visit(page, `/workflows/${mod}`, { settleMs: 2000 });
      await page.getByText(new RegExp('^\\s*' + status)).first().click();
      await page.waitForTimeout(1800);
      const row = page.locator('table tbody tr').nth(r);
      const label = ((await row.locator('td').nth(2).innerText().catch(() => '')) || '').split('\n')[0];
      await row.locator('button[data-bs-title="View"]').click();
      await page.waitForTimeout(2800);
      const url = new URL(page.url()).pathname;
      const have = [];
      for (const t of TABS) {
        if (!(await clickTab(t))) continue;
        await page.waitForTimeout(900);
        const txt = await page.evaluate(() => document.body.innerText);
        const body = (txt.split(/\n\s*Attachments\n/).pop() || '').slice(0, 1200);
        const empty = /No Data|Nothing|No time logged|No note|No material is used/i.test(body) || body.replace(/\s+/g, '').length < 40;
        if (process.env.DBG) console.log('   ', t, empty ? 'empty' : 'DATA', JSON.stringify(body.slice(0, 90)));
        if (!empty) have.push(t);
      }
      res.push({ r, label, url, have });
      console.log(String(r).padStart(2), url.padEnd(60), have.length, have.join(','));
    }
  } catch (e) { console.log('ERROR', String(e.message).split('\n')[0]); }
  finally {
    fs.writeFileSync(path.join(L.OUT, 'scout', `pick_${status}.json`), JSON.stringify(res, null, 1));
    await browser.close();
  }
})();
