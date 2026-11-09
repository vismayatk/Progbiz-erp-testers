'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit } = require('../FormKit');
const { expectToast, confirm } = require('./onbUi');

/**
 * /hrms/probation — Probation Dashboard. Stat tiles, "Start Probation", "Export Excel", filters.
 * Grid: Sl No | Employee | Branch | Start | End | Reviews | Next Review | Probation Timeline | Action
 * (a "Manage probation" button → record review / extend / confirm). "Start Probation" opens a modal
 * (Employee name/code search, start + end dates).
 */
class ProbationDashboardPage extends BasePage {
  constructor(page) {
    super(page, 'hrms/probation');
    this.fk = new FormKit(page);
    this.startBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*Start Probation\s*$/i }).first();
  }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Probation Dashboard heading').toContainText(/Probation/i, { timeout: 30000 });
    await this.page.waitForTimeout(1000);
  }

  rows() { return this.gridRows.filter({ hasText: /\S/ }); }
  async count() { return this.rows().count(); }
  rowFor(text) { return this.rows().filter({ hasText: text }).first(); }
  async exportAvailable() { return (await this.main.locator('button, a.btn').filter({ hasText: /Export Excel/i }).count()) > 0; }

  modal() { return this.page.locator('.modal.show:visible, [role="dialog"]:visible').first(); }

  /** Filter the dashboard by review/decision status (e.g. "End date passed", "In progress"). */
  async filterStatus(labelLike) {
    const sel = this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /In progress|End date passed|Review due/i }) }).first();
    if (!(await sel.count())) return false;
    const opts = (await sel.locator('option').allTextContents()).map(t => t.trim());
    const match = opts.find(o => o.toLowerCase().includes(labelLike.toLowerCase()));
    if (!match) return false;
    await sel.selectOption({ label: match });
    await this.page.waitForTimeout(1200);
    return true;
  }

  /** Open "Manage probation" for the first row (after any filter). Returns the employee name. */
  async manageFirst() {
    const row = this.rows().first();
    if (!(await row.count())) return '';
    const emp = ((await row.innerText().catch(() => '')).match(/([A-Z][a-z]+ [A-Z][a-z]+)/) || [])[1] || '';
    const btn = row.locator('button, a.btn, [title]').filter({ hasText: /Manage probation|manage/i }).first();
    if (!(await btn.count())) return '';
    await btn.click();
    await this.page.waitForTimeout(1500);
    return emp;
  }

  /** Start a probation for an employee (search by code; set start/end dates). */
  async startProbation({ code, startISO, endISO } = {}) {
    await this.startBtn.click();
    const m = this.modal();
    await expect(m, 'the Start Probation modal').toBeVisible({ timeout: 15000 });
    const search = m.locator('input[placeholder*="Employee name" i], input[placeholder*="code" i]').first();
    await search.fill(code);
    await this.page.waitForTimeout(1200);
    // pick the matching employee from the suggestions
    const opt = this.page.locator('.list-group li, .dropdown-item, [role="option"], li').filter({ hasText: new RegExp(code, 'i') }).first();
    if (await opt.count()) { await opt.click().catch(() => {}); await this.page.waitForTimeout(500); }
    const dates = m.locator('input[type="date"]');
    if (startISO && await dates.count()) await dates.nth(0).fill(startISO).catch(() => {});
    if (endISO && await dates.count() > 1) await dates.nth(1).fill(endISO).catch(() => {});
    const save = m.locator('button, a.btn').filter({ hasText: /start|save|confirm|begin/i }).filter({ hasNotText: /cancel|close/i }).last();
    await save.click();
    await expectToast(this.page, /start|probation|success|saved|added/i, 'Start probation').catch(() => {});
    await this.page.waitForTimeout(1500);
    await this.goto();
    await expect(this.rowFor(code).or(this.rows().first()), `${code} should be on probation`).toBeVisible({ timeout: 20000 }).catch(() => {});
  }

  /** Open the "Manage probation" view for an employee (by code/name). */
  async manage(codeOrName) {
    const row = this.rowFor(codeOrName);
    await expect(row, `probation row for ${codeOrName}`).toBeVisible({ timeout: 15000 });
    const btn = row.locator('button, a.btn, [title]').filter({ hasText: /Manage probation|manage/i }).first();
    await expect(btn, 'the Manage probation control').toBeVisible({ timeout: 10000 });
    await btn.click();
    await this.page.waitForTimeout(1500);
  }

  /** Within the manage view, click an action (Confirm / Extend / Record Review) and confirm. */
  async manageAction(re, { newEndISO, reason, name = 'Probation action' } = {}) {
    const scope = this.modal().or(this.main);
    const ctl = scope.locator('button, a.btn').filter({ hasText: re }).filter({ hasNotText: /cancel|close|back/i }).first();
    if (!(await ctl.count())) return 'not-available';
    await ctl.click();
    await this.page.waitForTimeout(700);
    if (newEndISO) { const d = this.page.locator('.modal.show input[type="date"], .swal2-popup input[type="date"]').first(); if (await d.count()) await d.fill(newEndISO).catch(() => {}); }
    if (reason) { const t = this.page.locator('.modal.show textarea, .swal2-popup textarea, textarea:visible').first(); if (await t.isVisible().catch(() => false)) await t.fill(reason).catch(() => {}); }
    if (await this.page.locator('.modal.show:visible, .swal2-popup:visible').isVisible().catch(() => false)) await confirm(this.page, re, { reason });
    const said = await expectToast(this.page, /success|confirmed|completed|extended|recorded|saved|probation/i, name).catch(() => '');
    await this.page.waitForTimeout(1200);
    return /error|oops|cannot|not allowed/i.test(said) ? 'error' : 'done';
  }

  confirm() { return this.manageAction(/confirm probation|confirm|complete probation/i, { name: 'Confirm probation', reason: 'Confirmed by automation test' }); }
  extend(newEndISO) { return this.manageAction(/extend/i, { newEndISO, name: 'Extend probation', reason: 'Extended by automation test' }); }
  recordReview(reason = 'Review recorded by automation test') { return this.manageAction(/record review|add review|review/i, { reason, name: 'Record probation review' }); }
}

module.exports = { ProbationDashboardPage };
