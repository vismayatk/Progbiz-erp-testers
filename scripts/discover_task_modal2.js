'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

async function dumpForm(page, tag) {
  const data = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    return {
      sels: [...document.querySelectorAll('select')].filter(vis).map(s => ({ id: s.id, name: s.name, options: [...s.options].map(o => o.textContent.trim()).slice(0, 12) })),
      inputs: [...document.querySelectorAll('input, textarea')].filter(vis).map(i => ({ id: i.id, name: i.name, type: i.type, ph: i.placeholder })),
      radios: [...document.querySelectorAll('input[type="radio"]')].map(r => ({ id: r.id, name: r.name, val: r.value, checked: r.checked, label: (r.closest('label')?.textContent || r.parentElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) })),
      btns: [...document.querySelectorAll('button, a.btn')].filter(vis).map(b => ({ id: b.id, txt: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) })).filter(b => b.txt || b.id),
      modeLabels: [...document.querySelectorAll('label, .nav-link, .tab, button')].filter(vis).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /instant|later|unscheduled|repeat/i.test(t) && t.length < 30),
    };
  });
  console.log(`\n===== ${tag} =====`);
  console.log('SELECTS:', JSON.stringify(data.sels, null, 0));
  console.log('INPUTS:', JSON.stringify(data.inputs));
  console.log('RADIOS:', JSON.stringify(data.radios));
  console.log('MODE LABELS:', JSON.stringify([...new Set(data.modeLabels)]));
  console.log('BUTTONS:', JSON.stringify(data.btns));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /create new/i }).or(page.locator('a,button').filter({ hasText: /^\s*Create New\s*$/i })).first().click().catch(() => {});
    await page.waitForTimeout(1000);

    // Exact Task menu item
    const menuItems = await page.evaluate(() => [...document.querySelectorAll('a, button, li')].filter(e => e.getClientRects().length > 0 && /^(task|enquiry|quotation)$/i.test((e.textContent || '').replace(/\s+/g, ' ').trim()))
      .map(e => ({ tag: e.tagName, txt: e.textContent.replace(/\s+/g, ' ').trim(), id: e.id, href: e.getAttribute('href'), onclick: (e.getAttribute('ng-click') || e.getAttribute('onclick') || '').slice(0, 60) })));
    console.log('MENU ITEMS:', JSON.stringify(menuItems, null, 1));

    // Click Task via JS to be safe
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('a, button, li')].find(e => e.getClientRects().length > 0 && /^task$/i.test((e.textContent || '').replace(/\s+/g, ' ').trim()));
      if (el) el.click();
    });
    await page.waitForTimeout(3000);
    console.log('After Task click → URL:', page.url());
    await dumpForm(page, 'TASK FORM (default)');

    // Try mode switches by clicking the labels found
    for (const mode of ['Task for Later', 'Unscheduled', 'Repeat', 'Later']) {
      const loc = page.getByText(new RegExp(`^\\s*${mode}\\s*$`, 'i')).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click().catch(() => {});
        await page.waitForTimeout(1200);
        await dumpForm(page, `MODE → ${mode}`);
      }
    }

    // three-dots menu
    const dots = page.locator('.ri-more-2-fill, .ri-more-2-line, .ri-more-fill, [class*="more-2"]').first();
    if (await dots.isVisible().catch(() => false)) {
      await dots.click().catch(() => {});
      await page.waitForTimeout(800);
      const items = await page.evaluate(() => [...document.querySelectorAll('a, button, li')].filter(e => e.getClientRects().length > 0).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /lead/i.test(t)).slice(0, 8));
      console.log('THREE-DOTS items:', JSON.stringify([...new Set(items)]));
    } else {
      console.log('three-dots not found by ri-more selector');
    }
  } catch (e) { console.log('ERR:', e.message); }
  finally { await browser.close(); }
})();
