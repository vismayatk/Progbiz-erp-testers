'use strict';

/**
 * Global setup for the HRMS suite — logs in ONCE and saves storage state
 * (cookies + localStorage) to hrms/.auth/state.json so every test starts
 * authenticated instead of logging in 80 times.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { HrmsLoginPage } = require('../pages/HrmsLoginPage');

module.exports = async () => {
  const authDir = path.join(__dirname, '..', '.auth');
  fs.mkdirSync(authDir, { recursive: true });
  const statePath = path.join(authDir, 'state.json');

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();

  const login = new HrmsLoginPage(page);
  await login.login();                       // env-driven creds, 3 retries
  await page.waitForTimeout(2000);           // let the SPA persist its session

  await ctx.storageState({ path: statePath });
  console.log(`  💾 auth state saved → ${statePath}`);
  await browser.close();
};
