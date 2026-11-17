'use strict';

/**
 * Accounts — every menu page that has no deeper spec: Receipts, Payments, Journals, Credit / Debit Notes,
 * Balance Sheet, Year Ending, Exchange Revaluation, Bank Reconciliation, TDS Challans / Register,
 * Account Groups, Voucher Types, Currencies, and the Cheque Collection and Cheque Issue pages.
 *
 * Added 14 Nov 2026, after the Accounts module reached the onetouch_test menu (see
 * reports/qa/changes-onetouch_test-2026-11-14.md). Structure + Add-form + list-search coverage from
 * erp/common/fixtures/pages.<tenant>.json (see erp/common/pageSuite.js).
 * Read-only: opens pages, switches tabs, opens Add forms and closes them without saving. The specs
 * that post vouchers (bank deposit, staff cash, daily report) are the other files in this folder.
 *
 *   npx playwright test erp/accounts/tests/accounts_pages.spec.js --workers=1
 *   npx playwright test erp/accounts/tests/accounts_pages.spec.js -g "Receipts"
 */
const { definePageSuite } = require('../../common/pageSuite');

const area = (...groups) => (e) => groups.includes(e.group);

definePageSuite('Accounts — pages without a deeper spec (Receipts, Payments, Journals, Notes, Balance Sheet, TDS, Groups, Currencies)',
  area('Accounts'));

definePageSuite('Accounts — Cheque Collection and Cheque Issue', area('Cheque Collection', 'Cheque Issue'));
