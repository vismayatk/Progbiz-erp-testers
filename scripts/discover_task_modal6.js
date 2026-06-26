'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2500);
    const item = page.locator('#new-task-item');
    for (let i = 0; i < 5 && !(await item.isVisible().catch(() => false)); i++) { await page.locator('#new-task').click().catch(() => {}); await page.waitForTimeout(700); }
    await item.click();
    await page.waitForTimeout(2500);

    // Switch to Later by text
    await page.getByText(/^\s*Task for Later\s*$/i).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    // enable both toggles
    for (const t of ['#instantDeadlineToggle', '#addEndTimeToggle']) {
      const el = page.locator(t);
      if (await el.isVisible().catch(() => false)) { await el.click({ force: true }).catch(() => {}); await page.waitForTimeout(900); }
    }
    // scroll modal body to bottom
    await page.evaluate(() => {
      const m = [...document.querySelectorAll('.modal, .modal-dialog, [role="dialog"]')].filter(e => e.getClientRects().length > 0).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      if (m) { const body = m.querySelector('.modal-body') || m; body.scrollTop = body.scrollHeight; m.scrollTop = m.scrollHeight; }
    });
    await page.waitForTimeout(600);

    const dump = await page.evaluate(() => {
      const m = [...document.querySelectorAll('.modal, .modal-dialog, [role="dialog"]')].filter(e => e.getClientRects().length > 0).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      if (!m) return { none: true };
      const vis = (e) => e.getClientRects().length > 0;
      const ok = (s) => !/switcher|theme-|example-radios|direction|navigation|sidemenu|page-styles|layout-|menu-|header-/.test(s || '');
      return {
        dateTimeInputs: [...m.querySelectorAll('input')].filter(vis).filter(i => ['date', 'time', 'datetime-local'].includes(i.type) || /date|time|deadline|schedule|finish/i.test((i.id || '') + (i.className || '') + (i.placeholder || ''))).map(i => ({ id: i.id, type: i.type, ph: i.placeholder, cls: (i.className || '').slice(0, 30) })),
        allInputs: [...m.querySelectorAll('input,textarea,select')].filter(vis).filter(e => ok(e.id || e.name)).map(e => ({ tag: e.tagName, id: e.id, type: e.type, ph: e.placeholder })),
      };
    });
    console.log('LATER after toggles:', JSON.stringify(dump, null, 1));
    await page.screenshot({ path: 'screenshots/task_later_bottom.png', fullPage: true }).catch(() => {});

    // Party search behaviour: type and search
    await page.locator('#partySearch').fill('a').catch(() => {});
    const searchBtn = page.locator('.ri-search-line').first();
    if (await searchBtn.isVisible().catch(() => false)) { await searchBtn.click().catch(() => {}); await page.waitForTimeout(1500); }
    const partyModal = await page.evaluate(() => {
      const sm = document.querySelector('#searchModal, .modal.show');
      return sm ? { id: sm.id, rows: sm.querySelectorAll('table tbody tr').length, txt: (sm.querySelector('.modal-title')?.textContent || '').trim() } : null;
    });
    console.log('PARTY search modal:', JSON.stringify(partyModal));
  } catch (e) { console.log('ERR:', e.message); }
  finally { await browser.close(); }
})();
