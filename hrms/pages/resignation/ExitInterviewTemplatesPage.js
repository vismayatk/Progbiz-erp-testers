'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit } = require('../FormKit');
const { expectToast } = require('./reUi');

/**
 * /exit-interview-templates — Exit Interview Templates (SRS §7.6, FR-23).
 * List: "New Template", grid Name | Questions | Action. New Template form: Template Name (unique),
 * Default / Mandatory / Active, and ≥1 question (Text, Kind [Rating 1–5 / Text / Yes-No / Choice];
 * Choice needs a comma-separated options list).
 */
class ExitInterviewTemplatesPage extends BasePage {
  constructor(page) {
    super(page, 'exit-interview-templates');
    this.fk = new FormKit(page);
    this.newBtn = this.main.locator('button, a.btn').filter({ hasText: /New Template/i }).first();
    this.search = this.main.locator('input[placeholder*="Search" i]').first();
  }

  rowByName(name) { return this.gridRows.filter({ hasText: name }).first(); }
  formScope() { return this.page.locator('.modal.show, .offcanvas.show, [role="dialog"]').first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Exit Interview Templates heading').toContainText(/Exit Interview Templates/i, { timeout: 30000 });
    await expect(this.newBtn, 'the New Template button').toBeVisible({ timeout: 20000 });
  }

  /**
   * Create an interview template. Inline form: Template Name, flags #isdefault / #ismandatory
   * ("Blocks exit closure") / #isactive, then a Questions section — each question is a block of
   * Question (textarea), Category, Answer Type (<select> Rating (1–5) / Text / Yes / No / Choice),
   * Options (comma list, Choice only), Order, Required (#qreq{i}). "Add Question" adds a block.
   * The i-th question's controls are the i-th occurrence of each control.
   */
  async createTemplate(spec) {
    await this.newBtn.click();
    await this.page.waitForTimeout(1000);
    const root = this.main;
    const name = root.getByText(/Template Name/i).first().locator('xpath=following::input[1]').first();
    await this.fk.setInput(name, spec.name, 'Template Name');
    const setFlag = async (id, on) => {
      if (on === undefined) return;
      const chk = this.page.locator(id);
      if (await chk.count()) { const now = await chk.isChecked().catch(() => false); if (now !== on) await chk.click({ force: true }).catch(() => {}); }
    };
    await setFlag('#isdefault', spec.isDefault);
    await setFlag('#ismandatory', spec.mandatory);
    await setFlag('#isactive', spec.active);
    // Question blocks are repeated controls in the content area; the i-th question uses the i-th of each.
    const qText = i => root.locator('textarea').nth(i);
    const qType = i => root.locator('select').filter({ has: this.page.locator('option', { hasText: /Rating \(1/i }) }).nth(i);
    const qOpts = i => root.locator('input[placeholder*="option a" i]').nth(i);
    for (let i = 0; i < spec.questions.length; i++) {
      const q = spec.questions[i];
      // The form starts with NO question rows ("No questions yet — use Add Question"), so add one
      // before every question (including the first).
      await root.locator('button, a.btn').filter({ hasText: /Add Question/i }).first().click();
      await this.page.waitForTimeout(700);
      const ta = qText(i);
      await ta.scrollIntoViewIfNeeded().catch(() => {});
      await ta.fill(q.text, { timeout: 8000 });
      // Set the Answer Type (this also enables the Options box for Choice).
      await this.fk.setSelect(qType(i), q.kind, 'Answer Type', { loose: true });
      if (/choice/i.test(q.kind) && q.options) {
        const opt = qOpts(i);
        await expect(opt, 'the Options box should enable for a Choice question').toBeEnabled({ timeout: 8000 });
        await opt.fill(q.options, { timeout: 8000 });
      }
    }
    await root.locator('button').filter({ hasText: /Save Template/i }).first().click();
    await expectToast(this.page, /success|saved|created|added/i, 'Create interview template').catch(() => {});
    await this.page.waitForTimeout(1200);
    await this.goto();
    if (await this.search.count()) { await this.search.fill(spec.name).catch(() => {}); await this.page.waitForTimeout(900); }
    await expect(this.rowByName(spec.name), `interview template "${spec.name}" should be listed`).toBeVisible({ timeout: 20000 });
  }
}

module.exports = { ExitInterviewTemplatesPage };
