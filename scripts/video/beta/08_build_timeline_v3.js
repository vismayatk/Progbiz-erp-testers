'use strict';
/**
 * Edit v3 of the beta product video: introduction (how a business uses ProgBiz), the CRM
 * walkthrough, the WhatsApp module (shared inbox, chatbot, knowledge base, broadcasts),
 * Lead Expenses, Executive Performance and the closing.
 *
 * Inputs : reports/video/beta/audio_v3/<voice>/cues.json, reports/video/beta/cap/*
 * Outputs: reports/video/beta/timeline_v3.json, reports/video/beta/voice_cues_v3.json
 *
 * Every zoom, highlight, callout and cursor click is anchored to the sentence (or the word
 * inside it) that mentions the feature, so the picture follows any voice or language.
 *
 * Run:  node scripts/video/beta/08_build_timeline_v3.js [--voice Samantha] [--total 290]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const BETA = path.join(ROOT, 'reports', 'video', 'beta');
const CAP = path.join(BETA, 'cap');
const rel = p => path.relative(ROOT, p);
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const VOICE = opt('--voice', 'Samantha');
const AUDIO = path.join(BETA, opt('--audio', 'audio_v3'), VOICE);
const TAG = opt('--tag', 'v3');

const cues = JSON.parse(fs.readFileSync(path.join(AUDIO, 'cues.json'), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(CAP, 'boxes.json'), 'utf8'));
const r3 = v => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------ section layout
const SEC = {};
const order = cues.sections.map(s => s.id);
const LEAD = { '01_intro': 0.8 };
const CLOSING_TAIL = 4.5;
const speech = cues.sections.reduce((a, s) => a + s.duration_s, 0);
const leads = order.reduce((a, id) => a + (LEAD[id] || 0.6), 0);
const TAIL = 2.0;
const TOTAL = Number(opt('--total', Math.ceil((speech + leads + CLOSING_TAIL + TAIL * (order.length - 1)) / 5) * 5));
const tail = (TOTAL - speech - leads - CLOSING_TAIL) / (order.length - 1);
if (tail < 1.2) throw new Error(`narration too long for ${TOTAL}s: tail per section ${tail.toFixed(2)}s`);
let t = 0;
for (const s of cues.sections) {
  const lead = LEAD[s.id] || 0.6;
  const S = t, V = S + lead, E = V + s.duration_s + (s.id === order[order.length - 1] ? CLOSING_TAIL : tail);
  SEC[s.id] = { S, V, E, sent: s.sentences, file: path.join(AUDIO, s.file) };
  t = E;
}
SEC[order[order.length - 1]].E = TOTAL;
const st = (id, k) => SEC[id].V + SEC[id].sent[k].start_s;
const sd = (id, k) => SEC[id].sent[k].duration_s;
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
const XF = d => ({ type: 'crossfade', duration: d || 0.5 });
const CUT = { type: 'cut' };
function scene(id, start, end, source, o = {}) {
  const loc = v => r3(v - start);
  const sc = { id, start: r3(start), end: r3(end), source };
  if (o.tr) sc.transition = o.tr;
  const f = o.build ? o.build(loc, r3(end - start)) : {};
  for (const k of ['camera', 'cursor', 'highlights', 'callouts', 'masks']) if (f[k]) sc[k] = f[k];
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
const pt = (tt, x, y, click) => (click ? { t: r3(tt), x, y, click: true } : { t: r3(tt), x, y });
const union = rs => { const x = Math.min(...rs.map(r => r[0])), y = Math.min(...rs.map(r => r[1])); return [x, y, Math.max(...rs.map(r => r[0] + r[2])) - x, Math.max(...rs.map(r => r[1] + r[3])) - y]; };
const mid = r => [Math.round(r[0] + r[2] / 2), Math.round(r[1] + r[3] / 2)];
const slow = (d, f, z0, z1) => ({ camera: [cam(0, { zoom: z0 || 1.0, focus: f }), cam(d, { zoom: z1 || 1.12, focus: f, ease: 'inOutSine' })] });

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
const ROI_Y = B.dash_scroll.target / 1000;           // dash_scroll source time of the Lead Source ROI table
const roiShot = () => shot('dash_scroll', { freeze_at: ROI_Y });
const ROI = { costLead: [900, 165, 170, 340], ret: [1500, 165, 400, 340], table: [276, 95, 1624, 420] };

// ============================================================ 01 INTRODUCTION
{
  const id = '01_intro', X = SEC[id];
  const s1 = st(id, 1), s2 = st(id, 2), s3 = st(id, 3), s4 = st(id, 4);
  const mg = at(id, 3, 'managers see'), bo = at(id, 3, 'and business owners');
  const srcCol = [1325, 236, 205, 482], del = B.fu_today.delayed;
  scene('i_leads', 0, s1 - 0.1, still('leads_nature'), {
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.9, focus: [1430, 525] }), cam(d, { zoom: 1.5, focus: [1260, 540], ease: 'inOutSine' })],
      highlights: [hl(1.0, d, srcCol)],
      callouts: [co('Facebook • Website • WhatsApp', 1.6, d - 0.2, srcCol, { placement: 'left' })],
    }),
  });
  scene('i_delayed', s1 - 0.1, s2 - 0.15, still('fu_delayed'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(0.4, { zoom: 1.0 }), cam(1.7, { zoom: 2.1, focus: mid(del) }), cam(d, { zoom: 2.2, focus: mid(del), ease: 'inOutSine' })],
      highlights: [hl(1.6, d, del, { padding: 4 })],
    }),
  });
  scene('i_title', s2 - 0.15, s3 - 0.1, card({ card: 'title', title: 'One platform for your whole sales team', subtitle: 'Leads, follow-ups, WhatsApp and team performance, in one place', logo_size: 66, title_size: 84, subtitle_size: 36 }), { tr: XF(0.5) });
  const h = B.home, D = B.dash_top;
  scene('i_exec', s3 - 0.1, mg - 0.1, still('home'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.25, focus: [900, 450] }), cam(d, { rect: h.schedule, zoom: 1.7, ease: 'inOutSine' })],
      highlights: [hl(0.6, d, h.schedule)],
      callouts: [co('For sales executives', 0.35, d, h.cards[0][1], { placement: 'bottom', leader: 'none' })],
    }),
  });
  scene('i_mgr', mg - 0.1, bo - 0.1, still('dash_top'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.15, focus: [1000, 470] }), cam(d, { zoom: 1.4, focus: [900, 430], ease: 'inOutSine' })],
      highlights: [hl(0.5, d, D.leadsSummary, { padding: 4 })],
      callouts: [co('For managers', 0.35, d, D.rates, { placement: 'bottom' })],
    }),
  });
  scene('i_owner', bo - 0.1, s4 - 0.1, roiShot(), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.1, focus: [1088, 330] }), cam(d, { rect: [900, 120, 1000, 400], zoom: 1.55, ease: 'inOutSine' })],
      highlights: [hl(0.5, d, ROI.ret, { padding: 4 })],
      callouts: [co('For business owners', 0.4, d - 0.1, ROI.ret, { placement: 'left' })],
    }),
  });
  scene('i_card', s4 - 0.1, X.E, card({ card: 'section', eyebrow: 'How it works', title: 'A day with ProgBiz ERP', subtitle: 'From the first enquiry to the final result' }), { tr: XF(0.5) });
}

// ============================================================ 02 HOME
{
  const id = '02_home', X = SEC[id], h = B.home;
  const a0 = st(id, 0), a1 = st(id, 1);
  const sch = at(id, 1, 'with today'), hist = at(id, 1, 'recent follow-up history'), sum = at(id, 1, 'and a lead summary');
  const cards = union(h.cards.map(c => c[1]));
  scene('h_home', X.S, X.E, still('home'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(a0) + 0.2, { zoom: 1.0 }), cam(loc(a1) - 0.1, { zoom: 1.06, focus: [1088, 470], ease: 'inOutSine' }),
        cam(loc(a1) + 0.9, { rect: cards, padding: 50 }), cam(loc(sch) - 0.1, { rect: cards, padding: 50 }),
        cam(loc(sch) + 0.8, { rect: h.schedule, zoom: 1.85 }), cam(loc(hist) - 0.1, { rect: h.schedule, zoom: 1.85 }),
        cam(loc(hist) + 0.8, { rect: h.history, zoom: 1.85 }), cam(loc(sum) - 0.1, { rect: h.history, zoom: 1.85 }),
        cam(loc(sum) + 0.8, { rect: h.summary, zoom: 1.85 }), cam(d - 1.2, { rect: h.summary, zoom: 1.85 }), cam(d, { zoom: 1.0 }),
      ],
      highlights: [hl(loc(a1) + 0.6, loc(sch) - 0.1, cards, { padding: 8 }), hl(loc(sch) + 0.6, loc(hist) - 0.05, h.schedule), hl(loc(hist) + 0.6, loc(sum) - 0.05, h.history), hl(loc(sum) + 0.6, d - 1.2, h.summary)],
      callouts: [co('One place to start your day', loc(a1) + 1.0, loc(sch) - 0.2, cards, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1250, 860), pt(loc(a1) + 0.9, 980, 236), pt(loc(sch) + 0.8, 700, 520), pt(loc(hist) + 0.7, 1300, 470), pt(loc(sum) + 0.7, 1705, 520), pt(d, 1500, 700)] },
    }),
  });
}

// ============================================================ 03 AI ASSISTANT
{
  const id = '03_ai', X = SEC[id], a = B.ai_empty;
  const b0 = st(id, 0), b1 = st(id, 1), b2 = st(id, 2), b3 = st(id, 3);
  const chipBox = name => (a.chips.find(c => c[0] === name) || [null, null])[1];
  const chipsAll = union(a.chips.map(c => c[1]));
  const chipsView = [chipsAll[0], 190, chipsAll[2], chipsAll[1] + chipsAll[3] - 190];
  const newChat = mid(a.newChat), input = B.ai_typing.input, send = mid(B.ai_typing.send);
  const inputView = { rect: [input[0], input[1] - 20, input[2] + 90, input[3] + 40], zoom: 1.45 };
  const endCam = { zoom: 1.25, focus: [980, 360] };
  scene('a_empty', X.S, b1 - 0.1, still('ai_empty'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(b0) + 0.2, { zoom: 1.0 }), cam(loc(b0) + 1.2, { rect: chipsView, zoom: 1.65 }), cam(d - 1.3, { rect: chipsView, zoom: 1.65 }), cam(d - 0.45, endCam)],
      highlights: [hl(loc(b0) + 1.0, d - 1.3, chipsAll, { padding: 10 })],
      callouts: [co('Ask your data anything', loc(b0) + 1.2, d - 1.4, chipsAll, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1300, 760), pt(loc(b0) + 1.2, 1180, 470), pt(d - 1.2, 1100, 430), pt(d - 0.3, newChat[0], newChat[1], true), pt(d, newChat[0], newChat[1])] },
    }),
  });
  const tyEnd = b1 + 2.9;
  scene('a_typing', b1 - 0.1, tyEnd, shot('ai_typing', { time_map: [{ t: 0, src: 0 }, { t: 0.75, src: 0 }, { t: 2.65, src: 1.89 }, { t: 3.0, src: 1.89 }] }), {
    tr: CUT,
    build: (loc, d) => ({
      camera: [cam(0, endCam), cam(0.7, inputView), cam(d, inputView)],
      cursor: { mode: 'waypoints', points: [pt(0, newChat[0], newChat[1]), pt(0.55, input[0] + 90, mid(input)[1], true), pt(1.2, input[0] + 140, mid(input)[1] + 26), pt(d - 0.3, send[0], send[1]), pt(d - 0.12, send[0], send[1], true), pt(d, send[0], send[1])] },
      highlights: [hl(0.7, d - 0.15, input, { padding: 5 })],
    }),
  });
  const q = [1666, 158, 200, 37], ans = [722, 231, 288, 37];
  const chatTop = { rect: [700, 140, 1190, 150], zoom: 1.45 };
  scene('a_answering', tyEnd, tyEnd + 2.1, shot('ai_answering', { time_map: [{ t: 0, src: 0.241 }, { t: 1.35, src: 3.6 }, { t: 1.45, src: 4.009 }, { t: 2.1, src: 4.6 }] }), {
    tr: CUT,
    build: (loc, d) => ({ camera: [cam(0, inputView), cam(0.7, chatTop), cam(d, chatTop)], cursor: { mode: 'waypoints', points: [pt(0, send[0], send[1]), pt(d, send[0] - 40, send[1] - 60)] } }),
  });
  scene('a_answer', tyEnd + 2.1, b2 - 0.15, still('ai_answer'), {
    tr: CUT,
    build: (loc, d) => ({
      camera: [cam(0, chatTop), cam(0.9, { rect: union([q, ans]), zoom: 1.45 }), cam(d, { rect: union([q, ans]), zoom: 1.5, ease: 'inOutSine' })],
      highlights: [hl(0.5, d, ans, { padding: 6, radius: 16 })],
      callouts: [co('Answers in seconds', 0.9, d - 0.1, ans, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, send[0] - 40, send[1] - 60), pt(1.0, 1100, 330)] },
    }),
  });
  const chips = [['follow-ups due today', 'Followups due today'], ['delayed tasks', 'How many tasks are delayed?'], ['project status', 'Check Projects status'], ['who is present today', 'Who all are present today?']]
    .map(([ph, name]) => ({ t: at(id, 2, ph), box: chipBox(name) }));
  const chipRect = [chipsAll[0] - 20, chipsAll[1] - 30, chipsAll[2] + 40, chipsAll[3] + 60];
  scene('a_chips', b2 - 0.15, b3 - 0.1, still('ai_empty'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { rect: chipRect, zoom: 1.6 }), cam(d, { rect: chipRect, zoom: 1.7, ease: 'inOutSine' })],
      highlights: chips.map((c, i) => hl(loc(c.t) - 0.05, i < chips.length - 1 ? loc(chips[i + 1].t) - 0.05 : d, c.box, { padding: 5, radius: 10 })),
      cursor: { mode: 'waypoints', points: [pt(0, 1100, 430)].concat(chips.map(c => pt(loc(c.t) + 0.2, mid(c.box)[0] + 20, mid(c.box)[1] + 16))) },
    }),
  });
  scene('a_history', b3 - 0.1, X.E, still('ai_answer'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { rect: [276, 68, 388, 291], zoom: 2.0 }), cam(d - 1.2, { rect: [276, 68, 388, 291], zoom: 2.1 }), cam(d, { zoom: 1.0 })],
      highlights: [hl(0.6, d - 1.2, [284, 180, 372, 44], { padding: 4, radius: 10 })],
      cursor: { mode: 'waypoints', points: [pt(0, 700, 420), pt(1.0, 520, 215)] },
    }),
  });
}

// ============================================================ 04 CRM DASHBOARD
{
  const id = '04_dashboard', X = SEC[id], D = B.dash_top;
  const c0 = st(id, 0), c1 = st(id, 1), c2 = st(id, 2), c3 = st(id, 3);
  const stage = n => (D.stages.find(s => s[0] === n) || [])[1];
  const stages = union(['Won', 'New', 'Not Connected', 'Cold', 'Warm', 'Hot'].map(stage));
  const fuCounts = [1400, 440, 480, 150];
  const phases = ['new', 'cold', 'warm', 'hot', 'won and lost'].map(p => at(id, 1, p));
  const stageSeq = [stage('New'), stage('Cold'), stage('Warm'), stage('Hot'), union([stage('Won'), [995, 530, 339, 76]])];
  const grouped = at(id, 1, 'with every lead grouped');
  scene('d_top', X.S, c3 + 0.3, still('dash_top'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(c0) + 0.3, { zoom: 1.0 }), cam(loc(c1) - 0.1, { zoom: 1.08, focus: [1000, 470], ease: 'inOutSine' }),
        cam(loc(c1) + 0.8, { rect: D.rates, zoom: 2.0 }), cam(loc(grouped) - 0.1, { rect: D.rates, zoom: 2.0 }),
        cam(loc(grouped) + 0.9, { rect: stages, zoom: 1.5 }), cam(loc(c2) - 0.1, { rect: stages, zoom: 1.5 }),
        cam(loc(c2) + 0.9, { rect: fuCounts, zoom: 1.9 }), cam(d - 1.0, { rect: fuCounts, zoom: 1.9 }), cam(d, { zoom: 1.0 }),
      ],
      highlights: [
        hl(loc(c1) + 0.7, loc(grouped) - 0.05, D.rates),
        ...stageSeq.map((r, i) => hl(loc(phases[i]) - 0.05, i < stageSeq.length - 1 ? loc(phases[i + 1]) - 0.05 : loc(c2) - 0.1, r, { padding: 4 })),
        hl(loc(c2) + 0.7, d - 1.0, fuCounts),
      ],
      callouts: [co('Your pipeline at a glance', loc(c1) + 1.0, loc(grouped) - 0.2, D.rates, { placement: 'bottom' }), co('Today • Delayed • Upcoming', loc(c2) + 1.0, d - 1.1, fuCounts, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1200, 900), pt(loc(c1) + 0.8, 1180, 360), pt(loc(grouped) + 0.9, 700, 660), pt(loc(c2) + 0.9, 1640, 520), pt(d, 1300, 700)] },
    }),
  });
  const S = B.dash_scroll, exY = S.execTable[1] - 100, caY = S.callActivity[1] - 120, roiY = S.target;
  const fca = at(id, 3, 'follow call activity'), src = at(id, 3, 'and see which lead sources');
  scene('d_scroll', c3 + 0.3, X.E, shot('dash_scroll'), {
    tr: CUT,
    build: (loc, d) => ({
      map: scrollMap([{ t: 0, y: 0 }, { t: 1.6, y: exY }, { t: loc(fca) - 0.3, y: exY }, { t: loc(fca) + 1.1, y: caY }, { t: loc(src) - 0.3, y: caY }, { t: loc(src) + 1.5, y: roiY }, { t: d, y: roiY }]),
      camera: [cam(0, { zoom: 1.0 }), cam(loc(src) + 1.6, { zoom: 1.0 }), cam(loc(src) + 2.6, { rect: [1000, 150, 900, 360], zoom: 1.75 }), cam(d - 0.9, { rect: [1000, 150, 900, 360], zoom: 1.8 }), cam(d, { zoom: 1.0 })],
      highlights: [hl(1.7, loc(fca) - 0.3, [276, 100, 1624, S.execTable[3]], { padding: 4 }), hl(loc(fca) + 1.2, loc(src) - 0.3, [276, 120, 800, S.callActivity[3]], { padding: 4 }), hl(loc(src) + 2.4, d - 0.9, ROI.ret, { padding: 4 })],
      callouts: [co('Know which sources pay off', loc(src) + 2.8, d - 1.0, ROI.ret, { placement: 'left' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1300, 700), pt(loc(src) + 2.4, 1700, 330), pt(d, 1700, 330)] },
    }),
  });
}

// ============================================================ 05 LEADS
{
  const id = '05_leads', X = SEC[id], N = B.leads_nature;
  const e1 = st(id, 1), e2 = st(id, 2), e3 = st(id, 3);
  const clickStatus = at(id, 1, 'and Status View') + 0.55, clickFilter = e2 + 0.25;
  const S = X.S;
  const src = composite('leads_views_v3', [{ still: 'leads_nature', t: 0 }, { still: 'leads_status', t: clickStatus - S }]);
  const sv = mid(N.statusView), fb = mid(N.filterBtn);
  scene('l_list', S, clickFilter + 0.15, src, {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(e1) - 0.1, { zoom: 1.0 }), cam(loc(e1) + 0.8, { zoom: 1.55, focus: [760, 250] }),
        cam(loc(at(id, 1, 'won and lost')) + 0.4, { zoom: 1.55, focus: [1150, 250] }),
        cam(loc(clickStatus) - 0.3, { zoom: 1.55, focus: [1250, 200] }), cam(loc(clickStatus) + 1.4, { zoom: 1.4, focus: [1200, 300] }),
        cam(d - 0.6, { zoom: 1.4, focus: [1200, 300] }), cam(d, { zoom: 1.3, focus: [1500, 300] }),
      ],
      highlights: [hl(loc(e1) + 0.7, loc(clickStatus) - 0.4, N.tabRow, { padding: 3 }), hl(loc(clickStatus) + 0.6, d - 0.6, [277, 168, 1510, 65], { padding: 3 })],
      cursor: { mode: 'waypoints', points: [pt(0, 1200, 850), pt(loc(e1) + 0.8, 760, 205), pt(loc(clickStatus) - 0.15, sv[0], sv[1], true), pt(loc(clickStatus) + 0.9, 1300, 320), pt(loc(clickFilter) - 0.1, fb[0], fb[1], true), pt(d, fb[0], fb[1])] },
    }),
  });
  const F = { date: [1340, 203, 178, 70], source: [1340, 370, 274, 66], quality: [1628, 370, 274, 66], assignee: [1340, 532, 274, 66], fb: [1340, 778, 274, 66] };
  const seq = [['by source', F.source], ['quality', F.quality], ['assignee', F.assignee], ['date', F.date], ['facebook campaign', F.fb]].map(([ph, r]) => ({ t: at(id, 2, ph), r }));
  scene('l_filter', clickFilter + 0.15, e3 - 0.1, still('leads_filter'), {
    tr: XF(0.25),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.3, focus: [1500, 300] }), cam(0.8, { zoom: 1.45, focus: [1480, 440] }), cam(loc(seq[4].t) - 0.2, { zoom: 1.45, focus: [1480, 460] }), cam(loc(seq[4].t) + 0.8, { zoom: 1.45, focus: [1480, 700] }), cam(d, { zoom: 1.45, focus: [1480, 700] })],
      highlights: seq.map((s, i) => hl(loc(s.t) - 0.05, i < seq.length - 1 ? loc(seq[i + 1].t) - 0.05 : d, s.r, { padding: 4, radius: 10 })),
      callouts: [co('Find any lead, fast', 0.9, d - 0.2, [1320, 200, 600, 700], { placement: 'left' })],
      cursor: { mode: 'waypoints', points: [pt(0, fb[0], fb[1])].concat(seq.map(s => pt(loc(s.t) + 0.25, mid(s.r)[0] + 60, mid(s.r)[1] + 14))) },
    }),
  });
  const T = B.transfer;
  scene('l_transfer', e3 - 0.1, X.E, still('transfer'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(1.0, { zoom: 1.4, focus: [760, 380] }), cam(d - 1.2, { zoom: 1.45, focus: [780, 390], ease: 'inOutSine' }), cam(d, { zoom: 1.0 })],
      highlights: [hl(1.1, d - 1.2, [T.assignee[0] - 6, T.assignee[1] - 6, 512, 72], { padding: 4 })],
      callouts: [co('Move leads in bulk', 1.2, d - 1.3, [T.title[0] - 30, T.title[1] - 25, T.title[2] + 40, T.title[3] + 30], { placement: 'right' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1200, 820), pt(1.2, 520, 530), pt(d, 560, 560)] },
    }),
  });
}

// ============================================================ 06 FOLLOW-UPS
{
  const id = '06_followups', X = SEC[id], F = B.fu_today;
  const f1 = st(id, 1), f2 = st(id, 2), f2end = f2 + sd(id, 2);
  const cD = at(id, 1, 'delayed') + 0.15, cU = at(id, 1, 'upcoming') + 0.15, cN = at(id, 1, 'non follow-up') + 0.15;
  const cK = at(id, 2, 'Kanban View') + 0.1;
  const S = X.S;
  const src = composite('fu_tabs_v3', [{ still: 'fu_today', t: 0 }, { still: 'fu_delayed', t: cD - S }, { still: 'fu_upcoming', t: cU - S }, { still: 'fu_non', t: cN - S }]);
  const kb = mid(F.kanbanView);
  scene('f_tabs', S, cK + 0.15, src, {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(f1) - 0.1, { zoom: 1.05, focus: [1000, 480] }), cam(loc(f1) + 0.8, { zoom: 1.35, focus: [930, 420] }),
        cam(loc(f2) - 0.1, { zoom: 1.35, focus: [930, 420] }), cam(loc(f2) + 0.9, { zoom: 1.4, focus: [1300, 330] }), cam(d, { zoom: 1.4, focus: [1300, 330] })],
      highlights: [hl(loc(f1) + 0.6, loc(cD) - 0.1, F.today, { padding: 2 }), hl(loc(cD), loc(cU) - 0.1, F.delayed, { padding: 2 }), hl(loc(cU), loc(cN) - 0.1, F.upcoming, { padding: 2 }), hl(loc(cN), loc(f2) - 0.1, F.non, { padding: 2 })],
      callouts: [co('Never miss a follow-up', loc(f1) + 0.9, loc(f2) - 0.2, F.tabRow, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1150, 850), pt(loc(f1) + 0.7, 440, 205), pt(loc(cD) - 0.12, mid(F.delayed)[0], mid(F.delayed)[1], true), pt(loc(cU) - 0.12, mid(F.upcoming)[0], mid(F.upcoming)[1], true),
        pt(loc(cN) - 0.12, mid(F.non)[0], mid(F.non)[1], true), pt(loc(cK) - 0.1, kb[0], kb[1], true), pt(d, kb[0], kb[1])] },
    }),
  });
  const K = B.fu_kanban, card0 = K.firstCard, nd = at(id, 2, 'with the next date');
  const max = B.fu_kanban_scroll.max / 1000;
  scene('f_kanban', cK + 0.15, X.E, shot('fu_kanban_scroll'), {
    tr: XF(0.25),
    build: (loc, d) => {
      const s0 = loc(f2end) - 0.3, s1 = d - 0.3;
      return {
        map: [{ t: 0, src: 0 }, { t: r3(s0), src: 0 }, ...Array.from({ length: 10 }, (_, k) => { const u = (k + 1) / 10; return { t: r3(s0 + (s1 - s0) * u), src: r3(max * (-(Math.cos(Math.PI * u) - 1) / 2)) }; }), { t: r3(d), src: r3(max) }],
        camera: [cam(0, { zoom: 1.4, focus: [1300, 330] }), cam(0.8, { zoom: 1.12, focus: [1088, 560] }), cam(loc(nd) - 0.1, { zoom: 1.12, focus: [1088, 560] }),
          cam(loc(nd) + 0.8, { rect: card0, zoom: 2.3 }), cam(s0 - 0.7, { rect: card0, zoom: 2.3 }), cam(s0 + 0.2, { zoom: 1.08, focus: [1088, 560] }), cam(d, { zoom: 1.08, focus: [1088, 560] })],
        highlights: [hl(loc(nd) + 0.7, s0 - 0.7, card0, { padding: 6, radius: 14 })],
        callouts: [co('Every stage on one board', 0.9, loc(nd) - 0.2, [277, 196, 1622, 52], { placement: 'bottom' })],
        cursor: { mode: 'waypoints', points: [pt(0, kb[0], kb[1]), pt(loc(nd) + 0.8, 470, 330), pt(s0, 900, 760), pt(d, 900, 760)] },
      };
    },
  });
}

// ============================================================ 07 WHATSAPP: INBOX, CHATBOT, KNOWLEDGE BASE
{
  const id = '07_wa_chat', X = SEC[id], W = B.wa_chat;
  const w0 = st(id, 0), w1 = st(id, 1), w2 = st(id, 2), w3 = st(id, 3);
  const sf = at(id, 1, 'with search and unread filters');
  const inbox = [285, 77, 398, 950], tools = [297, 158, 374, 96];
  scene('w_inbox', X.S, w2 - 0.1, still('wa_chat'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(w0) + 0.3, { zoom: 1.0 }), cam(loc(w1) - 0.1, { zoom: 1.1, focus: [800, 500], ease: 'inOutSine' }),
        cam(loc(w1) + 0.9, { zoom: 1.75, focus: [640, 560] }), cam(loc(sf) - 0.1, { zoom: 1.75, focus: [640, 560] }),
        cam(loc(sf) + 0.8, { zoom: 2.2, focus: [560, 230] }), cam(d - 1.1, { zoom: 2.2, focus: [560, 230] }), cam(d, { zoom: 1.0 })],
      highlights: [hl(loc(w1) + 0.7, loc(sf) - 0.1, W.list, { padding: 4 }), hl(loc(sf) + 0.6, d - 1.1, tools, { padding: 4 })],
      callouts: [co('One shared WhatsApp inbox', loc(w1) + 1.0, loc(sf) - 0.2, inbox, { placement: 'right' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1200, 800), pt(loc(w1) + 0.9, 520, 500), pt(loc(sf) + 0.7, 470, 184), pt(loc(sf) + 2.0, 368, 237), pt(d, 700, 500)] },
    }),
  });
  const bot = B.wa_chatbots, greet = [bot.greeting[0] - 10, bot.greeting[1] - 8, 1050, bot.greeting[3] + 16];
  scene('w_bot', w2 - 0.1, w3 - 0.1, still('wa_chatbots'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(0.9, { zoom: 1.0 }), cam(2.0, { rect: [760, 230, 1080, 180], zoom: 1.7 }), cam(d, { rect: [760, 230, 1080, 180], zoom: 1.78, ease: 'inOutSine' })],
      highlights: [hl(1.8, d, greet, { padding: 4 })],
      callouts: [co('A chatbot that replies 24/7', 2.0, d - 0.2, greet, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 700, 500), pt(1.9, 1000, 370), pt(d, 1040, 380)] },
    }),
  });
  const kb = B.wa_kb;
  scene('w_kb', w3 - 0.1, X.E, still('wa_kb'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(0.8, { zoom: 1.0 }), cam(1.9, { rect: kb.sources, zoom: 1.65 }), cam(d - 1.1, { rect: kb.sources, zoom: 1.72, ease: 'inOutSine' }), cam(d, { zoom: 1.0 })],
      highlights: [hl(1.7, d - 1.1, kb.note, { padding: 8 })],
      callouts: [co('AI answers from your content', 2.0, d - 1.2, kb.note, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1040, 380), pt(1.8, 1300, 300), pt(d, 1300, 320)] },
    }),
  });
}

// ============================================================ 08 WHATSAPP: BROADCASTS
{
  const id = '08_wa_broadcast', X = SEC[id], W = B.wa_broadcasts, F = B.wa_cb_form, T = B.wa_templates;
  const v0 = st(id, 0), v1 = st(id, 1), v2 = st(id, 2);
  const cc = at(id, 1, 'choose your customers'), si = at(id, 1, 'and send it immediately');
  const sdv = at(id, 2, 'sent, delivered'), enq = at(id, 2, 'along with the enquiries');
  const head = n => (W.heads.find(h => h[0] === n) || [])[1];
  const nb = mid(W.newBtn);
  scene('b_list', X.S, v1 - 0.1, still('wa_broadcasts'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(v0) + 0.4, { zoom: 1.0 }), cam(d - 0.2, { zoom: 1.5, focus: [1500, 200], ease: 'inOutSine' }), cam(d, { zoom: 1.5, focus: [1500, 200] })],
      highlights: [hl(loc(v0) + 1.8, d, W.newBtn, { padding: 5 })],
      cursor: { mode: 'waypoints', points: [pt(0, 1100, 700), pt(d - 0.3, nb[0], nb[1], true), pt(d, nb[0], nb[1])] },
    }),
  });
  const status = (T.heads.find(h => h[0] === 'Status') || [])[1];
  const statusCol = [status[0], 157, status[2], 492];
  scene('b_tpl', v1 - 0.1, cc - 0.1, still('wa_templates'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.3, focus: [1200, 400] }), cam(0.9, { zoom: 1.5, focus: [1250, 400] }), cam(d, { zoom: 1.55, focus: [1270, 400], ease: 'inOutSine' })],
      highlights: [hl(0.4, d, statusCol, { padding: 4 })],
      callouts: [co('Approved WhatsApp templates', 0.4, d, statusCol, { placement: 'left', fade_in: 0.25, fade_out: 0.2 })],
      cursor: { mode: 'waypoints', points: [pt(0, nb[0], nb[1]), pt(1.3, 1570, 330), pt(d, 1570, 360)] },
    }),
  });
  const tplSel = [820, 236, 520, 74], sendSel = [288, 772, 480, 74];
  scene('b_form', cc - 0.1, v2 - 0.1, still('wa_cb_form'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.2, focus: [820, 500] }), cam(0.8, { rect: F.recipients, zoom: 1.5 }), cam(loc(si) - 0.1, { rect: F.recipients, zoom: 1.5 }),
        cam(loc(si) + 0.8, { zoom: 1.7, focus: [620, 800] }), cam(d, { zoom: 1.75, focus: [620, 800], ease: 'inOutSine' })],
      highlights: [hl(0.6, loc(si) - 0.1, F.recipients, { padding: 4 }), hl(loc(si) + 0.6, d, sendSel, { padding: 4 })],
      callouts: [co('Send now or schedule', loc(si) + 0.9, d - 0.1, sendSel, { placement: 'right' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1080, 300), pt(0.8, 1250, 671), pt(loc(si) + 0.7, 520, 880), pt(d, 540, 880)] },
    }),
  });
  const delivery = union(['Sent', 'Delivered', 'Read', 'Failed', 'Clicked', 'Replied'].map(head).map(r => [r[0], 157, r[2], 307]));
  const results = union(['Enquiries', 'Won', 'Conv %'].map(head).map(r => [r[0], 157, r[2], 64]));
  scene('b_stats', v2 - 0.1, X.E, still('wa_broadcasts'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(sdv) - 0.2, { zoom: 1.0 }), cam(loc(sdv) + 0.8, { zoom: 1.7, focus: [1230, 300] }), cam(loc(enq) - 0.1, { zoom: 1.7, focus: [1230, 300] }),
        cam(loc(enq) + 0.8, { zoom: 1.9, focus: [1700, 250] }), cam(d - 1.1, { zoom: 1.9, focus: [1700, 250] }), cam(d, { zoom: 1.0 })],
      highlights: [hl(loc(sdv) + 0.5, loc(enq) - 0.1, delivery, { padding: 4 }), hl(loc(enq) + 0.6, d - 1.1, results, { padding: 4 })],
      callouts: [co('Track every campaign', loc(sdv) + 0.9, loc(enq) - 0.2, delivery, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 540, 880), pt(loc(sdv) + 0.8, 1200, 330), pt(loc(enq) + 0.8, 1690, 300), pt(d, 1500, 600)] },
    }),
  });
}

// ============================================================ 09 AI CALL ANALYSIS
{
  const id = '09_calls', X = SEC[id], C = B.calls;
  const g0 = st(id, 0), g1 = st(id, 1), g2 = st(id, 2);
  const lis = at(id, 1, 'and managers can listen');
  const head = n => (C.heads.find(h => h[0] === n) || [])[1];
  const rec = [head('Recording')[0], 240, head('Recording')[2], 560];
  const scores = [head('Lead')[0], 240, head('Sentiment')[0] + head('Sentiment')[2] - head('Lead')[0], 560];
  const eye = mid(C.eye), clickEye = g2 + 0.7, row1y = C.firstRow[1] + 24;
  scene('c_list', X.S, clickEye + 0.2, still('calls'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(g0) + 0.3, { zoom: 1.0 }), cam(loc(g1) - 0.1, { zoom: 1.2, focus: [1088, 420] }),
        cam(loc(g1) + 0.8, { rect: scores, zoom: 1.85 }), cam(loc(lis) - 0.1, { rect: scores, zoom: 1.85 }),
        cam(loc(lis) + 0.8, { rect: rec, zoom: 1.85 }), cam(loc(g2) - 0.1, { rect: rec, zoom: 1.85 }),
        cam(loc(g2) + 0.5, { zoom: 1.5, focus: [1500, 360] }), cam(d, { zoom: 1.5, focus: [1500, 360] })],
      highlights: [hl(loc(g1) + 0.7, loc(lis) - 0.1, scores, { padding: 4 }), hl(loc(lis) + 0.7, loc(g2) - 0.1, rec, { padding: 4 })],
      callouts: [co('AI scores every call', loc(g1) + 1.0, loc(lis) - 0.2, [scores[0], 240, scores[2], 44], { placement: 'left' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1100, 850), pt(loc(g1) + 0.8, 1068, row1y), pt(loc(lis) + 0.8, 1378, row1y + 2), pt(loc(clickEye) - 0.1, eye[0], eye[1], true), pt(d, eye[0], eye[1])] },
    }),
  });
  const M = B.calls_detail, top = [577, 100, 766, 95];
  const aSum = at(id, 2, 'an AI summary'), aCo = at(id, 2, 'and a coaching note');
  scene('c_detail', clickEye + 0.2, X.E, still('calls_detail'), {
    tr: XF(0.3),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(0.7, { rect: top, zoom: 1.9 }), cam(loc(aSum) - 0.1, { rect: top, zoom: 1.9 }),
        cam(loc(aSum) + 0.8, { rect: M.summary, zoom: 1.9 }), cam(loc(aCo) - 0.1, { rect: M.summary, zoom: 1.9 }),
        cam(loc(aCo) + 0.8, { rect: M.coaching, zoom: 1.9 }), cam(d - 1.2, { rect: M.coaching, zoom: 1.9 }), cam(d, { zoom: 1.0 })],
      highlights: [hl(0.6, loc(aSum) - 0.1, top, { padding: 6 }), hl(loc(aSum) + 0.7, loc(aCo) - 0.1, M.summary, { padding: 6 }), hl(loc(aCo) + 0.7, d - 1.2, M.coaching, { padding: 6 })],
      callouts: [co('Coaching for every executive', loc(aCo) + 1.0, d - 1.3, M.coaching, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, eye[0], eye[1]), pt(1.2, 1250, 240), pt(d, 1250, 240)] },
    }),
  });
}

// ============================================================ 10 LEAD EXPENSES
{
  const id = '10_expenses', X = SEC[id], E = B.lead_expenses;
  const x0 = st(id, 0), x1 = st(id, 1);
  const cols = [300, 345, 1100, 560], total = [E.total[0] - 14, E.total[1] - 8, E.total[2] + 28, E.total[3] + 16];
  scene('x_list', X.S, x1 - 0.1, still('lead_expenses'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(x0) + 0.4, { zoom: 1.0 }), cam(loc(x0) + 1.5, { zoom: 1.5, focus: [850, 560] }), cam(d, { zoom: 1.55, focus: [880, 560], ease: 'inOutSine' })],
      highlights: [hl(loc(x0) + 1.3, d, cols, { padding: 4 })],
      callouts: [co('Every ad spend, by source', loc(x0) + 1.6, d - 0.1, [300, 345, 1100, 40], { placement: 'top' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1200, 850), pt(loc(x0) + 1.5, 900, 520), pt(d, 920, 560)] },
    }),
  });
  scene('x_roi', x1 - 0.1, X.E, roiShot(), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(0.6, { zoom: 1.0 }), cam(1.6, { rect: [560, 110, 1340, 420], zoom: 1.4 }), cam(d - 1.0, { rect: [560, 110, 1340, 420], zoom: 1.45, ease: 'inOutSine' }), cam(d, { zoom: 1.0 })],
      highlights: [hl(1.4, d - 1.0, ROI.costLead, { padding: 4 }), hl(1.4, d - 1.0, ROI.ret, { padding: 4 })],
      callouts: [co('Cost per lead and return', 1.7, d - 1.1, ROI.ret, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 920, 560), pt(1.5, 985, 330), pt(d - 1.2, 1760, 330), pt(d, 1500, 600)] },
    }),
  });
}

// ============================================================ 11 EXECUTIVE PERFORMANCE
{
  const id = '11_performance', X = SEC[id], P = B.perf;
  const p0 = st(id, 0), p1 = st(id, 1);
  const bp = at(id, 1, 'so your best performers'), ev = at(id, 1, 'and everyone');
  const top1 = [277, 286, 523, 85], top3 = [277, 286, 1623, 86];
  scene('p_perf', X.S, X.E, still('perf'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(p0) + 0.3, { zoom: 1.0 }), cam(loc(p1) - 0.1, { zoom: 1.12, focus: [1090, 360], ease: 'inOutSine' }),
        cam(loc(p1) + 0.8, { rect: P.formula, zoom: 2.2 }), cam(loc(bp) - 0.1, { rect: P.formula, zoom: 2.2 }),
        cam(loc(bp) + 0.8, { rect: top1, zoom: 2.2 }), cam(loc(ev) - 0.1, { rect: top1, zoom: 2.2 }), cam(loc(ev) + 1.0, { rect: top3, zoom: 1.12 }), cam(d, { zoom: 1.0 })],
      highlights: [hl(loc(p1) + 0.7, loc(bp) - 0.1, P.formula, { padding: 8 }), hl(loc(bp) + 0.7, loc(ev) - 0.1, top1, { padding: 4, radius: 14 })],
      callouts: [co('One score per executive', loc(p1) + 1.0, loc(bp) - 0.2, P.formula, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1150, 900), pt(loc(p1) + 0.8, 1560, 440), pt(loc(bp) + 0.8, 560, 332), pt(d, 700, 600)] },
    }),
  });
}

// ============================================================ 12 CLOSING
{
  const id = '12_closing', X = SEC[id];
  const q1 = st(id, 1);
  const fr = at(id, 0, 'faster replies'), tm = at(id, 0, 'a sales team'), mk = at(id, 0, 'and marketing money');
  scene('q_fu', X.S, fr - 0.1, still('fu_kanban'), { tr: XF(0.5), build: (loc, d) => Object.assign(slow(d, [1000, 500]), { callouts: [co('Fewer missed leads', 0.7, d - 0.1, null, { placement: 'bottom' })] }) });
  scene('q_wa', fr - 0.1, tm - 0.1, still('wa_chat'), { tr: XF(0.4), build: (loc, d) => Object.assign(slow(d, [700, 500], 1.2, 1.35), { callouts: [co('Faster WhatsApp replies', 0.5, d - 0.1, null, { placement: 'bottom' })] }) });
  scene('q_coach', tm - 0.1, mk - 0.1, still('calls_detail'), { tr: XF(0.4), build: (loc, d) => Object.assign(slow(d, [960, 400], 1.3, 1.45), { callouts: [co('A team you can coach', 0.5, d - 0.1, null, { placement: 'bottom' })] }) });
  scene('q_roi', mk - 0.1, q1 - 0.2, roiShot(), { tr: XF(0.4), build: (loc, d) => Object.assign(slow(d, [1200, 330], 1.2, 1.35), { callouts: [co('Marketing that pays back', 0.5, d - 0.1, null, { placement: 'bottom' })] }) });
  scene('q_end', q1 - 0.2, TOTAL, card({ card: 'end', title: 'Bringing your business workflow together', cta: 'Capture every lead. Reply faster on WhatsApp. Know how your team performs.', footnote: '', logo_size: 96, cta_size: 56, cta_width: 1560 }), { tr: XF(0.5) });
}

// ------------------------------------------------------------ write
for (const sc of scenes) for (const c of (sc.callouts || [])) if (c.target === null) delete c.target;
for (let i = 1; i < scenes.length; i++) {
  if (Math.abs(scenes[i].start - scenes[i - 1].end) > 1e-6) throw new Error(`scene gap/overlap between ${scenes[i - 1].id} (${scenes[i - 1].end}) and ${scenes[i].id} (${scenes[i].start})`);
  if (scenes[i].end - scenes[i].start < 0.6) throw new Error(`scene ${scenes[i].id} is too short: ${(scenes[i].end - scenes[i].start).toFixed(2)}s`);
}
const timeline = {
  _comment: `ProgBiz ERP product video ${TAG} (beta.progbiz.io). Generated by scripts/video/beta/08_build_timeline_v3.js — edit the builder, not this file.`,
  version: 1, width: 1920, height: 1080, fps: 30, duration: TOTAL, assets_root: '.', background: '#071527',
  brand: {
    name: 'ProgBiz ERP', tagline: 'Bringing your business workflow together',
    logo: rel(path.join(CAP, 'white-logo-1600.png')),
    colors: { primary: '#0068EE', accent: '#85C0FF', ink: '#071527', paper: '#FFFFFF', muted: '#5B667A' },
  },
  scenes,
};
fs.writeFileSync(path.join(BETA, `timeline_${TAG}.json`), JSON.stringify(timeline, null, 1));
const voice = order.map(id => ({ file: rel(SEC[id].file), start_s: r3(SEC[id].V), gain: 1.0 }));
fs.writeFileSync(path.join(BETA, `voice_cues_${TAG}.json`), JSON.stringify(voice, null, 1));
fs.writeFileSync(path.join(BETA, `sections_${TAG}.json`), JSON.stringify({ total: TOTAL, sections: order.map(id => ({ id, start: r3(SEC[id].S), voice: r3(SEC[id].V), end: r3(SEC[id].E) })) }, null, 1));
console.log(`total ${TOTAL} s, narration ${speech.toFixed(1)} s, tail per section ${tail.toFixed(2)} s`);
for (const id of order) console.log(`  ${id.padEnd(16)} ${SEC[id].S.toFixed(2).padStart(7)} -> ${SEC[id].E.toFixed(2).padStart(7)}   voice at ${SEC[id].V.toFixed(2)}`);
console.log(`scenes: ${scenes.length}`);
for (const s of scenes) console.log(`  ${s.id.padEnd(12)} ${s.start.toFixed(2).padStart(7)} -> ${s.end.toFixed(2).padStart(7)}  (${(s.end - s.start).toFixed(2)} s)  ${s.source.type}`);
