'use strict';
/**
 * Discovery: map the "Create New → Task" modal + Task Management pages.
 * Run:  node scripts/discover_task_modal.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');

const CREDS = {
  company:  process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

async function dumpForm(page, tag) {
  const data = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const sels = [...document.querySelectorAll('select')].filter(vis).map(s => ({
      id: s.id, name: s.name, cls: s.className,
      options: [...s.options].map(o => o.textContent.trim()).slice(0, 12),
    }));
    const inputs = [...document.querySelectorAll('input, textarea')].filter(vis).map(i => ({
      id: i.id, name: i.name, type: i.type, ph: i.placeholder, cls: (i.className || '').slice(0, 40),
    }));
    const radios = [...document.querySelectorAll('input[type="radio"], .radio, [role="radio"]')].map(r => ({
      id: r.id, name: r.name, label: (r.closest('label')?.textContent || r.parentElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    }));
    const btns = [...document.querySelectorAll('button, a.btn, .btn')].filter(vis).map(b => ({
      id: b.id, txt: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30), cls: (b.className || '').slice(0, 40),
    })).filter(b => b.txt || b.id);
    return { sels, inputs, radios, btns };
  });
  console.log(`\n========== ${tag} ==========`);
  console.log('SELECTS:'); data.sels.forEach(s => console.log('  ', JSON.stringify(s)));
  console.log('INPUTS:');  data.inputs.forEach(i => console.log('  ', JSON.stringify(i)));
  console.log('RADIOS:');  data.radios.forEach(r => console.log('  ', JSON.stringify(r)));
  console.log('BUTTONS:'); data.btns.forEach(b => console.log('  ', JSON.stringify(b)));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const login = new LoginPage(page);
  try {
    await login.login(CREDS.company, CREDS.username, CREDS.password);
    console.log('Landed:', page.url());

    // 1) Find the "Create New" trigger on the home/dashboard
    await page.waitForTimeout(2000);
    const createNew = page.getByRole('button', { name: /create new/i })
      .or(page.getByRole('link', { name: /create new/i }))
      .or(page.locator('a, button').filter({ hasText: /^\s*Create New\s*$/i })).first();
    const hasCreate = await createNew.isVisible().catch(() => false);
    console.log('\n[Create New] visible:', hasCreate);
    if (hasCreate) {
      await createNew.click().catch(() => {});
      await page.waitForTimeout(1200);
      // Dump the menu options that appeared
      const menu = await page.evaluate(() =>
        [...document.querySelectorAll('a, button, li')].filter(e => e.getClientRects().length > 0)
          .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(t => /^(task|enquiry|quotation|lead)$/i.test(t)));
      console.log('[Create New] menu options:', JSON.stringify([...new Set(menu)]));

      // 2) Click "Task"
      const taskOpt = page.locator('a, button, li').filter({ hasText: /^\s*Task\s*$/i }).first();
      if (await taskOpt.isVisible().catch(() => false)) {
        await taskOpt.click().catch(() => {});
        await page.waitForTimeout(2500);
        console.log('After Task click → URL:', page.url());
        await dumpForm(page, 'TASK MODAL/FORM (default = Instant)');

        // 3) Look for the mode radios / tabs (Instant / Task for Later / Unscheduled)
        for (const mode of ['Task for Later', 'Later', 'Unscheduled', 'Repeat']) {
          const r = page.locator('label, button, a, span').filter({ hasText: new RegExp(`^\\s*${mode}\\s*$`, 'i') }).first();
          if (await r.isVisible().catch(() => false)) {
            await r.click().catch(() => {});
            await page.waitForTimeout(1200);
            await dumpForm(page, `MODE: ${mode}`);
          }
        }

        // 4) Three-dots menu (Add Lead)
        const dots = page.locator('button, a, i').filter({ hasText: /⋮|more|⋯/i })
          .or(page.locator('.ri-more-2-fill, .ri-more-fill, [class*="more"]')).first();
        if (await dots.isVisible().catch(() => false)) {
          await dots.click().catch(() => {});
          await page.waitForTimeout(800);
          const items = await page.evaluate(() =>
            [...document.querySelectorAll('a, button, li')].filter(e => e.getClientRects().length > 0)
              .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /lead|add/i.test(t)).slice(0, 10));
          console.log('[Three-dots] items:', JSON.stringify([...new Set(items)]));
        }
      } else {
        console.log('Task option not visible after Create New');
      }
    }

    // 5) Probe the listing pages for table columns
    for (const slug of ['my-tasks', 'created-tasks', 'delegated-tasks', 'todo-list', 'unscheduled-tasks', 'calendar', 'daily-activity-report']) {
      await page.goto(`${login.baseUrl}/${slug}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1800);
      const info = await page.evaluate(() => {
        const heads = [...document.querySelectorAll('table thead th, table thead td')].map(th => (th.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
        const rowCount = document.querySelectorAll('table tbody tr').length;
        const tabs = [...document.querySelectorAll('button, a.btn')].map(b => (b.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /^(Today|Delayed|Upcoming|Unscheduled|Completed|Pending|Overdue|Running|Hold)\b/i.test(t)).slice(0, 12);
        return { url: location.pathname, heads, rowCount, tabs };
      });
      console.log(`\n[PAGE ${slug}] →`, JSON.stringify(info));
    }
  } catch (e) {
    console.log('DISCOVERY ERROR:', e.message);
  } finally {
    await browser.close();
  }
})();
