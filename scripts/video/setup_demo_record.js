'use strict';
/**
 * PHASE 1 (not recorded) — create one clean, clearly-fake demo enquiry +
 * follow-up for the CRM product-demo video, per the brief's own rule:
 * "Use demo/test customer names and numbers only" (never a real customer).
 *
 * This is a real record on lesol_test, created the same safe way every QA
 * script this session creates one — nothing pre-existing is touched.
 *
 * Run:  node scripts/video/setup_demo_record.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { EnquiryPage } = require('../../erp/crm/pages/EnquiryPage');

const C = {
  company: process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD || '123',
};

// Clean, obviously-fake demo identity — presentable on camera, still safe.
// Mobile must be fresh: re-using the same number left a "New Suspect" dedupe
// modal open (confirmed via screenshot) that silently blocked the next click.
const uniqueSuffix = String(Date.now()).slice(-4);
const DEMO = {
  customerName: 'Demo Customer',
  mobile: `98765${uniqueSuffix}0`,
  email: 'demo.customer@example.com',
  source: 'Website',
  product: 'Inverter',
  description: 'Interested in a home inverter setup',
  quantity: '1',
  unitPrice: '1000',
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);

    const enq = new EnquiryPage(page);
    await enq.openAddForm();
    // Leave Followup Status at its default (New Enquiry) for the CREATE step —
    // pre-selecting "Interested" here makes Lead Quality mandatory (ENQ-09) and
    // fillAndCreate doesn't fill it, so Save silently swal-blocks. "Interested"
    // is set later, in the follow-up modal below, where Lead Quality IS filled.
    await enq.fillAndCreate(DEMO);
    await page.waitForTimeout(3000);
    console.log('  ✅ Demo enquiry saved | url:', page.url());

    // Confirm it actually landed on an overview (not stuck on the create form).
    if (/\/enquiry$/.test(page.url())) {
      throw new Error('Save did not navigate away from /enquiry — enquiry may not have persisted');
    }

    // Add a real follow-up so /followups has something presentable to open.
    // Uses tomorrow's date deliberately — CH-F1: the modal's own default date
    // is one minute below its min, which silently blocks Save.
    const addBtn = page.locator('#btn-add-followup');
    await addBtn.waitFor({ state: 'visible', timeout: 15000 });
    await addBtn.click();
    const modal = page.locator('#followupModal');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#followup-status').selectOption({ label: 'Interested' }).catch(async () => {
      await page.locator('#followup-status').selectOption({ index: 1 });
    });
    await page.waitForTimeout(900);
    await page.locator('#lead-quality').selectOption({ index: 1 }).catch(() => {});
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const dateStr = tomorrow.toISOString().slice(0, 10);
    await page.locator('#next-followup-date').fill(`${dateStr}T10:00`).catch(async () => {
      await page.locator('#next-followup-date').fill(dateStr).catch(() => {});
    });
    await page.locator('#followup-description').fill('Follow up about inverter installation timeline').catch(() => {});
    await page.locator('#btn-save-followup').click();
    await page.waitForTimeout(2500);
    console.log('  ✅ Follow-up saved for', DEMO.customerName, '| url:', page.url());
  } catch (e) {
    console.log('ERROR', e.message.split('\n')[0]);
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-vismaya-Progbiz/81b744fc-2b98-4885-bb8f-c0e257461fea/scratchpad/video-setup-failure.png' }).catch(() => {});
    const dump = await page.evaluate(() => ({
      url: location.href,
      openModals: [...document.querySelectorAll('.modal.show, .swal2-popup')].map(m => (m.querySelector('.modal-title, .swal2-title')?.textContent || '').trim()),
      bodySnippet: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    })).catch(() => null);
    console.log('DIAG', JSON.stringify(dump));
  } finally {
    await browser.close();
  }
})();
