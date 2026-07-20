'use strict';
/**
 * HRMS exploration — step 3
 * Merge all per-page JSON captures into a single summary printed to stdout
 * (used to author the documentation) and hrms/data/summary.json.
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'pages');
const files = fs.readdirSync(DATA).filter(f => f.endsWith('.json'));
const all = files.map(f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')));

const byGroup = {};
for (const p of all) (byGroup[p.group] = byGroup[p.group] || []).push(p);

for (const [g, pages] of Object.entries(byGroup)) {
  console.log(`\n=================== GROUP: ${g} (${pages.length}) ===================`);
  for (const p of pages.sort((a, b) => a.route.localeCompare(b.route))) {
    console.log(`\n--- /${p.route}${p.finalUrl && !p.finalUrl.endsWith('/' + p.route) ? '  → ' + p.finalUrl : ''}`);
    if (p.error) { console.log('   ERROR:', p.error.split('\n')[0]); continue; }
    if (p.headers?.length) console.log('   headers  :', p.headers.slice(0, 4).join(' | '));
    if (p.breadcrumb) console.log('   crumb    :', p.breadcrumb);
    if (p.tabs?.length) console.log('   tabs     :', p.tabs.join(' | '));
    if (p.buttons?.length) console.log('   buttons  :', p.buttons.slice(0, 18).join(' | '));
    for (const t of p.tables || []) {
      if (t.headers.length) console.log(`   table    : [${t.headers.join(', ')}] rows=${t.rowCount}`);
    }
    if (p.inputs?.length) console.log('   inputs   :', p.inputs.slice(0, 12).map(i => i.placeholder || i.name || i.id || i.type).filter(Boolean).join(' | '));
    if (p.selectsNg?.length) console.log('   selects  :', p.selectsNg.slice(0, 8).join(' | '));
    if (p.cards?.length) console.log('   cards    :', p.cards.join(' | '));
    if (p.links?.length) console.log('   links    :', p.links.slice(0, 10).map(l => `${l.text}→${l.href}`).join(' | '));
    if (p.emptyState) console.log('   empty    :', p.emptyState.slice(0, 80));
  }
}

fs.writeFileSync(path.join(__dirname, '..', 'data', 'summary.json'), JSON.stringify(byGroup, null, 2));
console.log('\nsaved data/summary.json');
