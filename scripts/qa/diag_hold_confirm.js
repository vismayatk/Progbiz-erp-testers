'use strict';
// Does the Hold confirm actually land? Uses our own QA task only.
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { TaskManagementPage } = require('../../erp/task-management/pages/TaskManagementPage');
const NAME = `QA_HOLD_${Date.now()}`;
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await new LoginPage(p).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD);
    const tm = new TaskManagementPage(p);
    await tm.createTask(NAME, {}); await p.waitForTimeout(2500);
    console.log('  opened:', await tm.openTaskDetails(NAME));
    console.log('  status before:', JSON.stringify(await tm.detailsStatuses()));

    await p.locator('#task-overview-modal .btn-warning-light').first().click({ timeout: 8000 });
    await p.waitForTimeout(1500);
    const hm = await p.evaluate(() => {
      const m = document.querySelector('#task-hold-modal');
      if (!m || !m.classList.contains('show')) return { open: false };
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return { open: true,
        inputs: [...m.querySelectorAll('input, select, textarea')].map((e) => ({ type: e.type, id: e.id || null, value: e.value, required: e.required, min: e.min || null, max: e.max || null })),
        buttons: [...m.querySelectorAll('button')].map((x) => ({ text: clean(x.innerText), cls: String(x.className).slice(0, 40) })),
        text: clean(m.innerText).slice(0, 200) };
    });
    console.log('  #task-hold-modal:', JSON.stringify(hm));
    // What does the page-wide getByRole('button', {name:/confirm/i}).first() resolve to?
    const roleBtns = await p.getByRole('button', { name: /confirm/i }).all();
    console.log('  page-wide role=button /confirm/i matches:', roleBtns.length);
    for (const [i, rb] of roleBtns.entries()) {
      console.log(`    [${i}] "${(await rb.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()}" visible=${await rb.isVisible().catch(() => false)} inHoldModal=${await rb.evaluate((e) => !!e.closest('#task-hold-modal')).catch(() => null)}`);
    }
    const reqs = []; p.on('response', (r) => { if (/\/api\/.*(hold|task)/i.test(r.url()) && r.request().method() !== 'GET') reqs.push(`${r.status()} ${r.url().split('?')[0].slice(-45)}`); });
    await p.locator('#task-hold-modal button').filter({ hasText: /confirm/i }).first().click({ timeout: 6000 }).catch((e) => console.log('  confirm click err:', e.message.split('\n')[0]));
    await p.waitForTimeout(4000);
    console.log('  API calls:', JSON.stringify(reqs));
    console.log('  alert:', await p.evaluate(() => [...document.querySelectorAll('.swal2-popup,.toast,.alert')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 140)));
    await p.locator('.swal2-confirm').click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(2000);
    console.log('  status after confirm:', JSON.stringify(await tm.detailsStatuses()));
    console.log('  hold modal still open:', await p.locator('#task-hold-modal.show').count());
    console.log('  overview buttons now:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#task-overview-modal button')].filter((b) => b.getClientRects().length).map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean))));
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0].slice(0, 160)); }
  finally { await b.close(); }
})();
