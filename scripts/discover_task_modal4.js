'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

const modalDump = () => {
  const m = [...document.querySelectorAll('.modal, [role="dialog"]')].filter(e => e.getClientRects().length > 0)
    .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
  if (!m) return { none: true };
  const vis = (e) => e.getClientRects().length > 0;
  return {
    inputs: [...m.querySelectorAll('input, textarea')].filter(vis).filter(i => !/switcher|theme|example-radios|direction|navigation|sidemenu|page-styles|layout|menu-|header-/.test(i.id + i.name)).map(i => ({ id: i.id, type: i.type, ph: i.placeholder, cls: (i.className || '').slice(0, 30) })),
    toggles: [...m.querySelectorAll('input[type="checkbox"], .form-switch, [role="switch"]')].filter(vis).map(t => ({ id: t.id, label: (t.closest('label, .form-check, .d-flex')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) })),
    moreIcons: [...m.querySelectorAll('[class*="more"], i')].filter(vis).map(i => i.className).filter(c => /more|ellipsis|three/i.test(c)).slice(0, 6),
    addIcons: [...m.querySelectorAll('[class*="add"], [class*="plus"], [class*="user-add"]')].filter(vis).map(i => ({ cls: i.className.slice(0, 30), title: i.getAttribute('title') || '', parentTitle: i.parentElement?.getAttribute('title') || '' })).slice(0, 8),
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2500);
    // Robust open: toggle Create New until the Task item is visible
    const item = page.locator('#new-task-item');
    for (let i = 0; i < 5 && !(await item.isVisible().catch(() => false)); i++) {
      await page.locator('#new-task').click().catch(() => {});
      await page.waitForTimeout(700);
    }
    await item.click();
    await page.waitForTimeout(3000);

    // INSTANT default — participant/host/party add controls
    console.log('=== INSTANT ===');
    console.log(JSON.stringify(await page.evaluate(modalDump), null, 1));

    // Switch to Task for Later
    await page.locator('#laterBtn').click().catch(() => {});
    await page.waitForTimeout(1200);
    console.log('\n=== LATER (before toggles) ===');
    console.log(JSON.stringify(await page.evaluate(modalDump), null, 1));

    // Toggle the deadline / end-time switches to reveal date/time pickers
    for (const t of ['#instantDeadlineToggle', '#addEndTimeToggle']) {
      await page.locator(t).click().catch(() => {});
      await page.waitForTimeout(900);
    }
    console.log('\n=== LATER (after toggles) ===');
    console.log(JSON.stringify(await page.evaluate(modalDump), null, 1));

    // Participants area: click "Participants" add/expand
    const partBtn = page.locator('.modal:visible, [role="dialog"]:visible').getByText(/participant/i).first();
    if (await partBtn.isVisible().catch(() => false)) {
      await partBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
      const users = await page.evaluate(() => {
        const sw = [...document.querySelectorAll('.form-switch input, [role="switch"], .toggle')].filter(e => e.getClientRects().length > 0);
        return { switchCount: sw.length, sample: sw.slice(0, 4).map(s => (s.closest('.d-flex, li, .form-check')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30)) };
      });
      console.log('\n=== PARTICIPANTS panel ===', JSON.stringify(users));
    }

    // three-dots (Add Lead) — search broadly across the dialog header
    const dotsCandidates = await page.evaluate(() => {
      const m = [...document.querySelectorAll('.modal, [role="dialog"]')].filter(e => e.getClientRects().length > 0).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      if (!m) return [];
      return [...m.querySelectorAll('i, button, a, span')].filter(e => e.getClientRects().length > 0).map(e => ({ tag: e.tagName, cls: (e.className || '').slice(0, 35), id: e.id })).filter(e => /more|ellipsis|dropdown-toggle|ri-more/i.test(e.cls));
    });
    console.log('\n=== dots candidates ===', JSON.stringify(dotsCandidates));

    await page.screenshot({ path: 'screenshots/discover_task_later.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); }
  finally { await browser.close(); }
})();
