'use strict';

/**
 * Task Management — pages without a deeper spec (Calendar, To Do, Timeline, Daily Activity, Predefined Tasks)
 * Structure + Add-form coverage from erp/common/fixtures/pages.<tenant>.json (see erp/common/pageSuite.js).
 * Read-only: opens pages, switches tabs, opens Add forms and closes them without saving.
 *
 * Run:  npx playwright test erp/task-management/tests/task_extra_pages.spec.js
 */
const { definePageSuite } = require('../../common/pageSuite');

definePageSuite('Task Management — pages without a deeper spec (Calendar, To Do, Timeline, Daily Activity, Predefined Tasks)', (e) => e.group === 'Task Management');
