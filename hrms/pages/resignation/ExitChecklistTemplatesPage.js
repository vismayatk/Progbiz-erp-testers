'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit } = require('../FormKit');
const { expectToast } = require('./reUi');

/**
 * /exit-checklist-templates — Exit Checklist Templates (SRS §7.5, FR-17..19).
 * List: "New Template", search, grid Name | Tasks | Action. New Template form: Template Name
 * (unique per tenant), For Designation (optional), Active, and ≥1 task (Title, Kind [KT / Asset
 * Return / Department Clearance / Other], Owner [Employee / Reporting Manager / Department /
 * Designation / Specific Employee], Due days [negative = before LWD], Mandatory). A template used by
 * any exit becomes undeletable (retire via Inactive).
 */
class ExitChecklistTemplatesPage extends BasePage {
  constructor(page) {
    super(page, 'exit-checklist-templates');
    this.fk = new FormKit(page);
    this.newBtn = this.main.locator('button, a.btn').filter({ hasText: /New Template/i }).first();
    this.search = this.main.locator('input[placeholder*="template name" i], input[placeholder*="Search" i]').first();
  }

  rowByName(name) { return this.gridRows.filter({ hasText: name }).first(); }
  formScope() { return this.page.locator('.modal.show, .offcanvas.show, [role="dialog"]').first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Exit Checklist Templates heading').toContainText(/Exit Checklist Templates/i, { timeout: 30000 });
    await expect(this.newBtn, 'the New Template button').toBeVisible({ timeout: 20000 });
  }

  /**
   * Create a checklist template. The form is INLINE (not a modal): Template Name, For Designation,
   * Active, Description, then four KIND SECTIONS (Knowledge Transfer / Department Clearance / Asset
   * Return / Other) each with an "Add" button and a Task | Owner | Due (days) | Mandatory table, and
   * "Save Template". A task of kind K is added by clicking Add inside the K section.
   */
  async createTemplate(spec) {
    await this.newBtn.click();
    await this.page.waitForTimeout(1000);
    const root = this.main;
    // Name: the input immediately after the "Template Name" label (NOT the grid search box).
    const name = root.getByText(/Template Name/i).first().locator('xpath=following::input[1]').first();
    await this.fk.setInput(name, spec.name, 'Template Name');
    if (spec.forDesignation) {
      const d = root.locator('select').filter({ has: this.page.locator('option', { hasText: new RegExp(spec.forDesignation, 'i') }) }).first();
      if (await d.count()) await this.fk.setSelect(d, spec.forDesignation, 'For Designation', { loose: true }).catch(() => {});
    }
    for (const t of spec.tasks) {
      await this._addTaskToSection(t);
    }
    const save = root.locator('button').filter({ hasText: /Save Template/i }).first();
    await save.click();
    await expectToast(this.page, /success|saved|created|added/i, 'Create checklist template').catch(() => {});
    await this.page.waitForTimeout(1200);
    await this.goto();
    if (await this.search.count()) { await this.search.fill(spec.name).catch(() => {}); await this.page.waitForTimeout(1000); }
    await expect(this.rowByName(spec.name), `checklist template "${spec.name}" should be listed`).toBeVisible({ timeout: 20000 });
  }

  /** Add one task to its kind section: click the section's Add, fill the new row. */
  async _addTaskToSection(t) {
    const root = this.main;
    // the section heading carries the kind; its Add button and its table follow it in the DOM.
    const heading = root.getByText(new RegExp(`^\\s*${t.kind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')).first();
    await expect(heading, `the "${t.kind}" task section`).toBeVisible({ timeout: 10000 });
    const add = heading.locator('xpath=following::button[contains(normalize-space(.),"Add")][1]');
    await add.click();
    await this.page.waitForTimeout(600);
    const table = heading.locator('xpath=following::table[1]');
    const row = table.locator('tbody tr').filter({ has: this.page.locator('input, select') }).last();
    await expect(row, `a new task row in "${t.kind}"`).toBeVisible({ timeout: 8000 });
    const title = row.locator('input[type="text"], input:not([type])').first();
    if (await title.count()) await title.fill(t.title).catch(() => {});
    const owner = row.locator('select').first();
    if (await owner.count()) await this.fk.setSelect(owner, t.owner, 'Owner', { loose: true }).catch(() => {});
    const due = row.locator('input[type="number"]').first();
    if (await due.count() && t.due != null) await due.fill(String(t.due)).catch(() => {});
    if (t.mandatory) { const m = row.locator('input[type="checkbox"]').last(); if (await m.count() && !(await m.isChecked().catch(() => false))) await m.click({ force: true }).catch(() => {}); }
    await this.page.waitForTimeout(200);
  }

  /** After the template is used by an exit, its Delete must be disabled (FR-19). Best-effort. */
  async expectUndeletableWhenUsed(name) {
    await this.goto();
    if (await this.search.count()) { await this.search.fill(name).catch(() => {}); await this.page.waitForTimeout(900); }
    const row = this.rowByName(name);
    await expect(row, `template row "${name}"`).toBeVisible({ timeout: 15000 });
    const del = row.locator('button, a').filter({ hasText: /delete/i }).or(row.locator('[title*="delete" i], i[class*="delete" i], i[class*="bin" i]')).first();
    if (await del.count()) {
      const disabled = await del.isDisabled().catch(() => false);
      const title = (await del.getAttribute('title').catch(() => '')) || '';
      expect(disabled || /used|inactive|cannot|deactivate/i.test(title), `a used template "${name}" should not be deletable`).toBeTruthy();
    }
  }
}

module.exports = { ExitChecklistTemplatesPage };
