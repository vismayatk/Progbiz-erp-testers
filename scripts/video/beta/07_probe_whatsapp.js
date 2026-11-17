'use strict';
/**
 * READ-ONLY probe of the WhatsApp screens for the video:
 *   - /chat: open the company's own "Progbiz Digital Marketing" conversation (view only)
 *   - /broadcasts: open the "New Broadcast" menu, then close it
 *   - /customer-broadcast: pick a template and a "Send at" option in the form to see the
 *     preview and schedule fields. The form is NEVER submitted; the page is left unsaved.
 * Run:  node scripts/video/beta/07_probe_whatsapp.js
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

(async () => {
  const dir = path.join(L.OUT, 'scout');
  const { browser, page } = await L.openApp();
  const shot = n => page.screenshot({ path: path.join(dir, `w_${n}.png`) });
  try {
    await L.visit(page, '/chat', { settleMs: 4000 });
    const item = page.getByText('Progbiz Digital Marketing', { exact: true }).first();
    await item.click({ timeout: 8000 });
    await page.waitForTimeout(4000);
    await shot('chat_open');
    fs.writeFileSync(path.join(dir, 'w_chat_open.text.txt'), await page.evaluate(() => document.body.innerText));
    const composer = await page.evaluate(() => [...document.querySelectorAll('input, textarea')].map(e => ({ ph: e.getAttribute('placeholder'), box: (() => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); })() })));
    console.log('chat inputs:', JSON.stringify(composer));

    await page.waitForTimeout(1500);
    await L.visit(page, '/broadcasts', { settleMs: 3000 });
    const nb = page.getByText('New Broadcast', { exact: false }).first();
    await nb.click({ timeout: 8000 });
    await page.waitForTimeout(1500);
    await shot('broadcast_menu');
    const menu = await page.evaluate(() => [...document.querySelectorAll('.dropdown-menu.show a, .dropdown-menu.show button, .dropdown-menu.show li')].map(e => (e.innerText || '').trim()).filter(Boolean));
    console.log('new broadcast menu:', JSON.stringify(menu));
    await page.keyboard.press('Escape');

    await page.waitForTimeout(1500);
    await L.visit(page, '/customer-broadcast', { settleMs: 3000 });
    const selects = await page.evaluate(() => [...document.querySelectorAll('select')].map(s => ({ id: s.id, name: s.name, options: [...s.options].map(o => o.text.trim()), box: (() => { const r = s.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); })() })));
    console.log('form selects:', JSON.stringify(selects));
    const tpl = page.locator('select').filter({ hasText: 'offer' }).first();
    await tpl.selectOption({ label: 'offer' }).catch(e => console.log('template select failed', e.message.split('\n')[0]));
    await page.waitForTimeout(2000);
    await shot('cb_template');
    const sendAt = page.locator('select').filter({ hasText: 'Scheduled' }).first();
    await sendAt.selectOption({ label: 'Scheduled' }).catch(e => console.log('sendAt select failed', e.message.split('\n')[0]));
    await page.waitForTimeout(1500);
    await shot('cb_scheduled');
    await sendAt.selectOption({ label: 'Periodic' }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot('cb_periodic');
    fs.writeFileSync(path.join(dir, 'w_cb.text.txt'), await page.evaluate(() => document.body.innerText));
  } catch (e) {
    console.log('ERROR', String(e.message).split('\n')[0]);
    await shot('error').catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close(); // leaves the broadcast form unsaved
  }
})();
