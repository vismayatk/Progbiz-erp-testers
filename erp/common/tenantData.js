'use strict';

/**
 * Per-tenant master data the suites depend on. Tenants differ (branches, follow-up
 * status names, items, executives, routes), so tests read the expected values from
 * here instead of hard-coding one tenant's data.
 *
 * Add a tenant: run `node scripts/qa/audit_tenant_data.js` against it and copy the
 * values in. onetouch_test comes from reports/qa/TENANT-AUDIT-onetouch_test-2026-10-09.md.
 */
const PROFILES = {
  lesol_test: {
    branch: 'Kannur',                 // default branch on the enquiry form + task modal
    enquiryHasBranch: true,
    taskModalHasBranch: true,
    // Follow-up status names by nature
    status: { new: 'New Enquiry', inFollowup: 'Interested', won: 'Got the business', lost: 'Not interested' },
    leadQualityForNew: 'optional',    // Sep-2026 build: always rendered, optional for New
    leadQuality: ['Cold', 'Warm', 'Hot'],
    leadSource: null,                 // null = first real source
    item: 'Inverter',
    itemCategory: 'Solar',
    executives: ['VIGNESH', 'SHAMAL', 'JASEEM', 'Biju', 'Arshida', 'Shaju Ummar'],
    routes: { items: '/items', itemCategories: '/item-categories', quotations: '/quotations' },
    itemForm: 'page',                 // /item create page
    knownDefects: [],
  },
  onetouch_test: {
    branch: 'Main Branch',
    enquiryHasBranch: false,          // single-branch tenant: the enquiry form hides Branch
    taskModalHasBranch: false,
    status: { new: 'New Enquiry', inFollowup: 'Call not answering', won: 'Deal Closed', lost: 'Lost' },
    leadQualityForNew: 'hidden',      // older build: Lead Quality only for In-Followup statuses
    leadQuality: ['Cold', 'Warm', 'Hot', 'Not Connected', 'Not Reachable'],
    leadSource: 'Google',             // the first options are a blank source and a junk source named "All"
    item: 'Cameras',
    itemCategory: null,               // the tenant has no item categories
    executives: ['Amit', 'Anciya', 'Ansar', 'Joel', 'Keith', 'Merina', 'Pritesh', 'Riyas', 'Shihab', 'Vanshika'],
    routes: { items: '/crm-items', itemCategories: '/crm-item-categories', quotations: null }, // quotations live in /leads (Type = Quotation)
    itemForm: 'modal',                // "New Item" modal on /crm-items
    knownDefects: ['QT-F1'],          // quotation follow-up default is below its own minimum (UAE vs browser clock)
  },
};

/** Customers/leads this suite created — the only ones tests may pick as "existing". */
const AUTOMATION_NAME = /^(Test Customer|QT Cust|FU Cust|ENQ Cust|Status |QA_|CH Cust|Chain )/i;

/** Junk options that must never be chosen as a real lead source. */
const JUNK_SOURCE = /^(|all|choose|select|--.*--)$/i;

function tenant(company = process.env.COMPANY_CODE) {
  const key = String(company || '').toLowerCase();
  if (PROFILES[key]) return PROFILES[key];
  console.log(`  ⚠️  No tenant profile for "${company}" in erp/common/tenantData.js — using lesol_test values`);
  return PROFILES.lesol_test;
}

module.exports = { tenant, PROFILES, AUTOMATION_NAME, JUNK_SOURCE };
