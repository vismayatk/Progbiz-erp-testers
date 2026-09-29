'use strict';
/**
 * Read-only probe #2: dump the OPEN "Create New" menu item-by-item.
 *
 * Probe #1 proved #new-enquiry-item / #new-quotation-item are absent from the
 * DOM on /home even after 12s (not a lazy render), but it never got the menu
 * open, so it couldn't say what the menu offers INSTEAD. This one opens the
 * menu the same way the tests do and prints every item (id, tag, text), then
 * looks for Enquiry/Quotation entries anywhere on the page under any id.
 *
 * Nothing is clicked inside the menu; nothing is saved.
 *
 * Run:  node scripts/qa/diag_create_new_menu2.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const C = {
  company: process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD || '123',
};

const dumpOpenMenu = () => {
  const item = document.getElementById('new-task-item');
  const menu = item ? item.closest('.dropdown-menu, ul, div[class*="dropdown"]') : null;
  const items = menu
    ? [...menu.querySelectorAll('a,button,li')].map((e) => ({
        id: e.id || null,
        tag: e.tagName.toLowerCase(),
        text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        shown: !!e.getClientRects().length,
      })).filter((x) => x.text)
    : null;
  // Anything anywhere offering Enquiry / Quotation creation, under any id.
  const elsewhere = [...document.querySelectorAll('a,button')]
    .filter((e) => /^(new\s+)?(enquiry|quotation)$/i.test((e.textContent || '').replace(/\s+/g, ' ').trim()))
    .map((e) => ({ id: e.id || null, text: (e.textContent || '').trim(), shown: !!e.getClientRects().length }));
  return {
    menuClass: menu ? menu.className : null,
    menuShown: menu ? !!menu.getClientRects().length : null,
    items,
    elsewhere,
  };
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    const opened = await (async () => {
      for (let i = 0; i < 8; i++) {
        if (await page.locator('#new-task-item').isVisible().catch(() => false)) return true;
        await page.locator('#new-task').click().catch(() => {});
        await page.waitForTimeout(700);
      }
      return false;
    })();
    console.log('menu opened:', opened);
    console.log('OPEN MENU   ', JSON.stringify(await page.evaluate(dumpOpenMenu), null, 1));
  } catch (e) {
    console.log('ERROR', e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
})();
