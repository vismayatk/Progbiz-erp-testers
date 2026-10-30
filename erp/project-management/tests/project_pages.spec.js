'use strict';

/**
 * Projects & Work Flow — pages without a deeper spec (Collections, Expenses, Delay Report, Notes, Cost Types…)
 * Structure + Add-form coverage from erp/common/fixtures/pages.<tenant>.json (see erp/common/pageSuite.js).
 * Read-only: opens pages, switches tabs, opens Add forms and closes them without saving.
 *
 * Run:  npx playwright test erp/project-management/tests/project_pages.spec.js
 */
const { definePageSuite } = require('../../common/pageSuite');

definePageSuite('Projects & Work Flow — pages without a deeper spec (Collections, Expenses, Delay Report, Notes, Cost Types…)', (e) => ['Projects', 'Work Flow'].includes(e.group));
