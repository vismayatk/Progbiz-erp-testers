'use strict';
/**
 * Step 2 of the beta scout (READ-ONLY): visit each page planned for the video,
 * wait for it to render, then save a full-page screenshot, the visible text and
 * a list of the main on-screen elements with their boxes (CSS px).
 * Only page.goto and reads — no clicks, no typing.
 * Run:  node scripts/video/beta/02_scout_pages.js [route ...]
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const DEFAULT = ['/home', '/data-assistant', '/crm-dashboard', '/executive-performance', '/leads',
  '/followups', '/call-analysis', '/sales-targets', '/bulk-lead-transfer'];

function slug(r) { return r.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-') || 'root'; }

async function elements(page) {
  return page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
    const box = e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)]; };
    const txt = e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
    const out = [];
    const add = (kind, e, extra) => { if (!vis(e)) return; const t = txt(e); out.push(Object.assign({ kind, text: t.slice(0, 120), id: e.id || undefined, cls: (e.className && e.className.baseVal === undefined ? String(e.className) : '').slice(0, 80) || undefined, box: box(e) }, extra || {})); };
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,.card-title,.page-title').forEach(e => add('heading', e));
    document.querySelectorAll('.nav-link,[role="tab"],.nav-tabs a,.nav-pills a').forEach(e => { if (!e.closest('#sidebar, .sidebar, aside, .app-sidebar')) add('tab', e); });
    document.querySelectorAll('button, a.btn, .btn').forEach(e => { if (!e.closest('#sidebar, .sidebar, aside, .app-sidebar')) add('button', e); });
    document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(e => add('input', e, { placeholder: e.getAttribute('placeholder') || undefined, type: e.getAttribute('type') || e.tagName.toLowerCase() }));
    document.querySelectorAll('.card').forEach(e => { if (e.getBoundingClientRect().height < 260) add('card', e); });
    document.querySelectorAll('canvas, svg.apexcharts-svg, .apexcharts-canvas').forEach(e => add('chart', e));
    document.querySelectorAll('table').forEach(t => {
      if (!vis(t)) return;
      const heads = [...t.querySelectorAll('thead th')].map(th => txt(th));
      const rows = t.querySelectorAll('tbody tr').length;
      out.push({ kind: 'table', heads, rows, box: box(t) });
    });
    return { scrollHeight: document.documentElement.scrollHeight, items: out };
  });
}

(async () => {
  const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
  const dir = path.join(L.OUT, 'scout');
  L.ensureDir(dir);
  const { browser, page } = await L.openApp();
  const summary = [];
  try {
    for (const r of routes) {
      const s = slug(r);
      const v = await L.visit(page, r, { settleMs: 2500 });
      const p = new URL(v.url).pathname;
      if (v.onLogin) { console.log(r, '-> LOGIN (session rejected)'); summary.push({ route: r, onLogin: true }); break; }
      await page.screenshot({ path: path.join(dir, `p_${s}.png`), fullPage: true });
      const text = await page.evaluate(() => document.body.innerText);
      fs.writeFileSync(path.join(dir, `p_${s}.text.txt`), text);
      const el = await elements(page);
      fs.writeFileSync(path.join(dir, `p_${s}.elements.json`), JSON.stringify(el, null, 1));
      const tables = el.items.filter(i => i.kind === 'table').map(t => `${t.rows} rows [${t.heads.join(' | ').slice(0, 140)}]`);
      console.log(`${r} -> ${p}  ${v.ms}ms  height=${el.scrollHeight}  items=${el.items.length}  tables=${tables.length}`);
      tables.forEach(t => console.log('     table:', t));
      summary.push({ route: r, path: p, ms: v.ms, scrollHeight: el.scrollHeight });
      await page.waitForTimeout(2000);
    }
  } catch (e) {
    console.log('ERROR', String(e.message).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(dir, 'pages.json'), JSON.stringify(summary, null, 1));
    await browser.close();
  }
})();
