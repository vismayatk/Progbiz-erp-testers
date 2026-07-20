'use strict';
/** Print failing tests + first error lines from the HRMS JSON report. */
const r = require('../../reports/hrms-results.json');
const walk = (s, acc) => { (s.suites || []).forEach(x => walk(x, acc)); (s.specs || []).forEach(sp => acc.push(sp)); return acc; };
const specs = walk({ suites: r.suites }, []);
for (const sp of specs) {
  const t = sp.tests[0]; if (!t) continue;
  const last = t.results[t.results.length - 1];
  if (last && last.status !== 'passed') {
    const msg = ((last.error && last.error.message) || '')
      .replace(/\[[0-9;]*m/g, '')
      .split('\n').slice(0, 5).join('  |  ');
    console.log('FAIL:', sp.title);
    console.log('  ', msg.slice(0, 420));
    console.log();
  }
}
