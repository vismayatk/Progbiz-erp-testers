'use strict';
/**
 * Step 1 of the workflow scout (READ-ONLY): confirm the saved session works,
 * then dump the full sidebar menu (label -> href) and screenshot /home.
 * Run:  node scripts/video/workflow/01_scout_nav.js
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

(async () => {
  const dir = path.join(L.OUT, 'scout');
  L.ensureDir(dir);
  const { browser, page } = await L.openApp();
  try {
    const r = await L.visit(page, '/home', { settleMs: 3000 });
    console.log('home:', JSON.stringify({ ms: r.ms, path: new URL(r.url).pathname, onLogin: r.onLogin }));
    if (r.onLogin) { console.log('SESSION_NOT_ACCEPTED'); process.exitCode = 3; return; }

    await page.screenshot({ path: path.join(dir, '01_home.png') });

    const nav = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href]')]
        .map(a => ({ text: (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') }))
        .filter(l => l.text && l.href && !/^(https?:|mailto:|tel:|#|javascript:)/i.test(l.href));
      const seen = new Set();
      return links.filter(l => { const k = l.text + '|' + l.href; if (seen.has(k)) return false; seen.add(k); return true; });
    });
    fs.writeFileSync(path.join(dir, 'nav.json'), JSON.stringify(nav, null, 2));
    console.log('nav links:', nav.length);
    for (const l of nav) console.log('  ', l.href.padEnd(40), l.text.slice(0, 60));

    const text = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(dir, '01_home.text.txt'), text);
  } catch (e) {
    console.log('ERROR', String(e.message).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
