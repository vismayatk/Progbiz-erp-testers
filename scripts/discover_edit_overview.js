'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

const dumpModal = (id) => {
  const m = document.querySelector(id);
  if (!m || m.getClientRects().length === 0) return { visible: false };
  const vis = (e) => e.getClientRects().length > 0;
  const ok = (s) => !/switcher|theme-|example-radios|direction|navigation|sidemenu|page-styles|layout-|menu-|header-/.test(s || '');
  return {
    visible: true, title: (m.querySelector('.modal-title,h4,h5')?.textContent || '').trim(),
    fields: [...m.querySelectorAll('input,select,textarea')].filter(vis).filter(e => ok(e.id || e.name)).map(e => ({ tag: e.tagName, id: e.id, type: e.type, val: (e.value || '').slice(0, 25), ph: e.placeholder })),
    buttons: [...m.querySelectorAll('button,a.btn')].filter(vis).map(b => ({ id: b.id, txt: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20) })).filter(b => b.id || b.txt),
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // --- list page row actions ---
    await page.goto(`${login.baseUrl}/created-tasks`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const ids = await page.evaluate(() => {
      const out = { edit: [], overview: [], del: [] };
      document.querySelectorAll('[id^="edit-task-"]').forEach(e => out.edit.push(e.id));
      document.querySelectorAll('[id^="overview-task-"]').forEach(e => out.overview.push(e.id));
      document.querySelectorAll('[id^="delete-task-"]').forEach(e => out.del.push(e.id));
      return { edit: out.edit.slice(0, 2), overview: out.overview.slice(0, 2), del: out.del.slice(0, 2), rows: document.querySelectorAll('table tbody tr').length };
    });
    console.log('created-tasks row actions:', JSON.stringify(ids));

    // --- EDIT ---
    if (ids.edit[0]) {
      await page.locator(`#${ids.edit[0]}`).click().catch(() => {});
      await page.waitForTimeout(2500);
      console.log('after EDIT click → url:', page.url());
      console.log('  #task-edit-modal:', JSON.stringify(await page.evaluate(dumpModal, '#task-edit-modal')));
      console.log('  #home-create-task-modal:', JSON.stringify(await page.evaluate(dumpModal, '#home-create-task-modal')));
      await page.screenshot({ path: 'screenshots/discover_edit.png', fullPage: true }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(800);
    }

    // --- OVERVIEW (notes/documents) ---
    if (ids.overview[0]) {
      await page.goto(`${login.baseUrl}/created-tasks`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.locator(`#${ids.overview[0]}`).click().catch(() => {});
      await page.waitForTimeout(3000);
      console.log('after OVERVIEW click → url:', page.url());
      const ov = await page.evaluate(() => {
        const vis = (e) => e.getClientRects().length > 0;
        const txt = document.body.innerText;
        return {
          tabs: [...document.querySelectorAll('a,button,.nav-link,li')].filter(vis).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => /note|document|attachment|activity|detail|comment|file/i.test(t) && t.length < 25).slice(0, 12),
          fileInputs: [...document.querySelectorAll('input[type="file"]')].map(i => ({ id: i.id, name: i.name, accept: i.accept })),
          textareas: [...document.querySelectorAll('textarea')].filter(vis).map(t => ({ id: t.id, ph: t.placeholder })),
          noteBtns: [...document.querySelectorAll('button,a.btn')].filter(vis).map(b => ({ id: b.id, txt: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 22) })).filter(b => /note|save|add|upload|comment|attach/i.test(b.txt)),
          hasNotesWord: /note/i.test(txt), hasDocWord: /document|attachment/i.test(txt),
        };
      });
      console.log('OVERVIEW:', JSON.stringify(ov, null, 1));
      await page.screenshot({ path: 'screenshots/discover_overview.png', fullPage: true }).catch(() => {});
    }

    // --- three-dots / Add Lead in the Add Task modal ---
    await page.goto(`${login.baseUrl}/home`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2000);
    const it = page.locator('#new-task-item');
    for (let i = 0; i < 6 && !(await it.isVisible().catch(() => false)); i++) { await page.locator('#new-task').click().catch(() => {}); await page.waitForTimeout(600); }
    await it.click().catch(() => {});
    await page.waitForTimeout(2500);
    const kebab = await page.evaluate(() => {
      const m = document.querySelector('#home-create-task-modal');
      if (!m) return null;
      const vis = (e) => e.getClientRects().length > 0;
      const cands = [...m.querySelectorAll('i,button,a,span,svg')].filter(vis).map(e => ({ tag: e.tagName, cls: (e.getAttribute('class') || '').slice(0, 40), title: e.getAttribute('title') || '' })).filter(e => /more|ellipsis|dots|kebab|vertical|three|ri-more/i.test(e.cls + e.title));
      const leadTxt = [...m.querySelectorAll('a,button,li')].filter(vis).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => /lead/i.test(t)).slice(0, 6);
      return { kebabCandidates: cands.slice(0, 8), leadText: [...new Set(leadTxt)], headerHTML: (m.querySelector('.modal-header')?.innerHTML || '').replace(/\s+/g, ' ').slice(0, 400) };
    });
    console.log('MODAL kebab/lead:', JSON.stringify(kebab, null, 1));
    await page.screenshot({ path: 'screenshots/discover_modal_header.png' }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
