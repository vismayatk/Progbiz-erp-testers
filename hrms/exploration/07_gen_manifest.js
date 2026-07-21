'use strict';
/**
 * Generate hrms/fixtures/page-manifest.js from the crawl captures.
 * The manifest freezes per-page expectations (title, buttons, grid columns)
 * for the data-driven smoke suite. Dynamic bits (counts like "New 0") are
 * stripped; pages with known quirks get flags.
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'pages');
const OUT = path.join(__dirname, '..', 'fixtures', 'page-manifest.js');

// Buttons that are generic/dynamic — not useful as page identity.
const SKIP_BUTTONS = new Set(['Previous', 'Next', 'Search', 'Show', 'Clear', 'Cancel', 'Refresh']);
// Pages whose header text is known-buggy on this build (assert the buggy text as-is).
const QUIRKS = {
  'employee-remark': 'header shows "Employee Deduction" (build bug) — asserted as-is',
  'add-visit-report': 'header misspelled "Add Vist Report" (build bug) — asserted as-is',
};
// Lazy pages that show a Loading placeholder first.
const LAZY = new Set(['ess', 'ess/probation', 'ess/profile']);
// The 4 re-captured ESS pages have a different JSON shape (sectionTitles, no
// headers/tables) — freeze their identity by hand from the verified screenshots.
const OVERRIDES = {
  // Grant/Reject are per-row actions — they vanish when no pending request rows
  // exist, so they cannot serve as page identity.
  'comp-off-management': { buttons: [] },
  'ess':           { title: 'My Workspace', buttons: ['Apply Leave', 'My Attendance', 'Payslips'], tabs: null },
  'ess/profile':   { title: 'My Profile', buttons: ['Submit Change Request', 'View My Requests'], tabs: null },
  'ess/probation': { title: 'My Probation', buttons: [], tabs: null },
  'ess/requests':  { title: 'My Requests', buttons: [], tabs: null },
};

function deriveTitle(headers) {
  const h0 = (headers[0] || '').trim();
  if (!h0) return '';
  const words = h0.split(/\s+/);
  for (let n = Math.floor(words.length / 2); n >= 1; n--) {
    const p = words.slice(0, n).join(' ');
    if (h0.length > p.length && h0.endsWith(p)) return p;   // "<h1> <crumb…<h1>>" echo
  }
  const h1 = (headers[1] || '').trim();
  if (h1 && h0.startsWith(h1)) return h1;
  return h0;
}

const files = fs.readdirSync(DATA).filter(f => f.endsWith('.json'));
const entries = [];

for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
  if (d.error) continue;

  // Title: the visible H1. headers[0] is the innerText of the page-header wrapper,
  // which on this build is often "<h1> <crumb echo>" (e.g. "Employees HRMS Employees").
  // Derivation: (a) longest word-prefix the string also ends with (the echoed h1);
  // (b) else headers[1] when headers[0] starts with it; (c) else headers[0] as-is.
  const title = deriveTitle(d.headers || []);

  // Identity buttons: first few stable, non-generic buttons.
  const buttons = (d.buttons || [])
    .map(b => b.replace(/\s+\d+$/, '').replace(/\s*\(\d+\)$/, '').trim())  // "New 0" / "Inbox (0)" → base name
    .filter(b => b && b.length > 1 && b.length < 40 && !SKIP_BUTTONS.has(b))
    .filter((b, i, a) => a.indexOf(b) === i)
    .slice(0, 4);

  // Grid columns of the first table (if any).
  const table = (d.tables || [])[0];
  const columns = table && table.headers && table.headers.length ? table.headers.slice(0, 12) : null;

  const tabs = (d.tabs || [])
    .map(t => t.replace(/\s+\d+$/, '').replace(/\s*\(\d+\)$/, '').trim())
    .filter((t, i, a) => t && a.indexOf(t) === i).slice(0, 6);

  const ov = OVERRIDES[d.route] || {};
  entries.push({
    route: d.route,
    group: d.group,
    title: (ov.title !== undefined ? ov.title : title).trim(),
    buttons: ov.buttons !== undefined ? ov.buttons : buttons,
    columns,
    tabs: ov.tabs !== undefined ? ov.tabs : (tabs.length ? tabs : null),
    lazy: LAZY.has(d.route) || undefined,
    quirk: QUIRKS[d.route] || undefined,
  });
}

entries.sort((a, b) => a.group.localeCompare(b.group) || a.route.localeCompare(b.route));

const body =
`'use strict';
/**
 * AUTO-GENERATED from hrms/data/pages/*.json by exploration/07_gen_manifest.js
 * (crawl of ${entries.length} HRMS pages). Regenerate after a re-crawl:
 *   node hrms/exploration/07_gen_manifest.js
 * Hand-edits: prefer fixing the generator, not this file.
 */
module.exports = ${JSON.stringify(entries, null, 2)};
`;

fs.writeFileSync(OUT, body);
console.log(`✅ manifest written: ${OUT} (${entries.length} pages)`);
