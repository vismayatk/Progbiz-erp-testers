'use strict';

require('dotenv').config();
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL     || 'https://erptest.progbiz.in';
const CO   = process.env.COMPANY_CODE || 'skiolo_test';
const USER = process.env.CRM_USERNAME || 'admin';
const PASS = process.env.PASSWORD     || '123';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page    = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="company_code"], input[id*="company" i]').first().fill(CO);
  await page.locator('input[name="username"], input[id*="user" i]').first().fill(USER);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 20000 });
  console.log('✅ Logged in\n');

  // ── Try to find Leads listing via sidebar ────────────────────────────────
  console.log('── Clicking CRM sidebar ──');
  await page.locator('a.side-menu__item', { hasText: 'CRM' }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'diag2_01_crm_expanded.png' });

  const sideLinks = await page.evaluate(() =>
    [...document.querySelectorAll('.slide-menu a, .sub-slide-menu a, .nav-sub a, ul.slide-menu a')]
      .filter(el => el.offsetParent !== null)
      .map(el => ({ text: el.textContent.trim(), href: el.href }))
  );
  console.log('CRM submenu links:', JSON.stringify(sideLinks, null, 2));

  // ── Try common listing URLs ──────────────────────────────────────────────
  const tryUrls = ['/leads', '/crm/leads', '/enquiry/list', '/enquiry/index', '/crm', '/crm/enquiry'];
  for (const u of tryUrls) {
    await page.goto(`${BASE}${u}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const rows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
    const heading = await page.evaluate(() => (document.querySelector('h1,h2,h3,.page-title,.card-title')?.textContent || '').trim());
    console.log(`${u} → rows=${rows} heading="${heading}" url=${page.url()}`);
  }

  // ── Navigate to Leads via sidebar click ─────────────────────────────────
  console.log('\n── Clicking Leads submenu ──');
  await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
  await page.locator('a.side-menu__item', { hasText: 'CRM' }).first().click();
  await page.waitForTimeout(600);

  const leadsLink = page.locator('a', { hasText: /^leads$/i }).first();
  const leadsCount = await leadsLink.count();
  console.log('Leads link count:', leadsCount);
  if (leadsCount > 0) {
    await leadsLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    console.log('Leads URL:', page.url());
    await page.screenshot({ path: 'diag2_02_leads.png' });

    const rows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
    console.log('Table rows:', rows);

    if (rows > 0) {
      const firstRow = await page.evaluate(() => {
        const row = document.querySelector('table tbody tr');
        return {
          html: row.innerHTML.substring(0, 600),
          links: [...row.querySelectorAll('a,button')].map(el => ({
            tag: el.tagName, text: el.textContent.trim(), href: el.href || '', cls: el.className, id: el.id
          }))
        };
      });
      console.log('First row links:', JSON.stringify(firstRow.links, null, 2));

      // Click first row to open detail
      const firstLink = page.locator('table tbody tr').first().locator('a').first();
      if (await firstLink.count() > 0) {
        await firstLink.click();
      } else {
        await page.locator('table tbody tr').first().click();
      }
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      console.log('\nDetail page URL:', page.url());
      await page.screenshot({ path: 'diag2_03_enquiry_detail.png' });

      // Detail page buttons
      const detailBtns = await page.evaluate(() =>
        [...document.querySelectorAll('a,button')]
          .filter(el => el.offsetParent && el.textContent.trim())
          .map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0,60), id: el.id, cls: el.className, href: el.href||'' }))
          .slice(0, 40)
      );
      console.log('\nDetail buttons:', JSON.stringify(detailBtns, null, 2));

      // Status dropdown
      const statusDrop = await page.evaluate(() => {
        const sel = [...document.querySelectorAll('select')].find(s => /status/i.test(s.id + s.name + s.className));
        return sel ? { id: sel.id, name: sel.name, cls: sel.className, options: [...sel.options].map(o => ({ val: o.value, text: o.text })) } : null;
      });
      console.log('\nStatus dropdown:', JSON.stringify(statusDrop, null, 2));

      // Follow-up section
      const followupBtns = await page.evaluate(() =>
        [...document.querySelectorAll('a,button')]
          .filter(el => /follow/i.test(el.textContent + el.id + el.className) && el.offsetParent)
          .map(el => ({ tag: el.tagName, text: el.textContent.trim(), id: el.id, cls: el.className }))
      );
      console.log('\nFollow-up buttons:', JSON.stringify(followupBtns, null, 2));

      // Convert/Quotation buttons
      const quotBtns = await page.evaluate(() =>
        [...document.querySelectorAll('a,button')]
          .filter(el => /quot|convert/i.test(el.textContent + el.id + el.className) && el.offsetParent)
          .map(el => ({ tag: el.tagName, text: el.textContent.trim(), id: el.id, cls: el.className, href: el.href||'' }))
      );
      console.log('\nQuotation buttons:', JSON.stringify(quotBtns, null, 2));
    }
  }

  console.log('\n📸 Screenshots saved: diag2_01_crm_expanded.png, diag2_02_leads.png, diag2_03_enquiry_detail.png');
  await browser.close();
})();
