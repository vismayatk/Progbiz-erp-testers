'use strict';

/**
 * "Add data once" actions for the linear run — keyed by the `add` name in data/hrmsPages.js.
 *
 * Each action runs on the shared tab right AFTER that page's generic check (so the page is already
 * open — no extra navigation), does its job ONCE, and verifies the result with one fresh load.
 * Everything employee-related uses the run's ONE employee (flows/runEmployee.js), created on the
 * Employee page. Values one action produces for a later one (requisition marker, holiday name,
 * candidate, ticket …) are kept in hrms/.auth/linear-run.json, so a single page can be re-run alone.
 *
 * Ported from the module specs that were already green (Core HR, Recruitment, Onboarding, Leave,
 * Helpdesk, Referral). Payroll, Attendance and Resignation & Exit are BASE ONLY here (page checks,
 * no actions) — teammates own and will push those modules. Safety limits: rewards are never
 * approved/paid, the shared Reward Policy is never edited, and the app's e-mails go only to reserved
 * @example.com test addresses (offer, pre-boarding invite).
 */
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../pages/FormKit');
const { EmployeesPage } = require('../pages/core-hr/EmployeesPage');
const { WorkerDirectoryPage } = require('../pages/core-hr/WorkerDirectoryPage');
const testEmployee = require('../data/testEmployee');
const { person, tagged, lettersOnlyCandidates, firstUnused } = require('../data/naming');
const R = require('./recruitmentFlow');
const L = require('./leaveFlow');
const { withUser } = require('./userSession');
const { saveRunEmployee, updateRunEmployee, requireRunEmployee, credentials } = require('./runEmployee');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const CV = path.join(__dirname, '..', 'fixtures', 'files', 'sample-cv.pdf');

// ── run state shared between actions (survives a worker restart / single-page re-run) ──
const STATE = path.join(__dirname, '..', '.auth', 'linear-run.json');
const state = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf-8')) : {});
const remember = fields => {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ ...state(), ...fields }, null, 2));
};
const need = (key, by) => { const v = state()[key]; expect(v, `"${key}" should have been set earlier in the run by ${by}`).toBeTruthy(); return v; };
const log = m => console.log(`     ↳ ${m}`);

/** One fresh load of `route`, then wait (no repeated reloads) until `text` shows in a VISIBLE element. */
async function expectListed(page, route, text, what) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await expect(page.getByText(text, { exact: false }).filter({ visible: true }).first(),
    `${what} should be listed after a fresh load`).toBeVisible({ timeout: 30000 });
}

async function pickUnusedName(page, base) {
  await page.locator('table tbody tr, .card').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  return firstUnused(lettersOnlyCandidates(base), await page.locator('body').innerText());
}

module.exports = {
  // ═══════════════════════════ Core HR ═══════════════════════════
  async createRunEmployee({ page }) {
    const profile = testEmployee.forRun();
    const po = new EmployeesPage(page);
    const created = await po.createEmployee(profile);
    const row = await po.findEmployeeRow(profile.email, profile.first);
    expect(row, `the register should list the new employee ${profile.display}`).toBeTruthy();
    const emp = { ...created, code: row[1] || created.code };
    expect(emp.code, 'the new employee should get an employee code').toMatch(/^[A-Za-z]+\d+$/);
    saveRunEmployee(emp);
    log(`run employee created: ${emp.display} (${emp.code}), login ${emp.username}, reports to Amit — used by every later page`);
  },

  async findRunEmployeeAndCompleteProfile({ page }) {
    const emp = requireRunEmployee();
    const wd = new WorkerDirectoryPage(page);
    const n = await wd.searchAndWait(emp.code);
    expect(n, `exactly one directory card should match ${emp.code}`).toBe(1);
    const card = await wd.readCard(wd.cardFor(emp.code));
    expect(card.name, 'directory card shows the run employee').toBe(emp.display);
    expect(card.branch, 'directory card shows their branch').toBe(emp.branch);
    expect(card.profileHref, 'directory card links to the profile').toMatch(/\/employee-view\//);
    updateRunEmployee({ profileHref: card.profileHref });
    log(`found ${emp.display} in the Worker Directory (${card.designation}, ${card.branch})`);

    const po = new EmployeesPage(page);
    await po.completeProfile({ ...emp, profileHref: card.profileHref });
    await page.goto(`${po.baseUrl}${card.profileHref}`, { waitUntil: 'domcontentloaded' });
    const basic = page.locator('#basic-info');
    await expect(basic, 'profile shows the Blood Group just saved').toContainText(emp.bloodGroup, { timeout: 30000 });
    await expect(basic, 'profile shows the Nationality just saved').toContainText(new RegExp(emp.nationality, 'i'));
    log(`profile completed: ${emp.department}, ${emp.bloodGroup}, ${emp.nationality}`);
  },

  async createLetterTemplate({ page }) {
    const fk = new FormKit(page);
    const name = tagged('Experience Letter');
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Template/i }).first().click();
    const form = await fk.scope({ ready: '#letterTemplateSubject' });
    await fk.setInput(fk.fieldByLabel(form, 'Template Name', 'input'), name, 'Template Name');
    await fk.setSelect(fk.selectWithOption(form, 'Candidate'), 'Employee', 'Letter is about');
    await fk.setCascade(fk.fieldByLabel(form, 'Type', 'select'), '', 'Type', { index: 1 });
    await fk.setInput(form.locator('#letterTemplateSubject'), 'Experience Certificate', 'Subject');
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save template', successRe: /success|saved|created|added/i });
    await expectListed(page, 'letters/templates', name, `letter template "${name}"`);
    log(`letter template "${name}" saved`);
  },

  async generateLetter({ page }) {
    const fk = new FormKit(page);
    const emp = requireRunEmployee();
    await page.locator('a, button, [role="button"]').filter({ hasText: /^\s*Generate\s*$/i }).first().click().catch(() => {});
    const form = await fk.scope({ ready: 'select' });
    await fk.setSelect(fk.selectWithOption(form, 'Candidate'), 'Employee', 'Letter is about');
    await fk.setSelect(fk.selectWithOption(form, 'Appoinment'), 'Appoinment', 'Template', { loose: true });
    await fk.setSelect(fk.selectWithOption(form, '-- Select branch --'), emp.branch, 'Branch');
    // The run employee, by code (falls back to the first employee if the list shows names only).
    const empSel = fk.selectWithOption(form, '-- Select employee --');
    await expect.poll(async () => empSel.locator('option').count(), { timeout: 20000, message: 'employees should load for the branch' }).toBeGreaterThan(1);
    const opt = (await empSel.locator('option').allTextContents()).find(t => t.includes(emp.code) || t.includes(emp.display));
    if (opt) await fk.setSelect(empSel, opt.trim(), 'Employee'); else await fk.setCascade(empSel, '', 'Employee', { index: 1 });
    const who = await fk.picked(empSel);
    await fk.saveAndConfirm(page.locator('button, a.btn, [role="button"]').filter({ hasText: /^\s*(Generate|Generate Letter|Preview|Download)\s*$/i }).last(),
      { name: 'Generate letter', successRe: /success|generated|ready|download|preview|letter/i });
    await expect(page.getByText(/Letter generated/i).first(), '"Letter generated" confirmation').toBeVisible({ timeout: 20000 });
    await expect(page.locator('button, a').filter({ hasText: /Download/i }).first(), 'Download is offered').toBeVisible({ timeout: 10000 });
    log(`appointment letter generated for ${who} (e-mail left off)`);
  },

  async createDutyHandover({ page }) {
    const fk = new FormKit(page);
    const note = tagged('Covering approvals and HR tasks during annual leave');
    // The run's own new employee goes away — they have no earlier handovers, so dates never conflict.
    const emp = requireRunEmployee();
    const awaySel = fk.selectWithOption(page, '-- Select employee --');
    await expect.poll(async () => awaySel.locator('option').count(), { timeout: 20000, message: 'employees should load' }).toBeGreaterThan(1);
    const awayOpt = (await awaySel.locator('option').allTextContents()).map(t => t.trim()).find(t => t.includes(emp.code) || t === emp.display || t.startsWith(`${emp.display} `));
    expect(awayOpt, `the run employee ${emp.display} should be offered as "Employee going away"`).toBeTruthy();
    await fk.setSelect(awaySel, awayOpt, 'Employee going away');
    const goingAway = await fk.picked(awaySel);
    await fk.setCascade(fk.selectWithOption(page, '-- Select assignee --'), '', 'Assign duties to', { index: 2 });
    const assignee = await fk.picked(fk.selectWithOption(page, '-- Select assignee --'));
    expect(assignee, 'assignee differs from the employee going away').not.toBe(goingAway);
    const offsetDays = 45 + (Date.now() % 300);   // unique far-future window (overlaps are rejected)
    const fmt = d => d.toISOString().slice(0, 10);
    await fk.setInput(page.locator('input[type="date"]').nth(0), fmt(new Date(Date.now() + offsetDays * 864e5)), 'From');
    await fk.setInput(page.locator('input[type="date"]').nth(1), fmt(new Date(Date.now() + (offsetDays + 1) * 864e5)), 'To');
    await fk.setInput(page.getByText('Note', { exact: false }).first().locator('xpath=following::textarea[1]'), note, 'Note');
    const save = page.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first();
    await save.click();
    await page.waitForTimeout(2000);
    const msg = (await page.locator('.swal2-popup, .toast, [role="alert"], .text-danger, .invalid-feedback')
      .evaluateAll(els => els.filter(e => e.getBoundingClientRect().width > 0).map(e => e.innerText.replace(/\s+/g, ' ').trim()))).join(' | ');
    expect(msg, 'the handover save should not be rejected').not.toMatch(/conflict|overlap|already|required|invalid/i);
    const ok = page.locator('.swal2-confirm');
    if (await waitVisible(ok, 2000)) await ok.click().catch(() => {});
    // One fresh load with all list filters on "All" — the newest handover is on page 1.
    await page.goto(`${BASE}/employee-handover`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    const filters = page.locator('select').filter({ has: page.locator('option', { hasText: /^All$/ }) });
    for (let i = 0; i < await filters.count(); i++) await filters.nth(i).selectOption({ label: 'All' }).catch(() => {});
    await expect(page.getByText(note, { exact: false }).first(), 'the new handover is listed').toBeVisible({ timeout: 30000 });
    log(`duty handover ${goingAway} → ${assignee} saved`);
  },

  // ═══════════════════════════ Recruitment ═══════════════════════════
  async raiseAndApproveRequisition({ page }) {
    const fk = new FormKit(page);
    const marker = tagged('Additional Software Tester for Q4 delivery');
    await R.clickLauncher(page, /New Requisition/i);
    const form = await fk.scope({ ready: 'select' });
    await fk.setSelect(fk.selectWithOption(form, R.DEPARTMENT), R.DEPARTMENT, 'Department');
    await fk.setCascade(fk.fieldByLabel(form, 'Designation', 'select'), R.DESIGNATION, 'Designation');
    await fk.setSelect(fk.selectWithOption(form, R.BRANCH), R.BRANCH, 'Branch');
    await fk.setInput(fk.fieldByLabel(form, 'Positions', 'input'), '1', 'Positions');
    await fk.setSelect(fk.selectWithOption(form, 'Full Time Employee'), 'Full Time Employee', 'Employee Type');
    await fk.setSelect(fk.selectWithOption(form, 'Office'), 'Office', 'Work Type');
    await fk.setInput(form.getByText('Business Justification', { exact: false }).first().locator('xpath=following::textarea[1]'), marker, 'Business Justification');
    await form.locator('button').filter({ hasText: /^\s*Submit\s*$/ }).first().click();
    const yes = page.locator('.swal2-popup button').filter({ hasText: /Yes, raise it anyway/i }).first();
    if (await waitVisible(yes, 6000)) await yes.click();   // repeat role → the app's "raise anyway" path
    await expect(form, 'the requisition form closes on submit').toBeHidden({ timeout: 20000 });
    remember({ reqMarker: marker });
    log(`requisition raised ("${marker}")`);
    await R.approveRecruitmentRequest(page, fk, 'Job Requisition', marker);
    await page.goto(`${BASE}/requisition-list`, { waitUntil: 'domcontentloaded' });
    const rows = await R.readRows(page, { withHtml: true });
    expect((rows.find(r => r.html.includes(marker)) || {}).text || '', 'the requisition shows Approved').toMatch(/Approved/);
    log('requisition approved in Recruitment Approvals');
  },

  async openingAndCandidate({ page }) {
    const fk = new FormKit(page);
    // Job opening for the approved role.
    await R.clickLauncher(page, /Add Job Opening/i);
    const form = await fk.scope({ ready: '#designation' });
    await fk.setSelect(form.locator('#designation'), R.DESIGNATION, 'Designation');
    await fk.setSelect(form.locator('#employmentType'), 'FullTime', 'Employment Type');
    await fk.setSelect(form.locator('#department'), R.DEPARTMENT, 'Department');
    await fk.setSelect(form.locator('#status'), 'Open', 'Status');
    await fk.setSelect(form.locator('#vacancyLocation'), 'Office', 'Work Type');
    await fk.setSelect(form.locator('#selectbox').filter({ has: page.locator('option', { hasText: R.BRANCH }) }), R.BRANCH, 'Branch');
    await fk.setInput(fk.fieldByLabel(form, 'Number of Vacancies', 'input'), '1', 'Number of Vacancies');
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save job opening', successRe: /success|saved|created|published|added/i });
    log('job opening created');

    // Candidate (Job Board → Candidates register → Add New) applying to the newest opening.
    let cand = person();
    await R.gotoCandidatesRegister(page);
    for (let i = 0; i < 8 && await R.candidateNameTaken(page, cand.full); i++) cand = person();
    const panel = await R.openAddCandidate(page);
    await fk.setInput(fk.fieldByLabel(panel, 'First Name', 'input'), cand.first, 'First Name');
    await fk.setInput(fk.fieldByLabel(panel, 'Last Name', 'input'), cand.last, 'Last Name');
    await fk.setInput(fk.fieldByLabel(panel, 'Email', 'input'), cand.email, 'Email');
    await fk.setSelect(fk.selectWithOption(panel, 'Male'), cand.gender, 'Gender');
    const code = fk.selectWithOption(panel, 'AFG 93');
    await fk.setSelect(code, 'IND', 'Phone code', { loose: true });
    await fk.setInput(code.locator('xpath=following::input[not(@type="hidden")][1]'), '9' + String(Date.now()).slice(-9), 'Phone number');
    await fk.setSelect(fk.selectWithOption(panel, 'Manual'), 'Manual', 'Source');
    await fk.setSelect(fk.selectWithOption(panel, R.DEPARTMENT), R.DEPARTMENT, 'Department');
    await fk.setCascade(fk.fieldByLabel(panel, 'Designation', 'select'), R.DESIGNATION, 'Designation');
    const apply = fk.fieldByLabel(panel, 'Apply to Job Opening', 'select');
    await expect.poll(async () => (await apply.locator('option').allTextContents()).filter(t => /JOB\d+/.test(t)).length,
      { timeout: 20000, message: 'job openings should load' }).toBeGreaterThan(0);
    const openings = (await apply.locator('option').allTextContents()).map(t => t.trim()).filter(t => /JOB\d+/.test(t));
    const newest = openings.sort((a, b) => Number(b.match(/JOB(\d+)/)[1]) - Number(a.match(/JOB(\d+)/)[1]))[0];
    await fk.setSelect(apply, newest, 'Apply to Job Opening');
    await fk.upload(panel.locator('input[type="file"]').first(), CV, 'Resume');
    await fk.saveButton(panel).click();
    await expect(panel, 'the candidate panel closes after saving').toBeHidden({ timeout: 25000 });
    await R.assertCandidateListed(page, cand.email);
    remember({ rec: { candidateName: cand.full, candidateEmail: cand.email, cand, openingCode: newest.match(/JOB\d+/)[0], roundName: tagged('Technical Round 1') } });
    log(`candidate ${cand.full} applied to ${newest} — listed in the Candidates register`);
  },

  async interviewAndFeedback({ page }) {
    const rec = need('rec', 'Job Board');
    log(`interview round "${rec.roundName}" (${await R.addInterviewRound(page, rec)})`);
    await R.scheduleInterview(page, rec);
    remember({ rec });   // keeps interviewAt
    log(`interview booked for ${R.dtLocal(new Date(rec.interviewAt))} — Scheduled`);
    rec.interviewAt = new Date(rec.interviewAt);
    await R.recordEvaluation(page, rec);
    log('feedback 4/5 Proceed saved — interview Completed');
  },

  async offerApprovedSentAccepted({ page }) {
    const rec = need('rec', 'Job Board');
    await R.createOffer(page, rec);
    log(`offer for ${rec.candidateName} saved as Draft`);
    await R.submitAndApproveOffer(page, rec);
    log('offer approved');
    await R.sendOfferAndRecordAcceptance(page, rec);
    log(`offer e-mailed to ${rec.candidateEmail} and accepted`);
  },

  async preboardingInvite({ page }) {
    const rec = need('rec', 'Job Board');
    await R.sendPreboardingInvite(page, rec);
    log(`pre-boarding invite e-mailed to ${rec.candidateEmail} — Invited`);
  },

  // ═══════════════════════════ Onboarding ═══════════════════════════
  async createOnboardingTemplate({ page }) {
    const fk = new FormKit(page);
    const name = tagged('Software Tester Onboarding');
    await page.locator('a, button').filter({ hasText: /New Template/i }).first().click();
    const nameInput = page.locator('label').filter({ hasText: /^\s*Template Name/ }).locator('xpath=following::input[1]').first();
    await expect(nameInput, 'the template editor opens').toBeVisible({ timeout: 15000 });
    await fk.setInput(nameInput, name, 'Template Name');
    await page.locator('button').filter({ hasText: /Add Stage/i }).first().click();
    await fk.setInput(page.getByPlaceholder('Stage name').first(), 'Day 1 Orientation', 'Stage Name');
    await page.locator('button').filter({ hasText: /Add Task/i }).first().click();
    const task = page.getByPlaceholder('Task name').first();
    await fk.setInput(task, 'Collect signed offer letter and ID proof', 'Task');
    const row = task.locator('xpath=ancestor::tr[1]');
    await fk.setSelect(row.locator('select').first(), 'Reporting Manager', 'Owner');
    await fk.setInput(row.locator('input[type="number"]').first(), '1', 'Due (days after joining)');
    await row.locator('input[type="checkbox"]').first().check();
    await page.locator('button').filter({ hasText: /^\s*Save Template\s*$/i }).first().click();
    await expectListed(page, 'onboarding-templates', name, `onboarding template "${name}"`);
    const card = page.locator('button, .card, a, li').filter({ hasText: name }).filter({ visible: true }).first();
    await expect(card, 'the template card shows 1 stage and 1 task').toContainText(/1 stage\(s\)\s*·\s*1 task\(s\)/);
    log(`onboarding template "${name}" saved with 1 stage and 1 task`);
  },

  async createTrainingCourse({ page }) {
    const fk = new FormKit(page);
    const course = tagged('Workplace Safety Induction');
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Course/i }).first().click();
    const form = await fk.scope({ ready: 'select' });
    await fk.setInput(fk.fieldByLabel(form, 'Course Name', 'input'), course, 'Course Name');
    await fk.setSelect(fk.selectWithOption(form, 'Specific Employee'), 'Self', 'Provider/Instructor');
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save course', successRe: /success|saved|created|added/i });
    await expectListed(page, 'training-courses', course, `training course "${course}"`);
    log(`training course "${course}" saved`);
  },

  // ═══════════════════════════ Leave ═══════════════════════════
  async createLeaveType({ page }) {
    const fk = new FormKit(page);
    const name = await pickUnusedName(page, 'Study Leave');
    await fk.setInput(page.locator('#leavetypename'), name, 'Leave Type Name');
    await fk.saveAndConfirm(fk.saveButton(page.locator('body')), { name: 'Save leave type', successRe: /success|saved|created|added/i });
    await page.goto(`${BASE}/leave-types`, { waitUntil: 'domcontentloaded' });
    const search = page.locator('input[placeholder*="Search leave type" i]').first();
    if (await waitVisible(search, 10000)) await search.fill(name);
    await expect(page.getByText(name, { exact: false }).filter({ visible: true }).first(), `leave type "${name}" is listed`).toBeVisible({ timeout: 30000 });
    log(`leave type "${name}" saved`);
  },

  async createLeavePattern({ page }) {
    const fk = new FormKit(page);
    const name = await pickUnusedName(page, 'Branch Leave Pattern');
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Leave Pattern/i }).first().click();
    const form = await fk.scope({ ready: '#leavepattern' });
    await fk.setInput(form.locator('#leavepattern'), name, 'Leave Pattern Name');
    await fk.setInput(form.locator('input[type="date"]').nth(0), '2026-01-01', 'Effective From');
    await fk.setInput(form.locator('input[type="date"]').nth(1), '2026-12-31', 'Effective To');
    await fk.setInput(form.locator('input[type="number"]').first(), '12', 'Days for first leave type');
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save leave pattern', successRe: /success|saved|created|added/i });
    await expectListed(page, 'leave-patterns', name, `leave pattern "${name}"`);
    log(`leave pattern "${name}" saved`);
  },

  async assignLeavePatternToRunEmployee({ page }) {
    const emp = requireRunEmployee();
    const { types } = await L.assignLeavePattern(page, emp.code);
    log(`Standard Staff assigned to ${emp.display} — leave types: ${types.join(', ')}`);
  },

  async createHoliday({ page }) {
    const fk = new FormKit(page);
    const name = await pickUnusedName(page, 'Company Foundation Day');
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Holiday/i }).first().click();
    const form = await fk.scope({ ready: '#holidayname' });
    await fk.setInput(form.locator('#holidayname'), name, 'Holiday Name');
    await fk.setSelect(fk.selectWithOption(form, 'All employees'), 'All employees', 'Calendar Type');
    await fk.setInput(form.locator('input[type="date"]').nth(0), '2026-12-28', 'From Date');
    await fk.setInput(form.locator('input[type="date"]').nth(1), '2026-12-28', 'To Date');
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save holiday', successRe: /success|saved|created|added/i });
    await expectListed(page, 'holiday-list', name, `holiday "${name}"`);
    remember({ holiday: name });
    log(`holiday "${name}" (28 Dec 2026) saved`);
  },

  async assignHoliday({ page }) {
    const fk = new FormKit(page);
    const holiday = need('holiday', 'Holidays');
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Holiday Assignment/i }).first().click();
    const form = await fk.scope({ ready: '#holidays' });
    await fk.setSelect(form.locator('#selectbox').nth(0), 'Branch', 'Assignment Type');
    await fk.setCascade(form.locator('#selectbox').nth(1), 'Main Branch', 'Branch target');
    await form.locator('#holidays').click();
    const opt = page.locator('[role="option"], .dropdown-item, li, label, .ng-option').filter({ hasText: holiday }).first();
    await expect(opt, `holiday "${holiday}" is selectable`).toBeVisible({ timeout: 10000 });
    await opt.click();
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save holiday assignment', successRe: /success|saved|created|added|assigned/i });
    await expectListed(page, 'holiday-assignment-list', holiday, `holiday assignment "${holiday}"`);
    log(`holiday "${holiday}" assigned to Main Branch`);
  },

  async applyLeaveOnBehalf({ page }) {
    const emp = requireRunEmployee();
    const r = await L.applyOnBehalf(page, emp.code, L.futureWeekdayISO(14));
    log(`1 day Casual Leave applied + approved for ${emp.display} on ${r.day} — balance ${r.before} → ${r.after}`);
  },

  async employeeAppliesManagerApproves({ page, browser, testInfo }) {
    const emp = requireRunEmployee();
    const creds = credentials(emp);
    const reason = tagged('Family function at hometown');
    const day = L.futureWeekdayISO(21);
    let before;
    await withUser(browser, testInfo, creds, async ep => {
      before = await L.myBalance(ep, 'Casual Leave');
      expect(before.available, `${emp.display} should have Casual Leave to apply for`).toBeGreaterThan(0);
      await L.employeeApplies(ep, { type: 'Casual Leave', reason, day });
      expect((await L.myRequestRow(ep, day)).text, 'My Leave Requests shows the request Pending').toMatch(/Casual Leave.*Pending/i);
    });
    log(`${emp.display} signed in and applied for ${day} (Casual ${before.available} available) — Pending`);
    await L.managerApproves(page, emp.first, reason);
    log(`Amit approved it on Leave Approval (row confirmed via View details)`);
    await withUser(browser, testInfo, creds, async ep => {
      expect((await L.myRequestRow(ep, day)).text, 'the employee sees the request Approved').toMatch(/Casual Leave.*Approved/i);
      const after = await L.myBalance(ep, 'Casual Leave');
      expect(after.available, `Casual available ${before.available} → ${before.available - 1}`).toBe(before.available - 1);
      expect(after.used, `Casual used ${before.used} → ${before.used + 1}`).toBe(before.used + 1);
      log(`${emp.display} sees Approved — Casual ${before.available} → ${after.available}`);
    });
  },

  // ═══════════════════════════ Helpdesk ═══════════════════════════
  async raiseTicket({ page }) {
    const fk = new FormKit(page);
    const subject = tagged('Unable to connect to office VPN from home');
    await page.locator('a, button, [role="button"]').filter({ hasText: /New Ticket/i }).first().click();
    const form = await fk.scope({ ready: '#subject' });
    await fk.setInput(form.locator('#subject'), subject, 'Subject');
    await fk.setInput(form.locator('#description'), 'VPN client shows "Connection timed out" since this morning; office network works fine.', 'Description');
    await fk.setCascade(form.locator('#category'), '', 'Category', { index: 1 });
    await fk.setSelect(form.locator('#priority'), 'Medium', 'Priority');
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Submit ticket', successRe: /success|submitted|created|raised|added/i });
    await page.goto(`${BASE}/ess/helpdesk/my-tickets`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('table tbody tr, .ticket-card, [class*="ticket" i]').filter({ hasText: subject }).first();
    await expect(row, 'My Support Tickets lists the new ticket').toBeVisible({ timeout: 30000 });
    const code = ((await row.innerText()).match(/TKT-\d{6}-\d{3}/) || [])[0] || '';
    remember({ ticket: { subject, code } });
    log(`ticket ${code} "${subject}" raised`);
  },

  async ticketLifecycle({ page }) {
    const fk = new FormKit(page);
    const t = need('ticket', 'Support Tickets');
    const needle = t.code || t.subject;
    const openManage = async () => {
      await page.goto(`${BASE}/ess/helpdesk/admin`, { waitUntil: 'domcontentloaded' });
      const search = page.locator('input[placeholder*="Search" i]').first();
      if (await waitVisible(search, 15000)) await search.fill(needle);
      const row = page.locator('table tbody tr').filter({ hasText: needle }).first();
      await expect(row, `the admin list shows ${needle}`).toBeVisible({ timeout: 30000 });
      await row.locator('button, a').filter({ hasText: /Manage/i }).first().click();
      await expect(page, 'the ticket Manage view opens').toHaveURL(/\/helpdesk\/admin\/ticket\//, { timeout: 20000 });
    };
    const statusIs = async re => {
      await page.goto(`${BASE}/ess/helpdesk/admin`, { waitUntil: 'domcontentloaded' });
      const search = page.locator('input[placeholder*="Search" i]').first();
      if (await waitVisible(search, 15000)) await search.fill(needle);
      await expect(page.locator('table tbody tr').filter({ hasText: needle }).first(), `ticket ${needle} shows ${re}`).toContainText(re, { timeout: 30000 });
    };

    await openManage();
    await fk.setSelect(fk.selectWithOption(page, 'In Progress'), 'In Progress', 'New Status', { loose: true });
    await fk.saveAndConfirm(page.locator('button').filter({ hasText: /^\s*Update(\s+Status)?\s*$/i }).first(), { name: 'Update status', successRe: /success|updated|progress|saved/i });
    await statusIs(/In Progress/i);
    log(`${needle} → In Progress`);

    await openManage();
    const ticketUrl = page.url();
    const note = tagged('Checked the VPN gateway logs, account was locked after a password change');
    await page.locator('button').filter({ hasText: /Add Internal Note/i }).first().click();
    await fk.setInput(page.locator('#note'), note, 'Internal Note');
    await page.locator('button').filter({ hasText: /^\s*Add Note\s*$/i }).first().click();
    await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(note).first(), 'the internal note is on the ticket').toBeVisible({ timeout: 30000 });
    log('internal note added');

    await fk.setInput(page.locator('textarea[placeholder*="resolved" i]').first(), 'Unlocked the VPN account and confirmed the user can connect.', 'Resolution Notes');
    await fk.saveAndConfirm(page.locator('button').filter({ hasText: /^\s*Resolve(\s+Ticket)?\s*$/i }).first(), { name: 'Resolve ticket', successRe: /success|resolved|closed|updated/i });
    await statusIs(/Resolved|Closed/i);
    log(`${needle} → Resolved`);
  },

  // ═══════════════════════════ Referral ═══════════════════════════
  async referralToHireAndReward({ page }) {
    const fk = new FormKit(page);
    // Submit (as Amit, the referrer) a new person not already referred or a candidate.
    let who = person();
    for (let i = 0; i < 6; i++) {
      await R.gotoCandidatesRegister(page);
      if (!(await R.candidateNameTaken(page, who.full))) break;
      who = person();
    }
    await page.goto(`${BASE}/ess/referral`, { waitUntil: 'domcontentloaded' });
    await page.locator('a, button, [role="button"]').filter({ hasText: /Refer a Candidate/i }).first().click();
    const form = await fk.scope({ ready: '#ref-phone' });
    await fk.setInput(form.getByPlaceholder('e.g. Priya'), who.first, 'First name');
    await fk.setInput(form.getByPlaceholder('e.g. Sharma'), who.last, 'Last name');
    await fk.setInput(form.getByPlaceholder('name@example.com'), who.email, 'Email');
    await fk.setSelect(fk.selectWithOption(form, 'Male'), who.gender, 'Gender');
    await fk.setSelect(form.locator('#ref-phone').locator('xpath=preceding::select[1]'), 'IND', 'Phone code', { loose: true });
    await fk.setInput(form.locator('#ref-phone'), '9' + String(Date.now()).slice(-9), 'Phone number');
    await fk.setInput(form.getByPlaceholder(/Former colleague/i), 'Former colleague at Infopark, Kochi', 'How do you know the candidate');
    await fk.upload(form.locator('input[type="file"]').first(), CV, 'Resume / CV');
    await form.locator('button, a.btn').filter({ hasText: /Submit Referral/i }).first().click();
    await page.waitForURL(/\/ess\/referral\/detail\//i, { timeout: 30000 });
    log(`referral submitted for ${who.full}`);

    // Admin: assign the newest opening → accept into the pipeline.
    const adminRow = async () => {
      await page.goto(`${BASE}/ess/referral/admin`, { waitUntil: 'domcontentloaded' });
      const s = page.getByPlaceholder(/Candidate, email or referrer/i).first();
      await expect(s, 'referral admin search').toBeVisible({ timeout: 30000 });
      await s.fill(who.email);
      await s.press('Enter').catch(() => {});
      const row = page.locator('table tbody tr').filter({ hasText: who.email }).first();
      await expect(row, `admin list shows ${who.email}`).toBeVisible({ timeout: 30000 });
      return row;
    };
    await (await adminRow()).locator('a, button').filter({ hasText: /Manage/i }).first().click();
    await page.waitForURL(/\/ess\/referral\/admin\/detail\//, { timeout: 20000 });
    const detailUrl = page.url();
    const job = fk.selectWithOption(page, 'Choose an open job');
    const opts = (await job.locator('option').allTextContents()).map(t => t.trim()).filter(t => /JOB\d+/.test(t) && t.includes(R.DESIGNATION));
    const newest = opts.sort((x, y) => Number(y.match(/JOB(\d+)/)[1]) - Number(x.match(/JOB(\d+)/)[1]))[0];
    await fk.setSelect(job, newest, 'Open job');
    await page.locator('button').filter({ hasText: /^\s*Assign\s*$/ }).first().click();
    await expect.poll(async () => (await (await adminRow()).innerText()), { timeout: 60000, intervals: [10000], message: 'the referral should carry the role' }).toContain(R.DESIGNATION);
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('button').filter({ hasText: /Accept & add to pipeline/i }).first().click();
    const popup = page.locator('.swal2-popup').filter({ hasText: /\w/ }).first();
    await expect(popup, 'the app answers the accept').toBeVisible({ timeout: 15000 });
    expect((await popup.innerText()).replace(/\s+/g, ' '), 'accept succeeds').toMatch(/accepted and added to the recruitment pipeline/i);
    await popup.locator('button').filter({ hasText: /^\s*OK\s*$/i }).first().click({ timeout: 5000 }).catch(() => {});
    await expect.poll(async () => (await (await adminRow()).innerText()), { timeout: 60000, intervals: [10000], message: 'the referral should be In Pipeline' }).toContain('In Pipeline');
    log(`referral assigned to ${newest.match(/JOB\d+/)[0]} and accepted — In Pipeline`);

    // The referral follows the ATS: interview → offer accepted → Hired → reward raised.
    const rec = { candidateName: who.full, candidateEmail: who.email, cand: who, openingCode: newest.match(/JOB\d+/)[0], roundName: tagged('Referral Technical Round') };
    await R.addInterviewRound(page, rec);
    await R.scheduleInterview(page, rec);
    await R.recordEvaluation(page, rec);
    log('referred candidate interviewed — feedback saved');
    await R.createOffer(page, rec);
    await R.submitAndApproveOffer(page, rec);
    await R.sendOfferAndRecordAcceptance(page, rec);
    log(`offer approved, e-mailed to ${who.email} and accepted`);
    await expect.poll(async () => (await (await adminRow()).innerText()).replace(/\s+/g, ' '),
      { timeout: 90000, intervals: [10000], message: 'the referral should become Hired with a Pending reward' }).toMatch(/Hired\s+Pending/);
    log('referral → Hired; reward raised automatically (Pending — never approved/paid)');
  },
};
