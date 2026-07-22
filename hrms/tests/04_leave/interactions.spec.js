'use strict';

/**
 * Leave Management — interaction suite (21 pages, POM-driven).
 *
 * PRIMARY interactions only, STRICTLY non-destructive:
 *   - open a create-form/modal → assert its named fields (where the crawl
 *     captured them) → dismiss WITHOUT saving
 *   - apply a filter / search / read-only query and assert the grid re-renders
 *     (rowCount >= 0, grid still attached, no /login bounce, no crash)
 *   - assert documented empty-states where captures showed them (tolerant of
 *     data having been seeded since the crawl)
 *
 * Every test navigates independently via its POM (no shared state).
 * No Save / Submit / Delete / Approve / Reject / Grant / Run Accrual /
 * Recalculate period is ever confirmed — mutating buttons are asserted
 * visible at most, never clicked.
 */
const { test, expect } = require('@playwright/test');

const { LeaveTypesPage }             = require('../../pages/leave/LeaveTypesPage');
const { LeavePatternsPage }          = require('../../pages/leave/LeavePatternsPage');
const { LeavePolicyPage }            = require('../../pages/leave/LeavePolicyPage');
const { LeaveAssignmentListPage }    = require('../../pages/leave/LeaveAssignmentListPage');
const { LeaveRequestListPage }       = require('../../pages/leave/LeaveRequestListPage');
const { LeaveApprovalPage }          = require('../../pages/leave/LeaveApprovalPage');
const { MyLeavePolicyPage }          = require('../../pages/leave/MyLeavePolicyPage');
const { LeaveBalancesPage }          = require('../../pages/leave/LeaveBalancesPage');
const { LeaveLedgerPage }            = require('../../pages/leave/LeaveLedgerPage');
const { LeaveAttendanceSyncPage }    = require('../../pages/leave/LeaveAttendanceSyncPage');
const { LeaveEncashmentPage }        = require('../../pages/leave/LeaveEncashmentPage');
const { LeaveEncashmentApprovalPage }= require('../../pages/leave/LeaveEncashmentApprovalPage');
const { LeaveDelegationPage }        = require('../../pages/leave/LeaveDelegationPage');
const { EmployeeHandoverPage }       = require('../../pages/leave/EmployeeHandoverPage');
const { CompOffsPage }               = require('../../pages/leave/CompOffsPage');
const { CompOffManagementPage }      = require('../../pages/leave/CompOffManagementPage');
const { HolidayListPage }            = require('../../pages/leave/HolidayListPage');
const { HolidayAssignmentListPage }  = require('../../pages/leave/HolidayAssignmentListPage');
const { LeaveReportsPage }           = require('../../pages/leave/LeaveReportsPage');
const { AbsenceAnalyticsPage }       = require('../../pages/leave/AbsenceAnalyticsPage');
const { LeaveCalendarPage }          = require('../../pages/leave/LeaveCalendarPage');

const THIS_YEAR = new Date().getFullYear();

// ── /leave-types ─────────────────────────────────────────────────────────────

test.describe('leave: /leave-types (Leave Types)', () => {
  test('inline Add LeaveType form exposes its named fields, fills and clears (never saved)', async ({ page }) => {
    const po = new LeaveTypesPage(page);
    await po.goto();
    await expect(po.nameInput,          '"Leave Type Name*" input').toBeVisible();
    await expect(po.supportHalfDayChk,  '"Support HalfDay" checkbox').toBeVisible();
    await expect(po.needDocumentChk,    '"Need Document" checkbox').toBeVisible();
    await expect(po.saveBtn).toBeVisible();   // asserted only — never clicked

    await po.fillCreateForm({ name: 'zz-probe-type' });
    expect(await po.nameInput.inputValue()).toBe('zz-probe-type');
    await po.clearForm();
    expect(await po.nameInput.inputValue(), 'Clear resets the unsaved form').not.toBe('zz-probe-type');
  });

  test('grid renders its per-type flag columns (captured empty — 0 rows ok)', async ({ page }) => {
    const po = new LeaveTypesPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = (await po.gridHeaderTexts()).map(h => h.toLowerCase());
    for (const col of ['Leave Type Name', 'Is Support Half Day', 'Is Need Document']) {
      expect(headers, `column "${col}"`).toContain(col.toLowerCase());
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /leave-patterns ──────────────────────────────────────────────────────────

test.describe('leave: /leave-patterns (Leave Patterns)', () => {
  test('New Leave Pattern opens a create dialog and dismisses without saving', async ({ page }) => {
    const po = new LeavePatternsPage(page);
    await po.goto();
    expect(await po.openCreateModal(), '"New Leave Pattern" should open a form').toBeTruthy();
    await po.closeModal();
    await expect(po.newPatternBtn).toBeVisible();   // back on the list view
  });

  test('patterns grid renders headers (captured empty — 0 rows ok)', async ({ page }) => {
    const po = new LeavePatternsPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    expect((await po.gridHeaderTexts()).map(h => h.toLowerCase())).toContain('leave pattern name');
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /leave-policy ────────────────────────────────────────────────────────────

test.describe('leave: /leave-policy (Leave Policy Configuration)', () => {
  test('page is gated on the Leave Pattern chooser (no form until a pattern is picked)', async ({ page }) => {
    const po = new LeavePolicyPage(page);
    await po.goto();
    await expect(po.patternSelect, '"Leave Pattern" select').toBeVisible();
    const options = await po.patternOptions();
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options[0].trim(), 'first option is the "Choose" placeholder').toMatch(/^choose$/i);
    expect(await po.isGated(), 'no buttons/tables before a pattern is chosen').toBeTruthy();
    test.info().annotations.push({ type: 'patterns-available', description: String(options.length - 1) });
  });
});

// ── /leave-assignment-list ───────────────────────────────────────────────────

test.describe('leave: /leave-assignment-list (Leave Assignment)', () => {
  test('New Leave Assignment opens and dismisses without saving', async ({ page }) => {
    const po = new LeaveAssignmentListPage(page);
    await po.goto();
    expect(await po.openCreateModal(), '"New Leave Assignment" should open a form').toBeTruthy();
    await po.closeModal();
    await expect(po.newAssignmentBtn).toBeVisible();
  });

  test('Filter toggles and the grid re-renders with its Leave Pattern column', async ({ page }) => {
    const po = new LeaveAssignmentListPage(page);
    await po.goto();
    await po.toggleFilterPanel();
    await expect(po.grid).toBeVisible();
    expect((await po.gridHeaderTexts()).map(h => h.toLowerCase())).toContain('leave pattern');
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /leave-request-list ──────────────────────────────────────────────────────

test.describe('leave: /leave-request-list (Leave Request)', () => {
  test('New Leave Request opens the create flow and dismisses without saving', async ({ page }) => {
    const po = new LeaveRequestListPage(page);
    await po.goto();
    expect(await po.openCreateModal(), '"New Leave Request" should open a form').toBeTruthy();
    await po.closeModal();
    await expect(po.newRequestBtn).toBeVisible();
  });

  test('request grid renders its Approval Status column (captured empty — 0 rows ok)', async ({ page }) => {
    const po = new LeaveRequestListPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    expect((await po.gridHeaderTexts()).map(h => h.toLowerCase())).toContain('approval status');
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /leave-approval ──────────────────────────────────────────────────────────

test.describe('leave: /leave-approval (Leave Approval)', () => {
  test('bulk-action toolbar renders (no decision is ever fired)', async ({ page }) => {
    const po = new LeaveApprovalPage(page);
    await po.goto();
    await expect(po.approveSelectedBtn, '"Approve Selected"').toBeVisible();   // asserted only
    await expect(po.rejectSelectedBtn,  '"Reject Selected"').toBeVisible();    // asserted only
    expect(await po.containsText('Bulk actions'), 'bulk-actions helper text').toBeTruthy();
    expect(await po.filterSelectCount(), 'three filter selects (shared id "selectbox")').toBe(3);
  });

  test('Delegate approvals opens the custodian panel and dismisses without confirming', async ({ page }) => {
    const po = new LeaveApprovalPage(page);
    await po.goto();
    await po.openDelegatePanel();
    await expect(po.delegateModalTitle, '"Delegate My Approvals" modal').toBeVisible();
    await expect(po.custodianInput, 'custodian picker (modal select)').toBeVisible();
    await po.closeDelegatePanel();
    await expect(po.delegateBtn).toBeVisible();   // back on the worklist
  });

  test('filter toggle re-renders the worklist grid', async ({ page }) => {
    const po = new LeaveApprovalPage(page);
    await po.goto();
    await po.toggleFilterPanel();
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /my-leave-policy ─────────────────────────────────────────────────────────

test.describe('leave: /my-leave-policy (My Leave Policy)', () => {
  test('Year + Show query shows either the assigned policy or the documented empty state', async ({ page }) => {
    const po = new MyLeavePolicyPage(page);
    await po.goto();
    await expect(po.yearInput).toBeVisible();
    await po.showYear(THIS_YEAR);
    await expect(po.showBtn).toBeVisible();   // query ran without crashing / bouncing
    const emptyShown  = await po.hasNoPolicyAssigned();
    const policyShown = await po.hasPolicyContent();
    expect(emptyShown || policyShown, 'either the no-policy empty state or policy content renders').toBeTruthy();
    test.info().annotations.push({ type: 'policy-assigned', description: String(!emptyShown) });
  });
});

// ── /leave-balances ──────────────────────────────────────────────────────────

test.describe('leave: /leave-balances (My Leave Balance)', () => {
  test('Year + Show renders the year-interpolated balance card (Run Accrual never clicked)', async ({ page }) => {
    const po = new LeaveBalancesPage(page);
    await po.goto();
    await expect(po.runAccrualBtn).toBeVisible();   // asserted only — mutating, never clicked
    await po.showYear(THIS_YEAR);
    expect(await po.hasBalanceCardFor(THIS_YEAR), `card "Balance Detail — ${THIS_YEAR}"`).toBeTruthy();
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('ledger footnote shows; empty state is year-interpolated when no balances exist', async ({ page }) => {
    const po = new LeaveBalancesPage(page);
    await po.goto();
    expect(await po.hasLedgerFootnote(), '"computed live from the leave ledger" footnote').toBeTruthy();
    const emptyShown = await po.hasNoBalancesFor(THIS_YEAR);
    const headers    = (await po.gridHeaderTexts()).map(h => h.toLowerCase());
    expect(headers, 'balance breakdown columns render either way').toContain('liability');
    test.info().annotations.push({ type: 'balances-empty', description: String(emptyShown) });
  });
});

// ── /leave-ledger ────────────────────────────────────────────────────────────

test.describe('leave: /leave-ledger (Leave Ledger)', () => {
  test('append-only banner and filter bar render (Export not exercised)', async ({ page }) => {
    const po = new LeaveLedgerPage(page);
    await po.goto();
    expect(await po.hasAppendOnlyBanner(), 'append-only banner').toBeTruthy();
    await expect(po.exportBtn).toBeVisible();     // download — asserted only
    await expect(po.filterBtn).toBeVisible();     // offcanvas toggle
    // The filter fields live in the #ledgerFilterOffcanvas — reveal it first.
    await po.revealFilters();
    await expect(po.employeeSearch, 'employee search ("All (search name / ID)")').toBeVisible();
    await expect(po.fromDateInput).toBeVisible();
    await expect(po.toDateInput).toBeVisible();
  });

  test('employee filter re-renders the ledger grid (empty result must not crash)', async ({ page }) => {
    const po = new LeaveLedgerPage(page);
    await po.goto();
    await po.filterByEmployee('zz-no-such-employee');
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
    expect((await po.gridHeaderTexts()).map(h => h.toLowerCase())).toContain('source ref');
  });
});

// ── /leave-attendance-sync ───────────────────────────────────────────────────

test.describe('leave: /leave-attendance-sync (Leave ↔ Attendance Sync)', () => {
  test('year filter re-renders the reconciliation grid (Recalculate period never clicked)', async ({ page }) => {
    const po = new LeaveAttendanceSyncPage(page);
    await po.goto();
    await expect(po.recalculateBtn).toBeVisible();   // asserted only — mutating, never clicked
    await po.applyYearFilter(THIS_YEAR);
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('LOP footnote shows; documented empty state is tolerated', async ({ page }) => {
    const po = new LeaveAttendanceSyncPage(page);
    await po.goto();
    expect(await po.hasLopFootnote(), '"IsLOP = 1" payroll footnote').toBeTruthy();
    const emptyShown = await po.hasNoLeaveInPeriod();
    expect(emptyShown || (await po.rowCount()) > 0, 'empty state or synced rows').toBeTruthy();
    test.info().annotations.push({ type: 'sync-empty', description: String(emptyShown) });
  });
});

// ── /leave-encashment ────────────────────────────────────────────────────────

test.describe('leave: /leave-encashment (Leave Encashment)', () => {
  test('Request Encashment form shows its named fields (Submit Request never clicked)', async ({ page }) => {
    const po = new LeaveEncashmentPage(page);
    await po.goto();
    await expect(po.leaveTypeSelect,  '"Leave Type" select').toBeVisible();
    await expect(po.daysInput,        '"Days" input').toBeVisible();
    await expect(po.perDayRateInput,  '"Per Day Rate" input').toBeVisible();
    await expect(po.amountLine,       'computed "Amount:" line').toBeVisible();
    await expect(po.submitRequestBtn).toBeVisible();   // asserted only — never clicked
  });

  test('Days × Rate recompute settles without submitting; My Requests grid intact', async ({ page }) => {
    const po = new LeaveEncashmentPage(page);
    await po.goto();
    const blocked = await po.hasNoEncashableNotice();
    if (!blocked) await po.fillRequest({ days: 2, rate: 100 });   // nothing is submitted
    const amount = await po.amountText();
    expect(amount, 'Amount line keeps its "Amount: <n>" shape').toMatch(/Amount:\s*[\d.,]+/i);
    await expect(po.grid).toBeVisible();                          // "My Requests"
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
    test.info().annotations.push({ type: 'encashment-blocked', description: String(blocked) });
  });
});

// ── /leave-encashment-approval ───────────────────────────────────────────────

test.describe('leave: /leave-encashment-approval (Encashment Approvals)', () => {
  test('five filter selects render and Filter re-renders the grid (no row action clicked)', async ({ page }) => {
    const po = new LeaveEncashmentApprovalPage(page);
    await po.goto();
    expect(await po.filterSelectCount(), 'five unlabelled filter selects').toBe(5);
    await po.applyFilter();
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
    expect((await po.gridHeaderTexts()).map(h => h.toLowerCase())).toContain('amount');
  });
});

// ── /leave-delegation ────────────────────────────────────────────────────────

test.describe('leave: /leave-delegation (Leave Approval Delegation)', () => {
  test('read-only delegation registry renders (created via /leave-approval, not here)', async ({ page }) => {
    const po = new LeaveDelegationPage(page);
    await po.goto();
    expect(await po.hasDelegationsCard(), '"Active & Past Delegations" card').toBeTruthy();
    await expect(po.grid).toBeVisible();
    const headers = (await po.gridHeaderTexts()).map(h => h.toLowerCase());
    for (const col of ['From Date', 'To Date', 'Active']) {
      expect(headers, `column "${col}"`).toContain(col.toLowerCase());
    }
    const emptyShown = await po.hasNoDelegations();
    expect(emptyShown || (await po.rowCount()) > 0, 'empty state or delegation rows').toBeTruthy();
  });
});

// ── /employee-handover ───────────────────────────────────────────────────────

test.describe('leave: /employee-handover (Employee Duty Handover)', () => {
  test('Set Up Handover form exposes its named fields (never saved)', async ({ page }) => {
    const po = new EmployeeHandoverPage(page);
    await po.goto();
    await expect(po.employeeAwaySelect, '"Employee going away" select').toBeVisible();
    await expect(po.assignToSelect,     '"Assign duties to" select').toBeVisible();
    await expect(po.fromDateInput).toBeVisible();
    await expect(po.toDateInput).toBeVisible();
    await expect(po.coverApprovalsChk,  '"Cover approvals" (#ca)').toBeVisible();
    await expect(po.coverTasksChk,      '"Cover HRMS tasks" (#ct)').toBeVisible();
    await expect(po.activeChk,          '"Active" (#active)').toBeVisible();
    await expect(po.noteInput,          '"Note (optional)" textarea').toBeVisible();
    await expect(po.saveBtn).toBeVisible();   // asserted only — never clicked
  });

  test('form fills and clears without persisting; handover grid intact', async ({ page }) => {
    const po = new EmployeeHandoverPage(page);
    await po.goto();
    await po.fillHandoverForm({ note: 'zz probe — never saved', coverApprovals: true });
    await po.clearForm();
    expect(await po.noteInput.inputValue(), 'Clear resets the unsaved form').not.toBe('zz probe — never saved');
    await expect(po.grid).toBeVisible();      // "All Handovers"
    expect((await po.gridHeaderTexts()).map(h => h.toLowerCase())).toContain('covers');
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /comp-offs ───────────────────────────────────────────────────────────────

test.describe('leave: /comp-offs (Comp-Off)', () => {
  test('Request Comp-Off opens the request flow and dismisses without submitting', async ({ page }) => {
    const po = new CompOffsPage(page);
    await po.goto();
    expect(await po.openRequestModal(), '"Request Comp-Off" should open a form').toBeTruthy();
    await po.closeModal();
    await expect(po.requestCompOffBtn).toBeVisible();
  });

  test('credits grid renders with its documented quirky empty state (tolerant)', async ({ page }) => {
    const po = new CompOffsPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    expect((await po.gridHeaderTexts()).map(h => h.toLowerCase())).toContain('expiry');
    const emptyShown = await po.hasNoCredits();
    expect(emptyShown || (await po.rowCount()) > 0, 'empty state or credit rows').toBeTruthy();
    test.info().annotations.push({ type: 'credits-empty', description: String(emptyShown) });
  });
});

// ── /comp-off-management ─────────────────────────────────────────────────────

test.describe('leave: /comp-off-management (Comp-Off Management)', () => {
  test('"Pending grant only" toggle re-renders the grid (Grant/Reject never clicked)', async ({ page }) => {
    const po = new CompOffManagementPage(page);
    await po.goto();
    await expect(po.pendingOnlyChk, '"Pending grant only" (#reqOnly)').toBeVisible();
    await po.togglePendingOnly();
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
    await po.togglePendingOnly();   // restore the unfiltered view
    await expect(po.grid).toBeVisible();
  });

  test('all-employees grid keeps its structure (live data exists — no empty assumption)', async ({ page }) => {
    const po = new CompOffManagementPage(page);
    await po.goto();
    const headers = (await po.gridHeaderTexts()).map(h => h.toLowerCase());
    for (const col of ['Employee', 'Source', 'Expiry', 'Status']) {
      expect(headers, `column "${col}"`).toContain(col.toLowerCase());
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /holiday-list ────────────────────────────────────────────────────────────

test.describe('leave: /holiday-list (Holiday)', () => {
  test('New Holiday opens the create modal and dismisses without saving', async ({ page }) => {
    const po = new HolidayListPage(page);
    await po.goto();
    expect(await po.openCreateModal(), '"New Holiday" should open a form').toBeTruthy();
    await po.closeModal();
    await expect(po.newHolidayBtn).toBeVisible();
  });

  test('holiday-name search re-renders the grid (empty result must not crash)', async ({ page }) => {
    const po = new HolidayListPage(page);
    await po.goto();
    await po.searchHoliday('zz-no-such-holiday');
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
    await po.searchHoliday('');   // reset — full list again
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('Calendar button opens the calendar view without crashing', async ({ page }) => {
    // Probed live: "Calendar" navigates to the /holiday-calendar visualisation.
    const po = new HolidayListPage(page);
    await po.goto();
    await po.toggleCalendarView();
    expect(page.url(), 'navigates to /holiday-calendar').toContain('holiday-calendar');
    expect(page.url()).not.toContain('/login');
  });
});

// ── /holiday-assignment-list ─────────────────────────────────────────────────

test.describe('leave: /holiday-assignment-list (Holiday Assignment)', () => {
  test('New Holiday Assignment opens and dismisses without saving', async ({ page }) => {
    const po = new HolidayAssignmentListPage(page);
    await po.goto();
    expect(await po.openCreateModal(), '"New Holiday Assignment" should open a form').toBeTruthy();
    await po.closeModal();
    await expect(po.newAssignmentBtn).toBeVisible();
  });

  test('grid renders its page-specific "Assigned Target Name" column', async ({ page }) => {
    const po = new HolidayAssignmentListPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    // NB: "Assigned Target Name" here, unlike /leave-assignment-list's "Assignment Target Name".
    expect((await po.gridHeaderTexts()).map(h => h.toLowerCase())).toContain('assigned target name');
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /leave-reports ───────────────────────────────────────────────────────────

test.describe('leave: /leave-reports (Leave Reports)', () => {
  test('report hub renders its pickers, filters and run placeholder', async ({ page }) => {
    const po = new LeaveReportsPage(page);
    await po.goto();
    await expect(po.registerBtn).toBeVisible();
    await expect(po.balanceBtn).toBeVisible();
    await expect(po.utilizationBtn).toBeVisible();
    expect(await po.hasRunPlaceholder(), 'initial "Choose a report type…" placeholder').toBeTruthy();
    const types = (await po.leaveTypeOptions()).map(t => t.trim());
    expect(types, 'Leave Type filter mirrors the type masters').toContain('Casual leave');
  });

  test('Register report runs via Filter (read-only) without crashing', async ({ page }) => {
    const po = new LeaveReportsPage(page);
    await po.goto();
    await po.pickReport('Register');
    await po.runReport();
    expect(page.url()).toContain('leave-reports');   // no bounce, no crash
    await expect(po.runFilterBtn).toBeVisible();
    test.info().annotations.push({
      type: 'result-tables',
      description: String(await po.main.locator('table').count()),
    });
  });
});

// ── /absence-analytics ───────────────────────────────────────────────────────

test.describe('leave: /absence-analytics (Absence Analytics)', () => {
  test('dashboard renders — Bradford risk table when data exists, else the documented empty state', async ({ page }) => {
    const po = new AbsenceAnalyticsPage(page);
    await po.goto();
    // DATA-DEPENDENT: with no absence data the page shows only
    // "No analytics available." — a valid, documented state.
    if (await po.isEmpty()) {
      expect(await po.isEmpty(), 'documented no-data state').toBeTruthy();
      return;
    }
    expect(await po.hasBradfordCard(), 'Bradford Factor risk card').toBeTruthy();
    await expect(po.grid).toBeVisible();
    expect((await po.gridHeaderTexts()).map(h => h.toLowerCase())).toContain('signal');
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('year filter re-renders the dashboard', async ({ page }) => {
    const po = new AbsenceAnalyticsPage(page);
    await po.goto();
    await po.applyYearFilter(THIS_YEAR);
    // No-data years collapse to "No analytics available." — no grid rendered.
    if (await po.isEmpty()) {
      expect(page.url()).not.toContain('/login');
      return;
    }
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /leave-calendar ──────────────────────────────────────────────────────────

test.describe('leave: /leave-calendar (Leave Calendar)', () => {
  test('calendar filters render and Show re-queries (async load tolerated)', async ({ page }) => {
    const po = new LeaveCalendarPage(page);
    await po.goto();
    await po.waitCalendarLoaded();                       // initial async render
    await expect(po.branchSelect).toBeVisible();
    await expect(po.departmentSelect).toBeVisible();
    await expect(po.employeeInput, 'employee filter ("Type a name to filter…")').toBeVisible();
    await po.show();                                     // re-query with defaults
    expect(page.url()).toContain('leave-calendar');      // no bounce, no crash
    test.info().annotations.push({ type: 'still-loading', description: String(await po.isLoading()) });
  });

  test('employee-name filter re-queries without crashing', async ({ page }) => {
    const po = new LeaveCalendarPage(page);
    await po.goto();
    await po.waitCalendarLoaded();
    await po.filterByEmployee('zz-nobody');
    await expect(po.showBtn).toBeVisible();              // page intact after empty-result query
    expect(page.url()).toContain('leave-calendar');
  });
});
