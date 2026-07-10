'use strict';
/**
 * Auto-generate TEST_CASES.md from the actual Playwright test titles.
 * Parses tests/*.spec.js for `test('TC-.. | ...')` and writes a table of
 * Test Case ID · Description · run command. Kept in sync automatically via the
 * "pretest" npm hook (runs before every `npm test`) — or run `npm run docs`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ERP_DIR = path.join(ROOT, 'erp');
const OUT = path.join(ROOT, 'docs', 'TEST_CASES.md');

// Recursively collect every *.spec.js under erp/ (erp/<module>/tests/…)
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.spec.js')) out.push(full);
  }
  return out;
}
const specFiles = walk(ERP_DIR);
const specs = specFiles.map(f => path.relative(ROOT, f).replace(/\\/g, '/'));
const rows = [];
for (let i = 0; i < specFiles.length; i++) {
  const spec = specs[i];
  const src = fs.readFileSync(specFiles[i], 'utf8');
  // test('TC-.. | ...') / test('TM-.. | ...') — lazy match to the matching closing
  // quote + comma, so titles with embedded quotes (e.g. "In Follow-up") are captured.
  const re = /test(?:\.\w+)?\(\s*(['"`])((?:TC|TM|MU|Login|Home|Item|ENQ|QT)[-_][\s\S]*?)\1\s*,/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const title = m[2].trim();
    const [idPart, ...descParts] = title.split('|');
    const id = idPart.trim();
    const desc = descParts.join('|').trim();
    // grep that uniquely targets this title: "TC-13 |"  (TC-02 won't match TC-02B)
    const grep = `${id} \\|`;
    rows.push({ id, desc, grep, spec });
  }
}

const cmd = g => `npx playwright test -g "${g}"`;
const cmdHeaded = g => `npx playwright test --headed -g "${g}"`;

const lines = [];
lines.push('# CRM Test Cases — IDs & Run Commands');
lines.push('');
lines.push('> **Auto-generated** by `scripts/gen-testcases.js` from the Playwright test titles.');
lines.push('> Do not edit by hand — it regenerates before every `npm test` (the `pretest` hook), or run `npm run docs`.');
lines.push(`> Last generated: ${new Date().toISOString()} · ${rows.length} test cases in ${specs.length} spec file(s).`);
lines.push('');
lines.push('Run all (headless): `npm test` · Run all (visible browser): `npm run test:headed` · Interactive: `npx playwright test --ui`');
lines.push('');
lines.push('| Test Case ID | Description | Headless command | Headed (browser) command |');
lines.push('|---|---|---|---|');
for (const r of rows) {
  lines.push(`| ${r.id} | ${r.desc} | \`${cmd(r.grep)}\` | \`${cmdHeaded(r.grep)}\` |`);
}
lines.push('');
lines.push('**Tips**');
lines.push('- Run several at once: `npx playwright test -g "TC-13|TC-14|TC-15|TC-16"`.');
lines.push('- Watch with slow-mo: prefix `HEADED=1` (PowerShell: `$env:HEADED=1; ...`).');
lines.push('- Use installed Chrome: prefix `CHANNEL=chrome` (PowerShell: `$env:CHANNEL="chrome"; ...`).');
lines.push('- Run from the project root (`erp-tests`), not `git_max`.');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'));
console.log(`📝 TEST_CASES.md updated — ${rows.length} test cases from ${specs.join(', ')}`);
