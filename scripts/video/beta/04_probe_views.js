'use strict';
/**
 * READ-ONLY probe of view toggles and detail views used in the video:
 *   - AI Call Analysis: open "View details" on the first analysed ("Done") call
 *   - Leads: open the filter panel (sliders icon), then Status View
 *   - CRM Dashboard: Marketing View
 * Clicks only view/toggle controls. Nothing is typed or saved.
 * Run:  node scripts/video/beta/04_probe_views.js
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

(async () => {
  const dir = path.join(L.OUT, 'scout');
  const { browser, page } = await L.openApp();
  const shot = async n => page.screenshot({ path: path.join(dir, `v_${n}.png`) });
  try {
    // AI Call Analysis detail
    await L.visit(page, '/call-analysis', { settleMs: 2500 });
    const doneRow = page.locator('table tbody tr', { has: page.locator('a[id^="ca-view-"]') }).first();
    await doneRow.locator('a[id^="ca-view-"]').click({ timeout: 8000 });
    await page.waitForTimeout(4000);
    console.log('call detail url:', new URL(page.url()).pathname);
    await shot('call_detail');
    await page.screenshot({ path: path.join(dir, 'v_call_detail_full.png'), fullPage: true });
    fs.writeFileSync(path.join(dir, 'v_call_detail.text.txt'), await page.evaluate(() => document.body.innerText));
    const modal = await page.locator('.modal.show').count();
    console.log('call detail modal open:', modal);
    if (modal) {
      const scrollH = await page.evaluate(() => { const m = document.querySelector('.modal.show .modal-body'); return m ? [m.scrollHeight, m.clientHeight] : null; });
      console.log('modal body scroll/client:', JSON.stringify(scrollH));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1200);
    }

    // Leads filter panel + Status View
    await page.waitForTimeout(1500);
    await L.visit(page, '/leads', { settleMs: 2500 });
    const filterBtn = page.locator('button:has(i[class*="filter"]), button:has(i[class*="equalizer"]), a:has(i[class*="equalizer"]), button:has(i.ri-sound-module-line), button:has(svg)').last();
    const sliders = await page.evaluate(() => {
      const cands = [...document.querySelectorAll('button, a')].filter(b => { const r = b.getBoundingClientRect(); return r.x > 1800 && r.y > 80 && r.y < 150 && r.width > 20; });
      return cands.map(b => ({ tag: b.tagName, id: b.id, cls: String(b.className).slice(0, 60), html: b.innerHTML.slice(0, 120), box: (() => { const r = b.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); })() }));
    });
    console.log('leads top-right buttons:', JSON.stringify(sliders));
    if (sliders.length) {
      const b = sliders[sliders.length - 1].box;
      await page.mouse.click(b[0] + b[2] / 2, b[1] + b[3] / 2);
      await page.waitForTimeout(2500);
      await shot('leads_filter');
      console.log('leads filter: modal', await page.locator('.modal.show').count(), 'offcanvas', await page.locator('.offcanvas.show').count());
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1200);
      const stillOpen = await page.locator('.offcanvas.show, .modal.show').count();
      if (stillOpen) { const close = page.locator('.offcanvas.show .btn-close, .modal.show .btn-close').first(); await close.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1000); }
    }
    await page.getByText('Status View', { exact: false }).first().click({ timeout: 8000 });
    await page.waitForTimeout(3500);
    await shot('leads_status_view');

    // CRM Dashboard Marketing View
    await page.waitForTimeout(1500);
    await L.visit(page, '/crm-dashboard', { settleMs: 3000 });
    await page.getByText('Marketing View', { exact: false }).first().click({ timeout: 8000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(dir, 'v_dashboard_marketing_full.png'), fullPage: true });
    console.log('marketing view height:', await page.evaluate(() => document.documentElement.scrollHeight));
  } catch (e) {
    console.log('ERROR', String(e.message).split('\n')[0]);
    await shot('error').catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
