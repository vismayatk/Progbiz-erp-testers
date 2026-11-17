'use strict';
/**
 * Captures the footage for the Work Flow module video (test.erp.progbiz.in, tenant lesol_test).
 *
 * Output (reports/video/workflow/cap/):
 *   <id>.jpg      3840x2160 still of a 1920x1080 CSS viewport (deviceScaleFactor 2)
 *   boxes.json    visible elements (kind, text, box in CSS px) per still, for highlights / camera moves
 *
 * SAFETY — navigation only. The script clicks page tabs, filter chips, the View / Template buttons and one
 * dashboard period drop-down. It never clicks Save, Add, Create, Edit, Delete, Start, Collect or Follow Up, and it
 * submits nothing.
 *
 * PRIVACY — before every screenshot customer names, places, phone numbers, consumer numbers and the signed-in
 * person's name are blurred IN THE BROWSER ONLY (a CSS class on the element). Nothing is sent to the server.
 *
 * Run:  node scripts/video/workflow/05_capture.js [group ...]      groups: dash list types new overview status money cost maint
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const CAP = path.join(L.OUT, 'cap');
const BOXES = path.join(CAP, 'boxes.json');
const JPG = { type: 'jpeg', quality: 92 };
const wait = (page, ms) => page.waitForTimeout(ms);

// ------------------------------------------------------------------ privacy
async function privacy(page) {
  await page.evaluate(() => {
    if (!document.getElementById('pv-style')) {
      const st = document.createElement('style');
      st.id = 'pv-style';
      st.textContent = `
        .pv-blur, .pv-blur *:not(.badge):not(.badge *) { color: transparent !important; text-shadow: 0 0 11px rgba(30,35,45,.9), 0 0 16px rgba(30,35,45,.6) !important; }
        .pv-blur .badge, .pv-blur .badge * { text-shadow: none !important; }
        .pv-soft, .pv-soft * { filter: blur(9px) !important; }`;
      document.head.appendChild(st);
    }
    const blur = e => e && e.classList.add('pv-blur');
    const leaf = re => [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && re.test((e.textContent || '').trim()));
    // tables: whole columns that hold customer data, by header
    document.querySelectorAll('table').forEach(t => {
      const hs = [...t.querySelectorAll('thead th')].map(h => (h.innerText || '').trim().toLowerCase());
      hs.forEach((h, i) => {
        if (!/^(name|customer|customer name|phone|mobile no|email|project|record|party)$/.test(h)) return;
        [...t.querySelectorAll('tbody tr')].filter(tr => tr.children.length === hs.length).forEach(tr => blur(tr.children[i]));
      });
    });
    // status report: record cell = link (name), customer + place line; keep the id, type, status and phase
    document.querySelectorAll('.wf-record-cell > a, .wf-record-cell > span.fs-12').forEach(blur);
    // project overview header: customer name, place, consumer number
    document.querySelectorAll('.project-list-title:not(.text-warning)').forEach(blur);
    document.querySelectorAll('.card-header .ri-map-pin-line').forEach(i => blur(i.parentElement));
    leaf(/^\s*Consumer No\s*:/i).forEach(blur);
    // contact phone, consumer number chips, any phone-like number
    leaf(/^\+?\d{2}[\d\s-]{8,}$/).forEach(blur);
    document.querySelectorAll('.badge, span, div').forEach(e => { if (e.children.length === 0 && /Consumer Number|Consumer No\s*:\s*\d/.test(e.textContent || '')) blur(e); });
    // text nodes: phone numbers, consumer numbers and the project's customer name wherever they appear (detail cards)
    const names = [...document.querySelectorAll('.project-list-title:not(.text-warning)')].map(e => (e.textContent || '').trim()).filter(Boolean);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = (n.nodeValue || '').trim();
      if (s && n.parentElement && (/^\+?\d[\d\s-]{9,}$/.test(s) || /Consumer No/i.test(s) || names.includes(s))) blur(n.parentElement);
    }
    // dashboard "Upcoming Visits": each visit names the customer's record
    document.querySelectorAll('.card').forEach(c => {
      const h = [...c.querySelectorAll('h1,h2,h3,h4,h5,h6,.card-title')].find(e => /^\s*Upcoming Visits\s*$/i.test(e.textContent || ''));
      if (!h) return;
      const head = h.closest('.card-header') || h.parentElement;
      [...c.children].filter(k => k !== head && /Maintenance visit/i.test(k.textContent || '')).forEach(blur);
    });
    // floating "back to top" button (fixed, bottom right) is page chrome, not product
    [...document.querySelectorAll('body *')].forEach(e => {
      const cs = getComputedStyle(e);
      if (cs.position !== 'fixed') return;
      const r = e.getBoundingClientRect();
      if (r.width < 80 && r.height < 80 && r.left > innerWidth - 120 && r.top > innerHeight - 160) e.style.display = 'none';
    });
    // the name of the signed-in person (top bar)
    document.querySelectorAll('.header-link *, .main-header *').forEach(e => { if (e.children.length === 0 && /^\s*Biju ummer\s*$/i.test(e.textContent || '')) blur(e); });
    // Notes / attachment lists can quote customers: blur project-name search boxes' typed value (none typed)
  });
}

// ------------------------------------------------------------------ element boxes
async function elements(page) {
  return page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
    const box = e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    const txt = e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
    const out = [];
    const add = (kind, e, extra) => { if (!vis(e)) return; out.push(Object.assign({ kind, text: txt(e).slice(0, 120), box: box(e) }, extra || {})); };
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,.card-title,.page-title').forEach(e => add('heading', e));
    document.querySelectorAll('.nav-link,[role="tab"],.nav-tabs a,.nav-pills a').forEach(e => { if (!e.closest('#sidebar, .sidebar, aside, .app-sidebar')) add('tab', e); });
    document.querySelectorAll('button, a.btn, .btn').forEach(e => { if (!e.closest('#sidebar, .sidebar, aside, .app-sidebar')) add('button', e); });
    document.querySelectorAll('select, input:not([type=hidden]), textarea').forEach(e => add('input', e, { placeholder: e.getAttribute('placeholder') || undefined }));
    document.querySelectorAll('.badge').forEach(e => { if (!e.closest('#sidebar, .sidebar, aside, .app-sidebar, table')) add('badge', e); });
    document.querySelectorAll('.card').forEach(e => { if (e.getBoundingClientRect().height < 700) add('card', e); });
    document.querySelectorAll('table').forEach(t => {
      if (!vis(t)) return;
      const heads = [...t.querySelectorAll('thead th')].map(th => ({ text: txt(th), box: box(th) }));
      const rows = [...t.querySelectorAll('tbody tr')].filter(tr => vis(tr)).map(tr => box(tr));
      out.push({ kind: 'table', box: box(t), heads, rows });
    });
    return out;
  });
}

function loadBoxes() { try { return JSON.parse(fs.readFileSync(BOXES, 'utf8')); } catch (_) { return {}; } }
function saveBoxes(b) { L.ensureDir(CAP); fs.writeFileSync(BOXES, JSON.stringify(b, null, 1)); }

/** Wait (up to ~20 s) until no loading skeleton / spinner is visible, so a slow server never gets filmed. */
async function waitReady(page) {
  for (let i = 0; i < 40; i++) {
    const busy = await page.evaluate(() => [...document.querySelectorAll('[class*="placeholder"], [class*="skeleton"], [class*="shimmer"], .spinner-border, .loader')].some(e => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return r.width > 8 && r.height > 8 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('input, select, textarea');
    })).catch(() => false);
    if (!busy) return;
    await page.waitForTimeout(500);
  }
}

async function still(page, id, boxes, settle = 600) {
  await waitReady(page);
  await privacy(page);
  await wait(page, settle);
  await page.screenshot({ path: path.join(CAP, `${id}.jpg`), ...JPG });
  boxes[id] = { items: await elements(page) };
  saveBoxes(boxes);
  console.log(`  still ${id}`);
}

// ------------------------------------------------------------------ navigation helpers (navigation only)
/** Click the first visible element (outside the sidebar) whose whole text equals `label`. */
async function clickLabel(page, label, { exact = true, tags = 'a, button, li, div, span' } = {}) {
  const re = exact ? new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(\\d+)?\\s*$') : new RegExp(label, 'i');
  const loc = page.locator(tags).filter({ hasText: re });
  const n = await loc.count();
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if (await el.evaluate(e => !!e.closest('#sidebar, .sidebar, aside, .app-sidebar, .modal')).catch(() => true)) continue;
    await el.click({ timeout: 5000 });
    return true;
  }
  throw new Error(`nothing to click for "${label}"`);
}
const settle = (page, ms = 2200) => wait(page, ms);

(async () => {
  const want = new Set(process.argv.slice(2));
  const all = !want.size;
  const has = g => all || want.has(g);
  L.ensureDir(CAP);
  const nav = JSON.parse(fs.readFileSync(path.join(L.OUT, 'scout', 'nav.json'), 'utf8'));
  const M = nav.find(n => /^workflows\//.test(n.href)).href.split('/')[1];
  const { browser, ctx, page } = await L.openApp({ dsf: 2 });
  const boxes = loadBoxes();
  let ov = null;
  try {
    if (has('dash')) {
      console.log('dash');
      await L.visit(page, `/workflow-dashboard/${M}`, { settleMs: 2500 });
      // read-only: widen the period filter from "This Month" to "All time" so the numbers are meaningful
      await page.locator('select').first().selectOption({ label: 'All time' }).catch(e => console.log('   period select failed', String(e.message).split('\n')[0]));
      await settle(page, 3000);
      await still(page, 'wf_dash', boxes);
      await page.evaluate(() => window.scrollTo(0, 600));    // middle: tasks, deal amount, receivables, collection
      await settle(page, 1200);
      await still(page, 'wf_dash2', boxes);
      await page.evaluate(() => {                            // maintenance schedule, upcoming visits (heading near the top)
        const h = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,.card-title')].find(e => /^\s*Maintenance Schedule\s*$/i.test(e.textContent || ''));
        window.scrollTo(0, h ? h.getBoundingClientRect().top + scrollY - 150 : 99999);
      });
      await settle(page, 1200);
      await still(page, 'wf_dash3', boxes);
    }
    if (has('list')) {
      console.log('list');
      await L.visit(page, `/workflows/${M}`, { settleMs: 2500 });
      await still(page, 'wf_list', boxes);
      await clickLabel(page, 'Phases', { tags: 'a, button' });
      await settle(page);
      await still(page, 'wf_list_phases', boxes);
    }
    if (has('types')) {
      console.log('types');
      await L.visit(page, `/workflow-types/${M}`, { settleMs: 2500 });
      await still(page, 'wf_types', boxes);
      const row = page.locator('table tbody tr').filter({ hasText: /^NON SUBSIDY ONGRID/ }).first();
      await row.getByText('Template', { exact: true }).click();
      await settle(page, 2800);
      const tpl = new URL(page.url()).pathname;
      console.log('  template page', tpl);
      await still(page, 'wf_tpl_phases', boxes);
      for (const [label, id] of [['Tasks', 'wf_tpl_tasks'], ['Payment Terms', 'wf_tpl_pay'], ['Members', 'wf_tpl_members'], ['Maintenance Schedule', 'wf_tpl_maint']]) {
        await clickLabel(page, label);
        await settle(page, 1800);
        await still(page, id, boxes);
      }
    }
    if (has('new')) {
      console.log('new');
      await L.visit(page, `/workflow/${M}`, { settleMs: 3000 });
      await still(page, 'wf_new', boxes);
    }
    if (has('overview')) {
      console.log('overview');
      await L.visit(page, `/workflows/${M}`, { settleMs: 2500 });
      await waitReady(page);
      await page.locator('table tbody tr').first().locator('button[data-bs-title="View"]').click({ timeout: 90000 });
      await settle(page, 3000);
      ov = new URL(page.url()).pathname;
      console.log('  overview page', ov);
      await still(page, 'wf_ov_basic', boxes);
      for (const [label, id] of [['Phases', 'wf_ov_phases'], ['Payment Summary', 'wf_ov_summary'], ['Payment Terms', 'wf_ov_terms'], ['Costing', 'wf_ov_costing'], ['Maintenances', 'wf_ov_maint']]) {
        await clickLabel(page, label);
        await settle(page, 1800);
        await still(page, id, boxes);
      }
      await clickLabel(page, 'Tasks');            // this tab is its own page (/workflow-tasks/<id>)
      await settle(page, 2800);
      console.log('  tasks page', new URL(page.url()).pathname);
      await still(page, 'wf_tasks', boxes);
    }
    if (has('status')) {
      console.log('status');
      await L.visit(page, `/workflow-status-report/${M}`, { settleMs: 3000 });
      await still(page, 'wf_status', boxes);
    }
    if (has('money')) {
      console.log('money');
      await L.visit(page, `/workflow-collections/module/${M}`, { settleMs: 2500 });
      await still(page, 'wf_coll', boxes);
      await L.visit(page, `/workflow-collection-pending/module/${M}`, { settleMs: 2500 });
      await still(page, 'wf_pending', boxes);
    }
    if (has('cost')) {
      console.log('cost');
      await L.visit(page, `/workflow-costing/module/${M}`, { settleMs: 3000 });
      await still(page, 'wf_costing', boxes);
      await L.visit(page, '/workflow-cost-rates', { settleMs: 2500 });
      await still(page, 'wf_rates', boxes);
      await L.visit(page, '/workflow-cost-types', { settleMs: 2500 });
      await still(page, 'wf_ctypes', boxes);
      await L.visit(page, '/labour-actualisation', { settleMs: 2500 });
      await still(page, 'wf_labour', boxes);
      await L.visit(page, '/workflow-material-used-list', { settleMs: 2500 });
      await still(page, 'wf_material', boxes);
      await L.visit(page, '/my-time', { settleMs: 2500 });
      await still(page, 'wf_mytime', boxes);
    }
    if (has('maint')) {
      console.log('maint');
      await L.visit(page, `/workflow-maintenance/module/${M}`, { settleMs: 2500 });
      await still(page, 'wf_maint', boxes);
      await L.visit(page, `/workflow-notes/module/${M}`, { settleMs: 2500 });
      await still(page, 'wf_notes', boxes);
      await L.visit(page, `/workflow-attachments/module/${M}`, { settleMs: 2500 });
      await still(page, 'wf_attach', boxes);
      await L.visit(page, `/workflow-expenses/module/${M}`, { settleMs: 2500 });
      await still(page, 'wf_expenses', boxes);
    }
    // the tenant home/logo for the intro window
    console.log('done');
  } catch (e) {
    console.log('ERROR', String(e.message).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
