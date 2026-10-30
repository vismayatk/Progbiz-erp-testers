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
const { MyDocumentsPage } = require('../pages/ess/MyDocumentsPage');
const { EmployeeProfilePage } = require('../pages/core-hr/EmployeeProfilePage');
const testEmployee = require('../data/testEmployee');
const { person, tagged, lettersOnlyCandidates, firstUnused, RUN_ID } = require('../data/naming');
const R = require('./recruitmentFlow');
const L = require('./leaveFlow');
const { withUser, withVisitor } = require('./userSession');
const { saveRunEmployee, updateRunEmployee, requireRunEmployee, credentials } = require('./runEmployee');
const { buildEmployeeImportXlsx } = require('./employeeImport');

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

/** Assessments → the assignment's "Submissions & evaluation" → the candidate's row. */
async function openSubmission(page, title, candidateName) {
  await page.goto(`${BASE}/assessment-list`, { waitUntil: 'domcontentloaded' });
  const row = page.locator('table tbody tr').filter({ hasText: title }).first();
  await expect(row, `assignment "${title}" is listed`).toBeVisible({ timeout: 30000 });
  await row.locator('[title*="Submissions"]').click();
  const modal = page.locator('.modal.show').last();
  await expect(modal, 'Submissions & evaluation opens').toBeVisible({ timeout: 15000 });
  const sub = modal.locator('tbody tr').filter({ hasText: candidateName }).first();
  await expect(sub, `${candidateName} is listed on the assignment`).toBeVisible({ timeout: 20000 });
  return sub;
}

/** As the candidate's interview panel (Amit): score the take-home assignment + feedback → Evaluated. */
async function evaluateAssessment(page, title, candidateName) {
  const fk = new FormKit(page);
  const sub = await openSubmission(page, title, candidateName);
  await fk.setInput(sub.locator('input[type="number"]').first(), '85', 'Assessment score');
  await fk.setInput(sub.getByPlaceholder('Your feedback').first(), 'Clear, well-structured test cases with good negative coverage.', 'Assessment feedback');
  await sub.locator('button').filter({ hasText: /^\s*Evaluate\s*$/ }).first().click();
  const ok = page.locator('.swal2-popup button').filter({ hasText: /^\s*(Yes.*|Evaluate|Confirm|OK)\s*$/i }).first();
  if (await waitVisible(ok, 4000)) await ok.click();
  await expect(sub, 'the candidate shows Evaluated').toContainText(/Evaluated/, { timeout: 30000 });
  await expect(sub, 'the score 85 is recorded').toContainText(/85/);
  await page.keyboard.press('Escape').catch(() => {});
}

/** Show the largest available page size on a paginated list, so later-page rows become visible. */
async function maximizePageSize(page) {
  const size = page.locator('select').filter({ has: page.locator('option', { hasText: /^\s*10\s*$/ }) }).last();
  if (await size.count()) {
    const sizes = (await size.locator('option').allTextContents()).map(t => t.trim()).filter(t => /^\d+$/.test(t));
    const biggest = sizes.sort((a, b) => Number(b) - Number(a))[0];
    if (biggest) { await size.selectOption({ label: biggest }).catch(() => {}); await page.waitForTimeout(2000); }
  }
}

async function pickUnusedName(page, base) {
  await page.locator('table tbody tr, .card').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  // Lists are paginated — show the largest page size first, so names on later pages count as taken.
  await maximizePageSize(page);
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
    // Address keys added after some run employees were saved — default them from testEmployee.details.
    const { presentState, presentCity, permanentSameAsPresent } = testEmployee.details;
    Object.assign(emp, { presentState, presentCity, permanentSameAsPresent, ...emp });
    // ONE load of the (heavy) Edit form for everything we enter, in its tab order:
    // Basic Details → Documents → Bank Details → Emergency. No reload between tabs.
    const extras = testEmployee.profileExtras(emp);
    const full = { ...emp, profileHref: card.profileHref,
      bank: emp.bank || extras.bank, emergency: emp.emergency || extras.emergency, documents: emp.documents || extras.documents };
    updateRunEmployee({ bank: full.bank, emergency: full.emergency, documents: full.documents });

    await po.completeProfile(full);
    log(`Basic Details: ${full.department}, ${full.bloodGroup}, ${full.nationality}, address ${full.presentCity}, ${full.presentState} (permanent = present)`);
    const hrDoc = full.documents.hr;
    const docVia = await po.uploadDocument(full, hrDoc);
    log(`Documents: ${hrDoc.type} no. ${hrDoc.number} ${docVia} by HR`);
    const bankVia = await po.fillBankDetails(full);
    log(`Bank Details: saved (${bankVia}) — ${full.bank.bankName}, a/c ${full.bank.accountNumber}, IFSC ${full.bank.ifsc}`);
    const emgVia = await po.addEmergencyContact(full);
    log(`Emergency: ${full.emergency.first} ${full.emergency.last} (${full.emergency.relationship}, ${full.emergency.phone}) ${emgVia}`);

    // ONE load of the READ-ONLY profile view — a separate page read fresh from the server, so it proves
    // everything above persisted. Tab by tab in its on-screen order.
    const view = new EmployeeProfilePage(page);
    await view.open(full.profileHref);
    await view.verifyBasic(full);
    await view.verifyAddress(full);
    await view.verifyBank(full);
    await view.verifyDocuments([hrDoc]);
    await view.verifyEmergency(full);
    const histRows = await view.verifyHistory(['Bank details changed', 'Emergency contact', 'Document updated']);
    await view.verifyLifecycleJoined(full);
    log(`profile view ✔ Basic · Address (${full.presentCity}, ${full.presentState}; permanent = present) · Bank · Documents · Emergency · History (${histRows} events) · Lifecycle (Joined)`);
    // Tabs that fill later in the employee's life — confirm they render; their data comes from later steps / modules.
    for (const [id, name] of [['probation-tab', 'Probation'], ['salary-details-tab', 'Salary History'], ['bgv-tab', 'Background Verification'], ['attendance-history-tab', 'Attendance History']]) {
      const t = await view.readTab(id);
      expect(t, `the ${name} tab should render`).not.toBe('');
      log(`profile view · ${name}: "${t.slice(0, 70)}"`);
    }
  },

  // My Workspace → Documents (/ess/documents): the run employee signs in and uploads their own document
  // (a non-ID type with a random certificate number), sees it in My Documents, and HR then sees the
  // same document on the employee's Core HR → Documents tab.
  async employeeUploadsDocument({ page, browser, testInfo }) {
    const emp = requireRunEmployee();
    if (!emp.documents) {   // generate once and keep it, so the saved number is the uploaded one
      emp.documents = testEmployee.profileExtras(emp).documents;
      updateRunEmployee({ documents: emp.documents });
    }
    const doc = emp.documents.self;
    let via, row;
    await withUser(browser, testInfo, credentials(emp), async ep => {
      const mine = new MyDocumentsPage(ep);
      via = await mine.uploadDocument(doc);
      row = await mine.verifyListed(doc, { fresh: false });   // same page — HR's view below proves it persisted
    });
    log(`${emp.display} signed in and ${via} ${doc.type} no. ${doc.number} — in My Documents: "${row.slice(0, 90)}"`);
    const po = new EmployeesPage(page);
    const hrRow = await po.verifyDocumentListed(emp, doc);
    log(`HR sees it on ${emp.display}'s Core HR → Documents tab: "${hrRow.slice(0, 90)}"`);

    // HR reviews the employee's upload and verifies it.
    const decided = await po.verifyDocument(emp, doc);
    log(`HR ${decided} ${doc.type} no. ${doc.number}`);

    // Profile view → Documents: both documents listed, the employee's one now Verified.
    const view = new EmployeeProfilePage(page);
    await view.open(emp.profileHref);
    const rows = await view.verifyDocuments([emp.documents.hr, doc].filter(Boolean));
    expect(rows[doc.number], `the profile view should show ${doc.type} as Verified`).toMatch(/Verified/i);
    log(`profile view · Documents: ${Object.keys(rows).length} listed — ${doc.type} Verified`);
  },

  // Employee Excel Import (/upload-employee): build a valid 20-column sheet, upload it, and confirm
  // the imported person lands in the employee register. One extra employee per run, disposable.
  async importEmployeeExcel({ page, testInfo }) {
    const { xlsxPath, employee } = await buildEmployeeImportXlsx(testInfo.outputPath('employee-import'));
    log(`importing ${employee.display} <${employee.email}> via Excel (${employee.designation}, ${employee.department}, branch ${employee.branch})`);

    await page.goto(`${BASE}/upload-employee`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});

    // Page-level Branch (native <select id=emp-branch>): there is no Branch column — every row is
    // created in the branch chosen here, so set it to the employee's branch.
    const branchSel = page.locator('#emp-branch');
    if (await waitVisible(branchSel, 5000)) {
      await branchSel.selectOption({ label: employee.branch }).catch(() => {});
    }

    // Attach the workbook to the (possibly hidden) file input, then Upload.
    const fileInput = page.locator('#emp-upload-excel, input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles(xlsxPath);
    log(`attached ${path.basename(xlsxPath)}`);

    const uploadBtn = page.locator('button, a, [role="button"]').filter({ hasText: /^\s*Upload\s*$/i }).first();
    await expect(uploadBtn, 'the Upload button is present').toBeVisible({ timeout: 10000 });
    await uploadBtn.click();

    // The result is a SweetAlert: success "You've done it!", or the format-mismatch error. Read it,
    // fail loudly on a rejection, then dismiss.
    const popup = page.locator('.swal2-popup').first();
    if (await waitVisible(popup, 20000)) {
      const msg = (await popup.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      log(`upload reported: "${msg.slice(0, 90)}"`);
      expect(msg, 'the import must not be rejected for a format mismatch').not.toMatch(/does not match the required format|invalid|failed/i);
      await popup.locator('button').filter({ hasText: /^\s*(OK|Close|Done)\s*$/i }).first().click().catch(() => {});
    }

    // Persistence proof: the import runs "in the background", so poll the register for the new row
    // (by the employee's unique e-mail). Re-submit once in case the row is added after the first
    // search settles.
    const po = new EmployeesPage(page);
    let row = await po.findEmployeeRow(employee.email, employee.first, 45000);
    if (!row) row = await po.findEmployeeRow(employee.email, employee.first, 30000);
    expect(row, `the register should list the imported employee ${employee.display} <${employee.email}>`).toBeTruthy();
    log(`imported employee ${employee.display} appears in the register${row[1] ? ` (${row[1]})` : ''}`);
  },

  // Document Compliance (/document-compliance): a read-only report. Run the "Missing Mandatory"
  // and "Expiring" views and verify each returns its own result set / columns.
  async documentComplianceReport({ page }) {
    await page.goto(`${BASE}/document-compliance`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    const headers = async () => (await page.locator('table th').allInnerTexts().catch(() => [])).join(' | ');

    // Default / Missing Mandatory: the compliance grid lists employees with a Document Type + State.
    const mm = page.locator('button, a, [role="button"]').filter({ hasText: /^\s*Missing Mandatory\s*$/i }).first();
    if (await waitVisible(mm, 8000)) { await mm.click().catch(() => {}); await page.waitForTimeout(1500); }
    await expect(page.locator('table tbody tr').first(), 'the compliance report lists rows').toBeVisible({ timeout: 30000 });
    const mmHeads = await headers();
    expect(mmHeads, 'the report shows the Document Type and State columns').toMatch(/Document Type/i);
    expect(mmHeads, 'the report shows a State column').toMatch(/State/i);
    await expect(page.locator('table tbody').getByText(/Missing/i).first(),
      'Missing Mandatory lists employees with a missing document').toBeVisible({ timeout: 20000 });
    const missingCount = await page.locator('table tbody tr').count();
    log(`Missing Mandatory report: ${missingCount} row(s) on page · columns [${mmHeads}]`);

    // Expiring: the grid switches to expiry columns (Expiry / Days / Bucket).
    const ex = page.locator('button, a, [role="button"]').filter({ hasText: /^\s*Expiring\s*$/i }).first();
    await expect(ex, 'the Expiring report toggle is present').toBeVisible({ timeout: 10000 });
    await ex.click();
    await page.waitForTimeout(2000);
    const exHeads = await headers();
    expect(exHeads, 'the Expiring report shows expiry columns').toMatch(/Expiry|Bucket|Days/i);
    log(`Expiring report columns [${exHeads}]`);
  },

  // HR Reminders (/hrms/reminder-rules): tenant-wide reminder config. Toggle one rule's "active"
  // flag, Save (asserting the server response), confirm it persists, then RESTORE the original —
  // channel is left on In-app, so no e-mails are sent and the tenant config is unchanged at the end.
  async configureReminderRule({ page }) {
    const RULE = 'Birthday';                                // a low-risk, always-present rule
    const goto = async () => {
      await page.goto(`${BASE}/hrms/reminder-rules`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await expect(page.locator(`#rr-active-${RULE}`), `the ${RULE} reminder rule is listed`).toBeVisible({ timeout: 30000 });
    };
    const rowSave = () => page.locator(`tr:has(#rr-active-${RULE})`).locator('button, a').filter({ hasText: /^\s*Save\s*$/i }).first();
    const saveAndAssert = async () => {
      const [resp] = await Promise.all([
        page.waitForResponse(r => /save-reminder-rule/i.test(r.url()) && r.request().method() === 'POST', { timeout: 15000}),
        rowSave().click(),
      ]);
      expect(resp.status(), 'saving the reminder rule returns 200').toBe(200);
      return resp;
    };

    await goto();
    const original = await page.locator(`#rr-active-${RULE}`).isChecked();
    const target = !original;
    log(`${RULE} reminder currently active=${original}; toggling to ${target} and back`);

    try {
      // Flip active, save, and confirm it persisted after a reload.
      await page.locator(`#rr-active-${RULE}`).setChecked(target);
      await saveAndAssert();
      await goto();
      expect(await page.locator(`#rr-active-${RULE}`).isChecked(),
        `${RULE} reminder active should persist as ${target} after reload`).toBe(target);
      log(`${RULE} reminder saved and persisted as active=${target}`);
    } finally {
      // Restore the original state no matter what.
      await goto();
      if ((await page.locator(`#rr-active-${RULE}`).isChecked()) !== original) {
        await page.locator(`#rr-active-${RULE}`).setChecked(original);
        await saveAndAssert();
        log(`${RULE} reminder restored to active=${original}`);
      }
    }
  },

  // Approval Config (/approval/config): build a NEW approval workflow (name + Leave Request type +
  // one "Report Person" level) and Save it. It is NOT marked default and NOT assigned, so it is
  // purely additive — it governs nothing live and leaves existing approvals untouched.
  async setupApprovalWorkflow({ page }) {
    const name = tagged('QA Leave Approval');
    await page.goto(`${BASE}/approval/config`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});

    await page.getByPlaceholder('e.g. Long Leave Approval').first().fill(name);
    const typeSel = page.locator('select').filter({ has: page.locator('option', { hasText: '-- Select type --' }) }).first();
    await typeSel.selectOption({ label: 'Leave Request' });

    // Add one approval level = the employee's Report Person (no secondary picker needed).
    await page.locator('button, a, [role="button"]').filter({ hasText: /\+\s*Add level/i }).first().click();
    const approverSel = page.locator('select').filter({ has: page.locator('option', { hasText: '-- Select approver --' }) }).first();
    await expect(approverSel, 'a level row with an approver select was added').toBeVisible({ timeout: 10000 });
    await approverSel.selectOption({ label: 'Report Person' });

    // Save the workflow and accept any confirm.
    await page.locator('button, a, [role="button"]').filter({ hasText: /Save Workflow/i }).first().click();
    const ok = page.locator('.swal2-popup button, .modal.show button').filter({ hasText: /^\s*(Yes.*|Save|OK|Confirm|Done)\s*$/i }).first();
    if (await waitVisible(ok, 5000)) await ok.click();
    const popup = page.locator('.swal2-popup').first();
    if (await waitVisible(popup, 8000)) {
      const msg = (await popup.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      expect(msg, 'the workflow save must not report an error').not.toMatch(/error|failed|invalid|required/i);
      await popup.locator('button').filter({ hasText: /^\s*(OK|Close|Done)\s*$/i }).first().click().catch(() => {});
    }

    // Verify the new workflow is listed (filter the table by its name).
    await page.goto(`${BASE}/approval/config`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    const nameFilter = page.locator('#filter-wf-name');
    if (await waitVisible(nameFilter, 5000)) { await nameFilter.fill('QA Leave Approval'); await page.waitForTimeout(1200); }
    await expect(page.getByText(name, { exact: false }).filter({ visible: true }).first(),
      `the new approval workflow "${name}" should be listed`).toBeVisible({ timeout: 20000 });
    log(`approval workflow created: "${name}" (Leave Request · Report Person) — not default, not assigned`);
  },

  // Pipeline Board (/recruitment-pipeline): a Kanban that REFLECTS the ATS — the standard stages move
  // automatically as the candidate progresses (our recruitment flow drives that); manual drag is only
  // for custom stages. So we verify the board mirrors our own candidate: filter to our opening and
  // confirm the self-applicant shows on the board, and report which stage column holds them.
  async pipelineBoardReflectsCandidate({ page }) {
    const job = need('publishedOpening', 'Job Board');
    const self = need('selfApplicant', 'Job Applications');
    await page.goto(`${BASE}/recruitment-pipeline`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});

    // Filter to our vacancy (option text looks like "Software Engineer (JOB0093)").
    const vac = page.locator('select').filter({ has: page.locator('option', { hasText: job }) }).first();
    await expect(vac, 'the vacancy filter is present').toBeVisible({ timeout: 20000 });
    const opt = (await vac.locator('option').allTextContents()).map(t => t.trim()).find(t => t.includes(job));
    expect(opt, `the board should offer our opening ${job} in the vacancy filter`).toBeTruthy();
    await vac.selectOption({ label: opt });
    await page.waitForTimeout(2500);

    // Our self-applicant must appear on the board for this vacancy.
    const card = page.locator('[class*="card" i]').filter({ hasText: self.name }).first();
    await expect(card, `self-applicant ${self.name} should appear on the pipeline board for ${job}`).toBeVisible({ timeout: 30000 });

    // Best-effort: report which stage column holds them.
    let stage = 'unknown';
    for (const s of ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'ON HOLD']) {
      const col = page.locator('[class*="pipeline" i]').filter({ hasText: new RegExp(`^\\s*${s}\\b`, 'i') })
        .filter({ has: page.locator('[class*="card" i]').filter({ hasText: self.name }) });
      if (await col.count()) { stage = s; break; }
    }
    log(`pipeline board for ${job} shows self-applicant ${self.name} in stage ${stage}`);
  },

  // Merge Fields (/letters/fields): create a custom letter merge field. "Where the value comes from"
  // is a cascading select that only populates after "Letter is about" is chosen.
  async createMergeField({ page }) {
    const fk = new FormKit(page);
    const token = `QaAuto${RUN_ID}`;                       // tokens are unique, alphanumeric (e.g. DateOfJoining)
    const label = `QA Auto Field ${RUN_ID}`;
    await page.locator('button, a, [role="button"]').filter({ hasText: /New Field/i }).first().click();
    const form = await fk.scope({ ready: 'input' });
    await fk.setInput(form.getByPlaceholder(/DateOfJoining/i).first(), token, 'Token Name');
    await fk.setInput(form.getByPlaceholder(/Date of joining/i).first(), label, 'Label');
    const selects = form.locator('select');
    await selects.nth(0).selectOption({ label: 'Employee' });   // Letter is about
    await selects.nth(1).selectOption({ label: 'Text' });       // Type
    // "Where the value comes from" populates after Employee is chosen — wait for a real option.
    const vs = selects.nth(2);
    let chosen = '';
    await expect.poll(async () => {
      const opts = await vs.locator('option').allTextContents();
      const real = opts.map(t => t.trim()).find(t => t && !/choose|select/i.test(t));
      if (real) { chosen = real; return true; }
      return false;
    }, { timeout: 15000, intervals: [700] }).toBe(true);
    await vs.selectOption({ label: chosen });
    await fk.setInput(form.getByPlaceholder(/resolves to/i).first(), 'QA automation custom merge field', 'Description').catch(() => {});
    await fk.saveAndConfirm(fk.saveButton(form, /save/i), { name: 'Save Field' });
    await expectListed(page, 'letters/fields', token, 'the merge field');
    log(`merge field created: ${token} ("${label}" · Employee · Text · ${chosen})`);
  },

  // Letterheads (/letters/letterheads): create a letterhead with a tagged name; layout fields keep
  // their defaults (A4, etc.). Not set as default.
  async createLetterhead({ page }) {
    const fk = new FormKit(page);
    const name = tagged('Corporate Letterhead');
    await page.locator('button, a, [role="button"]').filter({ hasText: /New Letterhead|Add Letterhead/i }).first().click();
    const form = await fk.scope({ ready: 'input' });
    await fk.setInput(form.getByPlaceholder(/Corporate letterhead/i).first().or(fk.fieldByLabel(form, 'Name', 'input')), name, 'Letterhead Name');
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save Letterhead' });
    await expectListed(page, 'letters/letterheads', name, 'the letterhead');
    log(`letterhead created: "${name}"`);
  },

  // Interview Rounds (/interview-rounds): define a round for a designation (round name unique per
  // designation, so it carries the run tag).
  async createInterviewRound({ page }) {
    const fk = new FormKit(page);
    const round = tagged('Technical Round');
    await page.locator('button, a, [role="button"]').filter({ hasText: /Add Round|New Round/i }).first().click();
    const form = await fk.scope({ ready: 'select' });
    await fk.setSelect(fk.selectWithOption(form, 'Software Engineer'), 'Software Engineer', 'Designation', { loose: true });
    await fk.setInput(fk.fieldByLabel(form, 'Round Name', 'input'), round, 'Round Name');
    // Order No is unique per designation — leave it blank so the app assigns the next free number.
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Add Round' });
    // Verify via the designation filter (narrows to one page), waiting out the "Loading..." state.
    await page.goto(`${BASE}/interview-rounds`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.locator('select').filter({ has: page.locator('option', { hasText: 'All Designations' }) }).first()
      .selectOption({ label: 'Software Engineer' }).catch(() => {});
    await expect.poll(async () => (await page.locator('table tbody').innerText().catch(() => 'Loading')),
      { timeout: 30000, intervals: [800] }).not.toMatch(/Loading/i);
    await expect(page.getByText(round, { exact: false }).filter({ visible: true }).first(),
      'the interview round should be listed under Software Engineer').toBeVisible({ timeout: 20000 });
    log(`interview round created: "${round}" for Software Engineer`);
  },

  // Probation Templates (/hrms/probation-templates): create a probation template with checkpoints.
  async createProbationTemplate({ page }) {
    const fk = new FormKit(page);
    const name = tagged('Standard Probation');
    await page.locator('button, a, [role="button"]').filter({ hasText: /New Template|Add Template/i }).first().click();
    const form = await fk.scope({ ready: 'input' });
    await fk.setInput(fk.fieldByLabel(form, 'Template Name', 'input'), name, 'Template Name');
    await fk.setInput(fk.fieldByLabel(form, 'Duration', 'input'), '90', 'Duration (days)');
    await fk.setInput(fk.fieldByLabel(form, 'Checkpoints', 'input'), '30, 60, 90', 'Checkpoints (days)');
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save Template' });
    await expectListed(page, 'hrms/probation-templates', name, 'the probation template');
    log(`probation template created: "${name}" (90 days · 30/60/90)`);
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

    // Publish it, so candidates can apply themselves on the public career page (Job Applications page).
    await page.goto(`${BASE}/vacancy-list`, { waitUntil: 'domcontentloaded' });
    const rows = await R.readRows(page);
    const newestCode = rows.map(t => (t.match(/JOB\d+/) || [])[0]).filter(Boolean)
      .sort((a, b) => Number(b.slice(3)) - Number(a.slice(3)))[0];
    expect(newestCode, 'the new job opening should be listed on the Job Board').toBeTruthy();
    const openingRow = () => page.locator('table tbody tr').filter({ hasText: newestCode }).first();
    await openingRow().locator('button').filter({ has: page.locator('i.ri-more-2-fill') }).first().click();
    const publish = page.locator('.dropdown-menu.show a, .dropdown-menu.show button').filter({ hasText: /^\s*Publish\s*$/ }).first();
    await expect(publish, `${newestCode} should offer "Publish"`).toBeVisible({ timeout: 10000 });
    await publish.click();
    const confirm = page.locator('.swal2-popup button, .modal.show button').filter({ hasText: /^\s*(Yes.*|Publish|Confirm|OK)\s*$/i }).first();
    if (await waitVisible(confirm, 5000)) await confirm.click();
    await page.goto(`${BASE}/vacancy-list`, { waitUntil: 'domcontentloaded' });
    await R.readRows(page);
    await expect(openingRow(), `${newestCode} should now be Published`).toContainText(/\bPublished\b/, { timeout: 30000 });
    remember({ publishedOpening: newestCode });
    log(`job opening ${newestCode} published on the public career page`);

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

  /**
   * A candidate applies THEMSELVES: logged-out window → public career page → this run's published
   * opening → Apply Now → application form → Submit Application. Then, as Amit, the application is
   * found in the Candidates register (by its unique e-mail).
   */
  async candidateSelfApplies({ page, browser, testInfo }) {
    const code = need('publishedOpening', 'Job Board');
    // The career page address comes from the Job Board's "Open public career page" button.
    await page.goto(`${BASE}/vacancy-list`, { waitUntil: 'domcontentloaded' });
    await R.readRows(page);
    const [career] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 30000 }),
      page.locator('[title="Open public career page"]').first().click(),
    ]);
    await career.waitForLoadState('domcontentloaded').catch(() => {});
    const careerUrl = career.url();
    await career.close();
    expect(careerUrl, 'the public career page address').toMatch(/\/careers\//);

    let who = person();
    await R.gotoCandidatesRegister(page);
    for (let i = 0; i < 6 && await R.candidateNameTaken(page, who.full); i++) who = person();

    await withVisitor(browser, testInfo, 'candidate', async cp => {
      await cp.goto(careerUrl, { waitUntil: 'domcontentloaded' });
      await expect(cp.getByText(/Join Our Team/i).first(), 'the public career page opens for a logged-out visitor').toBeVisible({ timeout: 60000 });
      const size = cp.locator('#page_size');
      if (await waitVisible(size, 5000)) await size.selectOption('100');   // all openings on one page
      const card = cp.locator('div, li, article').filter({ hasText: `Job Code: ${code}` }).filter({ has: cp.getByText(/Apply Now/) }).last();
      await expect(card, `the career page should list this run's opening ${code}`).toBeVisible({ timeout: 30000 });
      await card.getByText(/Apply Now/).first().click();
      await expect(cp, 'Apply Now opens the application form').toHaveURL(/\/apply\//, { timeout: 30000 });
      await expect(cp.getByText(`Job Code: ${code}`).first(), 'the form is for this run\'s opening').toBeVisible({ timeout: 30000 });

      const fk = new FormKit(cp);
      await fk.setInput(cp.locator('#applicant-firstname'), who.first, 'First Name');
      await fk.setInput(cp.locator('#applicant-lastname'), who.last, 'Last Name');
      await fk.setInput(cp.locator('#applicant-emailaddress'), who.email, 'Email Address');
      await fk.setSelect(cp.locator('#applicant-gender'), who.gender, 'Gender');
      await fk.setSelect(cp.locator('#applicant-mobile').locator('xpath=preceding::select[1]'), 'IND', 'Mobile code', { loose: true });
      await fk.setInput(cp.locator('#applicant-mobile'), '9' + String(Date.now()).slice(-9), 'Mobile Number');
      // City* is a type-ahead: type, then pick the suggestion (free text alone is rejected).
      const city = cp.locator('#applicant-city');
      await city.click();
      await city.pressSequentially('Kochi', { delay: 60 });
      const suggestion = cp.locator('li, [role="option"], .dropdown-item, .list-group-item, .autocomplete-item, button')
        .filter({ hasText: /Kochi/i }).filter({ visible: true }).first();
      await expect(suggestion, 'City search should suggest Kochi').toBeVisible({ timeout: 20000 });
      await suggestion.click();
      await expect(cp.getByText(/Please select your city/i), 'the city should be accepted').toHaveCount(0, { timeout: 10000 });
      await fk.upload(cp.locator('input[type="file"]').first(), CV, 'Resume');
      await cp.locator('#experienceNo').check().catch(() => {});
      await cp.locator('button').filter({ hasText: /Submit Application/i }).first().click();
      // The app answers with a confirmation; a validation message here is a refusal.
      await expect.poll(async () => (await cp.locator('body').innerText()).replace(/\s+/g, ' '),
        { timeout: 45000, intervals: [2000, 5000], message: 'the application should be accepted' })
        .toMatch(/thank|success|submitted|received|applied/i);
      log(`${who.full} applied for ${code} on the public career page (logged out)`);
    });

    // As Amit: the self-submitted application is in the Candidates register.
    const row = await R.candidateRow(page, who.email);
    expect(row, `the Candidates register should list ${who.email} (self-applied)`).toContain(who.email);
    expect(row, 'a career-page application shows Stage APPLIED and Source Portal').toMatch(/APPLIED\s+Portal/);
    remember({ selfApplicant: { name: who.full, email: who.email, code } });
    log(`application from ${who.full} is in the Candidates register — ${row.replace(/\s+/g, ' ').slice(0, 120)}`);
  },

  /**
   * Take-home assessment for this run's candidate: create the assignment → send it to the candidate
   * on this run's opening (the app e-mails the brief to their @example.com address) → evaluate it
   * (score + feedback) → the candidate's row shows Evaluated with the score.
   */
  async takeHomeAssessment({ page }) {
    const fk = new FormKit(page);
    const rec = need('rec', 'Job Board');
    const title = tagged('Manual Testing Exercise');
    const modal = () => page.locator('.modal.show').last();

    // 1. Create the assignment.
    await page.locator('a, button').filter({ hasText: /^\s*New Assignment\s*$/ }).first().click();
    await expect(modal(), 'the New Assignment form opens').toBeVisible({ timeout: 15000 });
    await modal().getByText(/^\s*Take-home Assignment\s*$/).first().click().catch(() => {});
    await fk.setInput(modal().getByPlaceholder('e.g. React Component Build'), title, 'Title');
    await fk.setInput(modal().locator('textarea').first(), 'Write 10 test cases for the login page (positive and negative) and log any defects you find.', 'Instructions');
    await fk.setInput(modal().getByText(/^\s*Max Score/).first().locator('xpath=following::input[1]'), '100', 'Max Score');
    await fk.setInput(modal().getByPlaceholder('e.g. 5'), '3', 'Due In (days)');
    await modal().locator('button').filter({ hasText: /^\s*Save\s*$/ }).first().click();
    await expect(modal(), 'the form closes on save').toBeHidden({ timeout: 20000 });
    await page.goto(`${BASE}/assessment-list`, { waitUntil: 'domcontentloaded' });
    const row = () => page.locator('table tbody tr').filter({ hasText: title }).first();
    await expect(row(), `assignment "${title}" is listed`).toBeVisible({ timeout: 30000 });
    log(`take-home assignment "${title}" created (max 100, due in 3 days)`);

    // 2. Send it to this run's candidate on this run's opening.
    await row().locator('[title="Send to candidates"]').click();
    await expect(modal(), 'the Send dialog opens').toBeVisible({ timeout: 15000 });
    const vacancy = modal().locator('select').first();
    const vOpt = (await vacancy.locator('option').allTextContents()).map(t => t.trim()).find(t => t.includes(`(${rec.openingCode})`));
    expect(vOpt, `the Send dialog should offer ${rec.openingCode}`).toBeTruthy();
    await fk.setSelect(vacancy, vOpt, 'Vacancy');
    const candRow = modal().locator('tbody tr').filter({ hasText: rec.candidateEmail }).first();
    await expect(candRow, `${rec.candidateName} should be listed for ${rec.openingCode}`).toBeVisible({ timeout: 20000 });
    await candRow.locator('input[type="checkbox"]').check();
    await expect(modal(), 'one candidate selected').toContainText(/1 selected/);
    await modal().locator('button').filter({ hasText: /^\s*Send\s*$/ }).first().click();
    const ok = page.locator('.swal2-popup button').filter({ hasText: /^\s*(Yes.*|Send|Confirm|OK)\s*$/i }).first();
    if (await waitVisible(ok, 4000)) await ok.click();
    await expect(page.locator('.modal.show').filter({ hasText: 'selected' }), 'the Send dialog closes').toHaveCount(0, { timeout: 20000 });
    await page.goto(`${BASE}/assessment-list`, { waitUntil: 'domcontentloaded' });
    await expect(row(), 'the assignment shows 1 assigned').toContainText(/1 assigned/, { timeout: 30000 });
    log(`assignment sent to ${rec.candidateName} (${rec.candidateEmail}) on ${rec.openingCode}`);

    // Before an interview the sender only sees it read-only ("View only"): the app lets only the
    // candidate's INTERVIEW PANEL evaluate. So it is evaluated on Interview Schedules, once Amit is
    // on the panel (see evaluateAssessment).
    const sub = await openSubmission(page, title, rec.candidateName);
    await expect(sub, `${rec.candidateName} is Assigned (awaiting the interview panel)`).toContainText(/Assigned/, { timeout: 20000 });
    await page.keyboard.press('Escape').catch(() => {});
    remember({ assessment: title });

    // Interview scorecard — a weighted competency sheet the panel rates (1–5) during the interview;
    // it is attached to the interview on Interview Schedules.
    const card = tagged('Software Tester — Technical Round');
    await page.goto(`${BASE}/assessment-list`, { waitUntil: 'domcontentloaded' });
    await page.locator('a, button, [role="tab"]').filter({ hasText: /Interview Scorecards/ }).first().click();
    await page.locator('a, button').filter({ hasText: /^\s*New Scorecard\s*$/ }).first().click();
    await expect(modal(), 'the New Scorecard form opens').toBeVisible({ timeout: 15000 });
    await fk.setInput(modal().getByPlaceholder('e.g. Backend Engineer — Technical Round'), card, 'Scorecard title');
    await fk.setInput(modal().locator('textarea').first(), 'Rate each competency 1–5 from the technical discussion.', 'Notes for the panel');
    const criteria = [['Test design', 'Covers positive, negative and boundary cases', '2'], ['Defect reporting', 'Clear steps, expected vs actual, severity', '1']];
    for (const [i, [name, prompt, weight]] of criteria.entries()) {
      await modal().locator('button').filter({ hasText: /Add Criterion/ }).first().click();
      const cr = modal().locator('tbody tr').nth(i);
      await fk.setInput(cr.getByPlaceholder('e.g. Problem solving'), name, `Criterion ${i + 1}`);
      await fk.setInput(cr.getByPlaceholder('Prompt for the interviewer'), prompt, `What to look for ${i + 1}`);
      await fk.setInput(cr.locator('input[type="number"]'), weight, `Weight ${i + 1}`);
    }
    await modal().locator('button').filter({ hasText: /^\s*Save\s*$/ }).first().click();
    await expect(modal(), 'the scorecard form closes on save').toBeHidden({ timeout: 20000 });
    await page.goto(`${BASE}/assessment-list`, { waitUntil: 'domcontentloaded' });
    await page.locator('a, button, [role="tab"]').filter({ hasText: /Interview Scorecards/ }).first().click();
    await expect(page.locator('table tbody tr').filter({ hasText: card }).first(), `scorecard "${card}" is listed with 2 criteria`)
      .toContainText(/2 criteria/, { timeout: 30000 });
    remember({ scorecard: card });
    log(`interview scorecard "${card}" created — Test design (×2), Defect reporting (×1)`);
  },

  async interviewAndFeedback({ page }) {
    const rec = need('rec', 'Job Board');
    // Resumable: if this candidate's interview is already booked (e.g. the run was interrupted), go
    // straight on — the app (correctly) won't book a second open interview for the same candidate.
    if (!rec.interviewBooked) {
      rec.scorecard = state().scorecard;   // attach this run's interview scorecard, if one was created
      rec.roundName = tagged('Technical Round 1');   // named per run (the app rejects a duplicate round name)
      log(`interview round "${rec.roundName}" (${await R.addInterviewRound(page, rec)})`);
      await R.scheduleInterview(page, rec);
      if (rec.scorecard) log(`scorecard "${rec.scorecard}" attached to the interview`);
      rec.interviewBooked = true;
      remember({ rec });   // keeps interviewAt
      log(`interview booked for ${R.dtLocal(new Date(rec.interviewAt))} — Scheduled`);
    } else {
      log(`resuming: interview "${rec.roundName}" for ${rec.candidateName} is already booked`);
    }
    // Amit is now on the candidate's interview panel, so he can evaluate the take-home assessment.
    const assessment = state().assessment;
    if (assessment && !rec.assessmentEvaluated) {
      await evaluateAssessment(page, assessment, rec.candidateName);
      rec.assessmentEvaluated = true;
      remember({ rec });
      log(`take-home assessment "${assessment}" evaluated by the interview panel — 85 / 100`);
    }
    rec.interviewAt = new Date(rec.interviewAt);
    await R.recordEvaluation(page, rec);
    log(rec.scorecard
      ? `scorecard feedback saved — every criterion rated 4/5 (overall 4), Proceed — interview Completed`
      : 'feedback 4/5 Proceed saved — interview Completed');
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
    if (await waitVisible(search, 10000)) {
      await search.fill(name);
      await search.press('Enter');   // the search only applies on Enter / the search button
    }
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
    // New employees may already get a leave pattern automatically (seen 2026-10-19: "Standard Leave"
    // for the year) — the app then rightly refuses a second overlapping pattern. Check first.
    await page.goto(`${BASE}/leave-request-on-behalf`, { waitUntil: 'domcontentloaded' });
    await L.selectOnBehalfEmployee(page, new RegExp(`\\[${emp.code}\\]`));
    const existing = (await L.leaveTypeSelect(page).locator('option').allTextContents().catch(() => []))
      .map(t => t.trim()).filter(t => /available/i.test(t));
    if (existing.length) {
      log(`${emp.display} already has a leave pattern in force (assigned automatically) — leave types: ${existing.join(', ')}`);
      return;
    }
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
    // Holidays* is a read-only box that opens a searchable list of switches — one per holiday.
    await form.locator('#holidays').click();
    const search = page.locator('#holidays-search-input');
    if (await waitVisible(search, 5000)) await search.fill(holiday);
    const toggle = page.locator('ul.list-group li').filter({ hasText: holiday }).locator('input[type="checkbox"]').first();
    await expect(toggle, `holiday "${holiday}" should be offered for Main Branch`).toBeVisible({ timeout: 15000 });
    await toggle.check();
    await expect(toggle, `holiday "${holiday}" should be switched on`).toBeChecked();
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Save holiday assignment', successRe: /success|saved|created|added|assigned/i });
    // The Main Branch row shows its first holidays and folds the rest into "+N more" (tooltip lists them).
    await page.goto(`${BASE}/holiday-assignment-list`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('table tbody tr').filter({ hasText: 'Main Branch' }).first();
    await expect(row, 'the Main Branch holiday assignment row is listed').toBeVisible({ timeout: 30000 });
    const shown = await row.innerText();
    const folded = await row.getByText(/\+\d+ more/).first().getAttribute('title').catch(() => '') || '';
    expect(`${shown}\n${folded}`, `Main Branch should now include "${holiday}"`).toContain(holiday);
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
    // Two own-data requests: one to APPROVE, one to REJECT — both from the run employee.
    const reasonApprove = tagged('Family function at hometown');
    const reasonReject = tagged('Personal errand');
    const dayApprove = L.futureWeekdayISO(21);
    const dayReject = L.futureWeekdayISO(28);
    let before, after;
    await withUser(browser, testInfo, creds, async ep => {
      before = await L.myBalance(ep, 'Casual Leave');
      expect(before.available, `${emp.display} should have at least 2 Casual Leave days to apply for`).toBeGreaterThanOrEqual(2);
      await L.employeeApplies(ep, { type: 'Casual Leave', reason: reasonApprove, day: dayApprove });
      expect((await L.myRequestRow(ep, dayApprove)).text, 'request #1 shows Pending').toMatch(/Casual Leave.*Pending/i);
      await L.employeeApplies(ep, { type: 'Casual Leave', reason: reasonReject, day: dayReject });
      expect((await L.myRequestRow(ep, dayReject)).text, 'request #2 shows Pending').toMatch(/Casual Leave.*Pending/i);
    });
    log(`${emp.display} applied for two leaves — ${dayApprove} (to approve) and ${dayReject} (to reject); Casual ${before.available} available`);

    await L.managerApproves(page, emp.first, reasonApprove);
    log(`Amit APPROVED ${dayApprove} on Leave Approval`);
    await L.managerRejects(page, emp.first, reasonReject);
    log(`Amit REJECTED ${dayReject} on Leave Approval`);

    await withUser(browser, testInfo, creds, async ep => {
      expect((await L.myRequestRow(ep, dayApprove)).text, 'the employee sees request #1 Approved').toMatch(/Casual Leave.*Approved/i);
      expect((await L.myRequestRow(ep, dayReject)).text, 'the employee sees request #2 Rejected').toMatch(/Casual Leave.*Reject/i);
      after = await L.myBalance(ep, 'Casual Leave');
      // Only the approved day consumes balance; the rejected day is released.
      expect(after.available, `Casual available ${before.available} → ${before.available - 1} (only the approved day counts)`).toBe(before.available - 1);
      expect(after.used, `Casual used ${before.used} → ${before.used + 1}`).toBe(before.used + 1);
      log(`${emp.display} sees one Approved + one Rejected — Casual ${before.available} → ${after.available}`);
    });

    // HR side: the employee's profile → Leave History now carries a Casual Leave transaction beyond the
    // opening pro-rata entitlement (the approved day). The rejected request must not debit anything.
    expect(emp.profileHref, 'the run employee should carry its profile link (set by the Worker Directory step)').toBeTruthy();
    const view = new EmployeeProfilePage(page);
    await view.open(emp.profileHref);
    // Row format: Date | Leave Type | Txn | Days | Balance After | Remarks — e.g.
    // "23 Oct 2026 Casual Leave Used -1 2 Leave approved". The rejected request adds NO row.
    const rows = await view.leaveHistoryRows();
    const used = rows.filter(r => /Casual Leave\s+Used\s+-1\b/i.test(r) && /Leave approved/i.test(r));
    const debits = rows.filter(r => /Casual Leave\s+Used\b/i.test(r));
    expect(used.length, `Leave History should show a "Casual Leave Used -1 … Leave approved" row (rows: ${JSON.stringify(rows)})`).toBeGreaterThanOrEqual(1);
    // One "Used" row per approved day — so the rows must equal the employee's used days (re-run safe);
    // a debit for the rejected request would push the rows above it.
    expect(debits.length, `Casual "Used" rows should equal the ${after.used} used day(s) — the rejected request must not be debited`).toBe(after.used);
    expect(rows.some(r => new RegExp(`Casual Leave\\s+Used\\s+-1\\s+${after.available}\\b`, 'i').test(r)),
      `the latest debit should leave a balance of ${after.available}`).toBe(true);
    log(`profile view · Leave History: ${debits.length} "Used" row(s) = ${after.used} used day(s), e.g. "${used[0].slice(0, 70)}" — rejected request not debited`);
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
    // The open-job options load after the page — wait for them before choosing.
    const jobOpts = async () => (await job.locator('option').allTextContents()).map(t => t.trim()).filter(t => /JOB\d+/.test(t) && t.includes(R.DESIGNATION));
    await expect.poll(async () => (await jobOpts()).length, { timeout: 30000, message: `open ${R.DESIGNATION} jobs should load` }).toBeGreaterThan(0);
    const opts = await jobOpts();
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
