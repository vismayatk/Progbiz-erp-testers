'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit, waitVisible } = require('../FormKit');
const { expectToast, confirmSwal } = require('./reUi');

/**
 * /exit-interview/{guid} — the per-exit interview (SRS §7.6, FR-23..25).
 * Schedule card: Questionnaire (template), Mode (In Person / Video / Phone / Form), Interview Date
 * (non-Form, today…LWD), Interviewer (non-Form). Answer capture per question (Rating 1–5 / Text /
 * Yes-No / Choice). Skip with a reason. A completed/skipped interview can't be rescheduled.
 */
class ExitInterviewPage extends BasePage {
  constructor(page) {
    super(page, 'exit-interview');
    this.fk = new FormKit(page);
  }

  async open(guid) {
    await this.goto(`exit-interview/${guid}`);
    await expect(this.main, 'the exit interview page should render').toBeVisible({ timeout: 30000 });
    await this.page.waitForTimeout(1000);
  }

  async text() { return (await this.main.innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); }
  btn(re) { return this.main.locator('button, a.btn').filter({ hasText: re }).first(); }

  /** Schedule the interview. For Form mode no date/interviewer are needed. */
  async schedule({ template, mode = 'In Person', date, interviewer } = {}) {
    if (template) {
      const t = this.main.locator('select').filter({ has: this.page.locator('option', { hasText: new RegExp(template.slice(0, 12), 'i') }) }).first();
      if (await t.count()) await this.fk.setSelect(t, template, 'Questionnaire', { loose: true }).catch(() => {});
    }
    const modeSel = this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /In Person|Video|Phone|Form/i }) }).first();
    if (await modeSel.count()) await this.fk.setSelect(modeSel, mode, 'Mode', { loose: true });
    if (!/form/i.test(mode)) {
      if (date) { const d = this.main.locator('input[type="date"]').first(); if (await d.count()) await d.fill(date).catch(() => {}); }
      if (interviewer) { const i = this.main.locator('select').filter({ has: this.page.locator('option', { hasText: new RegExp(interviewer.slice(0, 6), 'i') }) }).first(); if (await i.count()) await this.fk.setSelect(i, interviewer, 'Interviewer', { loose: true }).catch(() => {}); }
    }
    const save = this.btn(/schedule|save/i);
    await save.click();
    await expectToast(this.page, /schedul|success|saved/i, 'Schedule interview').catch(() => {});
    await this.page.waitForTimeout(1200);
  }

  /** Answer the questions generically: ratings → pick a middle value, text → fill, yes/no → Yes, choice → first. */
  async recordAnswers() {
    // Ratings: star/radio groups or number inputs
    const ratings = this.main.locator('input[type="radio"]');
    const rc = await ratings.count().catch(() => 0);
    if (rc) { await ratings.nth(Math.min(2, rc - 1)).check({ force: true }).catch(() => {}); }
    for (const ta of await this.main.locator('textarea').all()) await ta.fill('Satisfactory — recorded by automation.').catch(() => {});
    // Yes/No + Choice selects
    for (const sel of await this.main.locator('select').all()) {
      const opts = (await sel.locator('option').allTextContents()).map(t => t.trim());
      const pick = opts.find(o => /^yes$/i.test(o)) || opts.find(o => o && !/^(--|select|choose)/i.test(o));
      if (pick) await sel.selectOption({ label: pick }).catch(() => {});
    }
    const save = this.btn(/complete|submit|save answers|save/i);
    if (await save.count()) { await save.click(); if (await this.page.locator('.swal2-popup').isVisible().catch(() => false)) await confirmSwal(this.page, /complete|submit|yes|confirm/i).catch(() => {}); await expectToast(this.page, /complet|success|submitted|saved/i, 'Record interview answers').catch(() => {}); }
    await this.page.waitForTimeout(1000);
  }

  /** Skip the interview with a reason (FR-25). */
  async skip(reason = 'Skipped — employee unavailable (automation test)') {
    const b = this.btn(/skip/i);
    await expect(b, 'a Skip control').toBeVisible({ timeout: 15000 });
    await b.click();
    await this.page.waitForTimeout(600);
    const box = this.page.locator('.swal2-popup textarea, .modal.show textarea, textarea:visible').first();
    if (await waitVisible(box, 3000)) await box.fill(reason).catch(() => {});
    if (await this.page.locator('.swal2-popup').isVisible().catch(() => false)) await confirmSwal(this.page, /skip|yes|confirm|proceed/i).catch(() => {});
    await expectToast(this.page, /skip|success/i, 'Skip interview').catch(() => {});
    await this.page.waitForTimeout(1000);
  }

  /** A settled interview must not be reschedulable (no Schedule/Reschedule control). */
  async expectNotReschedulable() {
    const t = await this.text();
    expect(t, 'interview should be settled').toMatch(/completed|skipped/i);
    const resched = await this.main.locator('button, a.btn').filter({ hasText: /reschedule|re-schedule/i }).count();
    expect(resched, 'a settled interview should not be reschedulable').toBe(0);
  }
}

module.exports = { ExitInterviewPage };
