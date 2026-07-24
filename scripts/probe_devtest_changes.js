'use strict';
/** Read-only probe of the changed devtest build: Create New menu, home task
 *  sections/controls, my-tasks rows, leads listing. Diagnoses clusters A–D. */
require('dotenv').config();
const { chromium } = require('playwright');
const { LoginPage } = require('../erp/common/LoginPage');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await new LoginPage(page).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD);
  await page.waitForTimeout(3000);

  // ── A: Create New control + menu ──
  const createNew = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btns = Array.from(document.querySelectorAll('#new-task, [id*="new-task"], button, a'))
      .filter(el => vis(el) && /create new/i.test(el.innerText || ''))
      .map(el => ({ tag: el.tagName, id: el.id || null, cls: String(el.className).slice(0, 50), text: (el.innerText || '').trim().slice(0, 20) }));
    return { hasNewTaskId: !!document.querySelector('#new-task'), createNewButtons: btns.slice(0, 5) };
  });
  console.log('A1 create-new control:', JSON.stringify(createNew));

  // click Create New and dump menu items
  const cn = page.locator('#new-task').first().or(page.locator('button, a').filter({ hasText: /create new/i }).first());
  await cn.click({ timeout: 8000 }).catch(e => console.log('create-new click failed:', e.message.split('\n')[0]));
  await page.waitForTimeout(1200);
  const menu = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return Array.from(document.querySelectorAll('.dropdown-menu.show a, .dropdown-menu.show button, [class*="dropdown" i] a'))
      .filter(vis).map(a => ({ text: (a.innerText || '').trim(), id: a.id || null, href: a.getAttribute('href') })).slice(0, 12);
  });
  console.log('A2 create-new menu items:', JSON.stringify(menu));
  await page.keyboard.press('Escape').catch(() => {});

  // direct quotation/enquiry routes still exist?
  for (const r of ['redirect/enquiry', 'redirect/quotation']) {
    const resp = await page.goto(`${process.env.BASE_URL}/${r}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(2500);
    console.log(`A3 ${r} -> ${page.url()} (status ${resp && resp.status()})`);
  }

  // ── B/TM-20: home task sections + start/stop controls ──
  await page.goto(`${process.env.BASE_URL}/home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  const home = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = (document.body.innerText || '').replace(/\s+/g, ' ');
    const controls = Array.from(document.querySelectorAll('button, a, i'))
      .filter(el => vis(el) && /start|stop|hold|resume|end/i.test((el.getAttribute('title') || '') + ' ' + (el.className || '') + ' ' + (el.innerText || '').slice(0, 12)))
      .map(el => ({ tag: el.tagName, title: el.getAttribute('title'), cls: String(el.className).slice(0, 40), text: (el.innerText || '').trim().slice(0, 15) })).slice(0, 12);
    return {
      sections: ['Running', 'On-Hold', 'On Hold', "Today's Schedule", 'Pending', 'Delayed', 'Completed', 'Unscheduled'].filter(s => txt.includes(s)),
      controls,
      snippet: txt.slice(0, 400),
    };
  });
  console.log('B1 home sections:', JSON.stringify(home.sections));
  console.log('B1 lifecycle controls:', JSON.stringify(home.controls));
  console.log('B1 snippet:', home.snippet);

  // my-tasks rows + how a task opens
  await page.goto(`${process.env.BASE_URL}/my-tasks`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  const myTasks = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const rows = Array.from(document.querySelectorAll('table tbody tr')).filter(vis);
    const cards = Array.from(document.querySelectorAll('[class*="task-card" i], [class*="card" i][onclick], a[href*="task"]')).filter(vis);
    return {
      tableRows: rows.length,
      firstRowText: rows[0] ? rows[0].innerText.replace(/\s+/g, ' ').slice(0, 120) : null,
      firstRowLinks: rows[0] ? Array.from(rows[0].querySelectorAll('a,button,i')).map(e => ({ tag: e.tagName, title: e.getAttribute('title'), cls: String(e.className).slice(0, 30) })).slice(0, 8) : [],
      cardCount: cards.length,
      bodySnippet: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
    };
  });
  console.log('B2 my-tasks:', JSON.stringify(myTasks, null, 1));

  // ── D: leads listing ──
  await page.goto(`${process.env.BASE_URL}/leads`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  const leads = await page.evaluate(() => {
    const txt = (document.body.innerText || '').replace(/\s+/g, ' ');
    const rows = document.querySelectorAll('table tbody tr').length;
    return { rows, tabs: ['New', 'In-Followup', 'Won', 'Lost'].filter(t => txt.includes(t)), snippet: txt.slice(0, 300) };
  });
  console.log('D1 leads listing:', JSON.stringify(leads));

  await browser.close();
})().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
