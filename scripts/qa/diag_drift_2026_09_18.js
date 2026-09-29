'use strict';
/**
 * Read-only diagnostic for the three failures the 2026-09-18 suite run could
 * not explain from artifacts alone. Nothing here saves or submits.
 *
 *   A. My Tasks — what lives in the "Action" column now that the documented
 *      #overview-task-{id} / #edit-task-{id} / #delete-task-{id} ids are gone,
 *      and which single control (by icon/title, never blind) opens
 *      #task-overview-modal. Opens it once, checks #txtChat /
 *      #file-input-document / .fe-paperclip / .fe-more-vertical, then closes.
 *   B. Add Enquiry — is #lead-quality really visible for "New Enquiry", or was
 *      ENQ-09's failure the old broad `[id*="quality"]` fallback?
 *   C. /add-complaint — the real field labels / placeholders / required marks,
 *      so ComplaintsPage.create() is built on the live form, not a guess.
 *
 *   node scripts/qa/diag_drift_2026_09_18.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const REPO = path.join(__dirname, '..', '..');
const BASE = process.env.BASE_URL;
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const SHOTS = path.join(REPO, 'reports', 'qa', 'shots', 'drift-2026-09-18');
fs.mkdirSync(SHOTS, { recursive: true });
const OUT = {};

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // ── A. My Tasks Action column ────────────────────────────────────────
    console.log('\n══ A. /my-tasks Action column ══');
    await page.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('li.nav-item button, li.nav-item a')]
      .filter((e) => e.getClientRects().length).map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
    console.log('  tabs:', JSON.stringify(tabs));
    const grid = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const t = [...document.querySelectorAll('table')].filter((x) => x.getClientRects().length)
        .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
      if (!t) return null;
      const rows = [...t.querySelectorAll('tbody tr')];
      return {
        headers: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
        rowCount: rows.length,
        firstRows: rows.slice(0, 3).map((r) => ({
          text: clean(r.innerText).slice(0, 140),
          actionCell: (() => {
            const td = r.querySelector('td'); if (!td) return null;
            return {
              html: td.innerHTML.replace(/\s+/g, ' ').slice(0, 600),
              controls: [...td.querySelectorAll('a, button, i, span[role=button]')].map((c) => ({
                tag: c.tagName, id: c.id || null, cls: String(c.className || '').slice(0, 60),
                title: c.getAttribute('title') || c.getAttribute('aria-label') || c.getAttribute('data-bs-original-title') || null,
                text: clean(c.innerText).slice(0, 20),
              })),
            };
          })(),
          rowIds: [...r.querySelectorAll('[id]')].map((e) => e.id),
          clickableCells: [...r.querySelectorAll('td')].map((td, i) => ({ i, pointer: getComputedStyle(td).cursor === 'pointer' || !!td.querySelector('a[href], [onclick]') })).filter((c) => c.pointer).map((c) => c.i),
        })),
      };
    });
    OUT.myTasks = { tabs, grid };
    console.log('  headers:', JSON.stringify(grid?.headers));
    console.log('  rows:', grid?.rowCount);
    (grid?.firstRows || []).forEach((r, i) => {
      console.log(`  row ${i}: ${r.text}`);
      console.log(`    action controls: ${JSON.stringify(r.actionCell?.controls)}`);
      console.log(`    ids in row: ${JSON.stringify(r.rowIds)}`);
      console.log(`    pointer cells: ${JSON.stringify(r.clickableCells)}`);
    });
    await page.screenshot({ path: path.join(SHOTS, 'A_my_tasks.png'), fullPage: false }).catch(() => {});

    // Open the overview ONLY via a control that is clearly a "view" (eye icon /
    // title View|Overview|Details), or by clicking the Task-name cell. Never
    // click start/hold/end/edit/delete here.
    const VIEWISH = /eye|view|overview|detail/i;
    const DANGER = /play|pause|stop|delete|trash|bin|edit|pencil|start|hold|end|resume/i;
    const first = grid?.firstRows?.[0];
    let opener = null;
    if (first?.actionCell?.controls) {
      const idx = first.actionCell.controls.findIndex((c) => VIEWISH.test(`${c.cls} ${c.title} ${c.text} ${c.id}`) && !DANGER.test(`${c.cls} ${c.title} ${c.id}`));
      if (idx >= 0) opener = { how: 'action-control', idx, ctl: first.actionCell.controls[idx] };
    }
    if (!opener && grid?.headers) {
      const taskCol = grid.headers.findIndex((h) => /^task$/i.test(h));
      if (taskCol >= 0) opener = { how: 'task-cell', idx: taskCol };
    }
    console.log('  chosen opener:', JSON.stringify(opener));
    OUT.myTasks.opener = opener;
    if (opener) {
      const row = page.locator('table tbody tr').first();
      if (opener.how === 'action-control') await row.locator('td').first().locator('a, button, i, span[role=button]').nth(opener.idx).click({ timeout: 8000 }).catch((e) => console.log('   click err', e.message.split('\n')[0]));
      else await row.locator('td').nth(opener.idx).click({ timeout: 8000 }).catch((e) => console.log('   click err', e.message.split('\n')[0]));
      const opened = await page.locator('#task-overview-modal').waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
      const inside = await page.evaluate(() => {
        const m = document.querySelector('#task-overview-modal');
        const vis = (s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; };
        return {
          modalVisible: !!m && m.getClientRects().length > 0,
          txtChat: vis('#txtChat'), fileInputDocument: !!document.querySelector('#file-input-document'),
          paperclip: vis('#task-overview-modal .fe-paperclip'), moreVertical: vis('#task-overview-modal .fe-more-vertical'),
          btnSend: vis('#task-overview-modal .btn-send'),
          modalIds: m ? [...m.querySelectorAll('[id]')].map((e) => e.id).slice(0, 60) : [],
          modalIcons: m ? [...new Set([...m.querySelectorAll('i')].map((e) => String(e.className)))].slice(0, 40) : [],
        };
      });
      OUT.myTasks.overview = { opened, ...inside };
      console.log(`  overview opened=${opened} txtChat=${inside.txtChat} file-input-document=${inside.fileInputDocument} paperclip=${inside.paperclip} ⋮=${inside.moreVertical} send=${inside.btnSend}`);
      console.log(`  modal ids: ${JSON.stringify(inside.modalIds)}`);
      console.log(`  modal icons: ${JSON.stringify(inside.modalIcons)}`);
      await page.screenshot({ path: path.join(SHOTS, 'A_task_overview.png'), fullPage: false }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.locator('#task-overview-modal .btn-close').first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(800);
    }

    // ── B. Lead Quality on Add Enquiry ───────────────────────────────────
    console.log('\n══ B. /enquiry Lead Quality ══');
    await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    const lqState = () => page.evaluate(() => {
      const e = document.querySelector('#lead-quality');
      if (!e) return { inDom: false };
      const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
      let hiddenAncestor = null; let n = e;
      while (n && n !== document.body) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') { hiddenAncestor = `${n.tagName}.${String(n.className).split(' ')[0]}`; break; } n = n.parentElement; }
      const label = e.closest('.form-group,.mb-3,.col,.col-md-3,.col-md-4,.col-md-6,div')?.querySelector('label')?.innerText?.trim() || null;
      return { inDom: true, visible: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !hiddenAncestor, hiddenAncestor, label, required: /\*/.test(label || '') || e.required,
        options: [...e.options].map((o) => o.text.trim()) };
    });
    const initial = await page.evaluate(() => { const s = document.querySelector('#followup'); return s ? s.options[s.selectedIndex]?.text?.trim() : null; });
    const onLoad = await lqState();
    await page.locator('#followup').selectOption({ label: 'New Enquiry' }).catch(() => {}); await page.waitForTimeout(1200);
    const onNew = await lqState();
    await page.locator('#followup').selectOption({ label: 'Interested' }).catch(() => {}); await page.waitForTimeout(1200);
    const onInterested = await lqState();
    await page.locator('#followup').selectOption({ label: 'New Enquiry' }).catch(() => {}); await page.waitForTimeout(1200);
    const backToNew = await lqState();
    OUT.leadQuality = { initialFollowup: initial, onLoad, onNew, onInterested, backToNew };
    console.log(`  followup default: "${initial}"`);
    console.log(`  on load      : ${JSON.stringify(onLoad)}`);
    console.log(`  New Enquiry  : ${JSON.stringify(onNew)}`);
    console.log(`  Interested   : ${JSON.stringify(onInterested)}`);
    console.log(`  back to New  : ${JSON.stringify(backToNew)}`);
    await page.locator('#lead-quality').scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(SHOTS, 'B_enquiry_lead_quality_new.png'), fullPage: false }).catch(() => {});

    // ── C. /add-complaint form ───────────────────────────────────────────
    console.log('\n══ C. /add-complaint ══');
    await page.goto(`${BASE}/add-complaint`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);
    const form = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
      const main = document.querySelector('.main-content, main, .page, #app') || document.body;
      const label = (e) => {
        if (e.id) { const l = document.querySelector(`label[for="${e.id}"]`); if (l) return clean(l.innerText); }
        let n = e.parentElement;
        for (let d = 0; d < 4 && n; d++, n = n.parentElement) { const l = n.querySelector(':scope > label'); if (l) return clean(l.innerText); }
        return clean(e.getAttribute('aria-label') || e.placeholder || '');
      };
      return {
        controls: [...main.querySelectorAll('input, select, textarea, [contenteditable="true"]')].filter(on)
          .filter((e) => !/^switcher-|^nav-/.test(e.id || '') && !['hidden', 'submit', 'button'].includes(e.type))
          .map((e) => ({ tag: e.tagName, type: e.type || null, id: e.id || null, name: e.getAttribute('name'), placeholder: e.placeholder || null, label: label(e), required: e.required || /\*/.test(label(e)),
            options: e.tagName === 'SELECT' ? [...e.options].map((o) => clean(o.text)).slice(0, 8) : undefined, groupHtml: e.closest('.input-group') ? clean(e.closest('.input-group').outerHTML).slice(0, 300) : null })),
        buttons: [...main.querySelectorAll('button, a.btn')].filter(on).map((b) => ({ text: clean(b.innerText), id: b.id || null, title: b.title || null })).filter((b) => b.text || b.title),
        searchIcons: [...main.querySelectorAll('[title="Search"], .ri-search-line, .fe-search, .bi-search')].filter(on).map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 50), title: e.title || null })),
        tables: [...main.querySelectorAll('table')].filter(on).map((t) => [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText))),
      };
    });
    OUT.addComplaint = form;
    form.controls.forEach((c) => console.log(`  ${c.tag.toLowerCase().padEnd(8)} id=${String(c.id).padEnd(24)} "${c.label}"${c.required ? ' *' : ''}${c.placeholder ? ` ph="${c.placeholder}"` : ''}${c.options ? ' opts=' + JSON.stringify(c.options) : ''}`));
    console.log('  buttons:', JSON.stringify(form.buttons));
    console.log('  search icons:', JSON.stringify(form.searchIcons));
    console.log('  tables:', JSON.stringify(form.tables));
    await page.screenshot({ path: path.join(SHOTS, 'C_add_complaint.png'), fullPage: true }).catch(() => {});
  } catch (e) {
    console.log('\nFATAL:', e.message.split('\n')[0].slice(0, 200));
  } finally {
    await browser.close();
  }
  const out = path.join(REPO, 'reports', 'qa', 'raw', 'diag-drift-2026-09-18.json');
  fs.writeFileSync(out, JSON.stringify(OUT, null, 2));
  console.log(`\n  raw → ${path.relative(REPO, out)}`);
})();
