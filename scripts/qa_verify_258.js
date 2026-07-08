'use strict';
/** QA verify ERP-258: Task Overview note — pressing Enter SENDS the message
 *  (reporter wants paragraph-wise input instead). Fixed = Enter adds a newline,
 *  not-fixed = Enter posts the note. */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.goto(`${login.baseUrl}/my-tasks`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    // open the first task's details panel
    await page.locator('table tbody tr').first().locator('a,button').first().click().catch(() => {});
    const modal = page.locator('#task-overview-modal');
    await modal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const chat = page.locator('#txtChat');
    await chat.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);

    const marker = `QAcheck258 ${Date.now()}`;
    const notesBefore = await modal.evaluate(el => (el.textContent || '').length);
    await chat.click();
    await chat.type(marker, { delay: 10 });
    await chat.press('Enter');
    await page.waitForTimeout(2500);

    const valAfter = await chat.inputValue().catch(() => '');
    const modalText = (await modal.textContent().catch(() => '')) || '';
    const posted = modalText.includes(marker) && (valAfter.trim() === '' || !valAfter.includes(marker));
    const newline = /\n/.test(valAfter) && valAfter.includes(marker);
    await page.screenshot({ path: 'screenshots/qa_258.png', fullPage: true }).catch(() => {});

    console.log('note field value after Enter:', JSON.stringify(valAfter.slice(0, 60)));
    console.log('marker appears in activity log (posted):', posted);
    console.log('Enter produced a newline (paragraph):', newline);
    console.log('\nVERDICT:', posted
      ? 'NOT FIXED — pressing Enter still SENDS the note (no paragraph/multi-line support)'
      : (newline ? 'FIXED — Enter adds a newline; note is not auto-sent'
                  : 'INCONCLUSIVE — could not confirm send-on-Enter behaviour'));
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
