'use strict';

const { tenant } = require('./tenantData');

// One timestamp per `playwright test` run, shared by every worker. A worker restarts after a failed test and
// re-imports this file; a per-import Date.now() then gave later tests (TC-11) a different customer name from
// the one TC-02 created. Workers inherit this variable from the runner process.
process.env.QA_RUN_TS = process.env.QA_RUN_TS || String(Date.now());
const ts = Number(process.env.QA_RUN_TS);

const testData = {
  enquiry: {
    customerName:  `Test Customer ${ts}`,
    mobile:        '9' + String(ts).slice(-9),   // unique per run (avoids "phone already exists")
    email:         `customer${ts}@example.com`,
    source:        tenant().leadSource,
    product:       tenant().item,   // a real item on the current tenant (see tenantData.js)
    description:   `Auto enquiry created at ${new Date().toISOString()}`,
    quantity:      '5',
    unitPrice:     '1000',
  },
  followUp: {
    notes:         `Follow-up note ${ts}`,
    nextFollowUp:  getFutureDate(3),
  },
  quotation: {
    discount:      '5',
    terms:         'Payment within 30 days',
  },
};

function getFutureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

module.exports = { testData, ts };
