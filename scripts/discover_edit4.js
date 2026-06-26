'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const dumpModal = (id) => {
  const m = document.querySelector(id);
  if (!m || m.getClientRects().length === 0) return { visible: false };
  const vis = (e) => e.getClientRects().length > 0;
  const ok = (s) => !/switcher|theme-|example-radios|direction|navigation|sidemenu|page-styles|layout-|menu-|header-/.test(s || '');
  return { visible: true, title: (m.querySelector('.modal-title,h4,h5')?.textContent || '').trim(),
    fields: [...m.querySelectorAll('input,select,textarea')].filter(vis).filter(e => ok(e.id || e.name)).map(e => ({ tag: e.tagName, id: e.id, type: e.type, val: (e.value || '').slice(0, 22) })) };
};
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);
    await page.goto(`${login.baseUrl}/unscheduled-tasks`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const ids = await page.evaluate(() => ({
      edit: [...document.querySelectorAll('[id^="edit-task-"]')].map(e => e.id).slice(0, 1),
      overview: [...document.querySelectorAll('[id^="overview-task-"]')].map(e => e.id).slice(0, 1),
      del: [...document.querySelectorAll('[id^="delete-task-"]')].map(e => e.id).slice(0, 1),
      cols: [...document.querySelectorAll('table thead th')].map(t => t.textContent.trim()),
      rows: document.querySelectorAll('table tbody tr').length,
      otherActionIds: [...document.querySelectorAll('[id*="task-"]')].map(e => e.id).slice(0, 8),
    }));
    console.log('unscheduled-tasks:', JSON.stringify(ids));
    if (ids.edit[0]) {
      await page.locator(`#${ids.edit[0]}`).click().catch(() => {});
      await page.waitForTimeout(2800);
      console.log('EDIT edit-modal:', JSON.stringify(await page.evaluate(dumpModal, '#task-edit-modal')));
      console.log('EDIT create-modal:', JSON.stringify(await page.evaluate(dumpModal, '#home-create-task-modal')));
      await page.screenshot({ path: 'screenshots/discover_edit.png', fullPage: true }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(1000);
    }
    if (ids.overview[0]) {
      await page.locator(`#${ids.overview[0]}`).first().click().catch(() => {});
      await page.waitForTimeout(3000);
      console.log('OVERVIEW url:', page.url());
      console.log('OVERVIEW:', JSON.stringify(await page.evaluate(() => {
        const vis = (e) => e.getClientRects().length > 0;
        return {
          headings: [...document.querySelectorAll('h4,h5,h6,.nav-link,.card-title,.fw-semibold')].filter(vis).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => t && t.length < 26).slice(0, 16),
          fileInputs: [...document.querySelectorAll('input[type="file"]')].map(i => ({ id: i.id, accept: i.accept })),
          textareas: [...document.querySelectorAll('textarea')].filter(vis).map(t => ({ id: t.id, ph: t.placeholder })),
          actionBtns: [...document.querySelectorAll('button,a.btn')].filter(vis).map(b => ({ id: b.id, txt: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 22) })).filter(b => /note|save|add|upload|comment|attach|submit|document/i.test(b.id + b.txt)).slice(0, 14),
        };
      }), null, 1));
      await page.screenshot({ path: 'screenshots/discover_overview.png', fullPage: true }).catch(() => {});
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
