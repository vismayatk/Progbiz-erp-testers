'use strict';

/**
 * Master — pages without a deeper spec (Master, Users, Customisation, Automation, Excel Upload, Locations, Credentials, Help & Support, Top)
 * Structure + Add-form coverage from erp/common/fixtures/pages.<tenant>.json (see erp/common/pageSuite.js).
 * Read-only: opens pages, switches tabs, opens Add forms and closes them without saving.
 *
 * Run:  npx playwright test erp/master/tests/master_pages.spec.js
 */
const { definePageSuite } = require('../../common/pageSuite');

definePageSuite('Master — pages without a deeper spec (Master, Users, Customisation, Automation, Excel Upload, Locations, Credentials, Help & Support, Top)', (e) => ['Master', 'Users', 'Customisation', 'Automation', 'Excel Upload', 'Top', 'Quick Links', 'Locations', 'Credentials', 'Help & Support', '(not in menu)', '(was in menu)'].includes(e.group));
