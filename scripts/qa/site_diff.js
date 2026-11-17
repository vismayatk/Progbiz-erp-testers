'use strict';
/**
 * What changed on the ERP since the last check?
 *
 * Compares two snapshots written by scripts/qa/site_audit.js and lists every difference:
 * menu entries, Create New entries, new / hidden pages, headings, tabs, buttons, table columns,
 * fields (label, type, required, dropdown options, defaults), Add/New forms, Client Settings
 * options and their values, and page health (errors, console errors, failed calls, load time).
 * Every change is looked up in the automation under erp/, so you can see which tests it touches
 * and which new pages no test opens yet.
 *
 *   node scripts/qa/site_diff.js                          newest complete snapshot vs the one before it
 *   node scripts/qa/site_diff.js --base <file> [--head <file>]
 *   node scripts/qa/site_diff.js --list                   list the snapshots for the tenant
 *   node scripts/qa/site_diff.js --company lesol_test     another tenant (default: COMPANY_CODE in .env)
 *   node scripts/qa/site_diff.js --strict                 exit 2 when a page got worse (for scheduled runs)
 *
 * Writes reports/qa/raw/site-diff-<company>-<head stamp>.json and .md
 * The .md is a list of differences, not verified findings: the /qa-changes skill checks each one.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const ROOT = path.join(__dirname, '..', '..');
const RAW = path.join(ROOT, 'reports', 'qa', 'raw');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const COMPANY = arg('--company') || process.env.COMPANY_CODE;

// ── text helpers ─────────────────────────────────────────────────────────────
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** comparison key: case-insensitive, numbers masked (counts, dates and ids change every day) */
const mask = (s) => norm(s).toLowerCase().replace(/\d+([.,:]\d+)*/g, '#');
/** "New 52" / "Pending (3)" -> "New" / "Pending" */
const noCount = (s) => norm(s).replace(/\s*[([]?\s*\d[\d,]*\s*[)\]]?\s*$/, '').trim();
const PAGER = /^(#|next|last|first|prev|previous|«|»|‹|›|<<|>>|\.\.\.|…)$/i;
const NUMBERISH = /^[#\s/.:,-]*(am|pm)?$/i;          // dates, times, page numbers once masked
const NETWORK = /net::ERR_(NETWORK_CHANGED|INTERNET_DISCONNECTED|CONNECTION_(RESET|CLOSED|REFUSED|TIMED_OUT)|TIMED_OUT|NAME_NOT_RESOLVED|ABORTED)/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function cleanTexts(list, exclude = new Set()) {
  const seen = new Set(); const out = [];
  for (const raw of list || []) {
    const s = noCount(raw); const k = mask(s);
    if (!s || s.length < 2 || PAGER.test(k) || NUMBERISH.test(k) || exclude.has(k) || seen.has(k)) continue;
    seen.add(k); out.push(s);
  }
  return out;
}

function setDiff(a = [], b = [], key = mask) {
  const A = new Map(a.map((x) => [key(x), x])); const B = new Map(b.map((x) => [key(x), x]));
  return {
    added: [...B].filter(([k]) => !A.has(k)).map(([, v]) => v),
    removed: [...A].filter(([k]) => !B.has(k)).map(([, v]) => v),
  };
}

// ── snapshots ────────────────────────────────────────────────────────────────
function snapshots() {
  if (!fs.existsSync(RAW)) return [];
  return fs.readdirSync(RAW)
    .filter((f) => f.startsWith(`site-audit-${COMPANY}-`) && f.endsWith('.json'))
    .map((f) => {
      const file = path.join(RAW, f);
      let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
      // snapshots older than the "complete" flag count as complete when they reached Client Settings
      const complete = j.complete === true || (j.complete === undefined && (j.pages || []).length > 0 && !!j.clientSettings);
      return { file, name: f, at: j.at, complete, pages: (j.pages || []).length, json: j };
    })
    .filter(Boolean)
    .sort((a, b) => a.at.localeCompare(b.at));
}

function load(file) {
  const p = fs.existsSync(file) ? file : path.join(RAW, file);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { file: p, name: path.basename(p), at: j.at, json: j };
}

// ── automation index: which files in erp/ mention a route, an id or a text ────
const SUITE = path.join(ROOT, 'erp');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    // the page manifests (erp/common/fixtures/*.json) are test inputs too: they list what each page must show
    else if (e.name.endsWith('.js') || (e.name.endsWith('.json') && p.includes(`${path.sep}fixtures${path.sep}`))) out.push(p);
  }
  return out;
}
const FILES = fs.existsSync(SUITE) ? walk(SUITE).map((f) => ({ rel: path.relative(ROOT, f), lines: fs.readFileSync(f, 'utf8').split('\n') })) : [];

function grep(re, files = FILES, max = 4) {
  const hits = [];
  for (const f of files) {
    const n = f.lines.findIndex((l) => re.test(l));
    if (n >= 0) hits.push(`${f.rel}:${n + 1}`);
    if (hits.length >= max) break;
  }
  return hits;
}
const routeRe = (p) => new RegExp(`(['"\`}])${esc(p)}(?=['"\`?#)/]|$)`);
const idRe = (id) => new RegExp(`(#|['"\`])${esc(id)}(?![\\w-])`);
const textRe = (t) => new RegExp(`(['"\`/]|hasText:\\s*['"\`])\\s*\\^?${esc(t)}`, 'i');

const pageFileCache = new Map();
/** files that open a route, plus the specs that use a page object which opens it */
function filesForPage(route) {
  if (!route || route === '/') return [];
  if (pageFileCache.has(route)) return pageFileCache.get(route);
  const direct = FILES.filter((f) => f.lines.some((l) => routeRe(route).test(l)));
  const pageObjects = direct.filter((f) => /[\\/]pages[\\/]/.test(f.rel)).map((f) => path.basename(f.rel, '.js'));
  const users = pageObjects.length
    ? FILES.filter((f) => !direct.includes(f) && f.lines.some((l) => pageObjects.some((po) => l.includes('require(') && l.includes(po))))
    : [];
  const res = [...direct, ...users];
  pageFileCache.set(route, res);
  return res;
}

// ── page views ───────────────────────────────────────────────────────────────
function controlMap(list = []) {
  const ids = {}; for (const c of list) if (c.id) ids[c.id] = (ids[c.id] || 0) + 1;
  const m = new Map();
  for (const c of list) {
    const name = norm(c.label || c.placeholder || c.id || `${c.tag} ${c.type}`).replace(/\s*\*\s*$/, '');
    const key = c.id && ids[c.id] === 1 ? `#${c.id}` : `${c.id ? `#${c.id} ` : ''}${c.tag}:${c.type}:${mask(name)}`;
    let k = key; let n = 2; while (m.has(k)) k = `${key}~${n++}`;
    m.set(k, { ...c, name });
  }
  return m;
}

function health(p) {
  const errKey = (s) => norm(s).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '<id>').replace(/\d+/g, '#');
  const callKey = (s) => norm(s).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '<id>').replace(/=[^&]*/g, '=').replace(/\/\d+/g, '/#');
  return {
    error: p.error || '', notFound: !!p.notFound, errorText: p.errorText || '',
    console: (p.consoleErrors || []).map((t) => ({ k: errKey(t), t })),
    failed: (p.failedCalls || []).map((t) => ({ k: callKey(t), t })),
    loadMs: p.loadMs || 0, finalPath: p.finalPath || p.path, charts: p.charts || 0,
  };
}

function view(p) {
  const columns = cleanTexts((p.tables || []).flatMap((t) => t.headers || []));
  const tabs = cleanTexts(p.tabs);
  const heading = cleanTexts(p.heading);
  const exclude = new Set([...columns, ...tabs].map(mask));
  return {
    heading, tabs, columns,
    buttons: cleanTexts(p.buttons, exclude),
    controls: controlMap(p.controls),
    form: p.form ? { opener: noCount(p.form.opener), kind: p.form.kind, path: p.form.path || '', heading: cleanTexts(p.form.heading),
      buttons: cleanTexts(p.form.buttons), controls: controlMap(p.form.controls) } : null,
    health: health(p),
  };
}

const denied = (v) => v.heading.some((h) => /access denied|not authori[sz]ed|no permission/i.test(h));

// ── diff ─────────────────────────────────────────────────────────────────────
// levels: problem (page got worse) · breaking (removed / renamed / now required) · new · setting
//         (a Client Settings value changed) · minor (options, defaults, speed) · fixed
const changes = [];
function add(level, page, area, what, text, detail = '', needles = {}) {
  changes.push({ level, page, area, what, text: norm(text), detail: norm(detail), needles, impact: [] });
}

function diffControls(route, area, a, b) {
  for (const [k, c] of b) if (!a.has(k)) add('new', route, area, 'field added', c.name, fieldDesc(c), { id: c.id });
  for (const [k, c] of a) if (!b.has(k)) add('breaking', route, area, 'field removed', c.name, fieldDesc(c), { id: c.id, text: c.name });
  for (const [k, cb] of b) {
    const ca = a.get(k); if (!ca) continue;
    const needles = { id: cb.id, text: cb.name };
    if (ca.type !== cb.type) add('breaking', route, area, 'field type changed', cb.name, `${ca.type} → ${cb.type}`, needles);
    if (mask(ca.name) !== mask(cb.name)) add('breaking', route, area, 'field renamed', cb.name, `"${ca.name}" → "${cb.name}"`, { id: cb.id, text: ca.name });
    if (!!ca.required !== !!cb.required) add(cb.required ? 'breaking' : 'minor', route, area, cb.required ? 'field now required' : 'field no longer required', cb.name, '', needles);
    if (ca.tag === 'select' && cb.tag === 'select') {
      const full = (c) => Array.isArray(c.options) && (c.optionCount || 0) <= c.options.length;
      if (full(ca) && full(cb)) {
        const d = setDiff(ca.options, cb.options);
        if (d.added.length) add('minor', route, area, 'dropdown options added', cb.name, d.added.join(', '), needles);
        if (d.removed.length) add('breaking', route, area, 'dropdown options removed', cb.name, d.removed.join(', '), { id: cb.id, text: d.removed[0] });
      }
      if (mask(ca.value) !== mask(cb.value)) add('minor', route, area, 'dropdown default changed', cb.name, `"${ca.value}" → "${cb.value}"`, needles);
    }
    if (cb.type === 'checkbox' && ca.checked !== cb.checked) add('minor', route, area, 'checkbox default changed', cb.name, `${ca.checked ? 'on' : 'off'} → ${cb.checked ? 'on' : 'off'}`, needles);
  }
}
const fieldDesc = (c) => [c.tag === 'select' ? `dropdown (${(c.options || []).slice(0, 6).join(', ')}${(c.optionCount || 0) > 6 ? ', …' : ''})` : (c.type || c.tag),
  c.required ? 'required' : '', c.id ? `#${c.id}` : ''].filter(Boolean).join(' · ');

function diffTexts(route, area, what, a, b, levelRemoved = 'breaking') {
  const d = setDiff(a, b);
  for (const t of d.added) add('new', route, area, `${what} added`, t);
  for (const t of d.removed) add(levelRemoved, route, area, `${what} removed`, t, '', { text: t });
}

function diffPage(route, pa, pb) {
  const a = view(pa); const b = view(pb);
  // health first: a page that got worse matters more than anything else on it
  const ha = a.health; const hb = b.health;
  // A page that rendered nothing this time: one line to re-check, not dozens of "removed"
  if (pa.textLength > 200 && (pb.textLength || 0) < pa.textLength * 0.2 && !b.heading.length && !hb.error) {
    const blip = hb.console.some((x) => NETWORK.test(x.t));
    add('problem', route, 'health', 'page rendered empty', blip ? 'a network error hit the crawl on this page' : '',
      `${a.heading.length + a.tabs.length + a.buttons.length + a.columns.length + a.controls.size} elements missing — open it by hand; if it's fine, it was a blip`);
    return;
  }
  if (!ha.error && hb.error) add('problem', route, 'health', 'page fails to load', hb.error);
  if (ha.error && !hb.error) add('fixed', route, 'health', 'page loads again', ha.error);
  if (!ha.notFound && hb.notFound) add('problem', route, 'health', 'page now "not found"', '');
  if (ha.notFound && !hb.notFound) add('fixed', route, 'health', 'page found again', '');
  if (!ha.errorText && hb.errorText) add('problem', route, 'health', 'error text on page', hb.errorText);
  if (ha.errorText && !hb.errorText) add('fixed', route, 'health', 'error text gone', ha.errorText);
  if (!denied(a) && denied(b)) add('problem', route, 'health', 'now "Access Denied"', '', '', { route });
  if (denied(a) && !denied(b)) add('fixed', route, 'health', 'no longer "Access Denied"', '');
  if (ha.finalPath !== hb.finalPath) {
    const bad = /login|denied|error|not-?found|unauthori/i.test(hb.finalPath);
    add(bad ? 'problem' : 'breaking', route, 'health', 'now redirects', `${ha.finalPath} → ${hb.finalPath}`, '', { route });
  }
  const ce = setDiff(ha.console, hb.console, (x) => x.k);
  for (const x of ce.added) {
    if (NETWORK.test(x.t)) add('minor', route, 'health', 'network error during the crawl', x.t);
    else add('problem', route, 'health', 'new console error', x.t);
  }
  for (const x of ce.removed) add('fixed', route, 'health', 'console error gone', x.t);
  const fc = setDiff(ha.failed, hb.failed, (x) => x.k);
  for (const x of fc.added) add('problem', route, 'health', 'new failed API call', x.t);
  for (const x of fc.removed) add('fixed', route, 'health', 'failed API call gone', x.t);
  if (hb.loadMs > 8000 && hb.loadMs > 2 * ha.loadMs) add('minor', route, 'health', 'slower', `${(ha.loadMs / 1000).toFixed(1)} s → ${(hb.loadMs / 1000).toFixed(1)} s`);
  if (ha.charts > 0 && hb.charts === 0) add('minor', route, 'page', 'charts no longer drawn', `${ha.charts} → 0`);
  if (ha.charts === 0 && hb.charts > 0) add('new', route, 'page', 'charts added', `${hb.charts}`);

  // The page was blank last time (a network blip) and renders now: one line, not dozens of "added"
  if (pb.textLength > 200 && (pa.textLength || 0) < pb.textLength * 0.2 && !a.heading.length && !ha.error) {
    add('fixed', route, 'health', 'page was empty in the previous snapshot and renders now', '',
      `${b.heading.length + b.tabs.length + b.buttons.length + b.columns.length + b.controls.size} elements — treat the previous snapshot as the blip`);
    return;
  }

  // what the page offers
  diffTexts(route, 'page', 'heading', a.heading, b.heading);
  diffTexts(route, 'page', 'tab', a.tabs, b.tabs);
  // A button inside a table row ("Open record", "History") exists only for rows that support it, so it
  // comes and goes with the data. Row-level = its text is part of the first row's cells.
  const rowText = (p) => mask((p.tables || []).map((t) => (t.firstRow || []).join(' ')).join(' '));
  const inRow = (text, ...pages) => pages.some((p) => rowText(p).includes(mask(text)));
  const bd = setDiff(a.buttons, b.buttons);
  for (const t of bd.added) {
    if (inRow(t, pb)) add('minor', route, 'page', 'row button added', t, 'inside table rows: depends on the records shown');
    else add('new', route, 'page', 'button added', t);
  }
  for (const t of bd.removed) {
    if (inRow(t, pa, pb)) add('minor', route, 'page', 'row button removed', t, 'inside table rows: depends on the records shown', { text: t });
    else add('breaking', route, 'page', 'button removed', t, '', { text: t });
  }
  diffTexts(route, 'page', 'column', a.columns, b.columns);
  diffControls(route, 'page', a.controls, b.controls);

  // the Add / New form behind the page's first opener
  if (a.form && !b.form) add('breaking', route, 'form', 'Add form no longer opens', a.form.opener, '', { text: a.form.opener });
  else if (!a.form && b.form) add('new', route, 'form', 'Add form found', b.form.opener, `${b.form.kind} · ${b.form.controls.size} fields`);
  else if (a.form && b.form) {
    if (mask(a.form.opener) !== mask(b.form.opener)) add('breaking', route, 'form', 'Add form opener renamed', b.form.opener, `"${a.form.opener}" → "${b.form.opener}"`, { text: a.form.opener });
    if (a.form.kind !== b.form.kind) add('breaking', route, 'form', 'Add form changed type', b.form.opener, `${a.form.kind} → ${b.form.kind}`, { route });
    diffTexts(route, 'form', 'form heading', a.form.heading, b.form.heading);
    diffTexts(route, 'form', 'form button', a.form.buttons, b.form.buttons);
    diffControls(route, 'form', a.form.controls, b.form.controls);
  }
}

function describeNewPage(p) {
  const v = view(p);
  const fields = [...v.controls.values()].map((c) => `${c.name}${c.required ? ' *' : ''}`);
  const form = v.form ? `${v.form.opener} → ${v.form.kind}: ${[...v.form.controls.values()].map((c) => `${c.name}${c.required ? ' *' : ''}`).join(', ')}` : '';
  return { heading: v.heading, tabs: v.tabs, buttons: v.buttons, columns: v.columns, fields, form, health: v.health };
}

function diffSettings(sa, sb) {
  const opts = (s) => (s && Array.isArray(s.options) ? s.options : null);
  const A = opts(sa); const B = opts(sb);
  if (!B) { if (sb && sb.error) add('problem', '/client-setting', 'settings', 'Client Settings could not be read', sb.error); return null; }
  if (!A) return 'The previous snapshot has no Client Settings data (older audit format). Today\'s values are the new baseline.';
  const key = (o) => o.id || `${mask(o.section)}|${mask(o.label)}`;
  const show = (o) => (typeof o.value === 'boolean' ? (o.value ? 'on' : 'off') : `"${o.value}"`);
  const ma = new Map(A.map((o) => [key(o), o])); const mb = new Map(B.map((o) => [key(o), o]));
  diffTexts('/client-setting', 'settings', 'settings section', sa.sections || [], sb.sections || []);
  for (const [k, o] of mb) if (!ma.has(k)) add('new', '/client-setting', 'settings', 'new setting', o.label, `${o.section} · ${o.type || o.tag}${o.id ? ` · #${o.id}` : ''} · now ${show(o)}`, { id: o.id });
  for (const [k, o] of ma) if (!mb.has(k)) add('breaking', '/client-setting', 'settings', 'setting removed', o.label, `${o.section}${o.id ? ` · #${o.id}` : ''}`, { id: o.id, text: o.label });
  for (const [k, ob] of mb) {
    const oa = ma.get(k); if (!oa) continue;
    const needles = { id: ob.id };
    if (mask(oa.label) !== mask(ob.label)) add('minor', '/client-setting', 'settings', 'setting renamed', ob.label, `"${oa.label}" → "${ob.label}"`, needles);
    if (mask(oa.section) !== mask(ob.section)) add('minor', '/client-setting', 'settings', 'setting moved', ob.label, `${oa.section} → ${ob.section}`, needles);
    if (JSON.stringify(oa.value) !== JSON.stringify(ob.value)) add('setting', '/client-setting', 'settings', 'value changed', ob.label, `${show(oa)} → ${show(ob)}${ob.id ? ` · #${ob.id}` : ''}`, needles);
    if (oa.choices && ob.choices) {
      const d = setDiff(oa.choices, ob.choices);
      if (d.added.length) add('new', '/client-setting', 'settings', 'setting choices added', ob.label, d.added.join(', '), needles);
      if (d.removed.length) add('breaking', '/client-setting', 'settings', 'setting choices removed', ob.label, d.removed.join(', '), needles);
    }
  }
  return null;
}

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  if (!COMPANY) { console.error('No tenant: set COMPANY_CODE in .env or pass --company'); process.exit(1); }
  const all = snapshots();
  if (args.includes('--list')) {
    if (!all.length) console.log(`No snapshots for ${COMPANY} in ${path.relative(ROOT, RAW)}`);
    for (const s of all) console.log(`${s.complete ? '✓' : '✗ partial'}  ${when(s.at).padEnd(20)}  ${String(s.pages).padStart(3)} pages  ${s.name}`);
    return;
  }
  const complete = all.filter((s) => s.complete);
  const head = arg('--head') ? load(arg('--head')) : complete[complete.length - 1];
  if (!head) { console.log(`No complete snapshot for ${COMPANY}. Run: node scripts/qa/site_audit.js`); return; }
  const base = arg('--base') ? load(arg('--base')) : [...complete].reverse().find((s) => s.at < head.at);
  if (!base) {
    console.log(`Only one complete snapshot for ${COMPANY} (${head.name}).\nIt is the baseline now; run the audit again after the next update and diff then.`);
    return;
  }
  const A = base.json; const B = head.json;
  if (A.company !== B.company) console.warn(`⚠ comparing different tenants: ${A.company} vs ${B.company}`);

  // menu
  const menuMap = (m) => { const r = new Map(); for (const x of m || []) if (!r.has(x.path)) r.set(x.path, x); return r; };
  const ma = menuMap(A.menu); const mb = menuMap(B.menu);
  const pagesB = new Map((B.pages || []).map((p) => [p.path, p]));
  const pagesA = new Map((A.pages || []).map((p) => [p.path, p]));
  for (const [p, m] of mb) if (!ma.has(p)) add('new', p, 'menu', 'menu entry added', m.text, `under ${m.group}`, { route: p });
  for (const [p, m] of ma) {
    if (mb.has(p)) continue;
    const now = pagesB.get(p);
    let state = 'not checked';
    if (now) {
      const v = view(now);
      state = now.error ? `fails to load (${now.error})` : now.notFound ? 'page not found' : denied(v) ? '"Access Denied"'
        : v.health.finalPath !== p ? `redirects to ${v.health.finalPath}` : `still opens by URL ("${v.heading[0] || ''}")`;
    }
    add('breaking', p, 'menu', 'menu entry removed', m.text, `was under ${m.group}; ${state}`, { route: p, text: m.text });
  }
  for (const [p, mB] of mb) {
    const mA = ma.get(p); if (!mA) continue;
    if (mask(mA.text) !== mask(mB.text)) add('breaking', p, 'menu', 'menu entry renamed', mB.text, `"${mA.text}" → "${mB.text}"`, { text: mA.text, route: p });
    if (mask(mA.group) !== mask(mB.group)) add('minor', p, 'menu', 'menu entry moved', mB.text, `${mA.group} → ${mB.group}`, { route: p });
  }
  const cn = setDiff(A.createNew || [], B.createNew || []);
  for (const t of cn.added) add('new', '(header)', 'menu', 'Create New entry added', t);
  for (const t of cn.removed) add('breaking', '(header)', 'menu', 'Create New entry removed', t, '', { text: t });

  // pages
  const newPages = [];
  for (const [p, pb] of pagesB) {
    const pa = pagesA.get(p);
    if (pa) diffPage(p, pa, pb);
    else if (pb.group !== '(was in menu)') {
      const d = describeNewPage(pb);
      newPages.push({ path: p, group: pb.group, text: pb.text, covered: filesForPage(p).map((f) => f.rel), ...d });
      if (!ma.has(p) && !mb.has(p)) add('new', p, 'page', 'new page', pb.text || d.heading[0] || p);
    }
  }
  for (const [p, pa] of pagesA) if (!pagesB.has(p)) add('breaking', p, 'page', 'page not visited this time', pa.text || p, 'not in the menu and not re-visited', { route: p });

  // client settings
  const settingsNote = diffSettings(A.clientSettings, B.clientSettings);

  // automation impact
  for (const c of changes) {
    const hits = new Set();
    const route = c.needles.route || (c.page.startsWith('/') ? c.page : null);
    if (c.needles.id) grep(idRe(c.needles.id)).forEach((h) => hits.add(h));
    if (c.needles.route) grep(routeRe(c.needles.route)).forEach((h) => hits.add(h));
    if (c.needles.text && c.needles.text.length >= 3) {
      // a label like "Status" is everywhere: only count files that work on this page
      const scope = c.area === 'menu' || c.page === '(header)' ? FILES : filesForPage(route);
      if (c.area !== 'menu' || c.needles.text.length >= 5) grep(textRe(c.needles.text), scope).forEach((h) => hits.add(h));
    }
    c.impact = [...hits].slice(0, 5);
  }

  // ── output ─────────────────────────────────────────────────────────────────
  const count = (l) => changes.filter((c) => c.level === l).length;
  // additions don't break a test; removals, renames, new rules and new defaults can
  const touching = changes.filter((c) => c.impact.length && !['fixed', 'new'].includes(c.level) && c.what !== 'dropdown options added');
  const counts = { problem: count('problem'), touching: touching.length, new: count('new'), setting: count('setting'),
    breaking: count('breaking'), minor: count('minor'), fixed: count('fixed'), newPages: newPages.length,
    uncoveredNewPages: newPages.filter((p) => !p.covered.length).length };
  const stamp = head.name.startsWith(`site-audit-${COMPANY}-`) ? head.name.replace(`site-audit-${COMPANY}-`, '').replace('.json', '')
    : new Date(head.at).toISOString().slice(0, 16).replace(':', '-');
  const shown = (f) => (f.startsWith(ROOT) ? path.relative(ROOT, f) : f);
  const outBase = path.join(RAW, `site-diff-${COMPANY}-${stamp}`);
  fs.writeFileSync(`${outBase}.json`, JSON.stringify({ company: COMPANY,
    base: { file: shown(base.file), at: base.at }, head: { file: shown(head.file), at: head.at },
    counts, settingsNote, newPages, changes }, null, 2));

  const md = [];
  const cell = (s) => norm(s).replace(/\|/g, '\\|');
  const row = (c, withImpact = true) => `| \`${c.page}\` | ${c.what}${c.area === 'form' ? ' (Add form)' : ''} | ${cell(c.text)}${c.detail ? ` — ${cell(c.detail)}` : ''} |${withImpact ? ` ${c.impact.map((h) => `\`${h}\``).join('<br>') || '—'} |` : ''}`;
  const table = (title, list, withImpact = true, note = '') => {
    md.push(`## ${title}`, '');
    if (note) md.push(note, '');
    if (!list.length) { md.push('None.', ''); return; }
    md.push(withImpact ? '| Page | Change | Detail | Tests that reference it |' : '| Page | Change | Detail |',
      withImpact ? '|---|---|---|---|' : '|---|---|---|');
    for (const c of list) md.push(row(c, withImpact));
    md.push('');
  };
  md.push(`# Site changes · ${COMPANY} · ${when(base.at)} → ${when(head.at)}`, '',
    `**Base:** \`${shown(base.file)}\` · **Now:** \`${shown(head.file)}\` · **Pages compared:** ${[...pagesB.keys()].filter((p) => pagesA.has(p)).length}`,
    `**Changes:** ${counts.problem} problems · ${counts.touching} touch existing tests · ${counts.new} new · ${counts.setting} settings values changed · ${counts.breaking} removed/renamed · ${counts.minor} minor · ${counts.fixed} fixed`,
    '', '> Generated by `scripts/qa/site_diff.js`. These are differences between two read-only crawls, not verified findings:',
    '> reproduce each problem by hand before reporting it (`docs/qa/QA_METHOD.md`).', '');
  table('1. Problems — pages that got worse', changes.filter((c) => c.level === 'problem'));
  table('2. Changes that touch existing tests', touching.filter((c) => c.level !== 'problem'), true,
    'A test that clicks, reads or opens what changed. Run these files first; fix the test if the change is intended, report it if not.');

  md.push('## 3. New features', '');
  if (!newPages.length && !changes.some((c) => c.level === 'new' && c.area !== 'settings')) md.push('None.', '');
  for (const p of newPages) {
    md.push(`### \`${p.path}\` — ${p.group} › ${p.text || p.heading[0] || ''}${p.covered.length ? '' : ' · **no test opens this page**'}`, '');
    if (p.heading.length) md.push(`- **Heading:** ${p.heading.join(' · ')}`);
    if (p.tabs.length) md.push(`- **Tabs:** ${p.tabs.join(' · ')}`);
    if (p.buttons.length) md.push(`- **Buttons:** ${p.buttons.slice(0, 20).join(' · ')}`);
    if (p.fields.length) md.push(`- **Fields:** ${p.fields.slice(0, 25).join(' · ')}`);
    if (p.columns.length) md.push(`- **Columns:** ${p.columns.join(' · ')}`);
    if (p.form) md.push(`- **Add form:** ${p.form}`);
    const bad = [p.health.error, p.health.errorText, ...p.health.console.map((x) => x.t), ...p.health.failed.map((x) => x.t)].filter(Boolean);
    if (bad.length) md.push(`- **⚠ Errors on load:** ${bad.map(cell).join(' · ')}`);
    if (p.covered.length) md.push(`- **Referenced by:** ${p.covered.slice(0, 4).map((f) => `\`${f}\``).join(', ')}`);
    md.push('');
  }
  const newOnExisting = changes.filter((c) => c.level === 'new' && c.area !== 'settings' && !newPages.some((p) => p.path === c.page));
  if (newOnExisting.length) {
    md.push('**New on existing pages**', '', '| Page | Change | Detail |', '|---|---|---|');
    for (const c of newOnExisting) md.push(row(c, false));
    md.push('');
  }

  const settings = changes.filter((c) => c.area === 'settings');
  md.push('## 4. Client Settings', '');
  if (settingsNote) md.push(settingsNote, '');
  if (!settings.length && !settingsNote) md.push('No change: same options, same values.', '');
  if (settings.length) {
    md.push('| Change | Setting | Detail | Tests that reference it |', '|---|---|---|---|');
    for (const c of settings) md.push(`| ${c.what} | ${cell(c.text)} | ${cell(c.detail)} | ${c.impact.map((h) => `\`${h}\``).join('<br>') || '—'} |`);
    md.push('');
  }
  table('5. Removed or renamed (no test references them)', changes.filter((c) => c.level === 'breaking' && !c.impact.length && c.area !== 'settings'), false);
  table('6. Minor — dropdown options, defaults, speed', changes.filter((c) => c.level === 'minor' && !c.impact.length && c.area !== 'settings'), false);
  table('7. Fixed since last check', changes.filter((c) => c.level === 'fixed'), false);
  fs.writeFileSync(`${outBase}.md`, md.join('\n'));

  // console summary
  console.log(`\n${COMPANY}: ${when(base.at)} → ${when(head.at)}`);
  console.log(`  problems ${counts.problem} · touch tests ${counts.touching} · new ${counts.new} (new pages ${counts.newPages}, ${counts.uncoveredNewPages} without tests)`
    + ` · settings changed ${counts.setting} · removed/renamed ${counts.breaking} · minor ${counts.minor} · fixed ${counts.fixed}`);
  if (settingsNote) console.log(`  note: ${settingsNote}`);
  for (const c of changes.filter((x) => x.level === 'problem')) console.log(`  ✗ ${c.page}  ${c.what}: ${c.text}`);
  console.log(`\nWROTE ${path.relative(process.cwd(), outBase)}.md (+ .json)`);
  if (args.includes('--strict') && counts.problem) process.exit(2);
}

main();
