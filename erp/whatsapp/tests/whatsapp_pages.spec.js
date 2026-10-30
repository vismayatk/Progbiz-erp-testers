'use strict';

/**
 * WhatsApp — Chat, Broadcasts, Bots, Accounts, Templates, Knowledge Base
 * Structure + Add-form coverage from erp/common/fixtures/pages.<tenant>.json (see erp/common/pageSuite.js).
 * Read-only: opens pages, switches tabs, opens Add forms and closes them without saving.
 *
 * Run:  npx playwright test erp/whatsapp/tests/whatsapp_pages.spec.js
 */
const { definePageSuite } = require('../../common/pageSuite');

definePageSuite('WhatsApp — Chat, Broadcasts, Bots, Accounts, Templates, Knowledge Base', (e) => e.group === 'Whatsapp');
