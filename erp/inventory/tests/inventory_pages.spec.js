'use strict';

/**
 * Inventory, Sales, Purchase, Production and Stock Movements — every menu page that has no deeper spec:
 * Item Groups / Brands / Bundles / Import, Multiple Packing, Arabic Names, Couriers, Price Groups, Tax
 * Categories, Warehouses, Invoice Types, Price Slabs, Margin Rules, Promotions, Promo Codes; Sales Enquiries,
 * Sales Returns, Customer Collection; Purchase Returns, Supplier Payment; Production; Stock Transfers,
 * Inter-Branch Trades.
 *
 * Added 14 Nov 2026, after these modules reached the onetouch_test menu (see
 * reports/qa/changes-onetouch_test-2026-11-14.md). Structure + Add-form + list-search coverage from
 * erp/common/fixtures/pages.<tenant>.json (see erp/common/pageSuite.js).
 * Read-only: opens pages, switches tabs, opens Add forms and closes them without saving. The specs
 * that save items and invoices are the other files in this folder.
 *
 *   npx playwright test erp/inventory/tests/inventory_pages.spec.js --workers=1
 *   npx playwright test erp/inventory/tests/inventory_pages.spec.js -g "Warehouses"
 */
const { definePageSuite } = require('../../common/pageSuite');

const area = (...groups) => (e) => groups.includes(e.group);

definePageSuite('Inventory — masters without a deeper spec (Groups, Brands, Bundles, Packing, Couriers, Price Groups, Tax, Warehouses, Promotions)',
  area('Inventory'));

definePageSuite('Sales and Purchase — Enquiries, Returns, Customer Collection, Supplier Payment', area('Sales', 'Purchase'));

definePageSuite('Production and Stock Movements — Production, Stock Transfers, Inter-Branch Trades', area('Production', 'Stock Movements'));
