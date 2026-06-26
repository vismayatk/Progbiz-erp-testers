'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

const dump = () => {
  const m = [...document.querySelectorAll('.modal, [role="dialog"]')].filter(e => e.getClientRects().length > 0)
    .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
  if (!m) return { none: true };
  const vis = (e) => e.getClientRects().length > 0;
  const ok = (s) => s && !/switcher|theme|example-radios|direction|navigation|sidemenu|page-styles|layout|menu-|header-/.test(s);
  return {
    labels: [...m.querySelectorAll('label, .form-label, legend, h6, .section-title')].filter(vis).map(l => l.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 30),
    dateInputs: [...m.querySelectorAll('input')].filter(vis).filter(i => /date|time|flatpickr|deadline|schedule/i.test((i.id || '') + (i.className || '') + (i.placeholder || ''))).map(i => ({ id: i.id, type: i.type, ph: i.placeholder, cls: (i.className || '').slice(0, 40) })),
    allModalInputs: [...m.querySelectorAll('input,textarea,select')].filter(vis).filter(e => ok(e.id || e.name)).map(e => ({ tag: e.tagName, id: e.id, type: e.type, ph: e.placeholder })),
    toggles: [...m.querySelectorAll('input[type="checkbox"]')].filter(vis).map(t => ({ id: t.id, label: (t.closest('label,.form-check,.d-flex,div')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 45) })),
  };
};

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
    await page.waitForTimeout(3000);

    const modal = page.locator('.modal:visible, [role="dialog"]:visible').first();
    for (const mode of ['Task for Later', 'Repeat', 'Instant']) {
      await modal.getByText(new RegExp(`^\\s*${mode}\\s*$`, 'i')).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      console.log(`\n===== MODE: ${mode} =====`);
      console.log(JSON.stringify(await page.evaluate(dump), null, 1));
      await page.screenshot({ path: `screenshots/task_mode_${mode.replace(/\s+/g, '_')}.png`, fullPage: true }).catch(() => {});
    }
  } catch (e) { console.log('ERR:', e.message); }
  finally { await browser.close(); }
})();
