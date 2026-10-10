'use strict';
/** Print failing tests + first error lines from a Playwright JSON report.
 *  Usage: node scripts/report_failures.js [path-to-results.json]           */
const path = process.argv[2] || './reports/results.json';
const r = require(require('path').resolve(path));
const walk = (s, acc) => { (s.suites || []).forEach(x => walk(x, acc)); (s.specs || []).forEach(sp => acc.push(sp)); return acc; };
const specs = walk({ suites: r.suites }, []);
for (const sp of specs) {
  const t = sp.tests[0]; if (!t) continue;
  const last = t.results[t.results.length - 1];
  if (last && !['passed', 'skipped'].includes(last.status)) {
    const msg = ((last.error && last.error.message) || '')
      .replace(/\[[0-9;]*m/g, '')
      .split('\n').slice(0, 5).join('  |  ');
    console.log('FAIL:', sp.title);
    console.log('  ', msg.slice(0, 380));
    console.log();
  }
}
