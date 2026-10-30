'use strict';
/**
 * Edit v4 of the Progbiz ERP marketing video (brief "FINAL 4-MINUTE BUSINESS MARKETING VIDEO",
 * 2026-09-29): business-problem intro (motion graphics, no UI), then Home, AI Assistant, Leads,
 * CRM Dashboard, Executive Performance, AI Call Analysis, Follow-ups, Lead Transfer, WhatsApp
 * and the closing. Framed "stage" look, no cursor, short on-screen text only.
 *
 * Inputs : reports/video/beta/audio_v4/<voice>/cues.json (sentence WAVs), reports/video/beta/cap/*
 * Outputs: reports/video/beta/timeline_<tag>.json      (compositor timeline)
 *          reports/video/beta/voice_cues_<tag>.json    (one clip per SENTENCE, for mixwav.py)
 *          reports/video/beta/sfx_<tag>.json           (sound-effect events, for audio/mix.js)
 *          reports/video/beta/sections_<tag>.json
 *
 * Every camera move, highlight and on-screen text is anchored to the sentence (or the word in it)
 * that talks about it, so the picture follows the voice.
 *
 * Run:  node scripts/video/beta/10_build_timeline_v4.js [--voice com_apple_voice_Tara_premium] [--total 226] [--tag v4]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const BETA = path.join(ROOT, 'reports', 'video', 'beta');
const CAP = path.join(BETA, 'cap');
const rel = p => path.relative(ROOT, p);
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const VOICE = opt('--voice', 'com_apple_voice_Tara_premium');
const AUDIO = path.join(BETA, opt('--audio', 'audio_v4'), VOICE);
const TAG = opt('--tag', 'v4');
const TARGET = Number(opt('--total', 226));
const SFX_DIR = opt('--sfx-dir', path.join(BETA, 'audio_v4', 'music', 'sfx'));
// --recorded: the narration is a human/studio recording cut into one WAV per section (ingest_recording.py,
// cues.json with start_s inside each section file) instead of one WAV per sentence (make_vo.py)
const RECORDED = argv.includes('--recorded');
// --keynote: sound design for the tech-keynote music bed (soft impact on every section change, glass ticks on the headlines)
const KEY = argv.includes('--keynote');

const cues = JSON.parse(fs.readFileSync(path.join(AUDIO, 'cues.json'), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(CAP, 'boxes.json'), 'utf8'));
const r3 = v => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------ narration layout (per sentence)
const PAUSE = 0.42;
const PAUSE_AFTER = {          // "<section>#<sentence index>" -> pause after that sentence (s)
  '01_intro#1': 1.15,          // the activity cards converge before "Progbiz ERP brings..."
  '02_home#0': 0.5,
  '04_leads#0': 0.75, '06_executives#0': 0.6, '07_calls#0': 0.75, '08_followups#0': 0.75, '09_transfer#0': 0.75,
  '11_closing#0': 0.7, '11_closing#1': 0.5, '11_closing#2': 0.5, '11_closing#3': 0.8,
};
const LEAD = { '01_intro': 2.4, '02_home': 1.0 };          // visual time before the first sentence
const LEAD_DEF = 1.3;
const TAIL_FIXED = { '01_intro': 1.9, '11_closing': 4.4 };  // after the last sentence
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
const fixed = order.reduce((a, id) => a + SEC[id].lead + SEC[id].span + (TAIL_FIXED[id] || 0), 0);
const free = order.filter(id => TAIL_FIXED[id] == null);
const TAIL = (TARGET - fixed) / free.length;
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
const still = name => ({ type: 'still', path: rel(path.join(CAP, `${name}.jpg`)), css_width: 1920, css_height: 1080 });
const shot = (dir, extra) => Object.assign({ type: 'shot', dir: rel(path.join(CAP, dir)) }, extra || {});
const card = o => Object.assign({ type: 'card', theme: 'dark' }, o);
const cam = (tt, o) => Object.assign({ t: r3(Math.max(0, tt)) }, o);
const hl = (s, e, rect, o) => Object.assign({ start: r3(s), end: r3(e), rect, style: 'outline', radius: 12, padding: 6 }, o || {});
const co = (text, s, e, target, o) => Object.assign({ text, start: r3(s), end: r3(e), target }, o || {});
const headline = (text, s, e) => co(text, s, e, null, { placement: 'bottom', marker: true });
const union = rs => { const x = Math.min(...rs.map(r => r[0])), y = Math.min(...rs.map(r => r[1])); return [x, y, Math.max(...rs.map(r => r[0] + r[2])) - x, Math.max(...rs.map(r => r[1] + r[3])) - y]; };
const mid = r => [Math.round(r[0] + r[2] / 2), Math.round(r[1] + r[3] / 2)];
const fx = (name, t, gain_db, pan) => sfx.push({ file: path.join(SFX_DIR, `${name}.wav`), t: r3(t), gain_db, pan: pan || 0 });

function scrollMap(keys) {
  const out = [{ t: r3(keys[0].t), src: keys[0].y / 1000 }];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (a.y === b.y) { out.push({ t: r3(b.t), src: b.y / 1000 }); continue; }
    for (let k = 1; k <= 10; k++) {
      const u = k / 10, e = -(Math.cos(Math.PI * u) - 1) / 2;
      out.push({ t: r3(a.t + (b.t - a.t) * u), src: r3((a.y + (b.y - a.y) * e) / 1000) });
    }
  }
  return out;
}
function composite(id, parts) {
  const dir = path.join(CAP, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
  const frames = parts.map((p, i) => {
    const file = `frames/f_${String(i + 1).padStart(6, '0')}.jpg`;
    fs.copyFileSync(path.join(CAP, `${p.still}.jpg`), path.join(dir, file));
    return { file, t_ms: Math.round(p.t * 1000) };
  });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ shot_id: id, css_width: 1920, css_height: 1080, dsf: 2, frame_width: 3840, frame_height: 2160, frames, events: [] }, null, 1));
  return shot(id, { time_map: [{ t: 0, src: 0 }, { t: 1000, src: 1000 }] });
}
// section changes: content slides inside the window, with a soft whoosh
const sectionIn = t => { fx('whoosh', t - 0.3, KEY ? -19 : -16); if (KEY) fx('impact', t + 0.02, -15); return PUSH; };

// ============================================================ 01 INTRODUCTION (motion graphics)
{
  const id = '01_intro', X = SEC[id];
  const t = v => r3(v - X.S);
  const s3 = st(id, 2), s3end = se(id, 2);
  const sp = at(id, 1, 'spread across'), dp = at(id, 1, 'different places');
  const cards = [
    { t: X.S + 0.9, title: 'New enquiry', sub: 'From your website', icon: 'user', color: '#0068EE', x: 600, y: 300, sx: 340, sy: 195, rot: -5 },
    { t: X.S + 2.0, title: 'WhatsApp message', sub: 'New chat', icon: 'chat', color: '#22C55E', x: 1330, y: 250, sx: 1590, sy: 175, rot: 4 },
    { t: at(id, 0, 'customers'), title: 'Customer call', sub: 'Missed, 10:15 AM', icon: 'phone', color: '#F43F5E', x: 1440, y: 525, sx: 1700, sy: 540, rot: 3 },
    { t: at(id, 0, 'sales'), title: 'Quotation sent', sub: 'Awaiting reply', icon: 'chart', color: '#7C5CFF', x: 500, y: 560, sx: 235, sy: 555, rot: -3 },
    { t: at(id, 0, 'follow-ups'), title: 'Follow-up due', sub: 'Today, 4:30 PM', icon: 'calendar', color: '#F59E0B', x: 700, y: 800, sx: 420, sy: 905, rot: 3 },
    { t: at(id, 0, 'your team'), title: 'Team tasks', sub: '5 in progress', icon: 'users', color: '#0EA5A4', x: 1290, y: 805, sx: 1580, sy: 905, rot: -4 },
    { t: sp, title: 'Spreadsheet', sub: 'leads_final_v3.xlsx', icon: 'grid', color: '#16A34A', x: 975, y: 140, rot: 2 },
    { t: dp, title: 'Notebook', sub: 'Call back Friday', icon: 'note', color: '#EAB308', x: 985, y: 948, rot: -2 },
  ];
  cards.forEach((c, i) => fx('pop', c.t, i < 6 ? -18 : -20, (c.x - 960) / 1400));
  const q = [['what is happening', "What's happening?"], ['what needs attention', 'What needs attention?'], ['where your team stands', 'Where does your team stand?']]
    .map(([ph, text]) => ({ t: t(at(id, 1, ph)), text }));
  const win = [t(s3end + 0.35), t(s3end + 1.75)];
  if (KEY) fx('shimmer', s3end + 1.75 - 1.95, -16); else fx('riser', s3end + 1.75 - 1.5, -15);
  scene('i_motion', X.S, X.E, {
    type: 'motion', preset: 'intro', seed: 11,
    images: { home: rel(path.join(CAP, 'home.jpg')), logo: rel(path.join(CAP, 'white-logo-1600.png')) },
    cards: cards.map(c => Object.assign({}, c, { t: t(c.t) })),
    scatter: [t(sp - 0.2), t(sp + 1.6)],
    questions: q, question_size: 66,
    dim: [t(at(id, 1, 'what is happening') - 0.35), t(at(id, 1, 'what is happening') + 0.35)],
    text_out: t(s3 - 0.45),
    converge: [t(s3 - 0.35), t(s3 + 1.1)],
    logo_at: [t(s3 + 0.45), win[0]], logo_width: 780,
    tagline: 'One connected workspace', tagline_at: t(at(id, 2, 'one connected workspace') - 0.15),
    window: win,
    window_from: [960 - 240, 660, 480, 270],
  });
}

// ============================================================ 02 HOME
{
  const id = '02_home', X = SEC[id], h = B.home;
  const a0 = st(id, 0);
  const ov = at(id, 1, 'quick overview'), td = at(id, 1, 'what is happening today'), att = at(id, 1, 'where attention is needed');
  const cards = union(h.cards.map(c => c[1])), del = h.cards[2][1];
  scene('h_home', X.S, X.E, still('home'), {
    tr: CUT,
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(a0) + 0.1, { zoom: 1.0 }), cam(loc(ov) - 0.1, { zoom: 1.08, focus: [1088, 520], ease: 'inOutSine' }),
        cam(loc(ov) + 0.8, { rect: cards, padding: 40 }), cam(loc(td) - 0.1, { rect: cards, padding: 40 }),
        cam(loc(td) + 0.8, { rect: h.schedule, zoom: 1.6 }), cam(loc(att) - 0.1, { rect: h.schedule, zoom: 1.6 }),
        cam(loc(att) + 0.8, { rect: del, zoom: 2.2 }), cam(d, { rect: del, zoom: 2.3, ease: 'inOutSine' }),
      ],
      highlights: [hl(loc(ov) + 0.6, loc(td) - 0.1, cards, { padding: 8 }), hl(loc(td) + 0.6, loc(att) - 0.1, h.schedule), hl(loc(att) + 0.6, d, del, { padding: 4 })],
      callouts: [headline('Your business at a glance', loc(a0) + 0.2, loc(ov) - 0.15), co('Know what needs attention', loc(att) + 0.9, d - 0.1, del, { placement: 'bottom' })],
    }),
  });
}

// ============================================================ 03 AI ASSISTANT
{
  const id = '03_ai', X = SEC[id], a = B.ai_empty;
  const b0 = st(id, 0), b1 = st(id, 1);
  const chip = name => (a.chips.find(c => c[0] === name) || [null, null])[1];
  const chipsAll = union(a.chips.map(c => c[1]));
  const input = B.ai_typing.input;
  const inputView = { rect: [input[0], input[1] - 20, input[2] + 90, input[3] + 40], zoom: 1.45 };
  const endCam = { zoom: 1.2, focus: [1100, 420] };
  const tyStart = b0 + 0.6, tyEnd = tyStart + 1.9, anEnd = tyEnd + 1.3;
  scene('a_empty', X.S, tyStart, still('ai_empty'), {
    tr: sectionIn(X.S),
    build: (loc, d) => ({ camera: [cam(0, { zoom: 1.0 }), cam(loc(b0) - 0.2, { zoom: 1.0 }), cam(d, endCam)] }),
  });
  scene('a_typing', tyStart, tyEnd, shot('ai_typing', { time_map: [{ t: 0, src: 0 }, { t: 0.2, src: 0 }, { t: 1.65, src: 1.89 }, { t: 1.9, src: 1.89 }] }), {
    tr: CUT,
    build: (loc, d) => ({ camera: [cam(0, endCam), cam(0.45, inputView), cam(d, inputView)], highlights: [hl(0.45, d - 0.1, input, { padding: 5 })] }),
  });
  const q = [1666, 158, 200, 37], ans = [722, 231, 288, 37];
  const chatTop = { rect: [700, 140, 1190, 150], zoom: 1.45 };
  scene('a_answering', tyEnd, anEnd, shot('ai_answering', { time_map: [{ t: 0, src: 0.241 }, { t: 0.7, src: 3.6 }, { t: 0.8, src: 4.009 }, { t: 1.3, src: 4.6 }] }), {
    tr: CUT,
    build: (loc, d) => ({ camera: [cam(0, inputView), cam(0.5, chatTop), cam(d, chatTop)] }),
  });
  const qa = { rect: union([q, ans]), zoom: 1.5 };
  scene('a_answer', anEnd, b1 - 0.1, still('ai_answer'), {
    tr: CUT,
    build: (loc, d) => ({
      camera: [cam(0, chatTop), cam(0.7, qa), cam(d, Object.assign({}, qa, { zoom: 1.56, ease: 'inOutSine' }))],
      highlights: [hl(0.3, d, ans, { padding: 6, radius: 16 })],
      callouts: [co('Business insights in one touch', 0.6, d - 0.05, ans, { placement: 'bottom' })],
    }),
  });
  const seq = [
    ['lead status', [chip('How many leads today?')], 'Lead status', 'top'],
    ['employee work status', [chip('How many tasks are delayed?'), chip('Who has the most delayed tasks?')], 'Employee activity', 'bottom'],
    ['attendance', [chip('Who all are present today?')], 'Attendance', 'top'],
  ].map(([ph, rs, text, side]) => ({ t: at(id, 1, ph), r: union(rs), text, side }));
  const chipView = { rect: [chipsAll[0] - 30, chipsAll[1] - 120, chipsAll[2] + 60, chipsAll[3] + 240], zoom: 1.75 };
  scene('a_chips', b1 - 0.1, X.E, still('ai_empty'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.3, focus: [1200, 330] }), cam(0.9, chipView), cam(d, Object.assign({}, chipView, { zoom: 1.8, ease: 'inOutSine' }))],
      highlights: seq.map((c, i) => hl(loc(c.t) - 0.05, i < seq.length - 1 ? loc(seq[i + 1].t) - 0.05 : d, c.r, { padding: 5, radius: 10 })),
      callouts: seq.map((c, i) => co(c.text, loc(c.t) + 0.1, i < seq.length - 1 ? loc(seq[i + 1].t) - 0.1 : d - 0.1, c.r, { placement: c.side, size: 'normal' })),
    }),
  });
}

// ============================================================ 04 LEADS
{
  const id = '04_leads', X = SEC[id], N = B.leads_nature;
  const e0 = st(id, 0), e1 = st(id, 1), e2 = st(id, 2);
  const org = at(id, 1, 'organized'), team = at(id, 1, 'sales team'), cust = at(id, 1, 'the customers and opportunities');
  const assignee = [1740, 234, 159, 485], rows = [277, 278, 1622, 220];
  scene('l_list', X.S, e2 - 0.1, still('leads_nature'), {
    tr: sectionIn(X.S),
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(e0) + 0.2, { zoom: 1.0 }), cam(loc(org) - 0.2, { zoom: 1.1, focus: [1088, 420], ease: 'inOutSine' }),
        cam(loc(org) + 0.6, { rect: N.tabRow, zoom: 1.35 }), cam(loc(team) - 0.1, { rect: N.tabRow, zoom: 1.35 }),
        cam(loc(team) + 0.8, { zoom: 1.6, focus: [1560, 430] }), cam(loc(cust) - 0.1, { zoom: 1.6, focus: [1560, 430] }),
        cam(loc(cust) + 0.8, { zoom: 1.35, focus: [1150, 400] }), cam(d, { zoom: 1.38, focus: [1150, 400], ease: 'inOutSine' }),
      ],
      highlights: [hl(loc(org) + 0.5, loc(team) - 0.1, N.tabRow, { padding: 3 }), hl(loc(team) + 0.6, loc(cust) - 0.1, assignee, { padding: 4 }), hl(loc(cust) + 0.6, d, rows, { padding: 4 })],
      callouts: [headline('Every opportunity. One workspace.', loc(e0) + 0.5, loc(org) - 0.3)],
    }),
  });
  const F = { quality: [1628, 370, 274, 66], assignee: [1340, 532, 274, 66], date: [1340, 203, 178, 70] };
  const srch = at(id, 2, 'less on searching'), eng = at(id, 2, 'engaging customers');
  scene('l_filter', e2 - 0.1, X.E, still('leads_filter'), {
    tr: XF(0.35),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.3, focus: [1450, 420] }), cam(loc(srch), { zoom: 1.45, focus: [1480, 440] }), cam(d, { zoom: 1.5, focus: [1480, 450], ease: 'inOutSine' })],
      highlights: [hl(loc(srch) - 0.1, loc(eng) - 0.1, union([F.quality, F.assignee]), { padding: 5 }), hl(loc(eng), d, union([F.date, F.quality, F.assignee]), { padding: 5 })],
    }),
  });
}

// ============================================================ 05 CRM DASHBOARD
{
  const id = '05_dashboard', X = SEC[id], D = B.dash_top;
  const c0 = st(id, 0), c1 = st(id, 1);
  const stage = n => (D.stages.find(s => s[0] === n) || [])[1];
  const stages = union(['Total', 'Won', 'Lost', 'New', 'Not Connected', 'Cold', 'Warm', 'Hot'].map(stage).filter(Boolean));
  const dist = at(id, 1, 'lead distribution'), pipe = at(id, 1, 'pipeline activity'), kpi = at(id, 1, 'key sales indicators');
  scene('d_top', X.S, X.E, still('dash_top'), {
    tr: sectionIn(X.S),
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(c0) + 0.3, { zoom: 1.0 }), cam(loc(dist) - 0.2, { zoom: 1.06, focus: [1088, 470], ease: 'inOutSine' }),
        cam(loc(dist) + 0.7, { rect: stages, zoom: 1.45 }), cam(loc(pipe) - 0.1, { rect: stages, zoom: 1.45 }),
        cam(loc(pipe) + 0.7, { rect: D.followupCard, zoom: 1.5 }), cam(loc(kpi) - 0.1, { rect: D.followupCard, zoom: 1.5 }),
        cam(loc(kpi) + 0.7, { rect: D.rates, zoom: 1.9 }), cam(d - 1.1, { rect: D.rates, zoom: 1.95 }), cam(d, { zoom: 1.0 }),
      ],
      highlights: [hl(loc(dist) + 0.5, loc(pipe) - 0.1, stages, { padding: 6 }), hl(loc(pipe) + 0.5, loc(kpi) - 0.1, D.followupCard, { padding: 4 }), hl(loc(kpi) + 0.5, d - 1.1, D.rates)],
      callouts: [headline('See the bigger picture', loc(c0) + 1.6, loc(dist) - 0.3), co('Sales visibility', loc(kpi) + 0.9, d - 1.2, D.rates, { placement: 'bottom' })],
    }),
  });
}

// ============================================================ 06 EXECUTIVE PERFORMANCE
{
  const id = '06_executives', X = SEC[id], S = B.dash_scroll, P = B.perf;
  const p0 = st(id, 0), p1 = st(id, 1);
  const exY = S.execTable[1] - 100;
  scene('e_team', X.S, p1 - 0.1, shot('dash_scroll'), {
    tr: CUT,                                    // the dashboard simply scrolls down to the team table
    build: (loc, d) => ({
      map: scrollMap([{ t: 0, y: 0 }, { t: 0.25, y: 0 }, { t: 1.6, y: exY }, { t: d, y: exY }]),
      camera: [cam(0, { zoom: 1.0 }), cam(1.6, { zoom: 1.0 }), cam(d, { zoom: 1.1, focus: [1088, 330], ease: 'inOutSine' })],
      highlights: [hl(1.6, d, [276, 100, 1624, S.execTable[3]], { padding: 4 })],
      callouts: [headline('Visibility across your team', loc(p0) + 0.9, d - 0.1)],
    }),
  });
  const table = [276, 400, 1624, 330], top3 = [277, 286, 1623, 86], progress = [1468, 465, 186, 265];
  const act = at(id, 1, 'activity across executives'), prog = at(id, 1, 'individual progress'), attn = at(id, 1, 'where attention may be needed');
  scene('e_perf', p1 - 0.1, X.E, still('perf'), {
    tr: XF(0.45),
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(act) - 0.2, { zoom: 1.0 }), cam(loc(act) + 0.7, { rect: table, zoom: 1.3 }), cam(loc(prog) - 0.1, { rect: table, zoom: 1.3 }),
        cam(loc(prog) + 0.7, { rect: top3, zoom: 1.2 }), cam(loc(attn) - 0.1, { rect: top3, zoom: 1.2 }),
        cam(loc(attn) + 0.7, { rect: progress, zoom: 1.9 }), cam(d - 1.0, { rect: progress, zoom: 1.95 }), cam(d, { zoom: 1.0 }),
      ],
      highlights: [hl(loc(act) + 0.5, loc(prog) - 0.1, table, { padding: 4 }), hl(loc(prog) + 0.5, loc(attn) - 0.1, top3, { padding: 4, radius: 14 }), hl(loc(attn) + 0.5, d - 1.0, progress, { padding: 4 })],
      callouts: [co('Track progress', loc(prog) + 0.8, loc(attn) - 0.2, top3, { placement: 'bottom' })],
    }),
  });
}

// ============================================================ 07 AI CALL ANALYSIS
{
  const id = '07_calls', X = SEC[id], C = B.calls;
  const g0 = st(id, 0), g1 = st(id, 1), g2 = st(id, 2);
  const head = n => (C.heads.find(h => h[0] === n) || [])[1];
  const scores = [head('Lead')[0], 240, head('Sentiment')[0] + head('Sentiment')[2] - head('Lead')[0], 560];
  const rec = [head('Recording')[0], 240, head('Recording')[2], 560];
  const aca = at(id, 1, 'AI Call Analysis'), und = at(id, 1, 'understand customer interactions'), vis = at(id, 1, 'better visibility into call activity');
  scene('c_list', X.S, g2 - 0.1, still('calls'), {
    tr: sectionIn(X.S),
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(g0) + 0.3, { zoom: 1.0 }), cam(loc(aca) + 0.2, { zoom: 1.12, focus: [1088, 420], ease: 'inOutSine' }),
        cam(loc(und) + 0.6, { rect: scores, zoom: 1.8 }), cam(loc(vis) - 0.1, { rect: scores, zoom: 1.8 }),
        cam(loc(vis) + 0.7, { rect: rec, zoom: 1.8 }), cam(d, { rect: rec, zoom: 1.85, ease: 'inOutSine' }),
      ],
      highlights: [hl(loc(und) + 0.5, loc(vis) - 0.1, scores, { padding: 4 }), hl(loc(vis) + 0.5, d, rec, { padding: 4 })],
      callouts: [
        headline('Turn conversations into insights', loc(g0) + 0.4, loc(und) - 0.1),
        co('Understand customer interactions', loc(und) + 0.8, loc(vis) - 0.2, [scores[0], 240, scores[2], 44], { placement: 'left' }),
      ],
    }),
  });
  const M = B.calls_detail, top = [577, 100, 766, 95];
  const ls = at(id, 2, 'a lead score'), aSum = at(id, 2, 'short AI summary'), aCo = at(id, 2, 'coaching note');
  scene('c_detail', g2 - 0.1, X.E, still('calls_detail'), {
    tr: XF(0.35),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(ls) + 0.4, { rect: top, zoom: 1.9 }), cam(loc(aSum) - 0.1, { rect: top, zoom: 1.9 }),
        cam(loc(aSum) + 0.7, { rect: M.summary, zoom: 1.9 }), cam(loc(aCo) - 0.1, { rect: M.summary, zoom: 1.9 }),
        cam(loc(aCo) + 0.7, { rect: M.coaching, zoom: 1.9 }), cam(d - 1.1, { rect: M.coaching, zoom: 1.95 }), cam(d, { zoom: 1.0 })],
      highlights: [hl(loc(ls) + 0.3, loc(aSum) - 0.1, top, { padding: 6 }), hl(loc(aSum) + 0.5, loc(aCo) - 0.1, M.summary, { padding: 6 }), hl(loc(aCo) + 0.5, d - 1.1, M.coaching, { padding: 6 })],
      callouts: [headline('AI-powered call analysis', loc(aSum) + 0.8, d - 1.2)],
    }),
  });
}

// ============================================================ 08 FOLLOW-UPS
{
  const id = '08_followups', X = SEC[id], F = B.fu_today;
  const f0 = st(id, 0), f1 = st(id, 1), f2 = st(id, 2);
  const cT = at(id, 1, 'needs attention today'), cD = at(id, 1, 'has been delayed'), cU = at(id, 1, 'coming next');
  const S = X.S;
  const src = composite('fu_tabs_v4', [{ still: 'fu_today', t: 0 }, { still: 'fu_delayed', t: cD - 0.1 - S }, { still: 'fu_upcoming', t: cU - 0.1 - S }]);
  [cD - 0.1, cU - 0.1].forEach(t => fx('click', t, -19));
  const tabs = [[cT, F.today, 'Today'], [cD, F.delayed, 'Delayed'], [cU, F.upcoming, 'Upcoming']];
  const view = { rect: [277, 150, 1300, 420], zoom: 1.4 };
  scene('f_tabs', S, f2 - 0.1, src, {
    tr: sectionIn(S),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(f0) + 0.2, { zoom: 1.0 }), cam(loc(f1) - 0.1, { zoom: 1.08, focus: [1000, 440], ease: 'inOutSine' }), cam(loc(cT) - 0.1, view), cam(d, Object.assign({}, view, { zoom: 1.45 }))],
      highlights: tabs.map(([t, r], i) => hl(loc(t) - 0.05, i < tabs.length - 1 ? loc(tabs[i + 1][0]) - 0.1 : d, r, { padding: 2 })),
      callouts: [
        headline('Never lose the next action', loc(f0) + 0.5, loc(cT) - 0.3),
        ...tabs.map(([t, r, text], i) => co(text, loc(t) + 0.1, i < tabs.length - 1 ? loc(tabs[i + 1][0]) - 0.15 : d - 0.1, r, { placement: 'bottom', size: 'normal' })),
      ],
    }),
  });
  const K = B.fu_kanban, card0 = K.firstCard;
  const cons = at(id, 2, 'stay consistent'), lost = at(id, 2, "don't get lost");
  scene('f_kanban', f2 - 0.1, X.E, still('fu_kanban'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.1, focus: [1088, 560] }), cam(loc(cons), { zoom: 1.12, focus: [1088, 560] }), cam(loc(lost) - 0.2, { rect: card0, zoom: 2.2 }), cam(d, { rect: card0, zoom: 2.3, ease: 'inOutSine' })],
      highlights: [hl(loc(lost) - 0.3, d, card0, { padding: 6, radius: 14 })],
    }),
  });
}

// ============================================================ 09 LEAD TRANSFER
{
  const id = '09_transfer', X = SEC[id], T = B.transfer;
  const h0 = st(id, 0), h1 = st(id, 1);
  const dif = at(id, 1, 'different executive'), tr = at(id, 1, 'transfer the lead'), rp = at(id, 1, 'right person'), keep = at(id, 1, 'keep the sales process moving');
  const assigneeField = [T.assignee[0] - 6, T.assignee[1] - 6, 520, 72];
  fx('notify', rp + 0.35, -18);
  scene('t_transfer', X.S, X.E, still('transfer'), {
    tr: sectionIn(X.S),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(h0) + 0.3, { zoom: 1.0 }), cam(loc(dif) - 0.2, { zoom: 1.45, focus: [760, 420] }),
        cam(loc(tr) - 0.3, { zoom: 1.45, focus: [760, 420] }), cam(loc(tr) + 0.5, { zoom: 1.12, focus: [1088, 500] }), cam(d, { zoom: 1.15, focus: [1088, 500], ease: 'inOutSine' })],
      highlights: [hl(loc(dif) - 0.1, loc(tr) - 0.3, assigneeField, { padding: 4 })],
      masks: [],
      overlays: [{ kind: 'transfer', start: loc(tr) - 0.2, end: d, x: 960, y: 560, from: 'Current executive', to: 'New executive', chip: 'Lead', move: [loc(tr) + 0.6, loc(rp) + 0.3] }],
      callouts: [
        headline('Move opportunities to the right person', loc(h0) + 0.5, loc(dif) - 0.3),
        co('Current assignee', loc(dif) + 0.2, loc(tr) - 0.35, assigneeField, { placement: 'right' }),
        headline('Keep the sales process moving', loc(keep) + 0.2, d - 0.15),
      ],
    }),
  });
}

// ============================================================ 10 WHATSAPP
{
  const id = '10_whatsapp', X = SEC[id], W = B.wa_chat;
  const w0 = st(id, 0), w1 = st(id, 1), w2 = st(id, 2);
  const fast = at(id, 1, 'communicate with customers faster'), conn = at(id, 1, 'keep conversations connected'), conv = at(id, 1, 'follow-up communication');
  const tools = [297, 158, 374, 96];
  fx('notify', X.S + 0.9, -19);
  scene('w_inbox', X.S, w2 - 0.1, still('wa_chat'), {
    tr: sectionIn(X.S),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(w0) + 0.3, { zoom: 1.0 }), cam(loc(fast) - 0.1, { zoom: 1.2, focus: [800, 520], ease: 'inOutSine' }),
        cam(loc(fast) + 0.7, { zoom: 1.7, focus: [640, 560] }), cam(loc(conn) - 0.1, { zoom: 1.7, focus: [640, 560] }),
        cam(loc(conn) + 0.7, { zoom: 2.1, focus: [560, 240] }), cam(loc(conv) - 0.1, { zoom: 2.1, focus: [560, 240] }), cam(loc(conv) + 0.8, { zoom: 1.5, focus: [680, 520] }), cam(d, { zoom: 1.5, focus: [680, 520] })],
      highlights: [hl(loc(fast) + 0.5, loc(conn) - 0.1, W.list, { padding: 4 }), hl(loc(conn) + 0.5, loc(conv) - 0.1, tools, { padding: 4 })],
      callouts: [
        headline('Stay connected with customers', loc(w0) + 0.4, loc(fast) - 0.2),
        co('Faster communication', loc(fast) + 0.8, loc(conn) - 0.2, [285, 310, 398, 720], { placement: 'right' }),
        co('Better follow-up', loc(conv) + 0.9, d - 0.1, [285, 310, 398, 720], { placement: 'right' }),
      ],
    }),
  });
  const BR = B.wa_broadcasts, head = n => (BR.heads.find(h => h[0] === n) || [])[1];
  const delivery = union(['Sent', 'Delivered', 'Read', 'Replied'].map(head).map(r => [r[0], 157, r[2], 307]));
  const bot = at(id, 2, 'chatbot');
  scene('w_broad', w2 - 0.1, bot - 0.1, still('wa_broadcasts'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.2, focus: [1150, 320] }), cam(0.9, { rect: delivery, zoom: 1.7 }), cam(d, { rect: delivery, zoom: 1.75, ease: 'inOutSine' })],
      highlights: [hl(0.6, d, delivery, { padding: 4 })],
      callouts: [co('Reach many customers at once', 0.8, d - 0.05, delivery, { placement: 'bottom' })],
    }),
  });
  const bt = B.wa_chatbots, greet = [bt.greeting[0] - 10, bt.greeting[1] - 8, 1050, bt.greeting[3] + 16];
  scene('w_bot', bot - 0.1, X.E, still('wa_chatbots'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.2, focus: [1150, 360] }), cam(0.8, { rect: [760, 230, 1080, 180], zoom: 1.7 }), cam(d - 0.9, { rect: [760, 230, 1080, 180], zoom: 1.76 }), cam(d, { zoom: 1.0 })],
      highlights: [hl(0.6, d - 0.9, greet, { padding: 4 })],
      callouts: [co('Welcomes every enquiry, 24/7', 0.9, d - 1.0, greet, { placement: 'bottom' })],
    }),
  });
}

// ============================================================ 11 CLOSING
{
  const id = '11_closing', X = SEC[id];
  const k0 = st(id, 0), k0e = se(id, 0);
  const beats = [
    [X.S, 'home', [1088, 520]],
    [at(id, 0, 'business overview') + 0.1, 'ai_answer', [1250, 330]],
    [at(id, 0, 'to leads') - 0.2, 'leads_nature', [1088, 420]],
    [at(id, 0, 'team activity'), 'dash_top', [1000, 470]],
    [at(id, 0, 'AI insights'), 'calls_detail', [960, 400]],
    [at(id, 0, 'follow-ups and'), 'fu_kanban', [1088, 560]],
    [at(id, 0, 'customer communication'), 'wa_broadcasts', [1150, 330]],
    [at(id, 0, 'keeps your workflow connected'), 'home', [1088, 540]],
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
    images: { logo: rel(path.join(CAP, 'white-logo-1600.png')) },
    questions: [[1, 'One platform.'], [2, 'Clearer visibility.'], [3, 'Better control.']].map(([k, text], i) => ({ t: t(st(id, k) - 0.05), text, y: 330 + i * 116 })),
    question_size: 76,
    text_out: t(st(id, 4) - 0.35),
    logo_at: [t(st(id, 4) - 0.05), 1e6], logo_width: 820,
    tagline: 'One connected workspace for your business.', tagline_at: t(st(id, 4) + 0.55), tagline_size: 40,
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
  _comment: `Progbiz ERP marketing video ${TAG}. Generated by scripts/video/beta/10_build_timeline_v4.js — edit the builder, not this file.`,
  version: 1, width: 1920, height: 1080, fps: 30, duration: TOTAL, assets_root: '.', background: '#06101F',
  stage: { scale: 0.9, radius: 22 },
  brand: {
    name: 'Progbiz ERP', tagline: 'One connected workspace for your business',
    logo: rel(path.join(CAP, 'white-logo-1600.png')),
    colors: { primary: '#0068EE', accent: '#85C0FF', ink: '#071527', paper: '#FFFFFF', muted: '#5B667A' },
  },
  scenes,
};
fs.writeFileSync(path.join(BETA, `timeline_${TAG}.json`), JSON.stringify(timeline, null, 1));
const voice = [];
if (RECORDED) for (const id of order) voice.push({ file: rel(SEC[id].file), start_s: r3(SEC[id].V - SEC[id].f0), gain: 1.0 });
else for (const id of order) SEC[id].sent.forEach((s, k) => voice.push({ file: rel(s.file), start_s: r3(st(id, k)), gain: 1.0 }));
// every sentence with its start and end in video time (subtitles, checks)
fs.writeFileSync(path.join(BETA, `sentences_${TAG}.json`), JSON.stringify(order.flatMap(id => SEC[id].sent.map((x, k) => ({ section: id, n: k + 1, text: x.text, start_s: r3(st(id, k)), end_s: r3(se(id, k)) }))), null, 1));
fs.writeFileSync(path.join(BETA, `voice_cues_${TAG}.json`), JSON.stringify(voice, null, 1));
fs.writeFileSync(path.join(BETA, `sfx_${TAG}.json`), JSON.stringify(sfx.sort((a, b) => a.t - b.t), null, 1));
fs.writeFileSync(path.join(BETA, `sections_${TAG}.json`), JSON.stringify({ total: TOTAL, sections: order.map(id => ({ id, start: r3(SEC[id].S), voice: r3(SEC[id].V), end: r3(SEC[id].E) })) }, null, 1));
const words = order.reduce((a, id) => a + SEC[id].sent.reduce((b, s) => b + s.text.split(/\s+/).length, 0), 0);
const speech = order.reduce((a, id) => a + SEC[id].sent.reduce((b, s) => b + s.dur, 0), 0);
console.log(`total ${TOTAL} s (${Math.floor(TOTAL / 60)}:${String(Math.round(TOTAL % 60)).padStart(2, '0')}), tail per section ${TAIL.toFixed(2)} s, ${words} words, ${(words / (speech / 60)).toFixed(0)} wpm while speaking`);
for (const id of order) console.log(`  ${id.padEnd(16)} ${SEC[id].S.toFixed(2).padStart(7)} -> ${SEC[id].E.toFixed(2).padStart(7)}   voice ${SEC[id].V.toFixed(2)} + ${SEC[id].span.toFixed(2)}`);
console.log(`scenes: ${scenes.length}, sfx events: ${sfx.length}`);
for (const s of scenes) console.log(`  ${s.id.padEnd(18)} ${s.start.toFixed(2).padStart(7)} -> ${s.end.toFixed(2).padStart(7)}  (${(s.end - s.start).toFixed(2)} s)  ${s.source.type}`);
