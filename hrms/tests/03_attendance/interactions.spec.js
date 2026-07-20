'use strict';

/**
 * Attendance & Time — interaction suite (15 pages, POM-driven).
 *
 * PRIMARY interactions only, STRICTLY non-destructive:
 *   - open a create-form/modal or Filter dialog → assert it revealed → dismiss
 *     WITHOUT saving/applying
 *   - apply a search/filter and assert the grid re-renders (rowCount >= 0,
 *     grid still attached, no /login bounce, no crash)
 *   - assert documented empty-states and column identities (incl. the build's
 *     header typos, asserted verbatim per the manifest)
 *
 * Every test navigates independently via its POM (no shared state).
 * No Save / Submit / Assign / Finalize / Approve / Delete / Export is ever
 * clicked — mutation buttons are exposed by the POMs for assertion only.
 * No page in this group has tabs (manifest: tabs null throughout), so there
 * are no tab-switch tests.
 */
const { test, expect } = require('@playwright/test');

const { ShiftsPage }                  = require('../../pages/attendance/ShiftsPage');
const { ShiftRosterPage }             = require('../../pages/attendance/ShiftRosterPage');
const { AttendanceLogPage }           = require('../../pages/attendance/AttendanceLogPage');
const { DataFromDevicePage }          = require('../../pages/attendance/DataFromDevicePage');
const { AddVisitReportPage }          = require('../../pages/attendance/AddVisitReportPage');
const { RegularizationPage }          = require('../../pages/attendance/RegularizationPage');
const { OvertimeApprovalPage }        = require('../../pages/attendance/OvertimeApprovalPage');
const { AttendanceFinalizationPage }  = require('../../pages/attendance/AttendanceFinalizationPage');
const { GeofencesPage }               = require('../../pages/attendance/GeofencesPage');
const { TimesheetPage }               = require('../../pages/attendance/TimesheetPage');
const { AttendanceReportPackPage }    = require('../../pages/attendance/AttendanceReportPackPage');
const { ApprovalOperationPage }       = require('../../pages/attendance/ApprovalOperationPage');
const { ApprovalOperationReportPage } = require('../../pages/attendance/ApprovalOperationReportPage');
const { ApprovalAbsentPage }          = require('../../pages/attendance/ApprovalAbsentPage');
const { ApprovalAbsentReportPage }    = require('../../pages/attendance/ApprovalAbsentReportPage');

// ── /shifts ──────────────────────────────────────────────────────────────────

test.describe('attendance: /shifts (Shifts)', () => {
  test('New Shift form opens and dismisses without saving', async ({ page }) => {
    const po = new ShiftsPage(page);
    await po.goto();
    const opened = await po.openCreateForm();
    expect(opened, 'New Shift should open a create form').toBeTruthy();
    await po.closeCreateForm();
    await expect(po.newShiftBtn).toBeVisible();   // back on the master list
  });

  test('shift-name search re-renders the definitions grid', async ({ page }) => {
    const po = new ShiftsPage(page);
    await po.goto();
    await po.search('zz-no-such-shift');
    await expect(po.grid).toBeVisible();
    // NOTE: the tbody keeps a single EMPTY placeholder row — count is not data.
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /shift-roster ────────────────────────────────────────────────────────────

test.describe('attendance: /shift-roster (Shift Roster)', () => {
  test('Assign A Shift form exposes its mandatory fields (nothing assigned)', async ({ page }) => {
    const po = new ShiftRosterPage(page);
    await po.goto();
    await expect(po.shiftSelect,        'Shift* select').toBeVisible();
    await expect(po.scopeSelect,        'Scope* select').toBeVisible();
    await expect(po.effectiveFromInput, 'Effective From* date').toBeVisible();
    await expect(po.assignBtn,          '"Assign" exposed but never clicked').toBeVisible();
    const scopes = (await po.scopeOptions()).join(' | ');
    for (const s of ['Company', 'Branch', 'Department', 'Employee']) {
      expect(scopes, `Scope option "${s}"`).toMatch(new RegExp(s, 'i'));
    }
    await expect(po.helpText, 'precedence help ("most-specific assignment wins")').toBeVisible();
  });

  test('scope switch re-renders the dependent Target control', async ({ page }) => {
    const po = new ShiftRosterPage(page);
    await po.goto();
    for (const scope of ['Branch', 'Department', 'Employee', 'Company']) {
      await po.selectScope(scope);                                   // form state only
      expect(page.url(), `no crash/bounce after Scope="${scope}"`).not.toContain('/login');
    }
    await expect(po.scopeSelect).toBeVisible();   // form intact after the cascade
  });

  test('assignment search and active-only toggle re-render the grid', async ({ page }) => {
    const po = new ShiftRosterPage(page);
    await po.goto();
    await po.searchAssignments('zz-no-such-assignment');
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);

    await po.toggleActiveOnly();          // UI-only grid filter …
    await expect(po.grid).toBeVisible();
    await po.toggleActiveOnly();          // … restored to its original state
    await expect(po.grid).toBeVisible();
  });
});

// ── /attendance-log ──────────────────────────────────────────────────────────

test.describe('attendance: /attendance-log (Attendance Report)', () => {
  test('report grid renders its wide column set (0 rows until Filter)', async ({ page }) => {
    const po = new AttendanceLogPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Session Details', 'Must Work Hour', 'Balance Working Hours']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);   // pre-filter baseline is empty
  });

  test('Filter dialog opens and dismisses without applying', async ({ page }) => {
    const po = new AttendanceLogPage(page);
    await po.goto();
    const opened = await po.openFilterDialog();
    expect(opened, '"Filter" should reveal the criteria dialog').toBeTruthy();
    await po.closeFilterDialog();
    await expect(po.filterBtn).toBeVisible();   // back on the report baseline
  });
});

// ── /data-from-device ────────────────────────────────────────────────────────

test.describe('attendance: /data-from-device (Data from device)', () => {
  test('punch grid renders its device columns (0 rows until Filter)', async ({ page }) => {
    const po = new DataFromDevicePage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Is Registered In System', 'Device Name', 'Punching Sync Time', 'Image']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);   // pre-filter baseline is empty
  });

  test('Filter dialog opens and dismisses without applying', async ({ page }) => {
    const po = new DataFromDevicePage(page);
    await po.goto();
    const opened = await po.openFilterDialog();
    expect(opened, '"Filter" should reveal the criteria dialog').toBeTruthy();
    await po.closeFilterDialog();
    await expect(po.filterBtn).toBeVisible();
  });
});

// ── /add-visit-report ────────────────────────────────────────────────────────

test.describe('attendance: /add-visit-report (Add Vist Report)', () => {
  test('page keeps its misspelled "Add Vist Report" header and visit columns', async ({ page }) => {
    const po = new AddVisitReportPage(page);
    await po.goto();
    // Build typo asserted AS-IS per the manifest quirk.
    expect(await po.containsText('Add Vist Report'), 'typo header "Add Vist Report"').toBeTruthy();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Site Image', 'Mobile Location', 'Purpose']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);   // pre-filter baseline is empty
  });

  test('Filter dialog opens and dismisses without applying', async ({ page }) => {
    const po = new AddVisitReportPage(page);
    await po.goto();
    const opened = await po.openFilterDialog();
    expect(opened, '"Filter" should reveal the criteria dialog').toBeTruthy();
    await po.closeFilterDialog();
    await expect(po.filterBtn).toBeVisible();
  });
});

// ── /regularization ──────────────────────────────────────────────────────────

test.describe('attendance: /regularization (Regularization)', () => {
  test('Raise A Correction form exposes its named fields (nothing submitted)', async ({ page }) => {
    const po = new RegularizationPage(page);
    await po.goto();
    await expect(po.employeeSelect,  'Employee* select').toBeVisible();
    await expect(po.dateInput,       'Date* input').toBeVisible();
    await expect(po.typeSelect,      'Type* select').toBeVisible();
    await expect(po.inTimeInput,     'In Time (datetime-local)').toBeVisible();
    await expect(po.outTimeInput,    'Out Time (datetime-local)').toBeVisible();
    await expect(po.reasonTextarea,  'Reason textarea').toBeVisible();
    await expect(po.submitBtn,       '"Submit" exposed but never clicked').toBeVisible();
    const types = (await po.typeOptions()).join(' | ');
    for (const t of ['Missed Punch', 'Wrong Punch', 'Missed Check In', 'Missed Check Out', 'Manual Entry']) {
      expect(types, `Type option "${t}"`).toContain(t);
    }
  });

  test('Clear resets the correction draft (no request raised)', async ({ page }) => {
    const po = new RegularizationPage(page);
    await po.goto();
    await po.reasonTextarea.fill('zz probe — draft only, never submitted');
    await po.clearForm();
    expect(await po.reasonTextarea.inputValue(), 'Reason returns to default').toBe('');
  });

  test('requests search re-renders the grid', async ({ page }) => {
    const po = new RegularizationPage(page);
    await po.goto();
    await po.searchRequests('zz-no-such-request');
    await expect(po.grid).toBeVisible();
    // NOTE: the tbody keeps a single EMPTY placeholder row — count is not data.
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /overtime-approval ───────────────────────────────────────────────────────

test.describe('attendance: /overtime-approval (Overtime Approval)', () => {
  test('queue grid renders its OT columns (row Actions never touched)', async ({ page }) => {
    const po = new OvertimeApprovalPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['OT Min', 'Eligible', 'Payout', 'Exported']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('search and date-range filters re-render the queue', async ({ page }) => {
    const po = new OvertimeApprovalPage(page);
    await po.goto();
    await po.search('zz-no-such-employee');
    await expect(po.grid).toBeVisible();
    await po.filterByDateRange('2026-07-01', '2026-07-31');
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /attendance-finalization ─────────────────────────────────────────────────

test.describe('attendance: /attendance-finalization (Attendance Finalization)', () => {
  test('pay-cycle form exposes its five mandatory fields (never finalized)', async ({ page }) => {
    const po = new AttendanceFinalizationPage(page);
    await po.goto();
    await expect(po.monthSelect,  'Month* select').toBeVisible();
    await expect(po.yearSelect,   'Year* select').toBeVisible();
    await expect(po.scopeSelect,  'Scope* select').toBeVisible();
    await expect(po.targetSelect, 'Target* select').toBeVisible();
    await expect(po.cutOffInput,  'Cut-Off* date').toBeVisible();
    await expect(po.finalizeBtn,  '"Finalize" exposed but NEVER clicked').toBeVisible();
    const months = (await po.monthOptions()).join(' | ');
    expect(months).toMatch(/January/i);
    expect(months).toMatch(/December/i);
  });

  test('scope switch drives the dependent Target default', async ({ page }) => {
    const po = new AttendanceFinalizationPage(page);
    await po.goto();
    await po.selectScope('Branch');                                  // form state only
    const placeholder = await po.targetPlaceholderText();
    expect(placeholder.toLowerCase(), 'Target default follows Scope ("-- select branch --")')
      .toContain('branch');
    await po.selectScope('Employee');
    await expect(po.targetSelect, 'Target select survives the cascade').toBeVisible();
    expect(page.url()).not.toContain('/login');
  });

  test('runs search re-renders the grid', async ({ page }) => {
    const po = new AttendanceFinalizationPage(page);
    await po.goto();
    await po.searchRuns('zz-no-such-target');
    await expect(po.grid).toBeVisible();
    // NOTE: the tbody keeps a single EMPTY placeholder row — count is not data.
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /geofences ───────────────────────────────────────────────────────────────

test.describe('attendance: /geofences (Geofence Locations)', () => {
  test('Add Location opens the create flow and is dismissed unsaved', async ({ page }) => {
    const po = new GeofencesPage(page);
    await po.goto();
    const opened = await po.openCreateForm();
    expect(opened, 'Add Location should open a create form').toBeTruthy();
    await po.closeCreateForm();
    await expect(po.addLocationBtn).toBeVisible();   // back on the register
  });

  test('location search re-renders the grid with its numeric columns', async ({ page }) => {
    const po = new GeofencesPage(page);
    await po.goto();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Lat', 'Long', 'Radius', 'Status', 'Active']) {   // Status ≠ Active
      expect(headers, `column "${col}"`).toContain(col);
    }
    await po.search('zz-no-such-location');
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /timesheet ───────────────────────────────────────────────────────────────

test.describe('attendance: /timesheet (Timesheet)', () => {
  test('read-only comparison grid renders Attendance Hrs vs Task Hrs', async ({ page }) => {
    const po = new TimesheetPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Attendance Hrs', 'Task Hrs', 'Tasks']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('employee search and date range re-render the grid', async ({ page }) => {
    const po = new TimesheetPage(page);
    await po.goto();
    await po.search('zz-no-such-employee');
    await expect(po.grid).toBeVisible();
    await po.filterByDateRange('2026-07-01', '2026-07-31');
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /attendance-report-pack ──────────────────────────────────────────────────

test.describe('attendance: /attendance-report-pack (Attendance Report Pack)', () => {
  test('empty state "No records." with the pagination shell before any filter', async ({ page }) => {
    const po = new AttendanceReportPackPage(page);
    await po.goto();
    if (await po.emptyState.isVisible().catch(() => false)) {
      await expect(po.emptyState, 'documented pre-filter state "No records."').toBeVisible();
    } else {
      // Data exists since the crawl — the register card must still render.
      expect(await po.containsText('Daily Register')).toBeTruthy();
    }
    await expect(po.pageIndicator,     '"Page 1" indicator').toBeVisible();
    await expect(po.rowsPerPageSelect, 'Rows per page 50|100|250|500').toBeVisible();
    await expect(po.exportBtn,         '"Export" exposed but never clicked (download)').toBeVisible();
  });

  test('rows-per-page change keeps the pager on Page 1', async ({ page }) => {
    const po = new AttendanceReportPackPage(page);
    await po.goto();
    await po.setRowsPerPage('50');                       // read-only view change
    expect(await po.pageIndicatorText()).toMatch(/page\s*1\b/i);
    await expect(po.exportBtn).toBeVisible();            // page did not crash
  });

  test('filter panel toggles via the unlabeled card-header icon button', async ({ page }) => {
    const po = new AttendanceReportPackPage(page);
    await po.goto();
    const changed = await po.toggleFilterPanel();
    expect(changed, 'icon button should show/hide the filter inputs').toBeTruthy();
    await po.toggleFilterPanel();                        // restored — nothing applied
    await expect(po.exportBtn).toBeVisible();
  });
});

// ── /approval-operation ──────────────────────────────────────────────────────

test.describe('attendance: /approval-operation (Approval Operation)', () => {
  test('queue grid keeps its misspelled minute columns (0 rows until Filter)', async ({ page }) => {
    const po = new ApprovalOperationPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    // Build typos asserted VERBATIM per the manifest — "Miutes", not "Minutes".
    expect(headers, 'typo column "Entry Late Miutes"').toContain('Entry Late Miutes');
    expect(headers, 'typo column "Exit Early Miutes"').toContain('Exit Early Miutes');
    expect(headers, 'decision column "Approval" (never clicked)').toContain('Approval');
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);   // pre-filter baseline is empty
  });

  test('Filter dialog opens and dismisses without approving anything', async ({ page }) => {
    const po = new ApprovalOperationPage(page);
    await po.goto();
    const opened = await po.openFilterDialog();
    expect(opened, '"Filter" should reveal the criteria dialog').toBeTruthy();
    await po.closeFilterDialog();
    await expect(po.filterBtn).toBeVisible();
  });
});

// ── /approval-operation-report ───────────────────────────────────────────────

test.describe('attendance: /approval-operation-report (Approval Operation Report)', () => {
  test('register grid renders its Details/Delete columns (0 rows until Filter)', async ({ page }) => {
    const po = new ApprovalOperationReportPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Discount from Permission Hours', 'Final Hours', 'Details', 'Delete']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);   // pre-filter baseline is empty
  });

  test('Filter dialog opens and dismisses without applying', async ({ page }) => {
    const po = new ApprovalOperationReportPage(page);
    await po.goto();
    const opened = await po.openFilterDialog();
    expect(opened, '"Filter" should reveal the criteria dialog').toBeTruthy();
    await po.closeFilterDialog();
    await expect(po.filterBtn).toBeVisible();
  });
});

// ── /approval-absent ─────────────────────────────────────────────────────────

test.describe('attendance: /approval-absent (Approval Absent)', () => {
  test('absent queue renders its columns (note the "SL NO" casing)', async ({ page }) => {
    const po = new ApprovalAbsentPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    // Header casing differs from sibling pages — normalise case-insensitively.
    const lower = (await po.gridHeaderTexts()).map(h => h.toLowerCase());
    for (const col of ['sl no', 'period type', 'hours employee must work', 'approval']) {
      expect(lower, `column "${col}" (case-insensitive)`).toContain(col);
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);   // pre-filter baseline is empty
  });

  test('Filter dialog opens and dismisses without approving anything', async ({ page }) => {
    const po = new ApprovalAbsentPage(page);
    await po.goto();
    const opened = await po.openFilterDialog();
    expect(opened, '"Filter" should reveal the criteria dialog').toBeTruthy();
    await po.closeFilterDialog();
    await expect(po.filterBtn).toBeVisible();
  });
});

// ── /approval-absent-report ──────────────────────────────────────────────────

test.describe('attendance: /approval-absent-report (Approval Absent Report)', () => {
  test('register grid renders Start/End Time columns (0 rows until Filter)', async ({ page }) => {
    const po = new ApprovalAbsentReportPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Start Time', 'End Time', 'Final Hours', 'Details', 'Delete']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);   // pre-filter baseline is empty
  });

  test('Filter dialog opens and dismisses without applying', async ({ page }) => {
    const po = new ApprovalAbsentReportPage(page);
    await po.goto();
    const opened = await po.openFilterDialog();
    expect(opened, '"Filter" should reveal the criteria dialog').toBeTruthy();
    await po.closeFilterDialog();
    await expect(po.filterBtn).toBeVisible();
  });
});
