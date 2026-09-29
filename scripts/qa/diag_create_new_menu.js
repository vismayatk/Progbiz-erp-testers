'use strict';
/**
 * Read-only probe: what does the Home "Create New" menu contain now?
 *
 * TM-09 asserts the menu offers Task / Enquiry / Quotation (TC_TASK_001) and on
 * 2026-09-21 it read only ["Task"]. This probe opens the menu and dumps every
 * item (id + text) repeatedly over ~12s, to tell a LAZY RENDER (items appear a
 * beat later → fix the reader) from a real PRODUCT CHANGE (items are gone →
 * fix the expectation). Nothing is clicked inside the menu, nothing is saved.
 *
 * Run:  node scripts/qa/diag_create_new_menu.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const C = {
  company: process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD || '123',
};

const dump = () => {
  const menus = [...document.querySelectorAll('.dropdown-menu')];
  const open = menus.filter((m) => m.classList.contains('show') || m.getClientRects().length);
  const items = open.flatMap((m) => [...m.querySelectorAll('a,button')].map((e) => ({
    id: e.id || null,
    text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
  })));
  const byId = ['new-task-item', 'new-enquiry-item', 'new-quotation-item']
    .map((id) => [id, !!document.getElementById(id)]);
  return { openMenus: open.length, items, byId };
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // Open the Create New toggle (same control TM-09 / QT-001 use).
    const toggle = page.locator('#new-task');
    for (let i = 0; i < 6; i++) {
      if (await page.locator('#new-task-item').isVisible().catch(() => false)) break;
      await toggle.click().catch(() => {});
      await page.waitForTimeout(600);
    }

    for (let t = 0; t <= 12; t += 2) {
      console.log(`t=${t}s`, JSON.stringify(await page.evaluate(dump)));
      await page.waitForTimeout(2000);
    }

    // Does the SAME menu look different from the CRM side (/leads)?
    await page.goto(`${process.env.BASE_URL}/leads`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    for (let i = 0; i < 6; i++) {
      if (await page.locator('#new-task-item').isVisible().catch(() => false)) break;
      await toggle.click().catch(() => {});
      await page.waitForTimeout(600);
    }
    console.log('on /leads  ', JSON.stringify(await page.evaluate(dump)));
  } catch (e) {
    console.log('ERROR', e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
})();
