'use strict';
/**
 * Read-only probe: WHICH "Create New" toggle exists on /home, and does clicking
 * it open the menu?
 *
 * QT-001 burns 6 × 20s clicking #new-task and the menu never opens, while TM-09
 * (which clicks `#new-task, #new-lead-type`) opens it in 4s. This prints which
 * of the two ids is present/visible and whether the menu opens after a click.
 *
 * Run:  node scripts/qa/diag_create_new_toggle.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const C = {
  company: process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD || '123',
};

const state = () => {
  const probe = (id) => {
    const e = document.getElementById(id);
    return e ? { present: true, shown: !!e.getClientRects().length, text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) } : { present: false };
  };
  const anchor = document.getElementById('new-task-item');
  const menu = anchor && anchor.closest('.dropdown-menu');
  return {
    'new-task': probe('new-task'),
    'new-lead-type': probe('new-lead-type'),
    menuOpen: menu ? menu.classList.contains('show') || !!menu.getClientRects().length : null,
    itemShown: anchor ? !!anchor.getClientRects().length : null,
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
    console.log('before click ', JSON.stringify(await page.evaluate(state)));

    await page.locator('#new-task, #new-lead-type').first().click({ timeout: 8000 })
      .catch((e) => console.log('  click error:', e.message.split('\n')[0].slice(0, 80)));
    await page.waitForTimeout(1200);
    console.log('after click  ', JSON.stringify(await page.evaluate(state)));
  } catch (e) {
    console.log('ERROR', e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
})();
