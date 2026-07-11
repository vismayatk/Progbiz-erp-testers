'use strict';

/**
 * CRM — Quotation  (Excel "Quotation" sheet: QT-001 .. QT-018)
 * The create form is a stepped form best reached via enquiry → "Create Quotation"
 * (/quotation/0/{id}, prefilled). Fields: #branch · #date · #quotation-no (auto) ·
 * #customerNameInput · #agent (Sales Exec) · #quotation-quality · #currency ·
 * #expdate (Valid Upto — the only field NOT auto-filled) · #terms-and-condition ·
 * totals #gross-total/#payable-total · #btn-save-quotation.
 *
 * Run:  npx playwright test tests/crm_quotation.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { EnquiryPage } = require('../pages/EnquiryPage');
const { QuotationPage } = require('../pages/QuotationPage');
const { screenshot } = require('../../common/helpers');

const C = {
  company:  process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};
const uniq = () => { const ts = Date.now(); return { customerName: `QT Cust ${ts}`, mobile: '9' + String(ts).slice(-9), email: `qt${ts}@x.com`, source: 'Website', product: 'Inverter', description: 'qt', quantity: '2', unitPrice: '1000' }; };

/** Login, seed a fresh enquiry, open its prefilled Quotation form (not saved).
 *  Returns the QuotationPage; the seeded enquiry data is exposed as `qt.seed`. */
async function seedQuotation(page) {
  const lp = new LoginPage(page); await lp.goto(); await lp.login(C.company, C.username, C.password);
  const enq = new EnquiryPage(page);
  await enq.openAddForm();
  const data = uniq();
  await enq.fillAndCreate(data);
  await page.waitForTimeout(1500);
  await enq.openQuotationForm();
  const qt = new QuotationPage(page);
  qt.seed = data;
  return qt;
}

test.describe('CRM — Quotation', () => {
  test.describe.configure({ timeout: 200_000 });

  test('QT-010 | Auto-fill from enquiry + items + totals + editable (QT-003,004,006,010,011)', async ({ page }) => {
    const qt = await seedQuotation(page);
    expect(qt.onForm(), 'should be on the quotation form').toBeTruthy();
    const s = await qt.autoFillState();
    console.log('  🧾 auto-fill state:', JSON.stringify(s));
    expect(s.number, 'Quotation No auto-generated').toMatch(/QUO-?\d+/i);   // QT-001 number
    // Data round-trip: the auto-filled customer must be EXACTLY the enquiry's customer
    expect(s.customer, `autofill should carry customer "${qt.seed.customerName}"`).toContain(qt.seed.customerName); // QT-010
    expect(s.validUpto, 'Valid Upto should NOT be auto-filled (per spec)').toBeFalsy(); // QT-010
    // QT-004: the enquiry line item (qty 2 @ 1000) must actually carry into the quotation grid.
    // A generic row count passed on a blank "add new item" placeholder row, so match the data.
    const grid = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')]
      .map(r => [...r.querySelectorAll('td')].map(c => {
        const i = c.querySelector('input,select,textarea');
        return ((i ? i.value : c.textContent) || '').trim();
      })));
    const line = grid.find(cells => cells.includes(qt.seed.quantity) &&
      cells.some(c => parseFloat((c || '').replace(/[^\d.]/g, '')) > 0));
    expect(line, `enquiry line item (qty ${qt.seed.quantity} + a non-zero price) should carry into the quotation grid`).toBeTruthy();
    // QT-006: totals must be COMPUTED from the carried items (qty 2 × 1000), not a blank/0 placeholder
    const grossNum = parseFloat(String(s.gross).replace(/[^\d.]/g, ''));
    const payNum = parseFloat(String(s.payable).replace(/[^\d.]/g, ''));
    expect(grossNum, 'gross total should be computed from carried items (2×1000)').toBeGreaterThan(0);
    expect(payNum, 'payable total should be computed from carried items').toBeGreaterThan(0);
    // editable after auto-fill (QT-011): set Valid Upto
    const d = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    await qt.setValidUpto(d);
    expect(await qt.qValidUpto.inputValue()).toContain(d);
    await screenshot(page, 'qt10_autofill');
    console.log('  ✅ Quotation auto-filled (except Valid Upto), items+totals present, fields editable');
  });

  test('QT-007 | Terms and Conditions editable', async ({ page }) => {
    const qt = await seedQuotation(page);
    const terms = `Payment within 30 days ${Date.now()}`;
    await qt.qTerms.fill(terms).catch(() => {});
    await screenshot(page, 'qt07_terms');
    expect(await qt.qTerms.inputValue().catch(() => '')).toContain('Payment within 30 days');
    console.log('  ✅ Terms & Conditions accepts input');
  });

  test('QT-012 | Save quotation from enquiry → Overview + actions (QT-008,012,013,014,015,016,017,018)', async ({ page }) => {
    const qt = await seedQuotation(page);
    const before = await qt.autoFillState();
    expect(before.number, 'quotation number auto-generated').toMatch(/QUO-?\d+/i);
    const d = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    await qt.setValidUpto(d);                                  // required, not prefilled
    await qt.setLeadQuality();                                 // required — save swal-blocks without it
    const msg = await qt.save();                               // QT-008/012
    await page.waitForTimeout(2000);
    await screenshot(page, 'qt12_saved');
    console.log('  💾 save →', msg, '| number:', before.number, '| url:', page.url());
    // The old check (URL has "quotation" OR body has nav words) passed even on a failed save.
    // Prove the save persisted: no error, and the quotation NUMBER appears in the listing.
    expect(String(msg || ''), 'save must not surface an error').not.toMatch(/oops|error|went wrong|failed/i); // QT-013
    // a successful save leaves the /quotation/0/ create form (view page or overview)
    expect(page.url(), 'save did not persist — still on the /quotation/0/ create form').not.toContain('/quotation/0/');
    // and the quotation appears in /leads under the Type=Quotation filter with its QUO number
    await qt.gotoQuotationList();
    const found = await page.evaluate(n => document.body.innerText.includes(n), before.number);
    expect(found, `saved quotation ${before.number} should appear in the Type=Quotation listing`).toBeTruthy();
    console.log(`  ✅ Quotation ${before.number} saved and listed`);
  });

  test('QT-001 | Create New → Quotation page (QT-001,002,009)', async ({ page }) => {
    const lp = new LoginPage(page); await lp.goto(); await lp.login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);
    // Create New → Quotation
    const item = page.locator('#new-quotation-item');
    for (let i = 0; i < 6 && !(await item.isVisible().catch(() => false)); i++) { await page.locator('#new-task').click().catch(() => {}); await page.waitForTimeout(600); }
    // No direct-goto fallback: the Create-New → Quotation menu path itself is under test,
    // so a broken menu must fail rather than be masked by a forced page.goto('/quotation').
    await item.click();
    await page.waitForTimeout(2500);
    await screenshot(page, 'qt01_create');
    console.log('  🧾 Create New → Quotation url:', page.url());
    // Assert the actual quotation FORM rendered (URL substring alone was maskable). QT-001
    await expect(page.locator('#btn-save-quotation, #quotation-no').first(),
      'quotation create form did not render').toBeVisible({ timeout: 15000 });
    console.log('  ✅ Quotation creation form reachable from Create New');
  });
});
