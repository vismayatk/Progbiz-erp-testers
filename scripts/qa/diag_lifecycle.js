'use strict';
/**
 * Lifecycle probe for TM-28 (Hold does nothing) and TM-20 (no dashboard
 * controls found). Creates its OWN QA task, starts it, and inspects the real
 * controls at each step — so nothing here touches a real user's task.
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { TaskManagementPage } = require('../../erp/task-management/pages/TaskManagementPage');
const BASE = process.env.BASE_URL;
const NAME = `QA_LIFECYCLE_${Date.now()}`;

const modalButtons = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const m = document.querySelector('#task-overview-modal');
  if (!m) return { present: false };
  const vis = (e) => e.getClientRects().length > 0;
  return {
    present: true,
    buttons: [...m.querySelectorAll('button, a.btn')].filter(vis).map((b) => ({
      text: clean(b.innerText), cls: String(b.className).slice(0, 70), id: b.id || null,
      icon: [...b.querySelectorAll('i')].map((i) => String(i.className)).join(' ').slice(0, 50),
    })),
    statusish: [...m.querySelectorAll('.badge, span, div')].map((e) => clean(e.textContent))
      .filter((t) => /^(running|hold|on hold|not started|completed|paused|ended|scheduled)$/i.test(t)).slice(0, 6),
  };
};
const openModals = () => [...document.querySelectorAll('.modal.show')].map((m) => ({
  id: m.id || null,
  title: (m.querySelector('.modal-title, h5, h4')?.innerText || '').trim().slice(0, 50),
  buttons: [...m.querySelectorAll('button')].filter((b) => b.getClientRects().length)
    .map((b) => ({ text: (b.innerText || '').replace(/\s+/g, ' ').trim(), cls: String(b.className).slice(0, 50) })).filter((b) => b.text),
}));

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await new LoginPage(p).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD);
    const tm = new TaskManagementPage(p);
    console.log(`\n══ create + open "${NAME}" ══`);
    await tm.createTask(NAME, {});
    await p.waitForTimeout(2500);
    console.log('  opened:', await tm.openTaskDetails(NAME));
    let st = await p.evaluate(modalButtons);
    console.log('  modal buttons:', JSON.stringify(st.buttons));
    console.log('  status text  :', JSON.stringify(st.statusish));

    console.log('\n══ Start Task ══');
    await p.locator('#task-overview-modal button', { hasText: /start task/i }).first().click({ timeout: 8000 }).catch((e) => console.log('  click err:', e.message.split('\n')[0]));
    await p.waitForTimeout(1500);
    console.log('  modals open after Start:', JSON.stringify(await p.evaluate(openModals)));
    await p.locator('.modal.show button', { hasText: /^(yes|ok|confirm|start)/i }).first().click({ timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(3000);
    st = await p.evaluate(modalButtons);
    console.log('  buttons now  :', JSON.stringify(st.buttons));
    console.log('  status now   :', JSON.stringify(st.statusish));

    console.log('\n══ Hold (what TM-28 drives) ══');
    const warn = p.locator('#task-overview-modal .btn-warning-light');
    console.log('  .btn-warning-light count:', await warn.count());
    const holdBtn = p.locator('#task-overview-modal button, #task-overview-modal a.btn').filter({ hasText: /hold|pause/i }).first();
    console.log('  button matching /hold|pause/:', await holdBtn.count());
    if (await holdBtn.count()) {
      await holdBtn.click({ timeout: 8000 }).catch((e) => console.log('  click err:', e.message.split('\n')[0]));
      await p.waitForTimeout(1500);
      console.log('  modals open after Hold click:', JSON.stringify(await p.evaluate(openModals)));
      await p.locator('.modal.show button').filter({ hasText: /^(yes|ok|confirm|hold)/i }).first().click({ timeout: 4000 }).catch(() => {});
      await p.waitForTimeout(3000);
      st = await p.evaluate(modalButtons);
      console.log('  buttons after hold:', JSON.stringify(st.buttons));
      console.log('  status after hold :', JSON.stringify(st.statusish));
      console.log('  detailsStatuses() :', JSON.stringify(await tm.detailsStatuses()));
    }

    console.log('\n══ /home lifecycle controls (a task IS running/held now) ══');
    await p.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000);
    console.log(' ', JSON.stringify(await p.evaluate(() => ({
      iconPlay: document.querySelectorAll('.ri-play-fill').length,
      iconPause: document.querySelectorAll('.ri-pause-fill').length,
      iconStop: document.querySelectorAll('.ri-stop-fill').length,
      idStart: document.querySelectorAll('[id^="start-task-btn"]').length,
      idResume: document.querySelectorAll('[id^="resume-task-btn"]').length,
      idEnd: document.querySelectorAll('[id^="end-task-btn"]').length,
      otherIcons: [...new Set([...document.querySelectorAll('section i, .card i')].map((i) => String(i.className)))].filter((c) => /play|pause|stop|circle/i.test(c)).slice(0, 10),
      sections: ["Today's Schedule", 'Running Tasks', 'On Hold'].filter((s) => new RegExp(s, 'i').test(document.body.innerText)),
    }))));
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0].slice(0, 160)); }
  finally { await b.close(); }
})();
