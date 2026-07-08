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

    await page.locator('#new-task').click().catch(async () => {
      await page.getByRole('button', { name: /create new/i }).first().click().catch(() => {});
    });
    await page.waitForTimeout(800);
    await page.locator('#new-task-item').click();
    await page.waitForTimeout(3500);
    console.log('URL after Task:', page.url());

    // Find the visible modal/dialog container
    const modal = await page.evaluate(() => {
      const cands = [...document.querySelectorAll('.modal, [role="dialog"], .modal-dialog, .offcanvas')]
        .filter(e => e.getClientRects().length > 0);
      const m = cands.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      if (!m) return null;
      const vis = (e) => e.getClientRects().length > 0;
      return {
        modalId: m.id, modalCls: (m.className || '').slice(0, 60),
        title: (m.querySelector('.modal-title, h4, h5')?.textContent || '').replace(/\s+/g, ' ').trim(),
        selects: [...m.querySelectorAll('select')].filter(vis).map(s => ({ id: s.id, name: s.name, options: [...s.options].map(o => o.textContent.trim()).slice(0, 10) })),
        inputs: [...m.querySelectorAll('input, textarea')].filter(vis).map(i => ({ id: i.id, name: i.name, type: i.type, ph: i.placeholder })),
        radios: [...m.querySelectorAll('input[type="radio"], input[type="checkbox"]')].map(r => ({ id: r.id, name: r.name, type: r.type, checked: r.checked, label: (r.closest('label')?.textContent || r.parentElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 35) })),
        buttons: [...m.querySelectorAll('button, a.btn, .btn')].filter(vis).map(b => ({ id: b.id, txt: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30), title: b.getAttribute('title') || '' })).filter(b => b.txt || b.id || b.title),
        icons: [...m.querySelectorAll('i, [class*="ri-"], [class*="fa-"]')].filter(vis).map(i => i.className).filter(c => /more|plus|add|search|user/i.test(c)).slice(0, 15),
        labels: [...m.querySelectorAll('label, .form-label, legend')].filter(vis).map(l => (l.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 25),
      };
    });
    console.log('\n===== TASK MODAL =====');
    console.log(JSON.stringify(modal, null, 1));

    await page.screenshot({ path: 'screenshots/discover_task_modal.png', fullPage: true }).catch(() => {});

    // Mode radios/labels within modal: try clicking "Task for Later" then re-dump deltas
    for (const mode of ['Task for Later', 'Unscheduled', 'Repeat']) {
      const loc = page.locator('.modal:visible, [role="dialog"]:visible').getByText(new RegExp(`^\\s*${mode}\\s*$`, 'i')).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click().catch(() => {});
        await page.waitForTimeout(1200);
        const d = await page.evaluate(() => {
          const m = [...document.querySelectorAll('.modal, [role="dialog"]')].filter(e => e.getClientRects().length > 0).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
          if (!m) return null;
          const vis = (e) => e.getClientRects().length > 0;
          return {
            selects: [...m.querySelectorAll('select')].filter(vis).map(s => s.id || s.name),
            inputs: [...m.querySelectorAll('input,textarea')].filter(vis).map(i => ({ id: i.id, type: i.type, ph: i.placeholder })).filter(i => i.id || i.ph),
            labels: [...m.querySelectorAll('label,.form-label')].filter(vis).map(l => l.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20),
          };
        });
        console.log(`\n----- after mode "${mode}" -----`);
        console.log(JSON.stringify(d, null, 1));
      } else {
        console.log(`mode "${mode}" not found in modal`);
      }
    }

    // three-dots inside modal
    const dots = page.locator('.modal:visible, [role="dialog"]:visible').locator('[class*="more"], .ri-more-2-fill, .ri-more-2-line').first();
    if (await dots.isVisible().catch(() => false)) {
      await dots.click().catch(() => {});
      await page.waitForTimeout(700);
      const items = await page.evaluate(() => [...document.querySelectorAll('a,button,li')].filter(e => e.getClientRects().length > 0).map(e => ({ id: e.id, txt: (e.textContent || '').replace(/\s+/g, ' ').trim() })).filter(e => /lead/i.test(e.txt)).slice(0, 8));
      console.log('\nTHREE-DOTS lead items:', JSON.stringify(items));
    } else console.log('\nthree-dots not visible in modal');

  } catch (e) { console.log('ERR:', e.message); }
  finally { await browser.close(); }
})();
