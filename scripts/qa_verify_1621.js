'use strict';
/** QA verify ERP-1621: in WHITE/light theme, the task-modal date fields render dark. */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page); const tm = new TaskManagementPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // switch to LIGHT/white theme
    const applied = await page.evaluate(() => {
      const r = document.querySelector('#switcher-light-theme');
      if (r) { r.click(); }
      // many builds toggle a data attr on <html>
      const html = document.documentElement;
      return { clicked: !!r, htmlThemeAttrs: Object.keys(html.dataset).filter(k => /theme|mode|color/i.test(k)).map(k => `${k}=${html.dataset[k]}`) };
    });
    await page.waitForTimeout(1200);
    console.log('theme switch:', JSON.stringify(applied));

    // open task modal → Task for Later → reveal date/time fields
    await tm.openTaskModal();
    await tm.selectMode('later');
    const tgl = tm.deadlineToggle;
    if (await tgl.isVisible().catch(() => false)) { await tgl.click({ force: true }).catch(() => {}); await page.waitForTimeout(800); }

    const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
    const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const probe = await page.evaluate(() => {
      const m = document.querySelector('#home-create-task-modal');
      const cs = e => e ? getComputedStyle(e) : null;
      const di = [...m.querySelectorAll('input[type="date"],input[type="time"],input[type="datetime-local"]')].filter(e => e.getClientRects().length);
      const modalBg = cs(m.querySelector('.modal-content') || m).backgroundColor;
      const fields = di.map(e => ({ type: e.type, bg: cs(e).backgroundColor, color: cs(e).color }));
      const htmlClass = document.documentElement.className, bodyClass = document.body.className;
      return { modalBg, fields, htmlClass: htmlClass.slice(0, 60), bodyClass: bodyClass.slice(0, 60) };
    });
    console.log('modalBg:', probe.modalBg);
    console.log('htmlClass:', probe.htmlClass, '| bodyClass:', probe.bodyClass);
    probe.fields.forEach((f, i) => {
      const bgL = lum(rgb(f.bg)), txtL = lum(rgb(f.color));
      console.log(`  date field #${i} (${f.type}): bg=${f.bg} (lum ${bgL.toFixed(0)}) color=${f.color} (lum ${txtL.toFixed(0)})`);
    });
    const modalL = lum(rgb(probe.modalBg));
    const darkFields = probe.fields.filter(f => lum(rgb(f.bg)) < 90);
    console.log(`\nmodal luminance=${modalL.toFixed(0)} | dark date fields=${darkFields.length}/${probe.fields.length}`);
    console.log('VERDICT:', modalL > 150 && darkFields.length > 0
      ? 'BUG STILL PRESENT — date fields render dark on a light modal'
      : (modalL <= 150 ? 'INCONCLUSIVE — modal not in light theme (could not switch)' : 'LIKELY FIXED — date fields match the light theme'));
    await page.screenshot({ path: 'screenshots/qa_1621_light_theme.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
