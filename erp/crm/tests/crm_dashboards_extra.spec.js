'use strict';

/**
 * CRM — Dashboards without a deeper spec (Executive Performance, Lead Forecast, Task Dashboard)
 * Structure + Add-form coverage from erp/common/fixtures/pages.<tenant>.json (see erp/common/pageSuite.js).
 * Read-only: opens pages, switches tabs, opens Add forms and closes them without saving.
 *
 * Run:  npx playwright test erp/crm/tests/crm_dashboards_extra.spec.js
 */
const { definePageSuite } = require('../../common/pageSuite');

definePageSuite('CRM — Dashboards without a deeper spec (Executive Performance, Lead Forecast, Task Dashboard)', (e) => e.group === 'Dashboards');
