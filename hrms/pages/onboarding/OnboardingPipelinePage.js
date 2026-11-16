'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit } = require('../FormKit');
const { expectToast, confirm } = require('./onbUi');

/**
 * /onboarding-pipeline — the onboarding pipeline. "Start Onboarding" opens an inline form with a
 * Template select, an Employee select (an EXISTING employee), and an onboarding/joining date, plus
 * "Start". A card/list per in-progress onboarding shows "<name> <designation> <template> N/M tasks"
 * with per-record actions (Complete Probation / Drop). Opening a card shows its onboarding tasks.
 */
class OnboardingPipelinePage extends BasePage {
  constructor(page) {
    super(page, 'onboarding-pipeline');
    this.fk = new FormKit(page);
    this.startBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*Start Onboarding\s*$/i }).first();
  }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Onboarding Pipeline heading').toContainText(/Onboarding Pipeline/i, { timeout: 30000 });
    await expect(this.startBtn, 'the Start Onboarding button').toBeVisible({ timeout: 20000 });
    await this.page.waitForTimeout(800);
  }

  cards() { return this.main.locator('.card, [class*="card" i], tr, .list-group-item').filter({ hasText: /task/i }); }
  async count() { return this.cards().count(); }
  cardFor(name) { return this.main.locator('.card, [class*="card" i], tr, .list-group-item').filter({ hasText: name }).first(); }

  // The Start-Onboarding Employee select is a curated list of eligible (to-be-onboarded) employees.
  employeeSelect() { return this.main.locator('select').filter({ has: this.page.locator('option') }).nth(1); }
  templateSelect() { return this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /Designer|Onboarding|Writer|Creator|Developer/i }) }).first(); }

  /**
   * Start onboarding for an eligible employee. Picks the given employee if named, else the first
   * eligible one; picks a template and date; clicks Start. Returns the employee name onboarded.
   */
  async startOnboarding({ employeeName = '', templateLike = '', dateISO } = {}) {
    await this.startBtn.click();
    await this.page.waitForTimeout(1200);
    // Employee select — the second select on the form; its real options are the eligible employees.
    const empSel = this.employeeSelect();
    await expect(empSel, 'the Employee select in Start Onboarding').toBeVisible({ timeout: 15000 });
    await expect.poll(async () => empSel.locator('option').count(), { timeout: 12000, message: 'eligible employees should load' }).toBeGreaterThan(1);
    const empOpts = (await empSel.locator('option').allTextContents()).map(t => t.trim());
    const emp = (employeeName && empOpts.find(o => o.toLowerCase().includes(employeeName.toLowerCase()))) || empOpts.find(o => o && !/^(--|select|choose)/i.test(o));
    expect(emp, 'an eligible employee to onboard').toBeTruthy();
    await empSel.selectOption({ label: emp });
    await this.page.waitForTimeout(400);
    // Template select — pick templateLike or the first real template.
    const tplSel = this.templateSelect();
    if (await tplSel.count()) {
      const tplOpts = (await tplSel.locator('option').allTextContents()).map(t => t.trim());
      const tpl = (templateLike && tplOpts.find(o => o.toLowerCase().includes(templateLike.toLowerCase()))) || tplOpts.find(o => o && !/^(--|select|all templates)/i.test(o));
      if (tpl) await tplSel.selectOption({ label: tpl });
    }
    if (dateISO) { const d = this.main.locator('input[type="date"]').first(); if (await d.count()) await d.fill(dateISO).catch(() => {}); }
    await this.page.waitForTimeout(400);
    const start = this.main.locator('button, a.btn').filter({ hasText: /^\s*Start\s*$/i }).filter({ hasNotText: /onboarding|probation/i }).first();
    await expect(start, 'the Start button').toBeVisible({ timeout: 10000 });
    await start.click();
    if (await this.page.locator('.swal2-popup:visible, .modal.show:visible').filter({ hasText: /sure|confirm|start|already/i }).isVisible().catch(() => false)) await confirm(this.page, /start|begin|yes|confirm|ok/i).catch(() => {});
    await expectToast(this.page, /start|onboard|success|created|added|already/i, 'Start onboarding').catch(() => {});
    await this.page.waitForTimeout(1500);
    return emp;
  }

  /** Open an employee's onboarding record (card) to its task view. */
  async openOnboarding(name) {
    const card = this.cardFor(name);
    await expect(card, `onboarding card for "${name}"`).toBeVisible({ timeout: 15000 });
    await card.click();
    await this.page.waitForTimeout(1500);
  }

  /** Complete the onboarding tasks shown for the opened employee (HR can complete). Returns count settled. */
  async completeOpenTasks() {
    let settled = 0;
    for (let pass = 0; pass < 12; pass++) {
      const btn = this.page.locator('button, a.btn').filter({ hasText: /Mark Done|mark as done|^\s*Complete\s*$|complete task/i }).first();
      if (!(await btn.count())) break;
      await btn.click().catch(() => {});
      await this.page.waitForTimeout(500);
      if (await this.page.locator('.modal.show:visible, .swal2-popup:visible').isVisible().catch(() => false)) await confirm(this.page, /done|complete|yes|confirm|mark/i).catch(() => {});
      await this.page.waitForTimeout(800);
      settled++;
    }
    return settled;
  }
}

module.exports = { OnboardingPipelinePage };
