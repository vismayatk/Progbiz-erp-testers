'use strict';
require('dotenv').config();
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { TaskManagementPage } = require('../pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  const tm = new TaskManagementPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // fresh instant task (auto-running) so Hold/End are available + it's in My Tasks
    const name = `Details ${Date.now()}`;
    const cm = await tm.createViaModal(name, { type: 'Call', description: 'details flow' });
    console.log('create:', cm === null ? 'OK' : cm);

    const opened = await tm.openTaskDetails(name);
    console.log('openTaskDetails:', opened);
    if (!opened) { await browser.close(); return; }

    // NOTE
    const noteOk = await tm.addNote(`Auto note ${Date.now()}`);
    console.log('addNote visible in log:', noteOk);

    // DOCUMENT
    const up = await tm.uploadDocument(path.resolve('fixtures/sample-document.txt'));
    console.log('uploadDocument result:', up === null ? 'OK' : up);
    await page.screenshot({ path: 'screenshots/validate_details_notes.png', fullPage: true }).catch(() => {});

    // KEBAB menu options availability
    await tm.detailsModal.locator('.fe-more-vertical').first().click().catch(() => {});
    await page.waitForTimeout(900);
    const menu = await page.evaluate(() => [...document.querySelectorAll('a,button,li,.dropdown-item')].filter(e => e.getClientRects().length > 0).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /edit task|reschedule|add lead/i.test(t)).slice(0, 6));
    console.log('kebab items:', JSON.stringify([...new Set(menu)]));

    // EDIT TASK
    await page.getByText(/^\s*Edit Task\s*$/i).first().click().catch(() => {});
    await page.waitForTimeout(2800);
    const editModal = await page.evaluate(() => {
      const m = document.querySelector('#task-edit-modal') || [...document.querySelectorAll('.modal')].find(e => e.getClientRects().length > 0 && /edit/i.test(e.textContent));
      if (!m) return { visible: false };
      const vis = (e) => e.getClientRects().length > 0;
      return { id: m.id, visible: m.getClientRects().length > 0, title: (m.querySelector('.modal-title,h4,h5')?.textContent || '').trim(),
        nameVal: (m.querySelector('#taskName')?.value || ''), hasSave: !!m.querySelector('#saveBtn, button') };
    });
    console.log('EDIT modal:', JSON.stringify(editModal));
    await page.screenshot({ path: 'screenshots/validate_details_edit.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
