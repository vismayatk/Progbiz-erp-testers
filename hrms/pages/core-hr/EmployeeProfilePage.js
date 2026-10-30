'use strict';

const { test, expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');

/**
 * /employee-view/<guid> — the READ-ONLY employee profile (Core HR → Employee → open an employee).
 *
 * Tabs, in on-screen order (button id → pane via data-bs-target / aria-controls):
 *   Basic Details #basic-info-tab · Address #address-tab · Bank Details #bank-details-tab ·
 *   Documents #documents-tab · Emergency #emergency-tab · History #history-tab · Lifecycle #lifecycle-tab ·
 *   Probation #probation-tab · Salary History #salary-details-tab · Background Verification #bgv-tab ·
 *   Attendance History #attendance-history-tab · Leave History #leave-history-tab
 *
 * Several tabs only fill as the employee progresses: History / Lifecycle log every change, Leave History
 * after leave entitlement + approvals, Salary History after Payroll assigns salary, Attendance History
 * after attendance is captured. Data is ENTERED on the edit form (EmployeesPage); this page only reads.
 */
class EmployeeProfilePage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, '');
  }

  /** Open the profile view (`profileHref` = "/employee-view/<guid>") and wait for its tab bar. */
  async open(profileHref) {
    await this.page.goto(`${this.baseUrl}${profileHref}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await expect(this.page.locator('#basic-info-tab'), 'the profile view should render its tab bar').toBeVisible({ timeout: 60000 });
    await this.waitReady();
  }

  /** Click a tab by its button id and return its pane. */
  async tab(tabId) {
    const btn = this.page.locator(`#${tabId}`);
    const target = (await btn.getAttribute('data-bs-target').catch(() => null)) || (await btn.getAttribute('aria-controls').catch(() => null));
    const pane = this.page.locator(target ? (target.startsWith('#') ? target : `#${target}`) : '.tab-pane.active');
    await test.step(`Profile view: open "${tabId}"`, async () => {
      await btn.click();
      await expect(pane, `the ${tabId} pane should show`).toBeVisible({ timeout: 15000 });
      await this.page.waitForTimeout(1200);   // tab contents load just after the pane opens
    });
    return pane;
  }

  /** The pane's text, whitespace-collapsed. */
  async text(pane) {
    return (await pane.innerText()).replace(/\s+/g, ' ').trim();
  }

  // ── Tab checks, in on-screen order ────────────────────────────────────────────

  async verifyBasic(emp) {
    const pane = await this.tab('basic-info-tab');
    for (const v of [emp.code, emp.first, emp.designation, emp.bloodGroup, emp.nationality].filter(Boolean)) {
      await expect(pane, `Basic Details should show "${v}"`).toContainText(v, { timeout: 15000 });
    }
    if (emp.department) await expect(pane, 'Basic Details should show the department').toContainText(new RegExp(emp.department, 'i'));
  }

  /** Present + Permanent address; with "Same as Present" both halves carry the same city / state / pincode. */
  async verifyAddress(emp) {
    const pane = await this.tab('address-tab');
    await expect(pane, 'the Address tab should show the present address').toContainText(emp.addressLine1, { timeout: 15000 });
    const t = await this.text(pane);
    const [present, permanent = ''] = t.split(/Permanent Address/i);
    for (const v of [emp.presentCity, emp.presentState, emp.presentPincode].filter(Boolean)) {
      expect(present, `Present address should show "${v}"`).toContain(v);
      if (emp.permanentSameAsPresent) expect(permanent, `Permanent address (Same as Present) should show "${v}"`).toContain(v);
    }
  }

  async verifyBank(emp) {
    const pane = await this.tab('bank-details-tab');
    const row = pane.locator('table tbody tr').filter({ hasText: emp.bank.accountNumber }).first();
    await expect(row, `Bank Details should list a/c ${emp.bank.accountNumber}`).toBeVisible({ timeout: 15000 });
    await expect(row, 'the account row should carry bank name and IFSC').toContainText(emp.bank.bankName);
    await expect(row).toContainText(emp.bank.ifsc);
  }

  /** Every given document is listed (matched by its number). Returns each row's text. */
  async verifyDocuments(docs) {
    const pane = await this.tab('documents-tab');
    const rows = {};
    for (const d of docs) {
      const row = pane.locator('table tbody tr').filter({ hasText: d.number }).first();
      await expect(row, `Documents should list ${d.type} ${d.number}`).toBeVisible({ timeout: 15000 });
      rows[d.number] = (await row.innerText()).replace(/\s+/g, ' ').trim();
    }
    return rows;
  }

  async verifyEmergency(emp) {
    const c = emp.emergency;
    const pane = await this.tab('emergency-tab');
    const row = pane.locator('table tbody tr').filter({ hasText: `${c.first} ${c.last}` }).first();
    await expect(row, `Emergency should list ${c.first} ${c.last}`).toBeVisible({ timeout: 15000 });
    await expect(row, 'with the relationship').toContainText(new RegExp(c.relationship, 'i'));
    await expect(row, 'with the phone').toContainText(c.phone);
  }

  /** History is an automatic change log — each expected event text must appear. */
  async verifyHistory(events) {
    const pane = await this.tab('history-tab');
    for (const e of events) await expect(pane, `History should log "${e}"`).toContainText(e, { timeout: 15000 });
    return pane.locator('table tbody tr').count();
  }

  async verifyLifecycleJoined(emp) {
    const pane = await this.tab('lifecycle-tab');
    await expect(pane, 'Lifecycle should record the joining').toContainText(/Joined/i, { timeout: 15000 });
    await expect(pane, 'and the employee creation').toContainText(/Employee created/i);
    if (emp.designation) await expect(pane).toContainText(emp.designation);
  }

  /** Leave History rows (Date | Leave Type | Txn | Days | Balance After | Remarks) as text. */
  async leaveHistoryRows() {
    const pane = await this.tab('leave-history-tab');
    await expect(pane.locator('table tbody tr').first(), 'Leave History should list transactions').toBeVisible({ timeout: 15000 });
    return pane.locator('table tbody tr').evaluateAll(trs => trs.map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  }

  /** A tab whose data comes from a module not yet automated — returns its text (expected: its empty state). */
  async readTab(tabId) {
    return this.text(await this.tab(tabId));
  }
}

module.exports = { EmployeeProfilePage };
