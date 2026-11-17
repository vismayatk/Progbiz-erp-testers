'use strict';
/**
 * Map the filter panels and the home-page schedule widget so the functional
 * test can drive them with real selectors instead of guesses.
 *
 * Read-only.
 *   node scripts/qa/probe_crm_filters.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};

const dumpOpenPanel = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const onScreen = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const panels = [...document.querySelectorAll('.offcanvas.show, .modal.show, .filter-panel, [class*="filter" i]')]
    .filter(onScreen);
  const scope = panels[0] || document.body;
  return {
    panelClass: panels[0] ? (panels[0].getAttribute('class') || '').slice(0, 90) : '(none — inline filters)',
    controls: [...scope.querySelectorAll('input[id],select[id],textarea[id]')]
      .filter(onScreen)
      .map((e) => ({
        id: e.id,
        tag: e.tagName.toLowerCase(),
        type: e.type || null,
        label: clean(
          (e.labels && e.labels[0] && e.labels[0].innerText) ||
          e.getAttribute('placeholder') ||
          e.closest('.form-group,.col,div')?.querySelector('label')?.innerText
        ).slice(0, 40),
        options: e.tagName === 'SELECT'
          ? [...e.options].slice(0, 10).map((o) => ({ v: o.value, t: clean(o.text).slice(0, 34) }))
          : null,
      })),
    buttons: [...scope.querySelectorAll('button,a.btn')].filter(onScreen)
      .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 26) })).filter((b) => b.id || b.text),
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const R = {};
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    for (const route of ['/leads', '/followups']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);

      // Grid columns + a sample of real row data, so the test knows which
      // column index carries which value.
      R[`${route}_grid`] = await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const onScreen = (e) => e.getClientRects().length > 0;
        const t = [...document.querySelectorAll('table')].filter(onScreen)[0];
        if (!t) return null;
        return {
          columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
          sampleRows: [...t.querySelectorAll('tbody tr')].slice(0, 3)
            .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText).slice(0, 26))),
          rowCount: t.querySelectorAll('tbody tr').length,
        };
      });

      await page.locator('#btn-toggle-filter, button:has-text("Filter")').first()
        .click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1800);
      R[`${route}_filter`] = await page.evaluate(dumpOpenPanel);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(600);
    }

    // Home page — Today's Schedule / follow-up widgets
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);
    R.home = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const onScreen = (e) => e.getClientRects().length > 0;
      return {
        cards: [...document.querySelectorAll('.card, .panel, section')].filter(onScreen)
          .map((c) => {
            const head = clean(c.querySelector('.card-title,.card-header,h3,h4,h5')?.innerText).slice(0, 44);
            return head ? {
              heading: head,
              id: c.id || null,
              tableRows: c.querySelectorAll('table tbody tr').length,
              columns: [...c.querySelectorAll('table thead th')].map((h) => clean(h.innerText)),
              text: clean(c.innerText).slice(0, 150),
            } : null;
          }).filter(Boolean).slice(0, 22),
        countersOnPage: [...document.querySelectorAll('h1,h2,h3,h4,.count,[class*="count" i]')]
          .filter(onScreen).map((e) => clean(e.innerText)).filter((t) => /^\d+$/.test(t)).slice(0, 20),
      };
    });

    const out = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'crm-filters-probe.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(R, null, 2));
    console.log(JSON.stringify(R, null, 2).slice(0, 6000));
    console.log('\n✅ wrote reports/qa/raw/crm-filters-probe.json');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
