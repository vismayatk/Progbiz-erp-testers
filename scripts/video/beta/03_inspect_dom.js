'use strict';
/**
 * READ-ONLY DOM inspection used to write the privacy-blur rules: prints the
 * markup of one Home schedule card, one follow-up history item, one Kanban
 * card and one AI Call Analysis customer cell. Only navigation plus one click
 * on the "Kanban View" toggle (a view switch, nothing is saved).
 * Run:  node scripts/video/beta/03_inspect_dom.js
 */
const L = require('./lib');

const snip = (h, n = 1400) => h.replace(/\s+/g, ' ').replace(/<!--!-->/g, '').slice(0, n);

(async () => {
  const { browser, page } = await L.openApp();
  try {
    await L.visit(page, '/home', { settleMs: 3000 });
    const home = await page.evaluate(() => {
      const card = t => [...document.querySelectorAll('.card')].find(c => (c.innerText || '').trim().startsWith(t));
      const sch = card("Today's Schedule"), his = card('Followup History');
      const firstItem = c => { if (!c) return null; const b = c.querySelector('.card-body') || c; const kids = [...b.querySelectorAll(':scope > *')]; return (kids[0] || b).outerHTML; };
      return { schedule: firstItem(sch), history: firstItem(his) };
    });
    console.log('HOME schedule:', snip(home.schedule || 'n/a'));
    console.log('\nHOME history:', snip(home.history || 'n/a'));

    await page.waitForTimeout(1500);
    await L.visit(page, '/followups', { settleMs: 2500 });
    const kb = page.getByText('Kanban View', { exact: false }).first();
    await kb.click({ timeout: 8000 });
    await page.waitForTimeout(3500);
    const kan = await page.evaluate(() => {
      const c = [...document.querySelectorAll('div')].find(d => /ENQ-\d+|QUO-\d+/.test(d.innerText || '') && /Next:/.test(d.innerText || '') && d.children.length >= 3 && (d.innerText || '').length < 400);
      return c ? c.outerHTML : null;
    });
    console.log('\nKANBAN card:', snip(kan || 'n/a', 2200));

    await page.waitForTimeout(1500);
    await L.visit(page, '/call-analysis', { settleMs: 2500 });
    const cell = await page.evaluate(() => {
      const t = document.querySelector('table'); if (!t) return null;
      const heads = [...t.querySelectorAll('thead th')].map(th => th.innerText.trim());
      const i = heads.findIndex(h => /Enquiry/.test(h));
      const tr = t.querySelector('tbody tr');
      return { heads, cell: tr && tr.children[i] ? tr.children[i].outerHTML : null, action: tr ? tr.lastElementChild.outerHTML : null };
    });
    console.log('\nCALLS heads:', JSON.stringify(cell && cell.heads));
    console.log('CALLS customer cell:', snip((cell && cell.cell) || 'n/a'));
    console.log('CALLS action cell:', snip((cell && cell.action) || 'n/a'));
  } catch (e) {
    console.log('ERROR', String(e.message).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
