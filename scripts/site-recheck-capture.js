// Full re-audit capture: discover all internal pages, capture desktop + mobile segments,
// collect metrics (status, overflow, broken images, console errors, link statuses).
const { chromium, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BASE = 'https://progbiz.io';
const ROOT = 'C:/Users/PROBOOK/AppData/Local/Temp/claude/C--Users-PROBOOK-erp-tests-git-max/7ab0352e-1d83-4eb1-814d-6219ca09b978/scratchpad/recheck';
const DESK = path.join(ROOT, 'desktop'), MOB = path.join(ROOT, 'mobile'), TXT = path.join(ROOT, 'text');
for (const d of [ROOT, DESK, MOB, TXT]) fs.mkdirSync(d, { recursive: true });
const slug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/\//g, '_'));

const SEEDS = ['/', '/about', '/service', '/solution', '/works', '/industries', '/life-at-progbiz', '/contact', '/career', '/blog', '/service/branding'];

async function removeAutoModal(page) {
  await page.evaluate(() => {
    for (const e of [...document.querySelectorAll('div,section,dialog')]) {
      if ((e.innerText || '').includes('Ready To Start Your Next Project?') && getComputedStyle(e).position === 'fixed') e.remove();
    }
  }).catch(() => {});
}

(async () => {
  const browser = await chromium.launch();

  // -------- Phase 1: discover all internal pages --------
  const ctx0 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p0 = await ctx0.newPage();
  const found = new Set(SEEDS);
  for (const s of SEEDS) {
    try {
      await p0.goto(BASE + s, { waitUntil: 'load', timeout: 60000 });
      await p0.waitForTimeout(2200);
      const hrefs = await p0.$$eval('a', (as) => as.map((a) => a.href));
      for (const h of hrefs) { try { const u = new URL(h); if (u.hostname.endsWith('progbiz.io') && !u.pathname.match(/\.(pdf|jpg|png)$/i)) found.add(u.pathname.replace(/\/$/, '') || '/'); } catch {} }
    } catch (e) { console.log('discover ERR', s, e.message.split('\n')[0]); }
  }
  const PAGES = [...found].sort();
  console.log('DISCOVERED ' + PAGES.length + ' pages:'); PAGES.forEach((p) => console.log('  ' + p));

  // link statuses
  const statuses = {};
  for (const u of PAGES) { try { const r = await ctx0.request.get(BASE + u, { timeout: 30000 }); statuses[u] = r.status(); } catch { statuses[u] = 'ERR'; } }
  const broken = Object.entries(statuses).filter(([, s]) => s !== 200);
  console.log('NON-200: ' + JSON.stringify(broken));
  await ctx0.close();

  // -------- Phase 2: capture both viewports --------
  const metrics = {};
  for (const [label, ctxOpts, dir, step] of [
    ['desktop', { viewport: { width: 1440, height: 900 } }, DESK, 820],
    ['mobile', { ...devices['iPhone 12'], deviceScaleFactor: 2 }, MOB, 780],
  ]) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    let cur = null;
    page.on('console', (m) => { if (cur && m.type() === 'error') cur.consoleErrors.push(m.text().slice(0, 140)); });
    page.on('requestfailed', (rq) => { const t = (rq.failure() || {}).errorText || ''; if (cur && !/ERR_ABORTED/.test(t)) cur.failedReqs.push(t + ' ' + rq.url().slice(0, 100)); });
    for (const route of PAGES) {
      if (statuses[route] !== 200) continue;
      const dslug = slug(route);
      const dir2 = path.join(dir, dslug); fs.mkdirSync(dir2, { recursive: true });
      if (fs.readdirSync(dir2).some((f) => f.endsWith('.png'))) { console.log(`${label} ${route} SKIP (already captured)`); continue; }
      cur = { consoleErrors: [], failedReqs: [] };
      try {
        await page.goto(BASE + route, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(3000);
        await removeAutoModal(page);
        const m = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth, iw: innerWidth,
          brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.offsetParent).map((i) => (i.currentSrc || i.src).slice(0, 100)),
          total: document.documentElement.scrollHeight,
        }));
        if (label === 'desktop') {
          const body = await page.innerText('body').catch(() => '');
          fs.writeFileSync(path.join(TXT, dslug + '.txt'), 'URL: ' + BASE + route + '\nTITLE: ' + (await page.title()) + '\n\n' + body, 'utf8');
        }
        const n = Math.min(16, Math.ceil(m.total / step));
        for (let i = 0; i < n; i++) {
          await page.evaluate((y) => window.scrollTo(0, y), i * step);
          await page.waitForTimeout(600);
          if (i % 4 === 0) await removeAutoModal(page);
          await page.screenshot({ path: path.join(dir2, String(i).padStart(2, '0') + '.png') });
        }
        metrics[label + ':' + route] = { segs: n, overflow: m.sw - m.iw, brokenImgs: m.brokenImgs, consoleErrs: [...new Set(cur.consoleErrors)], failedReqs: [...new Set(cur.failedReqs)] };
        console.log(`${label} ${route} segs=${n} ovf=${m.sw - m.iw} imgX=${m.brokenImgs.length} cerr=${cur.consoleErrors.length}`);
      } catch (e) { metrics[label + ':' + route] = { error: e.message.split('\n')[0] }; console.log(label, route, 'ERR', e.message.split('\n')[0]); }
      fs.writeFileSync(path.join(ROOT, 'metrics.json'), JSON.stringify({ pages: PAGES, statuses, metrics }, null, 2));
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(ROOT, 'metrics.json'), JSON.stringify({ pages: PAGES, statuses, metrics }, null, 2));
  console.log('CAPTURE DONE');
  await browser.close();
})();
