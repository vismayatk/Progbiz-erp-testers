'use strict';

const ts = Date.now();

const testData = {
  enquiry: {
    customerName:  `Test Customer ${ts}`,
    mobile:        '9' + String(ts).slice(-9),   // unique per run (avoids "phone already exists")
    email:         `customer${ts}@example.com`,
    source:        'Website',
    product:       'Inverter',   // must match a real Inventory item (Generator/Inverter/Heat Pump/...)
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
