'use strict';
// Read-only: on a plain "Call" task in My Tasks, click ONLY the send-plane
// anchor (a:has(i.ri-send-plane-2-line)) and report what opens. Never the
// red delete button that now sits before it in the Action cell.
require('dotenv').config();
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL;
const SHOT = path.join(__dirname, '..', '..', 'reports', 'qa', 'shots', 'drift-2026-09-18', 'A3_send_plane_call.png');
(async () => {
  const b = await chromium.launch({ headless: true }); const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await new LoginPage(p).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD); await p.waitForTimeout(1500);
    await p.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
    await p.selectOption('#page_size', '100').catch(() => {}); await p.waitForTimeout(2500);
    const row = p.locator('table tbody tr').filter({ has: p.locator('td', { hasText: /^\s*Call\s*$/ }) }).first();
    console.log('  Call rows found:', await p.locator('table tbody tr').filter({ has: p.locator('td', { hasText: /^\s*Call\s*$/ }) }).count());
    console.log('  row:', (await row.innerText()).replace(/\s+/g, ' ').slice(0, 120));
    const actionHtml = await row.locator('td').first().innerHTML();
    console.log('  action cell:', actionHtml.replace(/\s+/g, ' ').replace(/<!--!-->/g, '').slice(0, 400));
    const before = p.url();
    await row.locator('a:has(i.ri-send-plane-2-line)').first().click({ timeout: 5000 });
    await p.waitForTimeout(3500);
    const st = await p.evaluate(() => {
      const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const shown = [...document.querySelectorAll('.modal.show, .offcanvas.show, [role=dialog]')].filter(vis);
      return {
        url: location.pathname + location.search,
        shown: shown.map((m) => ({ id: m.id || null, cls: String(m.className).slice(0, 60), title: (m.querySelector('.modal-title, .offcanvas-title, h5, h4')?.innerText || '').trim().slice(0, 60),
          ids: [...m.querySelectorAll('[id]')].map((e) => e.id).slice(0, 40),
          icons: [...new Set([...m.querySelectorAll('i')].map((e) => String(e.className)).filter(Boolean))].slice(0, 30),
          buttons: [...m.querySelectorAll('button')].filter(vis).map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 15) })),
        txtChat: vis(document.querySelector('#txtChat')), fileInputDocument: !!document.querySelector('#file-input-document'),
      };
    });
    console.log(`  navigated: ${p.url() !== before} → ${st.url}`);
    console.log(`  txtChat visible: ${st.txtChat} · #file-input-document in DOM: ${st.fileInputDocument}`);
    st.shown.forEach((m) => console.log(`  opened: #${m.id} "${m.title}"\n    ids: ${JSON.stringify(m.ids)}\n    icons: ${JSON.stringify(m.icons)}\n    buttons: ${JSON.stringify(m.buttons)}`));
    if (!st.shown.length) console.log('  nothing modal/offcanvas opened');
    await p.screenshot({ path: SHOT });
    await p.keyboard.press('Escape').catch(() => {});
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0]); }
  finally { await b.close(); }
})();
