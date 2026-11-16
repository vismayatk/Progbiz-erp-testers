'use strict';

/**
 * HRMS pages inside the ERP (onetouch_test) — Core HR, Recruitment, Onboarding, Attendance, Leave, Work From Home,
 * Payroll, Exit, My Workspace, Letters, Meetings … plus the CRM and Complaints pages added with them.
 *
 * These ~155 pages appeared in the ERP sidebar between the 13 Oct and 2 Nov 2026 snapshots (see
 * reports/qa/changes-onetouch_test-2026-11-02.md). The HRMS suite in hrms/ checks the same product on the
 * hrms-test tenant; this spec checks what the ERP tenant itself shows.
 * Structure + Add-form coverage from erp/common/fixtures/pages.<tenant>.json (see erp/common/pageSuite.js).
 * Read-only: opens pages, switches tabs, opens Add forms and closes them without saving.
 *
 * One suite per area, so a failure points at an area and one area can be run alone:
 *   npx playwright test erp/hrms-in-erp/tests/hrms_pages.spec.js -g "Payroll"
 *
 * A new menu group that no spec selects is not tested: after a /qa-changes run, check
 *   node -e 'console.log([...new Set(require("./erp/common/fixtures/pages.onetouch_test.json").pages.map(p=>p.group))])'
 * against the group lists in the specs that call definePageSuite.
 */
const { definePageSuite } = require('../../common/pageSuite');

const area = (...groups) => (e) => groups.includes(e.group);

definePageSuite('HRMS in ERP — CRM, Complaints and Helpdesk pages (Payment Pending Leads, Complaint Workflows, Helpdesk Admin)',
  area('CRM', 'Complaints', 'Helpdesk Admin'));

definePageSuite('HRMS in ERP — People: Core HR, Onboarding, Probation, Candidates, Recruitment, Pipeline, Referral',
  area('Core HR', 'Onboarding', 'Probation', 'Candidates', 'Recruitment', 'Pipeline', 'Referral Administration', 'Settings'));

definePageSuite('HRMS in ERP — Policy Management (Policies, Compliance, Expiry, Analytics, Templates, Regulations, Audit)',
  area('Policy Management'));

definePageSuite('HRMS in ERP — Time: Attendance, Work From Home, Leave, Setup, Records, Approvals, Analytics',
  area('Attendance', 'Work From Home', 'Leave Management', 'Setup', 'Records & Oversight', 'Approvals', 'Analytics'));

definePageSuite('HRMS in ERP — Payroll: Pay Design, Processing, Tax & Compliance, Payroll, Consultant Payouts, Reports',
  area('Pay Design', 'Processing', 'Tax & Compliance', 'Payroll', 'Consultant Payouts', 'Reports'));

definePageSuite('HRMS in ERP — Resignation & Exit', area('Resignation & Exit'));

definePageSuite('HRMS in ERP — My Workspace', area('My Workspace'));

definePageSuite('HRMS in ERP — Letters, Meetings, Documents', area('Letters', 'Meetings', 'Documents'));
