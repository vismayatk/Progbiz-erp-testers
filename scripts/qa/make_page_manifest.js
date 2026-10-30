'use strict';
/**
 * Build the expected-structure manifest for pages that no hand-written test opens.
 *
 *   node scripts/qa/make_page_manifest.js                 newest complete site-audit snapshot -> erp/common/fixtures/pages.<company>.json
 *   node scripts/qa/make_page_manifest.js --from <file>   use a specific snapshot
 *   node scripts/qa/make_page_manifest.js --all           every page, not only the uncovered ones
 *   node scripts/qa/make_page_manifest.js --keep          keep entries already in the manifest, add the new ones only
 *
 * The manifest is committed and meant to be read by a person: for each page it lists the
 * heading, tabs, table columns, buttons, filter controls and the Add form (opener, kind, fields,
 * required) the page had when it was last reviewed. erp/common/pageSuite.js checks every page
 * against it. Volatile things (row data, counts, dates, ids that contain numbers, dropdown values)
 * are left out on purpose.
 *
 * Edit the file by hand to add `known` (a tracked defect), `noForm`, `permission`, or to tighten
 * what a page must show. Regenerating keeps those hand-written keys (see PRESERVE).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const ROOT = path.join(__dirname, '..', '..');
const RAW = path.join(ROOT, 'reports', 'qa', 'raw');
const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const COMPANY = arg('--company') || process.env.COMPANY_CODE;
const OUT = path.join(ROOT, 'erp', 'common', 'fixtures', `pages.${COMPANY}.json`);
const PRESERVE = ['known', 'noForm', 'permission', 'skip', 'note', 'extraChecks', 'pin', 'optionalButtons'];
// Pages with their own deeper specs (or that must not be touched) never go in the manifest.
const NEVER = new Set(['/client-setting', '/home', '/']);
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*';
// "Orders 12" -> "Orders", "Body 0/1024" -> "Body", "Time Line Oct 12 - Oct 25," -> "Time Line"
const noCount = (s) => norm(s)
  .replace(new RegExp(`\\s*${MONTH}\\s+\\d{1,2}(\\s*-\\s*(${MONTH}\\s+)?\\d{1,2})?,?\\s*(\\d{4})?\\s*$`, 'i'), '')
  .replace(/\s*\d+\s*\/\s*\d+\s*$/, '')
  .replace(/\s*[([]?\s*\d[\d,]*\s*[)\]]?\s*$/, '').trim();
const DATE_TAB = /^\d{1,2}\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i;
// On a page that lists records, row-level buttons are record names ("Alico Madina market Suspect"),
// so only buttons that look like actions are kept.
const ACTION = /^(add|new|create|save|clear|export|import|upload|download|print|filter|search|reset|apply|close|cancel|edit|view|back|go back|collapse all|expand all|refresh|submit|send|sync|copy|assign|calculate|history|show|hide|today|settings|alert limits|nature view|status view|block number)\b/i;
const PAGER = /^(\d+|next|last|first|prev|previous|«|»|‹|›|<<|>>|\.\.\.|…)$/i;
const volatileId = (id) => !id || /\d{3,}/.test(id) || GUID.test(id) || /^switcher/i.test(id);

function snapshots() {
  return fs.readdirSync(RAW).filter((f) => f.startsWith(`site-audit-${COMPANY}-`) && f.endsWith('.json'))
    .map((f) => { try { const j = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')); return { f, at: j.at, ok: j.complete !== false && (j.pages || []).length > 0, j }; } catch { return null; } })
    .filter((x) => x && x.ok).sort((a, b) => a.at.localeCompare(b.at));
}

// which routes does a hand-written test already open?
function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'fixtures'].includes(e.name)) walk(p, o); } else if (e.name.endsWith('.js')) o.push(p);
  }
  return o;
}
const code = walk(path.join(ROOT, 'erp')).map((f) => fs.readFileSync(f, 'utf8'));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const referenced = (route) => code.some((c) => new RegExp(`['"\`}]${esc(route)}(?=['"\`?#/)]|\\b)`).test(c));

function entry(p) {
  const rowCells = norm((p.tables || []).map((t) => (t.firstRow || []).join(' ')).join(' ')).toLowerCase();
  const isRowButton = (b) => rowCells.includes(b.toLowerCase());
  const table = [...(p.tables || [])].sort((a, b) => (b.headers || []).length - (a.headers || []).length)[0];
  const columns = [...new Set(((table && table.headers) || []).map(noCount).filter((c) => c && !PAGER.test(c)))];
  const tabs = [...new Set((p.tabs || []).filter((x) => !DATE_TAB.test(norm(x))).map(noCount).filter(Boolean))];
  const skipBtn = new Set([...columns, ...tabs].map((x) => x.toLowerCase()));
  const hasRows = (p.tables || []).some((t) => t.rows > 0);
  const buttons = [...new Set((p.buttons || []).filter((x) => !DATE_TAB.test(norm(x))).map(noCount)
    .filter((b) => b && b.length > 1 && b.length < 40 && !PAGER.test(b) && !/^close$/i.test(b) && !isRowButton(b) && !skipBtn.has(b.toLowerCase()))
    .filter((b) => !hasRows || ACTION.test(b)))];
  const controls = (p.controls || []).filter((c) => !['password', 'hidden'].includes(c.type))
    .map((c) => ({ id: volatileId(c.id) ? '' : c.id, label: norm(c.label).replace(/\s*\*\s*$/, ''), type: c.tag === 'select' ? 'select' : (c.type || c.tag), required: !!c.required }))
    .filter((c) => c.id || c.label);
  const dedupe = (list) => { const seen = new Set(); return list.filter((c) => { const k = c.id || `${c.label}|${c.type}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
  // what a page lets you do to its list, found from the audit's controls: a search box and a date-range select
  const all = (p.controls || []).filter((c) => !['password', 'hidden'].includes(c.type));
  const searchCtl = all.find((c) => c.tag === 'input' && ['text', 'search', ''].includes(c.type || '') && (/filter-name|search/i.test(c.id || '') || /search/i.test(`${c.label} ${c.placeholder}`)));
  const dateSel = all.find((c) => c.tag === 'select' && (c.options || []).some((o) => /^this month$/i.test(o)) && (c.options || []).some((o) => /^today$/i.test(o)));
  const heading = [...new Set((p.heading || []).map(noCount).filter(Boolean))].slice(0, 4);
  const moduleScoped = GUID.test(p.path);
  const e = {
    path: p.path.replace(GUID, '{module}'),
    group: p.group, title: norm(p.text) || heading[0] || p.path,
    ...(p.finalPath && p.finalPath !== p.path ? { finalPath: p.finalPath.replace(GUID, '{module}') } : {}),
    heading, tabs, columns, buttons, controls: dedupe(controls).slice(0, 40),
    filters: {
      search: searchCtl ? { id: volatileId(searchCtl.id) ? '' : searchCtl.id, placeholder: norm(searchCtl.placeholder).slice(0, 60) } : null,
      dateRange: !!dateSel,
    },
  };
  if (moduleScoped) e.moduleScoped = true;
  if (p.form && (p.form.kind === 'modal' || p.form.kind === 'page')) {
    const fc = dedupe((p.form.controls || []).filter((c) => !['password', 'hidden'].includes(c.type))
      .map((c) => ({ id: volatileId(c.id) ? '' : c.id, label: norm(c.label).replace(/\s*\*\s*$/, ''), type: c.tag === 'select' ? 'select' : (c.type || c.tag), required: !!c.required }))
      .filter((c) => c.id || c.label));
    e.form = { opener: norm(p.form.opener), kind: p.form.kind, ...(p.form.id ? { id: p.form.id } : {}),
      heading: [...new Set((p.form.heading || []).map(noCount).filter(Boolean))].slice(0, 3), fields: fc.slice(0, 60) };
  }
  return e;
}

function main() {
  if (!COMPANY) throw new Error('No tenant: set COMPANY_CODE or pass --company');
  const snaps = snapshots();
  if (!snaps.length) throw new Error(`No complete snapshot for ${COMPANY}: run node scripts/qa/site_audit.js`);
  const from = arg('--from') ? { f: path.basename(arg('--from')), j: JSON.parse(fs.readFileSync(arg('--from'), 'utf8')) } : snaps[snaps.length - 1];
  const all = args.includes('--all');
  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { pages: [] };
  const oldBy = new Map(old.pages.map((e) => [e.path, e]));

  const pages = [];
  for (const p of from.j.pages) {
    const base = p.path.replace(GUID, '{module}');
    if (NEVER.has(p.path) || p.error || p.notFound) continue;
    const grepRoute = p.path.replace(/\/module\/.*$/, '').replace(GUID, '').replace(/\/$/, '') || p.path;
    if (!all && !oldBy.has(base) && referenced(grepRoute)) continue;
    const e = entry(p);
    const prev = oldBy.get(e.path);
    if (prev) {
      for (const k of PRESERVE) if (prev[k] !== undefined) e[k] = prev[k];
      for (const k of prev.pin || []) if (prev[k] !== undefined) e[k] = prev[k];   // hand-edited values kept as written
    }
    pages.push(e);
  }
  if (args.includes('--keep')) for (const e of old.pages) if (!pages.some((x) => x.path === e.path)) pages.push(e);
  pages.sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    company: COMPANY, source: path.basename(from.f), generated: new Date().toISOString().slice(0, 10),
    note: 'Expected page structure, read by erp/common/pageSuite.js. Generated by scripts/qa/make_page_manifest.js; hand-written keys (known, noForm, permission, skip, note) are kept on regeneration.',
    pages,
  }, null, 2) + '\n');
  const by = {}; for (const e of pages) by[e.group] = (by[e.group] || 0) + 1;
  console.log(`${pages.length} pages -> ${path.relative(ROOT, OUT)}  (from ${from.f})`);
  console.log(Object.entries(by).map(([g, n]) => `${g}: ${n}`).join(' · '));
  console.log(`with Add form: ${pages.filter((e) => e.form).length} · with tabs: ${pages.filter((e) => e.tabs.length).length} · module-scoped: ${pages.filter((e) => e.moduleScoped).length}`);
}
main();
