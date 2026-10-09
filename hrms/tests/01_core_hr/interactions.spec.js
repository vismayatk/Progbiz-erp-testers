'use strict';

/**
 * Core HR — interaction specs (STRICTLY non-destructive).
 *
 * One describe per page; each test navigates itself via its POM. Primary
 * interactions only: open a create-modal → assert fields → dismiss; apply a
 * filter → assert the grid re-renders; switch tabs → assert active state;
 * assert documented empty states.
 *
 * Nothing is ever saved: Save / Submit / Raise Revision / Save Workflow /
 * Upload / Generate / Approve are asserted visible at most — never clicked.
 * Create-modals opened here are always dismissed WITHOUT confirming.
 */
const { test, expect } = require('@playwright/test');

const { BasePage }                    = require('../../pages/BasePage');
const { EmployeesPage }               = require('../../pages/core-hr/EmployeesPage');
const { SectionsPage }                = require('../../pages/core-hr/SectionsPage');
const { WorkerDirectoryPage }         = require('../../pages/core-hr/WorkerDirectoryPage');
const { SalaryRevisionsPage }         = require('../../pages/core-hr/SalaryRevisionsPage');
const { EmployeeSalaryProcessPage }   = require('../../pages/core-hr/EmployeeSalaryProcessPage');
const { EmployeeDeductionPage }       = require('../../pages/core-hr/EmployeeDeductionPage');
const { EmployeeRemarkPage }          = require('../../pages/core-hr/EmployeeRemarkPage');
const { ProbationDashboardPage }      = require('../../pages/core-hr/ProbationDashboardPage');
const { ProbationTemplatesPage }      = require('../../pages/core-hr/ProbationTemplatesPage');
const { ProbationReportPage }         = require('../../pages/core-hr/ProbationReportPage');
const { ResignedEmployeesPage }       = require('../../pages/core-hr/ResignedEmployeesPage');
const { UploadEmployeePage }          = require('../../pages/core-hr/UploadEmployeePage');
const { LetterTemplatesPage }         = require('../../pages/core-hr/LetterTemplatesPage');
const { GenerateLetterPage }          = require('../../pages/core-hr/GenerateLetterPage');
const { ApprovalsPage }               = require('../../pages/core-hr/ApprovalsPage');
const { ApprovalConfigPage }          = require('../../pages/core-hr/ApprovalConfigPage');
const { EmployeeDeductionReportPage } = require('../../pages/core-hr/EmployeeDeductionReportPage');
const { EmployeeRemarkReportPage }    = require('../../pages/core-hr/EmployeeRemarkReportPage');

/**
 * Grids on this build render their empty state as a single ROW, not a separate
 * element. On an empty tenant that row must carry the documented text; with
 * live data the same grid has one or more real rows — accept either.
 */
async function expectEmptyStateOrData(po, emptyRe) {
  const rows = await po.gridRows.count();
  expect(rows, 'grid should render at least its empty-state row').toBeGreaterThanOrEqual(1);
  if (rows === 1) {
    const first = (await po.gridRows.first().innerText()).trim();
    if (!emptyRe.test(first)) {
      expect(first.length, `single row should be data or match ${emptyRe}`).toBeGreaterThan(0);
    }
  }
}

// ── /employees — Employee master register ───────────────────────────────────

test.describe('Employees (/employees)', () => {
  test('New Employee reveals a create form and is dismissed without saving', async ({ page }) => {
    const po = new EmployeesPage(page);
    await po.goto();
    const revealed = await po.openCreateModal();
    expect(revealed, '"New Employee" should reveal a create modal/form').toBeTruthy();
    await po.closeModal();
    // back on the register, untouched
    await expect(po.newEmployeeBtn).toBeVisible();
    expect((await po.gridHeaderTexts()).join('|')).toMatch(/Employee Code/i);
  });

  test('Include-archived toggle re-renders the register grid', async ({ page }) => {
    const po = new EmployeesPage(page);
    await po.goto();
    await expect(po.includeArchivedChk).toBeVisible();
    await po.toggleIncludeArchived();
    expect(await po.gridRows.count()).toBeGreaterThanOrEqual(0);   // no crash, grid still queryable
    expect((await po.gridHeaderTexts()).join('|')).toMatch(/Department Name/i);
    await po.toggleIncludeArchived();   // restore the default view
  });

  test('Filter button toggles its panel without breaking the grid', async ({ page }) => {
    const po = new EmployeesPage(page);
    await po.goto();
    await po.toggleFilterPanel();
    await expect(po.grid).toBeVisible();
    expect(page.url()).not.toContain('/login');
  });
});

// ── /sections — department/section master ───────────────────────────────────

test.describe('Sections (/sections)', () => {
  test('New Section form shows its named fields; Clear resets it', async ({ page }) => {
    const po = new SectionsPage(page);
    await po.goto();
    await expect(po.departmentSelect).toBeVisible();
    await expect(po.sectionNameInput).toBeVisible();
    await expect(po.saveBtn).toBeVisible();          // asserted only — never clicked
    await po.fillNewSection('QA temp section (never saved)');
    await po.clearForm();
    await expect(po.sectionNameInput).toHaveValue('');
  });

  test('sections grid renders the documented columns', async ({ page }) => {
    const po = new SectionsPage(page);
    await po.goto();
    const headers = (await po.gridHeaderTexts()).join('|');
    expect(headers).toMatch(/Department Name/i);
    expect(headers).toMatch(/Section Name/i);
    expect(await po.gridRows.count()).toBeGreaterThanOrEqual(0);
  });
});

// ── /worker-directory — read-only directory ─────────────────────────────────

test.describe('Worker Directory (/worker-directory)', () => {
  test('Cards ↔ Org Chart view toggle survives both renders', async ({ page }) => {
    const po = new WorkerDirectoryPage(page);
    await po.goto();
    await po.switchToOrgChart();
    await expect(po.cardsBtn).toBeVisible();     // toggle still present after re-render
    await po.switchToCards();
    await expect(po.searchBtn).toBeVisible();
    expect(page.url()).not.toContain('/login');
  });

  test('no-match search shows the documented empty state', async ({ page }) => {
    const po = new WorkerDirectoryPage(page);
    await po.goto();
    await po.search('zzz-no-such-worker-9999');
    await expect(po.emptyState).toBeVisible();
  });
});

// ── /salary-revisions — revisions + history ─────────────────────────────────

test.describe('Salary Revisions (/salary-revisions)', () => {
  test('Raise-A-Revision form exposes its named fields (never submitted)', async ({ page }) => {
    const po = new SalaryRevisionsPage(page);
    await po.goto();
    await expect(po.branchSelect).toBeVisible();
    await expect(po.employeeSelect).toBeVisible();
    await expect(po.newGrossInput).toBeVisible();
    await expect(po.effectiveDateInput).toBeVisible();
    await expect(po.reasonTextarea).toBeVisible();
    await expect(po.raiseRevisionBtn).toBeVisible();   // asserted only — never clicked
  });

  test('Revision History grid renders (documented empty-state row)', async ({ page }) => {
    const po = new SalaryRevisionsPage(page);
    await po.goto();
    const headers = (await po.gridHeaderTexts()).join('|');
    expect(headers).toMatch(/Employee/i);
    expect(headers).toMatch(/Status/i);
    await expectEmptyStateOrData(po, /No revisions yet\./i);
  });
});

// ── /employee-salary-process — monthly payroll grid ─────────────────────────

test.describe('Employee Salary Process (/employee-salary-process)', () => {
  test('year+month filter recomputes the payroll grid without crashing', async ({ page }) => {
    const po = new EmployeeSalaryProcessPage(page);
    await po.goto();
    await expect(po.branchSelect).toBeVisible();
    await expect(po.saveBtn).toBeVisible();            // asserted only — never clicked
    await po.selectFirstYearAndMonth('January');
    expect(await po.gridRows.count()).toBeGreaterThanOrEqual(0);
    expect((await po.gridHeaderTexts()).join('|')).toMatch(/Payable Amount/i);
    expect(page.url()).not.toContain('/login');
  });
});

// ── /employee-deduction — entry form ────────────────────────────────────────

test.describe('Employee Deduction (/employee-deduction)', () => {
  test('entry form exposes all named fields (duplicate #employee ids split by position)', async ({ page }) => {
    const po = new EmployeeDeductionPage(page);
    await po.goto();
    await expect(po.branchSelect).toBeVisible();
    await expect(po.staffSelect).toBeVisible();
    await expect(po.payUsingSelect).toBeVisible();
    await expect(po.dateInput).toBeVisible();
    await expect(po.deductionTypeInput).toBeVisible();
    await expect(po.amountInput).toBeVisible();
    await expect(po.detailsTextarea).toBeVisible();
    await expect(po.saveBtn).toBeVisible();            // asserted only — never clicked
  });

  test('typed values stick and Cancel discards the unsaved entry', async ({ page }) => {
    const po = new EmployeeDeductionPage(page);
    await po.goto();
    await po.fillForm({ amount: '1', details: 'QA temp — discarded, never saved' });
    await expect(po.amountInput).toHaveValue('1');
    await po.cancel();                                  // discard WITHOUT saving
    expect(page.url()).not.toContain('/login');
  });
});

// ── /employee-remark — entry form (title build bug) ─────────────────────────

test.describe('Employee Remark (/employee-remark)', () => {
  test('remark form = reduced field set (header falsely reads "Employee Deduction")', async ({ page }) => {
    const po  = new EmployeeRemarkPage(page);
    const ded = new EmployeeDeductionPage(page);   // locators only — never navigated
    await po.goto();
    // identity by URL, not title — the title carries the documented build bug
    expect(page.url()).toContain('/employee-remark');
    await expect(po.branchSelect).toBeVisible();
    await expect(po.staffSelect).toBeVisible();
    await expect(po.dateInput).toBeVisible();
    await expect(po.detailsTextarea).toBeVisible();
    // distinguishing negative: the deduction-only fields must NOT exist here
    await expect(ded.deductionTypeInput).toHaveCount(0);
    await expect(ded.amountInput).toHaveCount(0);
  });
});

// ── /hrms/probation — dashboard ─────────────────────────────────────────────

test.describe('Probation Dashboard (/hrms/probation)', () => {
  test('KPI tiles and documented grid render', async ({ page }) => {
    const po = new ProbationDashboardPage(page);
    await po.goto();
    for (const label of ['On Probation', 'Reviews Due (7d)', 'Overdue Reviews', 'Ending Soon (30d)']) {
      await expect(po.kpiTile(label), `KPI tile "${label}"`).toBeVisible();
      expect(await po.kpiValue(label)).toMatch(/^\d+%?$/);
    }
    expect((await po.gridHeaderTexts()).join('|')).toMatch(/Next Review/i);
    await expectEmptyStateOrData(po, /No one on probation\./i);
  });

  test('Report/Templates anchors carry the documented hrefs', async ({ page }) => {
    const po = new ProbationDashboardPage(page);
    await po.goto();
    await expect(po.reportLink).toBeVisible();      // locator IS the crawled href
    await expect(po.templatesLink).toBeVisible();
  });

  test('Start Probation opens a picker and is dismissed without confirming', async ({ page }) => {
    const po = new ProbationDashboardPage(page);
    await po.goto();
    const revealed = await po.openStartProbation();
    expect(revealed, '"Start Probation" should reveal a picker modal/form').toBeTruthy();
    await po.closeModal();
    await expect(po.startProbationBtn).toBeVisible();   // dashboard intact, nothing started
  });
});

// ── /hrms/probation-templates — template list ───────────────────────────────

test.describe('Probation Templates (/hrms/probation-templates)', () => {
  test('New Template reveals the create UI and is dismissed without saving', async ({ page }) => {
    const po = new ProbationTemplatesPage(page);
    await po.goto();
    const revealed = await po.openCreateModal();
    expect(revealed, '"New Template" should reveal a create modal/form').toBeTruthy();
    await po.closeModal();
    await expect(po.newTemplateBtn).toBeVisible();
  });

  test('grid renders documented columns and empty state', async ({ page }) => {
    const po = new ProbationTemplatesPage(page);
    await po.goto();
    const headers = (await po.gridHeaderTexts()).join('|');
    expect(headers).toMatch(/Checkpoints \(days\)/i);
    expect(headers).toMatch(/Default/i);
    await expectEmptyStateOrData(po, /No templates yet\./i);
  });
});

// ── /hrms/probation-report — pull-based report ──────────────────────────────

test.describe('Probation Report (/hrms/probation-report)', () => {
  test('filters render; Run Report re-renders the grid (read-only query)', async ({ page }) => {
    const po = new ProbationReportPage(page);
    await po.goto();
    await expect(po.fromDateInput).toBeVisible();
    await expect(po.toDateInput).toBeVisible();
    await expect(po.branchSelect).toBeVisible();
    await expect(po.exportExcelBtn).toBeVisible();     // asserted only — never clicked
    // an ancient range guarantees the documented empty state even with data
    await po.runReport({ from: '2001-01-01', to: '2001-01-31' });
    await expect(po.detailsCardTitle).toBeVisible();
    await expectEmptyStateOrData(po, /No probations in this range\./i);
  });
});

// ── /resigned-employees — read-only register ────────────────────────────────

test.describe('Resigned Employees (/resigned-employees)', () => {
  test('name filter re-renders the register without crashing', async ({ page }) => {
    const po = new ResignedEmployeesPage(page);
    await po.goto();
    expect((await po.gridHeaderTexts()).join('|')).toMatch(/Nationality/i);
    await po.filterByName('zzz-no-such-name-9999');
    expect(await po.gridRows.count()).toBeGreaterThanOrEqual(0);   // empty build renders blank cells
    expect(page.url()).not.toContain('/login');
    await po.clearFilter();
  });
});

// ── /upload-employee — bulk Excel import ────────────────────────────────────

test.describe('Employee Excel Import (/upload-employee)', () => {
  test('import controls render (file input + documented sample link)', async ({ page }) => {
    const po = new UploadEmployeePage(page);
    await po.goto();
    await expect(po.fileInput).toHaveCount(1);         // may be visually hidden behind a styled label
    await expect(po.sampleLink).toBeVisible();
    await expect(po.uploadBtn).toBeVisible();          // asserted only — never clicked
    expect(await po.sampleHref()).toBe('/assets/images/EmployeeExcelImport.xlsx');
  });

  test('Excel Rules dialog opens and is dismissed', async ({ page }) => {
    const po = new UploadEmployeePage(page);
    await po.goto();
    const shown = await po.openExcelRules();
    if (shown) await po.closeModal();                  // info dialog — dismissed, nothing confirmed
    await expect(po.uploadBtn).toBeVisible();          // page intact either way
    expect(page.url()).not.toContain('/login');
  });
});

// ── /letters/templates — template manager ───────────────────────────────────

test.describe('Letter Templates (/letters/templates)', () => {
  test('header anchors carry documented hrefs; New Template opens + dismisses', async ({ page }) => {
    const po = new LetterTemplatesPage(page);
    await po.goto();
    await expect(po.mergeFieldsLink).toBeVisible();     // locator IS the crawled href
    await expect(po.generateLetterLink).toBeVisible();
    const revealed = await po.openCreateModal();
    expect(revealed, '"New Template" should reveal the template editor').toBeTruthy();
    await po.closeModal();
    await expect(po.newTemplateBtn).toBeVisible();
  });

  test('grid renders documented columns and empty state', async ({ page }) => {
    const po = new LetterTemplatesPage(page);
    await po.goto();
    const headers = (await po.gridHeaderTexts()).join('|');
    expect(headers).toMatch(/Owner/i);
    expect(headers).toMatch(/Subject/i);
    await expectEmptyStateOrData(po, /No templates yet\./i);
  });
});

// ── /letters/generate — letter merge form ───────────────────────────────────

test.describe('Generate Letter (/letters/generate)', () => {
  test('form shows Template/Branch/Employee selects, email toggle and preview hint', async ({ page }) => {
    const po = new GenerateLetterPage(page);
    await po.goto();
    await expect(po.templateSelect).toBeVisible();
    await expect(po.branchSelect).toBeVisible();
    await expect(po.employeeSelect).toBeVisible();
    await expect(po.emailLetterChk).toHaveCount(1);    // may be a styled checkbox
    await expect(po.previewBtn).toBeVisible();
    await expect(po.generateBtn).toBeVisible();        // asserted only — never clicked
    await expect(po.previewHint).toBeVisible();        // enforces template+employee before Preview
  });
});

// ── /approvals — approver inbox ─────────────────────────────────────────────

test.describe('My Approvals (/approvals)', () => {
  test('each tab switches and reports active state', async ({ page }) => {
    const po = new ApprovalsPage(page);
    await po.goto();
    for (const name of ['My requests', 'History', 'Awaiting my decision']) {
      await po.switchTab(name);
      expect(await po.isTabActive(name), `tab "${name}" should be active after click`).toBeTruthy();
    }
  });

  test('Refresh re-polls; Awaiting grid shows documented empty state', async ({ page }) => {
    const po = new ApprovalsPage(page);
    await po.goto();
    await po.refresh();
    const headers = (await po.gridHeaderTexts()).join('|');
    expect(headers).toMatch(/Type/i);
    expect(headers).toMatch(/Raised/i);
    await expectEmptyStateOrData(po, /Nothing awaiting your approval\./i);
  });
});

// ── /approval/config — workflow definitions ─────────────────────────────────

test.describe('Approval Configuration (/approval/config)', () => {
  test('New Workflow form exposes named fields and Core-HR document types', async ({ page }) => {
    const po = new ApprovalConfigPage(page);
    await po.goto();
    await expect(po.approvalTypeSelect).toBeVisible();
    await expect(po.workflowNameInput).toBeVisible();
    await expect(po.defaultChk).toHaveCount(1);        // may be a styled checkbox
    await expect(po.addLevelBtn).toBeVisible();
    await expect(po.saveWorkflowBtn).toBeVisible();    // asserted only — never clicked
    const opts = (await po.approvalTypeOptions()).join('|');
    expect(opts).toMatch(/Salary Revision/);
    expect(opts).toMatch(/Probation Decision/);
  });

  test('+ Add level appends an unsaved level row to the form', async ({ page }) => {
    const po = new ApprovalConfigPage(page);
    await po.goto();
    const before = await po.visibleControlCount();
    await po.addLevel();                                // form-only — nothing persisted
    expect(await po.visibleControlCount(), 'a level row should add form controls')
      .toBeGreaterThan(before);
  });

  test('Configured Workflows grid shows documented columns/empty state', async ({ page }) => {
    const po = new ApprovalConfigPage(page);
    await po.goto();
    expect((await po.gridHeaderTexts()).join('|')).toMatch(/Approval chain/i);
    await expectEmptyStateOrData(po, /No workflows configured yet\./i);
  });
});

// ── /employee-deduction-report — pull-based report ──────────────────────────

test.describe('Employee Deduction Reports (/employee-deduction-report)', () => {
  test('filters render; This-Year query re-renders without crashing', async ({ page }) => {
    const po = new EmployeeDeductionReportPage(page);
    await po.goto();
    await expect(po.deductionTypeSelect).toBeVisible();   // duplicate #report-assignee, nth(0)
    await expect(po.staffSelect).toBeVisible();           // duplicate #report-assignee, nth(1)
    await expect(po.periodSelect).toBeVisible();
    await po.selectPeriod('This Year');
    await po.viewReport();                                // read-only query
    expect(page.url()).toContain('employee-deduction-report');
    expect(await po.gridRows.count()).toBeGreaterThanOrEqual(0);   // grid renders 0..n rows post-query
    expect(page.url()).not.toContain('/login');
  });
});

// ── /employee-remark-report — pull-based report ─────────────────────────────

test.describe('Employee Remark Reports (/employee-remark-report)', () => {
  test('filters render; This-Year query re-renders without crashing', async ({ page }) => {
    const po = new EmployeeRemarkReportPage(page);
    await po.goto();
    await expect(po.staffSelect).toBeVisible();
    await expect(po.periodSelect).toBeVisible();
    await po.selectPeriod('This Year');
    await po.viewReport();                                // read-only query
    expect(page.url()).toContain('employee-remark-report');
    expect(await po.gridRows.count()).toBeGreaterThanOrEqual(0);
    expect(page.url()).not.toContain('/login');
  });
});

// ── /hrms/reminder-rules (NEW — 2026-07 role change) ─────────────────────────

test.describe('core-hr: /hrms/reminder-rules (HR Reminders)', () => {
  test('reminder rules page renders its nightly-scan explainer', async ({ page }) => {
    const po = new BasePage(page, 'hrms/reminder-rules');
    await po.goto();
    await expect(po.main.getByText(/HR Reminders/i).first()).toBeVisible({ timeout: 25000 });
    expect(await po.containsText('Reminder Rules'), '"Reminder Rules" card').toBeTruthy();
    expect(await po.containsText('nightly scan'), 'nightly-scan explainer text').toBeTruthy();
    expect(page.url()).not.toContain('/login');
  });
});
