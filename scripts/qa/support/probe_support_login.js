'use strict';
/**
 * Map the support-login form so the explorer can authenticate.
 *
 * This is a different entry point from the tenant login: no company code,
 * and a superadmin session that spans every tenant. Nothing here is assumed —
 * the form is read and reported before any credential is typed.
 *
 * Read-only.
 *   node scripts/qa/support/probe_support_login.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE = process.env.SUPPORT_BASE_URL || 'https://dev.erp.progbiz.in';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    const resp = await page.goto(`${BASE}/support-login/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);

    const form = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => {
        if (e.getClientRects().length === 0) return false;
        const s = getComputedStyle(e);
        return s.display !== 'none' && s.visibility !== 'hidden';
      };
      return {
        url: location.href,
        title: document.title,
        heading: clean(document.querySelector('h1,h2,h3,.card-title')?.innerText).slice(0, 80),
        inputs: [...document.querySelectorAll('input')].filter(on).map((i) => ({
          id: i.id || null, name: i.name || null, type: i.type,
          placeholder: i.getAttribute('placeholder'),
          label: clean(i.labels && i.labels[0] && i.labels[0].innerText).slice(0, 30),
        })),
        buttons: [...document.querySelectorAll('button, input[type=submit]')].filter(on)
          .map((b) => ({ id: b.id || null, type: b.type, text: clean(b.innerText || b.value).slice(0, 30) })),
        bodySample: clean(document.body.innerText).slice(0, 300),
      };
    });

    console.log(`HTTP ${resp ? resp.status() : '?'}`);
    console.log(JSON.stringify(form, null, 2));
    await page.screenshot({ path: 'reports/qa/shots/support/login.png', fullPage: true }).catch(() => {});

    const out = path.join(__dirname, '..', '..', '..', 'reports', 'qa', 'raw', 'support-login-form.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(form, null, 2));
    console.log('\n✅ wrote reports/qa/raw/support-login-form.json');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
