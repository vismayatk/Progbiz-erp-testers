'use strict';
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
    await page.waitForTimeout(2500);
    const item = page.locator('#new-task-item');
    for (let i = 0; i < 6 && !(await item.isVisible().catch(() => false)); i++) { await page.locator('#new-task').click().catch(() => {}); await page.waitForTimeout(700); }
    await item.click();
    await page.waitForTimeout(2500);

    // Switch to Later (Host appears) then open Host picker
    await page.getByText(/^\s*Task for Later\s*$/i).first().click().catch(() => {});
    await page.waitForTimeout(1000);

    for (const [label, sel] of [['HOST', '.add-host-btn'], ['PARTICIPANT', '.ri-user-add-line']]) {
      const btn = page.locator('#home-create-task-modal').locator(sel).first();
      if (!(await btn.isVisible().catch(() => false))) { console.log(`${label}: trigger ${sel} not visible`); continue; }
      await btn.click().catch(() => {});
      await page.waitForTimeout(1500);
      const panel = await page.evaluate(() => {
        // find the topmost visible modal/popover that now lists users with toggles
        const cands = [...document.querySelectorAll('.modal, [role="dialog"], .offcanvas, .dropdown-menu, .popover')].filter(e => e.getClientRects().length > 0);
        const withToggle = cands.filter(c => c.querySelector('.form-check-input, [role="switch"], .form-switch input, input[type="checkbox"]'));
        const p = withToggle.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] || cands.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
        if (!p) return null;
        const vis = (e) => e.getClientRects().length > 0;
        const toggles = [...p.querySelectorAll('.form-check, .form-switch, li, .d-flex, tr')].filter(vis).map(r => ({
          text: (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
          hasToggle: !!r.querySelector('.form-check-input, [role="switch"], input[type="checkbox"], .form-switch input'),
        })).filter(r => r.text && r.hasToggle).slice(0, 12);
        const done = [...p.querySelectorAll('button, a.btn')].filter(vis).map(b => ({ id: b.id, txt: (b.textContent || '').replace(/\s+/g, ' ').trim() })).filter(b => /done|add|save|ok|apply|select/i.test(b.txt));
        const searchBox = [...p.querySelectorAll('input[type="text"], input[type="search"]')].filter(vis).map(i => ({ id: i.id, ph: i.placeholder }));
        return { modalId: p.id, cls: (p.className || '').slice(0, 50), userCount: toggles.length, users: toggles, done, searchBox };
      });
      console.log(`\n=== ${label} panel ===`);
      console.log(JSON.stringify(panel, null, 1));
      await page.screenshot({ path: `screenshots/discover_${label.toLowerCase()}_panel.png` }).catch(() => {});
      // close the panel before next (press Escape / click Done)
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(800);
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
