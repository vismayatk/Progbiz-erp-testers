'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

const grabIds = () => ({
  edit: [...document.querySelectorAll('[id^="edit-task-"]')].map(e => e.id),
  overview: [...document.querySelectorAll('[id^="overview-task-"]')].map(e => e.id),
  del: [...document.querySelectorAll('[id^="delete-task-"]')].map(e => e.id),
  rows: document.querySelectorAll('table tbody tr').length,
});
const dumpModal = (id) => {
  const m = document.querySelector(id);
  if (!m || m.getClientRects().length === 0) return { visible: false };
  const vis = (e) => e.getClientRects().length > 0;
  const ok = (s) => !/switcher|theme-|example-radios|direction|navigation|sidemenu|page-styles|layout-|menu-|header-/.test(s || '');
  return { visible: true, title: (m.querySelector('.modal-title,h4,h5')?.textContent || '').trim(),
    fields: [...m.querySelectorAll('input,select,textarea')].filter(vis).filter(e => ok(e.id || e.name)).map(e => ({ tag: e.tagName, id: e.id, type: e.type, val: (e.value || '').slice(0, 22) })),
    activeMode: [...m.querySelectorAll('#instantBtn,#laterBtn,#repeatBtn')].map(b => b.textContent.trim()) };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);
    let found = null, fromPage = null;
    for (const slug of ['my-tasks', 'delegated-tasks', 'unscheduled-tasks', 'todo-list']) {
      await page.goto(`${login.baseUrl}/${slug}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2000);
      // try clicking tabs that may hold rows
      for (const tab of ['', 'Delayed', 'Upcoming', 'Completed', 'Unscheduled']) {
        if (tab) { await page.locator('button, a.btn').filter({ hasText: new RegExp(`^${tab}\s+\d`, 'i') }).first().click().catch(() => {}); await page.waitForTimeout(1800); }
        const ids = await page.evaluate(grabIds);
        if (ids.overview.length || ids.edit.length) { found = ids; fromPage = `${slug}${tab ? '/' + tab : ''}`; break; }
      }
      if (found) break;
    }
    console.log('FOUND actions on:', fromPage, JSON.stringify({ edit: found?.edit?.slice(0,1), overview: found?.overview?.slice(0,1), del: found?.del?.slice(0,1), rows: found?.rows }));
    if (!found) { console.log('no row actions found anywhere'); await browser.close(); return; }

    // EDIT
    if (found.edit[0]) {
      await page.locator(`#${found.edit[0]}`).click().catch(() => {});
      await page.waitForTimeout(2800);
      console.log('EDIT → #task-edit-modal:', JSON.stringify(await page.evaluate(dumpModal, '#task-edit-modal')));
      console.log('EDIT → #home-create-task-modal:', JSON.stringify(await page.evaluate(dumpModal, '#home-create-task-modal')));
      await page.screenshot({ path: 'screenshots/discover_edit.png', fullPage: true }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(800);
    }
    // OVERVIEW
    if (found.overview[0]) {
      const ovId = found.overview[0];
      if (!/my-tasks|delegated|unscheduled|todo/.test(page.url())) { await page.goBack().catch(() => {}); await page.waitForTimeout(1500); }
      await page.locator(`#${ovId}`).first().click().catch(() => {});
      await page.waitForTimeout(3000);
      console.log('OVERVIEW → url:', page.url());
      const ov = await page.evaluate(() => {
        const vis = (e) => e.getClientRects().length > 0;
        return {
          tabs: [...document.querySelectorAll('a,button,.nav-link,li,h5,h6')].filter(vis).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => /note|document|attachment|comment|file|activity|detail/i.test(t) && t.length < 28).slice(0, 12),
          fileInputs: [...document.querySelectorAll('input[type="file"]')].map(i => ({ id: i.id, accept: i.accept })),
          textareas: [...document.querySelectorAll('textarea,input[type=text]')].filter(vis).map(t => ({ id: t.id, ph: t.placeholder })).slice(0, 10),
          actionBtns: [...document.querySelectorAll('button,a.btn')].filter(vis).map(b => ({ id: b.id, txt: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 22) })).filter(b => /note|save|add|upload|comment|attach|submit/i.test(b.id + b.txt)).slice(0, 12),
        };
      });
      console.log('OVERVIEW fields:', JSON.stringify(ov, null, 1));
      await page.screenshot({ path: 'screenshots/discover_overview.png', fullPage: true }).catch(() => {});
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
