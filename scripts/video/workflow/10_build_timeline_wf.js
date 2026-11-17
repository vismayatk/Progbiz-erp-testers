'use strict';
/**
 * Edit of the Progbiz Work Flow module marketing video: business-problem intro (motion graphics, no UI), then
 * Projects Dashboard, Projects, Project Types, New Project, Project Overview, Tasks, Status Report, Payments and
 * Collections, Costing, Maintenance and the closing. Framed "stage" look, no cursor, short on-screen text only.
 *
 * Inputs : reports/video/workflow/audio/<voice>/cues.json (sentence WAVs, from make_vo.py) or --recorded cues,
 *          reports/video/workflow/cap/*  (stills + boxes.json from 05_capture.js)
 * Outputs: reports/video/workflow/timeline_<tag>.json    (compositor timeline)
 *          reports/video/workflow/voice_cues_<tag>.json  (one clip per sentence, for mixwav.py)
 *          reports/video/workflow/sfx_<tag>.json         (sound-effect events, for audio/mix.js)
 *          reports/video/workflow/sections_<tag>.json, sentences_<tag>.json
 *
 * Every camera move, highlight and on-screen text is anchored to the sentence (or the word in it) that talks about
 * it, so the picture follows the voice.
 *
 * Run:  node scripts/video/workflow/10_build_timeline_wf.js [--voice com_apple_voice_Tara_premium] [--total 0] [--tag wf] [--keynote]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const WF = path.join(ROOT, 'reports', 'video', 'workflow');
const CAP = path.join(WF, 'cap');
const LOGO = path.join(ROOT, 'reports', 'video', 'beta', 'cap', 'white-logo-1600.png');
const rel = p => path.relative(ROOT, p);
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const VOICE = opt('--voice', 'com_apple_voice_Tara_premium');
const AUDIO = path.join(WF, opt('--audio', 'audio'), VOICE);
const TAG = opt('--tag', 'wf');
const TARGET = Number(opt('--total', 0));       // 0 = as long as the narration needs (tail per section TAIL_AUTO)
const TAIL_AUTO = 2.3;
const SFX_DIR = path.resolve(ROOT, opt('--sfx-dir', path.join('reports', 'video', 'beta', 'audio_v4', 'music', 'sfx')));
const RECORDED = argv.includes('--recorded');   // narration = one WAV per section cut from a recording (ingest_recording.py)
const KEY = argv.includes('--keynote');         // sound design for the keynote music bed

const cues = JSON.parse(fs.readFileSync(path.join(AUDIO, 'cues.json'), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(CAP, 'boxes.json'), 'utf8'));
const r3 = v => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------ narration layout (per sentence)
const PAUSE = 0.42;
const PAUSE_AFTER = {          // "<section>#<sentence index>" -> pause after that sentence (s)
  '01_intro#1': 1.15,          // the activity cards converge before "Progbiz Workflow turns..."
  '02_dashboard#0': 0.55, '03_projects#0': 0.5, '04_types#0': 0.6, '05_new_project#0': 0.5, '06_overview#0': 0.6,
  '07_tasks#0': 0.5, '08_status#0': 0.5, '09_money#0': 0.6, '10_cost#0': 0.5, '11_maintenance#0': 0.7,
  '12_closing#0': 0.7, '12_closing#1': 0.5, '12_closing#2': 0.5, '12_closing#3': 0.8,
};
const LEAD = { '01_intro': 2.4, '02_dashboard': 1.0 };         // visual time before the first sentence
const LEAD_DEF = 1.3;
const TAIL_FIXED = { '01_intro': 1.9, '12_closing': 4.4 };     // after the last sentence
const order = cues.sections.map(s => s.id);
const SEC = {};
for (const s of cues.sections) {
  if (RECORDED) {
    const f0 = s.sentences[0].start_s;
    const sent = s.sentences.map(x => ({ text: x.text, file: path.join(AUDIO, s.file), dur: x.duration_s, rel: x.start_s - f0 }));
    const last = s.sentences[s.sentences.length - 1];
    SEC[s.id] = { sent, span: last.end_s - f0, lead: LEAD[s.id] ?? LEAD_DEF, file: path.join(AUDIO, s.file), f0 };
    continue;
  }
  let t = 0;
  const sent = s.sentences.map((x, k) => {
    const o = { text: x.text, file: path.join(AUDIO, x.file), dur: x.duration_s, rel: t };
    t += x.duration_s + (k < s.sentences.length - 1 ? (PAUSE_AFTER[`${s.id}#${k}`] ?? PAUSE) : 0);
    return o;
  });
  SEC[s.id] = { sent, span: t, lead: LEAD[s.id] ?? LEAD_DEF };
}
const free = order.filter(id => TAIL_FIXED[id] == null);
const fixed = order.reduce((a, id) => a + SEC[id].lead + SEC[id].span + (TAIL_FIXED[id] || 0), 0);
const TAIL = TARGET > 0 ? (TARGET - fixed) / free.length : TAIL_AUTO;
if (TAIL < 1.8) throw new Error(`narration too long for ${TARGET}s: tail per section ${TAIL.toFixed(2)}s`);
{
  let t = 0;
  for (const id of order) {
    const X = SEC[id];
    X.S = t; X.V = t + X.lead; X.E = X.V + X.span + (TAIL_FIXED[id] ?? TAIL);
    t = X.E;
  }
}
const TOTAL = r3(SEC[order[order.length - 1]].E);
const st = (id, k) => SEC[id].V + SEC[id].sent[k].rel;
const sd = (id, k) => SEC[id].sent[k].dur;
const se = (id, k) => st(id, k) + sd(id, k);
const norm = s => s.toLowerCase().replace(/[‘’]/g, "'");
/** Global time at which `phrase` is spoken inside sentence k (proportional to its character position). */
function at(id, k, phrase) {
  const txt = SEC[id].sent[k].text;
  const i = norm(txt).indexOf(norm(phrase));
  if (i < 0) throw new Error(`phrase "${phrase}" not in ${id}#${k}: ${txt}`);
  return st(id, k) + sd(id, k) * (i / txt.length);
}

// ------------------------------------------------------------ boxes of the captured pages (CSS px)
const items = id => { if (!B[id]) throw new Error(`no boxes for still ${id}`); return B[id].items; };
function box(id, kind, re, nth = 0) {
  const m = items(id).filter(i => i.kind === kind && re.test(i.text || i.placeholder || ''));
  if (!m[nth]) throw new Error(`no ${kind} ${re} in ${id}`);
  return m[nth].box;
}
const tbl = (id, n = 0) => { const t = items(id).filter(i => i.kind === 'table')[n]; if (!t) throw new Error(`no table in ${id}`); return t; };
/** Box of a table column: its header and the first `nRows` visible rows. */
function col(id, headRe, nRows, n = 0) {
  const t = tbl(id, n), h = t.heads.find(x => headRe.test(x.text));
  if (!h) throw new Error(`no column ${headRe} in ${id}`);
  const rows = t.rows.slice(0, nRows || t.rows.length), last = rows[rows.length - 1];
  return [h.box[0], h.box[1], h.box[2], last ? last[1] + last[3] - h.box[1] : h.box[3]];
}
/** Box of the first `nRows` rows of a table (full width). */
function rows(id, a, b, n = 0) { const t = tbl(id, n), x = t.rows[a], y = t.rows[b]; return [x[0], x[1], x[2], y[1] + y[3] - x[1]]; }
const tabOf = (id, re) => box(id, 'tab', re);
const union = rs => { const x = Math.min(...rs.map(r => r[0])), y = Math.min(...rs.map(r => r[1])); return [x, y, Math.max(...rs.map(r => r[0] + r[2])) - x, Math.max(...rs.map(r => r[1] + r[3])) - y]; };

// ------------------------------------------------------------ helpers
const scenes = [];
const sfx = [];
const XF = d => ({ type: 'crossfade', duration: d || 0.45 });
const PUSH = { type: 'stage_push', duration: 0.5 };
const CUT = { type: 'cut' };
function scene(id, start, end, source, o = {}) {
  const loc = v => r3(v - start);
  const sc = { id, start: r3(start), end: r3(end), source };
  if (o.tr) sc.transition = o.tr;
  const f = o.build ? o.build(loc, r3(end - start)) : {};
  for (const k of ['camera', 'highlights', 'callouts', 'masks', 'overlays']) if (f[k]) sc[k] = f[k];
  if (f.map) sc.source.time_map = f.map;
  scenes.push(sc);
  return sc;
}
const still = name => {
  const p = path.join(CAP, `${name}.jpg`);
  if (!fs.existsSync(p)) throw new Error(`missing still ${name}.jpg — run 05_capture.js`);
  return { type: 'still', path: rel(p), css_width: 1920, css_height: 1080 };
};
const cam = (tt, o) => Object.assign({ t: r3(Math.max(0, tt)) }, o);
const hl = (s, e, rect, o) => Object.assign({ start: r3(s), end: r3(e), rect, style: 'outline', radius: 12, padding: 6 }, o || {});
const co = (text, s, e, target, o) => Object.assign({ text, start: r3(s), end: r3(e), target }, o || {});
const headline = (text, s, e) => co(text, s, e, null, { placement: 'bottom', marker: true });
const fx = (name, t, gain_db, pan) => sfx.push({ file: path.join(SFX_DIR, `${name}.wav`), t: r3(t), gain_db, pan: pan || 0 });
/** Camera view that frames `rect`: it fills about `f` of the frame, never closer than `mx`. */
const fit = (r, f = 0.78, mx = 2.4) => ({ rect: r, zoom: r3(Math.max(1, Math.min(mx, 1920 * f / r[2], 1080 * f / r[3]))) });
/** Camera keys from [local time, view, ease] triples (times are forced to increase). */
function camSeq(keys) {
  const out = []; let prev = -1;
  for (const [t, v, ease] of keys) {
    let tt = Math.max(0, t); if (tt <= prev) tt = prev + 0.04; prev = tt;
    out.push(cam(tt, Object.assign({}, v, ease ? { ease } : {})));
  }
  return out;
}
/**
 * Highlights and callouts that follow the narration: items = [{ t (global), rect, text?, side?, pad?, r? }].
 * Each item is lit from its time to the next item's time (the last one to `end`, local).
 */
function follow(loc, end, list, o = {}) {
  const highlights = [], callouts = [];
  list.forEach((c, i) => {
    const s = loc(c.t) - 0.05, e = i < list.length - 1 ? loc(list[i + 1].t) - 0.05 : end;
    if (e - s < 0.25) return;
    if (!c.nohl) highlights.push(hl(s, e, c.rect, { padding: c.pad ?? 5, radius: c.r ?? 10 }));
    if (c.text) callouts.push(co(c.text, s + 0.08, e - 0.05, c.rect, { placement: c.side || 'bottom', size: o.size || 'normal' }));
  });
  return { highlights, callouts };
}
/** Merge scene parts: arrays (highlights, callouts) are concatenated, everything else is taken as is. */
const mix = (...parts) => parts.reduce((a, p) => { for (const [k, v] of Object.entries(p)) a[k] = Array.isArray(v) && Array.isArray(a[k]) ? a[k].concat(v) : v; return a; }, {});
// section changes: content slides inside the window, with a soft whoosh
const sectionIn = t => { fx('whoosh', t - 0.3, KEY ? -19 : -16); if (KEY) fx('impact', t + 0.02, -15); return PUSH; };

// ============================================================ 01 INTRODUCTION (motion graphics)
{
  const id = '01_intro', X = SEC[id];
  const t = v => r3(v - X.S);
  const s3 = st(id, 2), s3end = se(id, 2);
  const sp = at(id, 1, 'phone calls'), dl = at(id, 1, 'deadlines slip');
  const cards = [
    { t: X.S + 0.9, title: 'Site approval', sub: 'Waiting for sign-off', icon: 'check', color: '#0068EE', x: 600, y: 300, sx: 340, sy: 195, rot: -5 },
    { t: X.S + 2.0, title: 'Purchase order', sub: 'Awaiting delivery', icon: 'chart', color: '#7C5CFF', x: 1330, y: 250, sx: 1590, sy: 175, rot: 4 },
    { t: at(id, 0, 'installation'), title: 'Installation', sub: 'Crew on site', icon: 'users', color: '#0EA5A4', x: 1440, y: 525, sx: 1700, sy: 540, rot: 3 },
    { t: at(id, 0, 'payments'), title: 'Payment due', sub: 'Reminder pending', icon: 'bell', color: '#F43F5E', x: 500, y: 560, sx: 235, sy: 555, rot: -3 },
    { t: at(id, 0, 'service'), title: 'Service visit', sub: 'Due next month', icon: 'calendar', color: '#F59E0B', x: 700, y: 800, sx: 420, sy: 905, rot: 3 },
    { t: sp, title: 'Phone call', sub: '"Is it done yet?"', icon: 'phone', color: '#22C55E', x: 1290, y: 805, sx: 1580, sy: 905, rot: -4 },
    { t: at(id, 1, 'spreadsheets'), title: 'Spreadsheet', sub: 'projects_final_v3.xlsx', icon: 'grid', color: '#16A34A', x: 975, y: 140, rot: 2 },
    { t: dl, title: 'Notebook', sub: 'Chase on Monday', icon: 'note', color: '#EAB308', x: 985, y: 948, rot: -2 },
  ];
  cards.forEach((c, i) => fx('pop', c.t, i < 6 ? -18 : -20, (c.x - 960) / 1400));
  const q = [['deadlines slip', 'Is it on schedule?'], ['money is chased late', 'Has it been paid?'], ['who is waiting on whom', 'Who is waiting on whom?']]
    .map(([ph, text]) => ({ t: t(at(id, 1, ph)), text }));
  const win = [t(s3end + 0.35), t(s3end + 1.75)];
  if (KEY) fx('shimmer', s3end + 1.75 - 1.95, -16); else fx('riser', s3end + 1.75 - 1.5, -15);
  scene('i_motion', X.S, X.E, {
    type: 'motion', preset: 'intro', seed: 11,
    images: { home: rel(path.join(CAP, 'wf_dash.jpg')), logo: rel(LOGO) },
    cards: cards.map(c => Object.assign({}, c, { t: t(c.t) })),
    scatter: [t(sp - 0.2), t(sp + 1.6)],
    questions: q, question_size: 66,
    dim: [t(at(id, 1, 'deadlines slip') - 0.35), t(at(id, 1, 'deadlines slip') + 0.35)],
    text_out: t(s3 - 0.45),
    converge: [t(s3 - 0.35), t(s3 + 1.1)],
    logo_at: [t(s3 + 0.45), win[0]], logo_width: 780,
    tagline: 'Every project, on track', tagline_at: t(at(id, 2, 'one clear') - 0.15),
    window: win,
    window_from: [960 - 240, 660, 480, 270],
  });
}

// ============================================================ 02 PROJECTS DASHBOARD
{
  const id = '02_dashboard', X = SEC[id];
  const c0 = st(id, 0), c2 = st(id, 2);
  const jobs = at(id, 1, 'how many jobs'), ph = at(id, 1, 'which phase'), ov = at(id, 1, 'how many tasks are overdue'), fl = at(id, 1, 'for any branch');
  const kpis = union(['Total', 'Ongoing', 'On Hold', 'Finished', 'Overdue Tasks'].map(n => box('wf_dash', 'card', new RegExp('^' + n + ' \\d'))));
  const kpi4 = union(['Total', 'Ongoing', 'On Hold', 'Finished'].map(n => box('wf_dash', 'card', new RegExp('^' + n + ' \\d'))));
  const phases = box('wf_dash', 'card', /^Active Phases/);
  const overdue = box('wf_dash', 'card', /^Overdue Tasks/);
  const filters = union(['All time', 'All Branches', 'All Types', 'All Executives'].map(n => box('wf_dash', 'input', new RegExp('^' + n))));
  const upc = at(id, 2, 'upcoming maintenance');
  scene('d_top', X.S, c2 - 0.1, still('wf_dash'), {
    tr: CUT,
    build: (loc, d) => mix({
      camera: camSeq([
        [0, { zoom: 1.0 }], [loc(c0) + 0.3, { zoom: 1.0 }], [loc(jobs) - 0.25, { zoom: 1.06, focus: [1088, 500] }, 'inOutSine'],
        [loc(jobs) + 0.7, fit(kpi4, 0.8)], [loc(ph) - 0.1, fit(kpi4, 0.8)],
        [loc(ph) + 0.8, fit(phases, 0.86)], [loc(ov) - 0.1, fit(phases, 0.86)],
        [loc(ov) + 0.7, fit(overdue, 0.5, 2.2)], [loc(fl) - 0.1, fit(overdue, 0.5, 2.2)],
        [loc(fl) + 0.8, fit(filters, 0.78, 2.0)], [d, Object.assign({}, fit(filters, 0.78, 2.0), { ease: 'inOutSine' })],
      ]),
    }, follow(loc, d, [
      { t: jobs + 0.4, rect: kpi4, text: 'Live project status', side: 'bottom', pad: 8 },
      { t: ph + 0.45, rect: phases, text: 'Where every job stands', side: 'top', pad: 8, r: 14 },
      { t: ov + 0.45, rect: overdue, text: 'Overdue tasks, at a glance', side: 'bottom' },
      { t: fl + 0.45, rect: filters, text: 'By branch, type or executive', side: 'bottom' },
    ]), { }),
  });
  const coll = box('wf_dash2', 'card', /^Collection/), rec = box('wf_dash2', 'card', /^Total Receivables/);
  scene('d_mid', c2 - 0.1, upc - 0.1, still('wf_dash2'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.22, focus: [1000, 760] }], [loc(at(id, 2, 'collections')) + 0.7, fit(coll, 0.8)], [loc(at(id, 2, 'receivables')) - 0.1, fit(coll, 0.8)],
        [loc(at(id, 2, 'receivables')) + 0.8, fit(rec, 0.8)], [d, Object.assign({}, fit(rec, 0.8), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [
      { t: at(id, 2, 'collections'), rect: coll, text: 'Collections', side: 'top', pad: 6, r: 14 },
      { t: at(id, 2, 'receivables'), rect: rec, text: 'Receivables', side: 'top', pad: 6, r: 14 },
    ])),
  });
  const mnt = [276, 127, 1070, 454], vis = [1368, 127, 532, 454];
  scene('d_low', upc - 0.1, X.E, still('wf_dash3'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.2, focus: [1100, 420] }], [loc(upc) + 0.7, fit(union([mnt, vis]), 0.88)], [d, Object.assign({}, fit(union([mnt, vis]), 0.88), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [{ t: upc, rect: union([mnt, vis]), text: 'Upcoming service visits', side: 'top', pad: 6, r: 14 }])),
  });
}

// ============================================================ 03 PROJECTS (list + phase view)
{
  const id = '03_projects', X = SEC[id];
  const e0 = st(id, 0), e1 = st(id, 1), e2 = st(id, 2);
  const tabs = ['Created', 'Ongoing', 'On Hold', 'Finished', 'Dropped'].map(n => tabOf('wf_list', new RegExp('^' + n + ' \\d')));
  const tabRow = union(tabs);
  const cType = col('wf_list', /^Type/, 7), cOwner = col('wf_list', /^Agent Name/, 7), cPhase = col('wf_list', /^Phase/, 7);
  const sw = at(id, 2, 'phase view');
  scene('p_list', X.S, sw - 0.15, still('wf_list'), {
    tr: sectionIn(X.S),
    build: (loc, d) => mix({
      camera: camSeq([
        [0, { zoom: 1.0 }], [loc(e0) + 0.2, { zoom: 1.0 }], [loc(e1) - 0.25, { zoom: 1.08, focus: [1088, 420] }, 'inOutSine'],
        [loc(e1) + 0.6, fit(tabRow, 0.9)], [loc(at(id, 1, 'its type')) - 0.1, fit(tabRow, 0.9)],
        [loc(at(id, 1, 'its type')) + 0.7, { zoom: 1.5, focus: [1380, 520] }], [d, { zoom: 1.5, focus: [1380, 520], ease: 'inOutSine' }],
      ]),
    }, follow(loc, d, [
      { t: at(id, 1, 'created') - 0.05, rect: tabs[0], pad: 3 }, { t: at(id, 1, 'ongoing'), rect: tabs[1], pad: 3 }, { t: at(id, 1, 'on hold'), rect: tabs[2], pad: 3 },
      { t: at(id, 1, 'finished'), rect: tabs[3], pad: 3 }, { t: at(id, 1, 'dropped'), rect: tabs[4], pad: 3 },
      { t: at(id, 1, 'its type'), rect: cType, text: 'Type', side: 'top', pad: 4 }, { t: at(id, 1, 'its owner'), rect: cOwner, text: 'Owner', side: 'top', pad: 4 },
      { t: at(id, 1, 'its current phase'), rect: cPhase, text: 'Current phase', side: 'top', pad: 4 },
    ])),
  });
  const chips = items('wf_list_phases').filter(i => i.kind === 'tab').map(i => i.box).filter(b => b[0] + b[2] <= 1900);
  const chipRow = union(chips), big = box('wf_list_phases', 'tab', /^ORDER CONFIRMATION \d/);
  scene('p_phase', sw - 0.15, X.E, still('wf_list_phases'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.12, focus: [1088, 400] }], [loc(sw) + 0.5, fit(chipRow, 0.95)], [d, Object.assign({}, fit(chipRow, 0.95), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [
      { t: sw, rect: chipRow, text: 'Phase view', side: 'bottom', pad: 4 },
      { t: at(id, 2, 'how many jobs'), rect: chipRow, text: 'Jobs waiting at each stage', side: 'bottom', pad: 4, nohl: true },
    ])),
  });
}

// ============================================================ 04 PROJECT TYPES (templates)
{
  const id = '04_types', X = SEC[id];
  const a1 = at(id, 1, 'its phases'), a2 = at(id, 1, 'tasks,'), a3 = at(id, 1, 'payment terms'), a4 = at(id, 1, 'team,'), a5 = at(id, 1, 'every new project');
  const tTable = tbl('wf_types').box;
  const cPh = col('wf_types', /^Phases/), cTk = col('wf_types', /^Tasks/);
  scene('t_types', X.S, a1 - 0.2, still('wf_types'), {
    tr: sectionIn(X.S),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.0 }], [loc(st(id, 0)) + 0.3, { zoom: 1.0 }], [loc(st(id, 1)) - 0.1, { zoom: 1.1, focus: [1088, 420] }, 'inOutSine'], [d, { zoom: 1.16, focus: [1088, 430], ease: 'inOutSine' }]]),
      callouts: [headline('A process for every job type', loc(st(id, 0)) + 0.5, loc(st(id, 1)) - 0.2)],
    }, follow(loc, d, [{ t: st(id, 1) + 0.6, rect: union([cPh, cTk]), text: 'Phases and tasks, per type', side: 'top', nohl: false, pad: 5 }])),
  });
  // "its phases, tasks, payment terms and team" are spoken within about two seconds, so the template page stays up
  // and its left-hand menu is lit item by item; the plan itself (the task list) follows on "the right plan".
  const menuT = union(['Phases', 'Tasks', 'Payment Terms', 'Members'].map(n => tabOf('wf_tpl_phases', new RegExp('^' + n + '$'))));
  const phT = tbl('wf_tpl_phases').box;
  scene('t_phases', a1 - 0.2, a5 - 0.1, still('wf_tpl_phases'), {
    tr: XF(0.35),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.1, focus: [1000, 470] }], [0.7, fit(union([menuT, phT]), 0.92, 1.5)], [d, Object.assign({}, fit(union([menuT, phT]), 0.92, 1.5), { ease: 'inOutSine' })]]),
      callouts: [co('Everything a type needs', 0.5, d - 0.1, menuT, { placement: 'top' })],
    }, follow(loc, d, [
      { t: a1, rect: tabOf('wf_tpl_phases', /^Phases$/), pad: 3, r: 8 }, { t: a2, rect: tabOf('wf_tpl_phases', /^Tasks$/), pad: 3, r: 8 },
      { t: a3, rect: tabOf('wf_tpl_phases', /^Payment Terms$/), pad: 3, r: 8 }, { t: a4, rect: tabOf('wf_tpl_phases', /^Members$/), pad: 3, r: 8 },
    ])),
  });
  const planR = [714, 272, 1153, 560];
  scene('t_plan', a5 - 0.1, at(id, 2, 'ready template') - 0.15, still('wf_tpl_tasks'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.12, focus: [1000, 470] }], [0.8, fit(union([menuT, planR]), 0.92, 1.5)], [d, Object.assign({}, fit(union([menuT, planR]), 0.92, 1.5), { ease: 'inOutSine' })]]),
      highlights: [hl(0.3, d - 0.05, planR, { padding: 6, radius: 12 })],
      callouts: [co('The right plan from day one', 0.5, d - 0.1, planR, { placement: 'top' })],
    }, {}),
  });
  const addT = box('wf_types', 'button', /^Add from Template/), addN = box('wf_types', 'button', /^Add Type/);
  const rt = at(id, 2, 'ready template'), by = at(id, 2, 'build your own');
  scene('t_end', at(id, 2, 'ready template') - 0.15, X.E, still('wf_types'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.12, focus: [1088, 420] }], [loc(rt) - 0.2, { zoom: 1.12, focus: [1088, 420] }], [loc(rt) + 0.7, fit(union([addT, addN]), 0.5, 1.9)], [d, Object.assign({}, fit(union([addT, addN]), 0.5, 1.9), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [{ t: rt, rect: addT, text: 'Ready templates', side: 'bottom', pad: 5 }, { t: by, rect: addN, text: 'Or build your own', side: 'bottom', pad: 5 }])),
  });
}

// ============================================================ 05 NEW PROJECT
{
  const id = '05_new_project', X = SEC[id];
  const e0 = st(id, 0), e1 = st(id, 1), e2 = st(id, 2);
  const inp = (re, n = 0) => box('wf_new', 'input', re, n);
  const cust = inp(/^Search and pick/), exec = inp(/^Choose You/), amount = [293, 537, 260, 39], from = inp(/^Direct Quotation/);
  const solar = box('wf_new', 'card', /^Solar/);
  const panel = union([inp(/^Enter panel watts/), inp(/^Enter panel quantity/), inp(/^Choose --Create New-- Adani/)]);
  const inverter = union([inp(/^Enter inverter capacity/), inp(/^Choose --Create New-- Enphase/)]);
  scene('n_form', X.S, X.E, still('wf_new'), {
    tr: sectionIn(X.S),
    build: (loc, d) => mix({
      camera: camSeq([
        [0, { zoom: 1.0 }], [loc(e0) + 0.3, { zoom: 1.0 }], [loc(e1) - 0.2, { zoom: 1.1, focus: [1000, 420] }, 'inOutSine'],
        [loc(at(id, 1, 'the customer')) + 0.5, fit(union([cust, exec, amount]), 0.82, 1.9)], [loc(at(id, 1, 'start directly')) - 0.1, fit(union([cust, exec, amount]), 0.82, 1.9)],
        [loc(at(id, 1, 'start directly')) + 0.7, { zoom: 1.5, focus: [760, 330] }], [loc(e2) - 0.3, { zoom: 1.5, focus: [760, 330] }],
        [loc(e2) + 0.6, { rect: solar, padding: 40 }], [d, { rect: solar, padding: 40, ease: 'inOutSine' }],
      ]),
      callouts: [headline('One form to start a project', loc(e0) + 0.4, loc(e1) - 0.15)],
    }, follow(loc, d, [
      { t: at(id, 1, 'the customer'), rect: cust, text: 'Customer', side: 'bottom', pad: 5 }, { t: at(id, 1, 'the executive'), rect: exec, text: 'Executive', side: 'bottom', pad: 5 },
      { t: at(id, 1, 'the deal value'), rect: amount, text: 'Deal value', side: 'bottom', pad: 5 },
      { t: at(id, 1, 'start directly'), rect: from, text: 'Direct, quotation or enquiry', side: 'right', pad: 5 },
      { t: at(id, 2, 'panel'), rect: panel, text: 'Panel details', side: 'top', pad: 6 }, { t: at(id, 2, 'inverter'), rect: inverter, text: 'Inverter details', side: 'top', pad: 6 },
      { t: at(id, 2, 'from day one'), rect: solar, text: 'Industry fields from day one', side: 'top', pad: 8, r: 14 },
    ])),
  });
}

// ============================================================ 06 PROJECT OVERVIEW
{
  const id = '06_overview', X = SEC[id];
  const o0 = st(id, 0), o1 = st(id, 1), o2 = st(id, 2);
  const menu = union(items('wf_ov_basic').filter(i => i.kind === 'tab').map(i => i.box));
  const tab = n => tabOf('wf_ov_basic', new RegExp('^' + n + '$'));
  const pT = tbl('wf_ov_phases').box, pTasks = col('wf_ov_phases', /^Tasks/, 4);
  const done = rows('wf_ov_phases', 0, 1);
  const detail = [697, 300, 1190, 400];
  scene('o_basic', X.S, o1 - 0.15, still('wf_ov_basic'), {
    tr: sectionIn(X.S),
    build: (loc, d) => ({
      camera: camSeq([[0, { zoom: 1.0 }], [loc(o0) + 0.2, { zoom: 1.0 }], [loc(o0) + 1.4, { zoom: 1.5, focus: [1090, 360] }, 'inOutSine'], [d, { zoom: 1.56, focus: [1090, 380], ease: 'inOutSine' }]]),
      callouts: [headline('The whole project, in one place', loc(o0) + 0.5, d - 0.1)],
    }),
  });
  const auto = at(id, 1, 'automatically'), fin = at(id, 1, 'as tasks finish');
  scene('o_phases', o1 - 0.15, o2 - 0.1, still('wf_ov_phases'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.12, focus: [1100, 520] }], [loc(o1) + 0.6, fit(pT, 0.9)], [d, Object.assign({}, fit(pT, 0.9), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [
      { t: at(id, 1, 'phases move'), rect: pT, text: 'Phases advance automatically', side: 'top', pad: 6, r: 14 },
      { t: fin, rect: pTasks, text: 'Tasks finished / total', side: 'top', pad: 4 },
      { t: at(id, 1, 'progress'), rect: done, pad: 4, nohl: false },
    ])),
  });
  const seq = [['checklists', 'Checklist'], ['payments', 'Payment Summary'], ['costing', 'Costing'], ['materials', 'Material'], ['time,', 'Time'], ['maintenance', 'Maintenances'], ['notes', 'Notes'], ['attachments', 'Attachments']]
    .map(([ph, n]) => ({ t: at(id, 2, ph), rect: tab(n), pad: 3, r: 8 }));
  seq.unshift({ t: o2, rect: tab('Tasks'), pad: 3, r: 8 });
  scene('o_menu', o2 - 0.1, X.E, still('wf_ov_basic'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.12, focus: [1100, 520] }], [0.9, { rect: [293, 300, 620, 700], zoom: 1.5 }], [d, { rect: [293, 300, 620, 700], zoom: 1.56, ease: 'inOutSine' }]]),
      callouts: [headline('Everything in one record', loc(at(id, 2, 'in one record')) - 0.2, d - 0.1)],
    }, follow(loc, d, seq)),
  });
}

// ============================================================ 07 TASKS
{
  const id = '07_tasks', X = SEC[id];
  const t0 = st(id, 0), t1 = st(id, 1);
  const cOwn = col('wf_tasks', /^Assigned To/, 8), cSch = col('wf_tasks', /^Scheduled On/, 8), cDl = col('wf_tasks', /^Deadline/, 8);
  const bSch = box('wf_tasks', 'button', /^Schedule/);
  const tRun = tabOf('wf_tasks', /^Running/), tTodo = tabOf('wf_tasks', /^To Do/), tFin = tabOf('wf_tasks', /^Finished/);
  const tabRow = union([tRun, tTodo, tFin]);
  scene('k_tasks', X.S, X.E, still('wf_tasks'), {
    tr: sectionIn(X.S),
    build: (loc, d) => mix({
      camera: camSeq([
        [0, { zoom: 1.0 }], [loc(t0) + 0.3, { zoom: 1.0 }], [loc(t0) + 1.2, { zoom: 1.12, focus: [1088, 600] }, 'inOutSine'],
        [loc(at(id, 0, 'each with an owner')) + 0.2, fit(cOwn, 0.5, 1.5)], [loc(at(id, 1, 'schedule them')) - 0.1, fit(cOwn, 0.5, 1.5)],
        [loc(at(id, 1, 'schedule them')) + 0.8, { zoom: 1.5, focus: [1520, 420] }], [loc(at(id, 1, 'what is running')) - 0.15, { zoom: 1.5, focus: [1520, 420] }],
        [loc(at(id, 1, 'what is running')) + 0.7, fit(tabRow, 0.9)], [d, Object.assign({}, fit(tabRow, 0.9), { ease: 'inOutSine' })],
      ]),
      callouts: [headline('Every task has an owner', loc(t0) + 0.4, loc(at(id, 0, 'each with an owner')) - 0.2)],
    }, follow(loc, d, [
      { t: at(id, 0, 'each with an owner'), rect: cOwn, text: 'Owner', side: 'top', pad: 4 }, { t: at(id, 1, 'schedule them'), rect: union([bSch, cSch]), text: 'Scheduled', side: 'bottom', pad: 5 },
      { t: at(id, 1, 'set deadlines'), rect: cDl, text: 'Deadline', side: 'top', pad: 4 },
      { t: at(id, 1, 'what is running'), rect: tRun, pad: 3 }, { t: at(id, 1, 'still to do'), rect: tTodo, pad: 3 }, { t: at(id, 1, 'what is finished'), rect: tFin, pad: 3 },
    ])),
  });
}

// ============================================================ 08 STATUS REPORT
{
  const id = '08_status', X = SEC[id];
  const r0 = st(id, 0), r1 = st(id, 1), r2 = st(id, 2);
  const chips = union(items('wf_status').filter(i => i.kind === 'badge').map(i => i.box));
  const cTask = col('wf_status', /^Task/, 5), cAsg = col('wf_status', /^Assignee/, 5), cUpd = col('wf_status', /^Updated/, 5);
  const filt = union(['All Branches', 'All Types'].map(n => box('wf_status', 'input', new RegExp('^' + n))));
  const pdf = box('wf_status', 'button', /^Export PDF/);
  const cur = at(id, 1, 'current and next task'), asg = at(id, 1, 'who it is assigned to'), run = at(id, 1, 'running');
  const fb = at(id, 2, 'filter by branch'), ex = at(id, 2, 'export it as a pdf');
  scene('s_report', X.S, X.E, still('wf_status'), {
    tr: sectionIn(X.S),
    build: (loc, d) => mix({
      camera: camSeq([
        [0, { zoom: 1.0 }], [loc(r0) + 0.3, { zoom: 1.0 }], [loc(r1) - 0.2, { zoom: 1.08, focus: [1088, 520] }, 'inOutSine'],
        [loc(cur) + 0.6, fit(union([cTask, cUpd]), 0.9, 1.5)], [loc(asg) - 0.1, fit(union([cTask, cUpd]), 0.9, 1.5)],
        [loc(asg) + 0.7, fit(cAsg, 0.5, 1.6)], [loc(run) - 0.15, fit(cAsg, 0.5, 1.6)],
        [loc(run) + 0.7, fit(chips, 0.5, 2.7)], [loc(fb) - 0.15, fit(chips, 0.5, 2.7)],
        [loc(fb) + 0.8, fit(union([filt, pdf]), 0.7, 2.2)], [d, Object.assign({}, fit(union([filt, pdf]), 0.7, 2.2), { ease: 'inOutSine' })],
      ]),
      callouts: [headline('One report for every project', loc(r0) + 0.4, loc(r1) - 0.25)],
    }, follow(loc, d, [
      { t: cur, rect: union([cTask, cUpd]), text: 'Current and next task', side: 'top', pad: 5 }, { t: asg, rect: cAsg, text: 'Who is on it', side: 'top', pad: 5 },
      { t: run, rect: chips, text: 'Running, scheduled, unscheduled', side: 'bottom', pad: 5 },
      { t: fb, rect: filt, text: 'Filter', side: 'bottom', pad: 5 }, { t: ex, rect: pdf, text: 'Export PDF', side: 'bottom', pad: 5 },
    ])),
  });
}

// ============================================================ 09 PAYMENTS AND COLLECTIONS
{
  const id = '09_money', X = SEC[id];
  const m0 = st(id, 0), m1 = st(id, 1), m2 = st(id, 2);
  const kpi = union(items('wf_ov_summary').filter(i => i.kind === 'card' && /INR$/.test(i.text)).map(i => i.box));
  const ledger = box('wf_ov_summary', 'card', /^Date Particulars/);
  scene('m_summary', X.S, m1 - 0.15, still('wf_ov_summary'), {
    tr: sectionIn(X.S),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.0 }], [loc(m0) + 0.2, { zoom: 1.0 }], [loc(m0) + 1.3, fit(union([kpi, ledger]), 0.88, 1.6), 'inOutSine'], [d, Object.assign({}, fit(union([kpi, ledger]), 0.88, 1.6), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [{ t: m0 + 0.6, rect: kpi, text: 'Deal, due and collected, per project', side: 'bottom', pad: 8, r: 14 }])),
  });
  const terms = tbl('wf_ov_terms').box, cOn = col('wf_ov_terms', /^Payment On/), cPct = col('wf_ov_terms', /^%/);
  scene('m_terms', m1 - 0.15, m2 - 0.1, still('wf_ov_terms'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.12, focus: [1088, 520] }], [loc(m1) + 0.6, fit(terms, 0.85, 1.9)], [d, Object.assign({}, fit(terms, 0.85, 1.9), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [
      { t: at(id, 1, 'payment terms'), rect: terms, text: 'Payment terms', side: 'top', pad: 6, r: 12 },
      { t: at(id, 1, 'to a phase'), rect: cOn, text: 'Tied to a phase', side: 'top', pad: 5 },
      { t: at(id, 1, 'money follows'), rect: union([cPct, col('wf_ov_terms', /^Amount/)]), text: 'Money follows the work', side: 'top', pad: 5 },
    ])),
  });
  const pl = at(id, 2, 'pending collection list');
  const cAmt = col('wf_coll', /^Amount/, 8), cVou = col('wf_coll', /^Voucher/, 8);
  scene('m_coll', m2 - 0.1, pl - 0.15, still('wf_coll'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.12, focus: [1088, 520] }], [loc(at(id, 2, 'collections are')) + 0.8, { zoom: 1.35, focus: [1150, 480] }], [d, { zoom: 1.4, focus: [1150, 490], ease: 'inOutSine' }]]),
    }, follow(loc, d, [{ t: at(id, 2, 'collections are') + 0.2, rect: union([cVou, cAmt]), text: 'Every collection, against its project', side: 'top', pad: 5 }])),
  });
  const cDeal = col('wf_pending', /^Deal Amount/, 8), cCol = col('wf_pending', /^Collected/, 8), cUn = col('wf_pending', /^Un Collected/, 8);
  const acts = [290, 200, 160, 8 * 53 + 10];
  const owe = union([cDeal, cCol, cUn]);
  scene('m_pending', pl - 0.15, X.E, still('wf_pending'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.12, focus: [1088, 420] }], [loc(pl) + 0.6, { zoom: 1.3, focus: [1088, 420] }], [loc(at(id, 2, 'who owes what')) + 0.7, fit(owe, 0.55, 1.8)],
        [loc(at(id, 2, 'follow-up')) - 0.1, fit(owe, 0.55, 1.8)], [loc(at(id, 2, 'follow-up')) + 0.8, fit(acts, 0.5, 1.9)], [d, Object.assign({}, fit(acts, 0.5, 1.9), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [
      { t: at(id, 2, 'who owes what'), rect: owe, text: 'Who owes what', side: 'top', pad: 5 },
      { t: at(id, 2, 'follow-up'), rect: acts, text: 'Follow up or collect', side: 'right', pad: 6 },
    ])),
  });
}

// ============================================================ 10 COSTING
{
  const id = '10_cost', X = SEC[id];
  const k0 = st(id, 0), k1 = st(id, 1), k2 = st(id, 2);
  const cardRev = box('wf_costing', 'card', /^Revenue/), cardCost = box('wf_costing', 'card', /^Cost \d/), cardMar = box('wf_costing', 'card', /^Margin/), cardOver = box('wf_costing', 'card', /^Over budget/);
  const kp = union([cardRev, cardCost, cardMar, cardOver]);
  const cBud = col('wf_costing', /^Budget/, 9), cUsed = col('wf_costing', /^Used/, 9), cMar = col('wf_costing', /^Margin/, 9);
  const cr = at(id, 2, 'cost rates');
  scene('c_costing', X.S, cr - 0.15, still('wf_costing'), {
    tr: sectionIn(X.S),
    build: (loc, d) => mix({
      camera: camSeq([
        [0, { zoom: 1.0 }], [loc(k0) + 0.2, { zoom: 1.0 }], [loc(k0) + 1.3, fit(kp, 0.9, 1.6), 'inOutSine'],
        [loc(at(id, 1, 'budget and margin')) - 0.1, fit(kp, 0.9, 1.6)], [loc(at(id, 1, 'budget and margin')) + 0.7, { zoom: 1.5, focus: [1500, 520] }],
        [loc(at(id, 1, 'over budget')) - 0.1, { zoom: 1.5, focus: [1500, 520] }], [loc(at(id, 1, 'over budget')) + 0.7, fit(cardOver, 0.5, 2.2)], [d, Object.assign({}, fit(cardOver, 0.5, 2.2), { ease: 'inOutSine' })],
      ]),
      callouts: [headline('Margin, while the work is running', loc(k0) + 0.4, loc(k1) - 0.2)],
    }, follow(loc, d, [
      { t: at(id, 1, 'revenue'), rect: cardRev, text: 'Revenue', side: 'bottom', pad: 5 }, { t: at(id, 1, 'cost,'), rect: cardCost, text: 'Cost', side: 'bottom', pad: 5 },
      { t: at(id, 1, 'budget and margin'), rect: union([cBud, cUsed, cMar]), text: 'Budget, used and margin', side: 'top', pad: 5 },
      { t: at(id, 1, 'over budget'), rect: cardOver, text: 'Over budget', side: 'bottom', pad: 5 },
    ])),
  });
  const calc = box('wf_rates', 'button', /^Calculate from salary/);
  const cSal = col('wf_rates', /^Monthly salary/, 6), cRate = col('wf_rates', /^Current rate/, 6);
  const la = at(id, 2, 'labour cost actualisation'), mu = at(id, 2, 'materials used');
  scene('c_rates', cr - 0.15, la - 0.1, still('wf_rates'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.1, focus: [1088, 560] }], [loc(cr) + 0.6, fit(union([calc, cSal, cRate]), 0.9, 1.6)], [d, Object.assign({}, fit(union([calc, cSal, cRate]), 0.9, 1.6), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [
      { t: cr, rect: union([cSal, cRate]), text: 'Cost rates', side: 'top', pad: 5 }, { t: at(id, 2, 'from salaries'), rect: calc, text: 'Calculated from salary', side: 'bottom', pad: 6 },
    ])),
  });
  const per = union(items('wf_labour').filter(i => (i.kind === 'input' && i.box[0] > 1500) || (i.kind === 'button' && /^Preview/.test(i.text))).map(i => i.box));
  scene('c_labour', la - 0.1, mu - 0.1, still('wf_labour'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.2, focus: [1500, 200] }], [loc(la) + 0.6, fit(per, 0.55, 2.0)], [d, Object.assign({}, fit(per, 0.55, 2.0), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [{ t: la, rect: per, text: 'Month by month', side: 'bottom', pad: 6 }])),
  });
  const mt = tbl('wf_material').box, addM = box('wf_material', 'button', /^Add Material Used/);
  scene('c_material', mu - 0.1, X.E, still('wf_material'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.12, focus: [1088, 330] }], [loc(mu) + 0.6, fit(union([mt, addM]), 0.85, 1.7)], [d, Object.assign({}, fit(union([mt, addM]), 0.85, 1.7), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [{ t: mu, rect: union([mt, addM]), text: 'Materials used, per job', side: 'bottom', pad: 6 }])),
  });
}

// ============================================================ 11 MAINTENANCE
{
  const id = '11_maintenance', X = SEC[id];
  const n0 = st(id, 0), n1 = st(id, 1), n2 = st(id, 2);
  const mnt = [276, 127, 1070, 454], vis = [1368, 127, 532, 454];
  scene('mt_open', X.S, n1 - 0.15, still('wf_dash3'), {
    tr: sectionIn(X.S),
    build: (loc, d) => ({
      camera: camSeq([[0, { zoom: 1.0 }], [loc(n0) + 0.3, { zoom: 1.0 }], [loc(n0) + 1.4, fit(union([mnt, vis]), 0.88), 'inOutSine'], [d, Object.assign({}, fit(union([mnt, vis]), 0.88), { ease: 'inOutSine' })]]),
      callouts: [headline('Service stays on the calendar', loc(n0) + 0.5, d - 0.1)],
    }),
  });
  const tT = tbl('wf_tpl_maint').box;
  const cEvery = col('wf_tpl_maint', /^Visit Every/), cContract = col('wf_tpl_maint', /^Contract/), cFires = col('wf_tpl_maint', /^Fires On/), cPhase = col('wf_tpl_maint', /^Phase/);
  scene('mt_tpl', n1 - 0.15, n2 - 0.1, still('wf_tpl_maint'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.1, focus: [1000, 400] }], [loc(n1) + 0.6, fit(union([[293, 255, 364, 36], tT]), 0.9, 1.7)], [d, Object.assign({}, fit(union([[293, 255, 364, 36], tT]), 0.9, 1.7), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [
      { t: at(id, 1, 'maintenance schedule'), rect: union([tabOf('wf_tpl_maint', /^Maintenance Schedule/)]), pad: 3 },
      { t: at(id, 1, 'every four months'), rect: cEvery, text: 'Every four months', side: 'bottom', pad: 5 },
      { t: at(id, 1, 'five years'), rect: cContract, text: 'For five years', side: 'bottom', pad: 5 },
      { t: at(id, 1, 'starts automatically'), rect: union([cPhase, cFires]), text: 'Starts when the project finishes', side: 'bottom', pad: 5 },
    ])),
  });
  const cVisit = col('wf_maint', /^Visit/, 9), cStat = col('wf_maint', /^Status/, 9), cWhen = col('wf_maint', /^Scheduled On/, 9);
  const list = tbl('wf_maint').box;
  scene('mt_list', n2 - 0.1, X.E, still('wf_maint'), {
    tr: XF(0.4),
    build: (loc, d) => mix({
      camera: camSeq([[0, { zoom: 1.12, focus: [1088, 420] }], [loc(n2) + 0.7, fit(list, 0.9, 1.5)], [d, Object.assign({}, fit(list, 0.9, 1.5), { ease: 'inOutSine' })]]),
    }, follow(loc, d, [
      { t: at(id, 2, 'every visit'), rect: union([cWhen, cVisit]), text: 'Every visit, scheduled', side: 'top', pad: 5 },
      { t: at(id, 2, 'one schedule'), rect: list, text: 'One schedule', side: 'top', pad: 6, r: 14 },
      { t: at(id, 2, 'service is never'), rect: cStat, text: 'Nothing forgotten', side: 'top', pad: 5 },
    ])),
  });
}

// ============================================================ 12 CLOSING
{
  const id = '12_closing', X = SEC[id];
  const k0e = se(id, 0);
  const beats = [
    [X.S, 'wf_dash', [1088, 500]],
    [at(id, 0, 'first enquiry') - 0.1, 'wf_new', [1000, 420]],
    [at(id, 0, 'last service visit') - 0.1, 'wf_maint', [1088, 420]],
    [at(id, 0, 'keeps every project') - 0.1, 'wf_status', [1088, 540]],
    [at(id, 0, 'on track') - 0.1, 'wf_list_phases', [1088, 400]],
  ];
  const endAt = k0e + 0.35;
  beats.forEach(([t0, name, f], i) => {
    const t1 = i < beats.length - 1 ? beats[i + 1][0] : endAt;
    scene(`q_${i + 1}_${name}`, t0, t1, still(name), {
      tr: i === 0 ? sectionIn(X.S) : XF(0.25),
      build: (loc, d) => ({ camera: [cam(0, { zoom: i % 2 ? 1.28 : 1.18, focus: f }), cam(d, { zoom: i % 2 ? 1.18 : 1.3, focus: f, ease: 'linear' })] }),
    });
  });
  const t = v => r3(v - endAt);
  if (KEY) fx('shimmer', st(id, 4) - 0.05 - 2.0, -17); else fx('riser', st(id, 4) - 1.3, -17);
  scene('q_end', endAt, TOTAL, {
    type: 'motion', preset: 'intro', seed: 5, pings: false,
    images: { logo: rel(LOGO) },
    questions: [[1, 'One process.'], [2, 'Clear ownership.'], [3, 'Better control.']].map(([k, text], i) => ({ t: t(st(id, k) - 0.05), text, y: 330 + i * 116 })),
    question_size: 76,
    text_out: t(st(id, 4) - 0.35),
    logo_at: [t(st(id, 4) - 0.05), 1e6], logo_width: 820,
    tagline: 'Every project, on track.', tagline_at: t(st(id, 4) + 0.55), tagline_size: 40,
  }, { tr: XF(0.45) });
}

// ------------------------------------------------------------ write
if (KEY) {                                      // a soft tick when a headline (a callout without a target) appears
  let last = -9;
  for (const sc of scenes) for (const c of (sc.callouts || [])) {
    if (c.target !== null) continue;
    const t = sc.start + c.start + 0.08;
    if (t - last > 0.8) { fx('tick', t, -14); last = t; }
  }
}
for (const sc of scenes) for (const c of (sc.callouts || [])) if (c.target === null) delete c.target;
for (let i = 1; i < scenes.length; i++) {
  if (Math.abs(scenes[i].start - scenes[i - 1].end) > 1e-6) throw new Error(`scene gap/overlap between ${scenes[i - 1].id} (${scenes[i - 1].end}) and ${scenes[i].id} (${scenes[i].start})`);
  if (scenes[i].end - scenes[i].start < 0.6) throw new Error(`scene ${scenes[i].id} is too short: ${(scenes[i].end - scenes[i].start).toFixed(2)}s`);
}
const timeline = {
  _comment: `Progbiz Work Flow module video ${TAG}. Generated by scripts/video/workflow/10_build_timeline_wf.js — edit the builder, not this file.`,
  version: 1, width: 1920, height: 1080, fps: 30, duration: TOTAL, assets_root: '.', background: '#06101F',
  stage: { scale: 0.9, radius: 22 },
  brand: {
    name: 'Progbiz ERP', tagline: 'Every project, on track',
    logo: rel(LOGO),
    colors: { primary: '#0068EE', accent: '#85C0FF', ink: '#071527', paper: '#FFFFFF', muted: '#5B667A' },
  },
  scenes,
};
fs.writeFileSync(path.join(WF, `timeline_${TAG}.json`), JSON.stringify(timeline, null, 1));
const voice = [];
if (RECORDED) for (const id of order) voice.push({ file: rel(SEC[id].file), start_s: r3(SEC[id].V - SEC[id].f0), gain: 1.0 });
else for (const id of order) SEC[id].sent.forEach((s, k) => voice.push({ file: rel(s.file), start_s: r3(st(id, k)), gain: 1.0 }));
fs.writeFileSync(path.join(WF, `sentences_${TAG}.json`), JSON.stringify(order.flatMap(id => SEC[id].sent.map((x, k) => ({ section: id, n: k + 1, text: x.text, start_s: r3(st(id, k)), end_s: r3(se(id, k)) }))), null, 1));
fs.writeFileSync(path.join(WF, `voice_cues_${TAG}.json`), JSON.stringify(voice, null, 1));
fs.writeFileSync(path.join(WF, `sfx_${TAG}.json`), JSON.stringify(sfx.sort((a, b) => a.t - b.t), null, 1));
fs.writeFileSync(path.join(WF, `sections_${TAG}.json`), JSON.stringify({ total: TOTAL, sections: order.map(id => ({ id, start: r3(SEC[id].S), voice: r3(SEC[id].V), end: r3(SEC[id].E) })) }, null, 1));
const words = order.reduce((a, id) => a + SEC[id].sent.reduce((b, s) => b + s.text.split(/\s+/).length, 0), 0);
const speech = order.reduce((a, id) => a + SEC[id].sent.reduce((b, s) => b + s.dur, 0), 0);
console.log(`total ${TOTAL} s (${Math.floor(TOTAL / 60)}:${String(Math.round(TOTAL % 60)).padStart(2, '0')}), tail per section ${TAIL.toFixed(2)} s, ${words} words, ${(words / (speech / 60)).toFixed(0)} wpm while speaking`);
for (const id of order) console.log(`  ${id.padEnd(16)} ${SEC[id].S.toFixed(2).padStart(7)} -> ${SEC[id].E.toFixed(2).padStart(7)}   voice ${SEC[id].V.toFixed(2)} + ${SEC[id].span.toFixed(2)}`);
console.log(`scenes: ${scenes.length}, sfx events: ${sfx.length}`);
for (const s of scenes) console.log(`  ${s.id.padEnd(18)} ${s.start.toFixed(2).padStart(7)} -> ${s.end.toFixed(2).padStart(7)}  (${(s.end - s.start).toFixed(2)} s)  ${s.source.type}`);
