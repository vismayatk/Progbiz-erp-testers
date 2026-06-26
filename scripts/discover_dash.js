'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => {
      const txt = document.body.innerText;
      const timers = (txt.match(/\d\d:\d\d:\d\d/g) || []).length;
      const iconCls = new Set();
      document.querySelectorAll('[class*="play"],[class*="pause"],[class*="stop"],[class*="ri-"]').forEach(e => {
        (e.className.match(/ri-(play|pause|stop)[\w-]*/g) || []).forEach(c => iconCls.add(c));
      });
      // section headings
      const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,.card-title,.fw-semibold')].map(h => h.textContent.replace(/\s+/g,' ').trim()).filter(t => /schedule|running|hold|pending|complete|today|task/i.test(t)).slice(0,12);
      return { timers, iconCls: [...iconCls], heads: [...new Set(heads)] };
    });
    console.log(JSON.stringify(info, null, 1));
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
