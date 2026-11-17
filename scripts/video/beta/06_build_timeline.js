'use strict';
/**
 * Builds the 4-minute edit for the beta product video.
 *
 * Inputs : reports/video/beta/audio/<voice>/cues.json   (exact sentence timings of the narration)
 *          reports/video/beta/cap/boxes.json            (element boxes recorded during capture)
 *          reports/video/beta/cap/*                     (stills and frame-sequence shots)
 * Outputs: reports/video/beta/timeline.json             (compositor timeline, scripts/video/compose)
 *          reports/video/beta/voice_cues.json           (narration placement for mixwav.py)
 *          reports/video/beta/cap/<composite shots>     (tab/view switches assembled from stills)
 *
 * Every zoom, highlight, callout and cursor click is anchored to the sentence (or the
 * word inside it) that mentions the feature, so picture and voice stay in sync when the
 * narration is regenerated with another voice or pace.
 *
 * Run:  node scripts/video/beta/06_build_timeline.js [--voice Samantha]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const BETA = path.join(ROOT, 'reports', 'video', 'beta');
const CAP = path.join(BETA, 'cap');
const rel = p => path.relative(ROOT, p);
const argv = process.argv.slice(2);
const VOICE = argv.includes('--voice') ? argv[argv.indexOf('--voice') + 1] : 'Samantha';

const TOTAL = 240;
const cues = JSON.parse(fs.readFileSync(path.join(BETA, 'audio', VOICE, 'cues.json'), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(CAP, 'boxes.json'), 'utf8'));
const r3 = v => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------ section layout
const SEC = {};
const order = cues.sections.map(s => s.id);
const LEAD = { '01_opening': 0.8 };
const CLOSING_TAIL = 4.0;
const speech = cues.sections.reduce((a, s) => a + s.duration_s, 0);
const leads = order.reduce((a, id) => a + (LEAD[id] || 0.6), 0);
const tail = (TOTAL - speech - leads - CLOSING_TAIL) / (order.length - 1);
if (tail < 1.2) throw new Error(`narration too long for ${TOTAL}s: tail per section ${tail.toFixed(2)}s`);
let t = 0;
for (const s of cues.sections) {
  const lead = LEAD[s.id] || 0.6;
  const S = t, V = S + lead, E = V + s.duration_s + (s.id === '09_closing' ? CLOSING_TAIL : tail);
  SEC[s.id] = { S, V, E, sent: s.sentences, file: path.join(BETA, 'audio', VOICE, s.file) };
  t = E;
}
SEC['09_closing'].E = TOTAL;
const st = (id, k) => SEC[id].V + SEC[id].sent[k].start_s;               // sentence k starts (global s)
const sd = (id, k) => SEC[id].sent[k].duration_s;
/** Global time at which `phrase` is spoken inside sentence k (proportional to its character position). */
function at(id, k, phrase) {
  const txt = SEC[id].sent[k].text;
  const i = txt.toLowerCase().indexOf(phrase.toLowerCase());
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
  for (const k of ['camera', 'cursor', 'highlights', 'callouts', 'masks', '_map']) if (f[k]) sc[k] = f[k];
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

/** Scroll time map: holds and eased moves. keys = [{ t, y }] (scene-local s, CSS px). src = y / 1000. */
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

/** Composite shot from stills: frames switch at the given scene-local seconds. */
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

// ============================================================ 01 OPENING
{
  const id = '01_opening', X = SEC[id];
  const s1 = st(id, 1), s2 = st(id, 2);
  const srcCol = [1325, 236, 205, 482];
  scene('o_leads', 0, s1 - 0.1, still('leads_nature'), {
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.9, focus: [1430, 525] }), cam(d, { zoom: 1.5, focus: [1260, 540], ease: 'inOutSine' })],
      highlights: [hl(1.0, d, srcCol)],
      callouts: [co('Facebook • Website • WhatsApp', 1.6, d - 0.2, srcCol, { placement: 'left' })],
    }),
  });
  const del = B.fu_today.delayed;
  scene('o_delayed', s1 - 0.1, s2 - 0.15, still('fu_delayed'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(0.5, { zoom: 1.0 }), cam(2.0, { zoom: 2.1, focus: mid(del) }), cam(d, { zoom: 2.25, focus: mid(del), ease: 'inOutSine' })],
      highlights: [hl(1.9, d, del, { padding: 4 })],
    }),
  });
  scene('o_title', s2 - 0.15, X.E, card({ card: 'title', title: 'One CRM for your whole sales team', subtitle: 'Leads, follow-ups, AI insights and team performance, in one place', logo_size: 66, title_size: 86, subtitle_size: 36 }), { tr: XF(0.5) });
}

// ============================================================ 02 HOME
{
  const id = '02_home', X = SEC[id], h = B.home;
  const a0 = st(id, 0), a1 = st(id, 1), a2 = st(id, 2);
  const hist = at(id, 2, 'the follow-up history'), sum = at(id, 2, 'and the summary');
  const cards = union(h.cards.map(c => c[1]));
  scene('h_home', X.S, X.E, still('home'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(a0) + 0.2, { zoom: 1.0 }), cam(loc(a1) - 0.1, { zoom: 1.06, focus: [1088, 470], ease: 'inOutSine' }),
        cam(loc(a1) + 0.9, { rect: cards, padding: 50 }), cam(loc(a2) - 0.1, { rect: cards, padding: 50 }),
        cam(loc(a2) + 0.9, { rect: h.schedule, zoom: 1.85 }), cam(loc(hist) - 0.1, { rect: h.schedule, zoom: 1.85 }),
        cam(loc(hist) + 0.8, { rect: h.history, zoom: 1.85 }), cam(loc(sum) - 0.1, { rect: h.history, zoom: 1.85 }),
        cam(loc(sum) + 0.8, { rect: h.summary, zoom: 1.85 }), cam(d - 1.4, { rect: h.summary, zoom: 1.85 }), cam(d, { zoom: 1.0 }),
      ],
      highlights: [
        hl(loc(a1) + 0.6, loc(a2) - 0.1, cards, { padding: 8 }),
        hl(loc(a2) + 0.7, loc(hist) - 0.05, h.schedule), hl(loc(hist) + 0.6, loc(sum) - 0.05, h.history), hl(loc(sum) + 0.6, d - 1.4, h.summary),
      ],
      callouts: [co('One place to start your day', loc(a1) + 1.0, loc(a2) - 0.2, cards, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1250, 860), pt(loc(a1) + 0.9, 980, 236), pt(loc(a2) + 0.9, 700, 520), pt(loc(hist) + 0.7, 1300, 470), pt(loc(sum) + 0.7, 1705, 520), pt(d, 1500, 700)] },
    }),
  });
}

// ============================================================ 03 AI ASSISTANT
{
  const id = '03_ai', X = SEC[id], a = B.ai_empty;
  const b0 = st(id, 0), b1 = st(id, 1), b2 = st(id, 2), b3 = st(id, 3), b4 = st(id, 4);
  const chipBox = name => (a.chips.find(c => c[0] === name) || [null, null])[1];
  const chipsAll = union(a.chips.map(c => c[1]));
  const newChat = mid(a.newChat), input = B.ai_typing.input, send = mid(B.ai_typing.send);
  const endCam = { zoom: 1.25, focus: [980, 360] };
  scene('a_empty', X.S, b2 - 0.1, still('ai_empty'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(b0) + 0.3, { zoom: 1.0 }), cam(loc(b1) - 0.2, { zoom: 1.12, focus: [1290, 430] }),
        cam(loc(b1) + 0.8, { rect: [chipsAll[0], 190, chipsAll[2], chipsAll[1] + chipsAll[3] - 190], zoom: 1.65 }), cam(d - 1.5, { rect: [chipsAll[0], 190, chipsAll[2], chipsAll[1] + chipsAll[3] - 190], zoom: 1.65 }),
        cam(d - 0.5, endCam)],
      highlights: [hl(loc(b1) + 0.7, d - 1.5, chipsAll, { padding: 10 })],
      callouts: [co('Ask your data anything', loc(b1) + 1.0, d - 1.6, chipsAll, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1300, 760), pt(loc(b1) + 0.8, 1180, 470), pt(d - 1.4, 1100, 430), pt(d - 0.35, newChat[0], newChat[1], true), pt(d, newChat[0], newChat[1])] },
    }),
  });
  const tyEnd = b2 + 2.9;
  scene('a_typing', b2 - 0.1, tyEnd, shot('ai_typing', { time_map: [{ t: 0, src: 0 }, { t: 0.75, src: 0 }, { t: 2.65, src: 1.89 }, { t: 3.0, src: 1.89 }] }), {
    tr: CUT,
    build: (loc, d) => ({
      camera: [cam(0, endCam), cam(0.7, { rect: [input[0], input[1] - 20, input[2] + 90, input[3] + 40], zoom: 1.45 }), cam(d, { rect: [input[0], input[1] - 20, input[2] + 90, input[3] + 40], zoom: 1.45 })],
      cursor: { mode: 'waypoints', points: [pt(0, newChat[0], newChat[1]), pt(0.55, input[0] + 90, mid(input)[1], true), pt(1.2, input[0] + 140, mid(input)[1] + 26), pt(d - 0.3, send[0], send[1]), pt(d - 0.12, send[0], send[1], true), pt(d, send[0], send[1])] },
      highlights: [hl(0.7, d - 0.15, input, { padding: 5 })],
    }),
  });
  const q = [1666, 158, 200, 37], ans = [722, 231, 288, 37];
  const chatTop = { rect: [700, 140, 1190, 150], zoom: 1.45 };
  scene('a_answering', tyEnd, tyEnd + 2.1, shot('ai_answering', { time_map: [{ t: 0, src: 0.241 }, { t: 1.35, src: 3.6 }, { t: 1.45, src: 4.009 }, { t: 2.1, src: 4.6 }] }), {
    tr: CUT,
    build: (loc, d) => ({
      camera: [cam(0, { rect: [input[0], input[1] - 20, input[2] + 90, input[3] + 40], zoom: 1.45 }), cam(0.7, chatTop), cam(d, chatTop)],
      cursor: { mode: 'waypoints', points: [pt(0, send[0], send[1]), pt(d, send[0] - 40, send[1] - 60)] },
    }),
  });
  scene('a_answer', tyEnd + 2.1, b3 - 0.15, still('ai_answer'), {
    tr: CUT,
    build: (loc, d) => ({
      camera: [cam(0, chatTop), cam(0.9, { rect: union([q, ans]), zoom: 1.45 }), cam(d, { rect: union([q, ans]), zoom: 1.5, ease: 'inOutSine' })],
      highlights: [hl(0.5, d, ans, { padding: 6, radius: 16 })],
      callouts: [co('Answers in seconds', 0.9, d - 0.1, ans, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, send[0] - 40, send[1] - 60), pt(1.0, 1100, 330)] },
    }),
  });
  const chips = [['follow-ups due today', 'Followups due today'], ['delayed tasks', 'How many tasks are delayed?'], ['project status', 'Check Projects status'], ['who is present today', 'Who all are present today?']]
    .map(([ph, name]) => ({ t: at(id, 3, ph), box: chipBox(name) }));
  const chipRect = [chipsAll[0] - 20, chipsAll[1] - 30, chipsAll[2] + 40, chipsAll[3] + 60];
  scene('a_chips', b3 - 0.15, b4 - 0.1, still('ai_empty'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { rect: chipRect, zoom: 1.6 }), cam(d, { rect: chipRect, zoom: 1.7, ease: 'inOutSine' })],
      highlights: chips.map((c, i) => hl(loc(c.t) - 0.05, i < chips.length - 1 ? loc(chips[i + 1].t) - 0.05 : d, c.box, { padding: 5, radius: 10 })),
      cursor: { mode: 'waypoints', points: [pt(0, 1100, 430)].concat(chips.map(c => pt(loc(c.t) + 0.2, mid(c.box)[0] + 20, mid(c.box)[1] + 16))) },
    }),
  });
  const list = [284, 180, 372, 44];
  scene('a_history', b4 - 0.1, X.E, still('ai_answer'), {
    tr: XF(0.4),
    build: (loc, d) => ({
      camera: [cam(0, { rect: [276, 68, 388, 291], zoom: 2.0 }), cam(d - 1.2, { rect: [276, 68, 388, 291], zoom: 2.1 }), cam(d, { zoom: 1.0 })],
      highlights: [hl(0.6, d - 1.2, list, { padding: 4, radius: 10 })],
      cursor: { mode: 'waypoints', points: [pt(0, 700, 420), pt(1.0, 520, 215)] },
    }),
  });
}

// ============================================================ 04 CRM DASHBOARD
{
  const id = '04_dashboard', X = SEC[id], D = B.dash_top;
  const c0 = st(id, 0), c1 = st(id, 1), c2 = st(id, 2), c3 = st(id, 3), c4 = st(id, 4);
  const stage = n => (D.stages.find(s => s[0] === n) || [])[1];
  const stages = union(['Won', 'New', 'Not Connected', 'Cold', 'Warm', 'Hot'].map(stage));
  const fuCounts = [1400, 440, 480, 150];
  const controls = [1590, 92, 300, 44];
  const download = [858, 186, 30, 28];
  const phases = ['new', 'cold', 'warm', 'hot', 'won and lost'].map(p => at(id, 1, p));
  const stageSeq = [stage('New'), stage('Cold'), stage('Warm'), stage('Hot'), union([stage('Won'), [995, 530, 339, 76]])];
  const grouped = at(id, 1, 'with every lead grouped');
  const dl = at(id, 3, 'download');
  scene('d_top', X.S, c4 + 0.3, still('dash_top'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(c0) + 0.3, { zoom: 1.0 }), cam(loc(c1) - 0.1, { zoom: 1.08, focus: [1000, 470], ease: 'inOutSine' }),
        cam(loc(c1) + 0.8, { rect: D.rates, zoom: 2.0 }), cam(loc(grouped) - 0.1, { rect: D.rates, zoom: 2.0 }),
        cam(loc(grouped) + 0.9, { rect: stages, zoom: 1.5 }), cam(loc(c2) - 0.1, { rect: stages, zoom: 1.5 }),
        cam(loc(c2) + 0.9, { rect: fuCounts, zoom: 1.9 }), cam(loc(c3) - 0.1, { rect: fuCounts, zoom: 1.9 }),
        cam(loc(c3) + 0.8, { rect: controls, zoom: 2.1 }), cam(loc(dl) - 0.2, { rect: controls, zoom: 2.1 }),
        cam(loc(dl) + 0.8, { rect: [640, 170, 480, 60], zoom: 2.1 }), cam(d - 1.0, { rect: [640, 170, 480, 60], zoom: 2.1 }),
        cam(d, { zoom: 1.0 }),
      ],
      highlights: [
        hl(loc(c1) + 0.7, loc(grouped) - 0.05, D.rates),
        ...stageSeq.map((r, i) => hl(loc(phases[i]) - 0.05, i < stageSeq.length - 1 ? loc(phases[i + 1]) - 0.05 : loc(c2) - 0.1, r, { padding: 4 })),
        hl(loc(c2) + 0.7, loc(c3) - 0.1, fuCounts),
        hl(loc(c3) + 0.7, loc(dl) - 0.1, controls, { padding: 4 }),
        hl(loc(dl) + 0.6, d - 1.0, download, { padding: 5, radius: 8 }),
      ],
      callouts: [
        co('Your pipeline at a glance', loc(c1) + 1.0, loc(grouped) - 0.2, D.rates, { placement: 'bottom' }),
        co('Today • Delayed • Upcoming', loc(c2) + 1.0, loc(c3) - 0.2, fuCounts, { placement: 'bottom' }),
      ],
      cursor: { mode: 'waypoints', points: [pt(0, 1200, 900), pt(loc(c1) + 0.8, 1180, 360), pt(loc(grouped) + 0.9, 700, 660), pt(loc(c2) + 0.9, 1640, 520),
        pt(loc(c3) + 0.8, 1626, 113), pt(loc(c3) + 2.2, 1760, 113), pt(loc(dl) + 0.7, 873, 200), pt(d, 1300, 700)] },
    }),
  });
  const S = B.dash_scroll, exY = S.execTable[1] - 100, caY = S.callActivity[1] - 120, roiY = S.target;
  const fca = at(id, 4, 'follow call activity'), src = at(id, 4, 'and see which lead sources');
  const roiCols = [1500, 170, 400, 330];
  scene('d_scroll', c4 + 0.3, X.E, shot('dash_scroll'), {
    tr: CUT,
    build: (loc, d) => {
      const map = scrollMap([{ t: 0, y: 0 }, { t: 1.6, y: exY }, { t: loc(fca) - 0.3, y: exY }, { t: loc(fca) + 1.1, y: caY }, { t: loc(src) - 0.3, y: caY }, { t: loc(src) + 1.5, y: roiY }, { t: d, y: roiY }]);
      return {
        camera: [cam(0, { zoom: 1.0 }), cam(loc(src) + 1.6, { zoom: 1.0 }), cam(loc(src) + 2.6, { rect: [1000, 150, 900, 360], zoom: 1.75 }), cam(d - 0.9, { rect: [1000, 150, 900, 360], zoom: 1.8 }), cam(d, { zoom: 1.0 })],
        highlights: [hl(1.7, loc(fca) - 0.3, [276, 100, 1624, S.execTable[3]], { padding: 4 }), hl(loc(fca) + 1.2, loc(src) - 0.3, [276, 120, 800, S.callActivity[3]], { padding: 4 }), hl(loc(src) + 2.4, d - 0.9, roiCols, { padding: 4 })],
        callouts: [co('Know which sources pay off', loc(src) + 2.8, d - 1.0, roiCols, { placement: 'left' })],
        cursor: { mode: 'waypoints', points: [pt(0, 1300, 700), pt(loc(src) + 2.4, 1700, 330), pt(d, 1700, 330)] },
        _map: map,
      };
    },
  });
  const sc = scenes[scenes.length - 1];
  sc.source.time_map = sc._map; delete sc._map;
}

// ============================================================ 05 LEADS
{
  const id = '05_leads', X = SEC[id], N = B.leads_nature;
  const e0 = st(id, 0), e1 = st(id, 1), e2 = st(id, 2), e3 = st(id, 3), e4 = st(id, 4);
  const clickStatus = at(id, 1, 'and Status View') + 0.55, clickNature = e2 - 0.35, clickFilter = e3 + 0.25;
  const S = X.S;
  const src = composite('leads_views', [{ still: 'leads_nature', t: 0 }, { still: 'leads_status', t: clickStatus - S }, { still: 'leads_nature', t: clickNature - S }]);
  const sv = mid(N.statusView), nv = mid(N.natureView), fb = mid(N.filterBtn);
  const cols = [1100, 236, 800, 300];
  scene('l_list', S, clickFilter + 0.15, src, {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [
        cam(0, { zoom: 1.0 }), cam(loc(e1) - 0.1, { zoom: 1.0 }), cam(loc(e1) + 0.8, { zoom: 1.55, focus: [760, 250] }),
        cam(loc(at(id, 1, 'won and lost')) + 0.4, { zoom: 1.55, focus: [1150, 250] }),
        cam(loc(clickStatus) - 0.3, { zoom: 1.55, focus: [1250, 200] }), cam(loc(clickStatus) + 1.6, { zoom: 1.45, focus: [1250, 260] }),
        cam(loc(clickNature) - 0.5, { zoom: 1.45, focus: [1250, 260] }),
        cam(loc(e2) + 0.8, { rect: cols, zoom: 1.75 }), cam(loc(e3) - 0.4, { rect: cols, zoom: 1.75 }),
        cam(d, { zoom: 1.3, focus: [1500, 300] }),
      ],
      highlights: [
        hl(loc(e1) + 0.7, loc(clickStatus) - 0.4, N.tabRow, { padding: 3 }),
        hl(loc(clickStatus) + 0.6, loc(clickNature) - 0.4, [277, 168, 1510, 65], { padding: 3 }),
        hl(loc(e2) + 0.8, loc(e3) - 0.3, [1100, 236, 800, 40], { padding: 3 }),
        hl(loc(e2) + 1.4, loc(e3) - 0.3, [277, 279, 1622, 44], { padding: 2, radius: 6 }),
      ],
      cursor: { mode: 'waypoints', points: [pt(0, 1200, 850), pt(loc(e1) + 0.8, 760, 205), pt(loc(clickStatus) - 0.15, sv[0], sv[1], true), pt(loc(clickStatus) + 0.8, 1300, 320),
        pt(loc(clickNature) - 0.1, nv[0], nv[1], true), pt(loc(e2) + 1.0, 1500, 300), pt(loc(clickFilter) - 0.1, fb[0], fb[1], true), pt(d, fb[0], fb[1])] },
    }),
  });
  const F = { date: [1340, 203, 178, 70], source: [1340, 370, 274, 66], quality: [1628, 370, 274, 66], assignee: [1340, 532, 274, 66], fb: [1340, 778, 274, 66] };
  const seq = [['by source', F.source], ['quality', F.quality], ['assignee', F.assignee], ['date', F.date], ['facebook campaign', F.fb]].map(([ph, r]) => ({ t: at(id, 3, ph), r }));
  scene('l_filter', clickFilter + 0.15, e4 - 0.1, still('leads_filter'), {
    tr: XF(0.25),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.3, focus: [1500, 300] }), cam(0.8, { zoom: 1.45, focus: [1480, 440] }), cam(loc(seq[4].t) - 0.2, { zoom: 1.45, focus: [1480, 460] }), cam(loc(seq[4].t) + 0.8, { zoom: 1.45, focus: [1480, 700] }), cam(d, { zoom: 1.45, focus: [1480, 700] })],
      highlights: seq.map((s, i) => hl(loc(s.t) - 0.05, i < seq.length - 1 ? loc(seq[i + 1].t) - 0.05 : d, s.r, { padding: 4, radius: 10 })),
      callouts: [co('Find any lead, fast', 0.9, d - 0.2, [1320, 200, 600, 700], { placement: 'left' })],
      cursor: { mode: 'waypoints', points: [pt(0, fb[0], fb[1])].concat(seq.map(s => pt(loc(s.t) + 0.25, mid(s.r)[0] + 60, mid(s.r)[1] + 14))) },
    }),
  });
  const T = B.transfer;
  scene('l_transfer', e4 - 0.1, X.E, still('transfer'), {
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
  const f0 = st(id, 0), f1 = st(id, 1), f2 = st(id, 2), f3 = st(id, 3);
  const cD = at(id, 1, 'delayed') + 0.15, cU = at(id, 1, 'upcoming') + 0.15, cN = at(id, 1, 'non follow-up') + 0.15;
  const cK = at(id, 2, 'Kanban View') + 0.1;
  const S = X.S;
  const src = composite('fu_tabs', [{ still: 'fu_today', t: 0 }, { still: 'fu_delayed', t: cD - S }, { still: 'fu_upcoming', t: cU - S }, { still: 'fu_non', t: cN - S }]);
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
      const s0 = loc(f3) - 0.1, s1 = Math.min(d - 0.6, s0 + 4.0);
      return {
        camera: [cam(0, { zoom: 1.4, focus: [1300, 330] }), cam(0.8, { zoom: 1.12, focus: [1088, 560] }), cam(loc(nd) - 0.1, { zoom: 1.12, focus: [1088, 560] }),
          cam(loc(nd) + 0.8, { rect: card0, zoom: 2.3 }), cam(s0 - 0.2, { rect: card0, zoom: 2.3 }), cam(s0 + 0.9, { zoom: 1.08, focus: [1088, 560] }), cam(d, { zoom: 1.08, focus: [1088, 560] })],
        highlights: [hl(loc(nd) + 0.7, s0 - 0.2, card0, { padding: 6, radius: 14 })],
        callouts: [co('Every stage on one board', 0.9, loc(nd) - 0.2, [277, 196, 1622, 52], { placement: 'bottom' })],
        cursor: { mode: 'waypoints', points: [pt(0, kb[0], kb[1]), pt(loc(nd) + 0.8, 470, 330), pt(s0, 900, 760), pt(d, 900, 760)] },
        _map: [{ t: 0, src: 0 }, { t: r3(s0), src: 0 }, ...Array.from({ length: 10 }, (_, k) => { const u = (k + 1) / 10; return { t: r3(s0 + (s1 - s0) * u), src: r3(max * (-(Math.cos(Math.PI * u) - 1) / 2)) }; }), { t: r3(d), src: r3(max) }],
      };
    },
  });
  const sc = scenes[scenes.length - 1];
  sc.source.time_map = sc._map; delete sc._map;
}

// ============================================================ 07 AI CALL ANALYSIS
{
  const id = '07_calls', X = SEC[id], C = B.calls;
  const g0 = st(id, 0), g1 = st(id, 1), g2 = st(id, 2), g3 = st(id, 3), g4 = st(id, 4);
  const head = n => (C.heads.find(h => h[0] === n) || [])[1];
  const rec = [head('Recording')[0], 240, head('Recording')[2], 560];
  const scores = [head('Lead')[0], 240, head('Sentiment')[0] + head('Sentiment')[2] - head('Lead')[0], 560];
  const eye = mid(C.eye), clickEye = g4 + 0.7;
  const row1y = C.firstRow[1] + 24;
  scene('c_list', X.S, clickEye + 0.2, still('calls'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(g0) + 0.3, { zoom: 1.0 }), cam(loc(g1) + 0.6, { zoom: 1.2, focus: [1088, 420] }),
        cam(loc(g2) + 0.8, { rect: rec, zoom: 1.85 }), cam(loc(g3) - 0.1, { rect: rec, zoom: 1.85 }),
        cam(loc(g3) + 0.8, { rect: scores, zoom: 1.85 }), cam(loc(g4) - 0.1, { rect: scores, zoom: 1.85 }),
        cam(loc(g4) + 0.5, { zoom: 1.5, focus: [1500, 360] }), cam(d, { zoom: 1.5, focus: [1500, 360] })],
      highlights: [hl(loc(g2) + 0.7, loc(g3) - 0.1, rec, { padding: 4 }), hl(loc(g3) + 0.7, loc(g4) - 0.1, scores, { padding: 4 })],
      callouts: [co('AI scores every call', loc(g3) + 1.0, loc(g4) - 0.2, [scores[0], 240, scores[2], 44], { placement: 'left' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1100, 850), pt(loc(g2) + 0.8, 1378, row1y + 2), pt(loc(g3) + 0.8, 1068, row1y), pt(loc(clickEye) - 0.1, eye[0], eye[1], true), pt(d, eye[0], eye[1])] },
    }),
  });
  const M = B.calls_detail, top = [577, 100, 766, 95];
  const aSum = at(id, 4, 'an AI summary'), aCo = at(id, 4, 'a coaching note');
  scene('c_detail', clickEye + 0.2, X.E, still('calls_detail'), {
    tr: XF(0.3),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(0.8, { rect: top, zoom: 1.9 }), cam(loc(aSum) - 0.1, { rect: top, zoom: 1.9 }),
        cam(loc(aSum) + 0.8, { rect: M.summary, zoom: 1.9 }), cam(loc(aCo) - 0.1, { rect: M.summary, zoom: 1.9 }),
        cam(loc(aCo) + 0.8, { rect: M.coaching, zoom: 1.9 }), cam(d - 1.2, { rect: M.coaching, zoom: 1.9 }), cam(d, { zoom: 1.0 })],
      highlights: [hl(0.7, loc(aSum) - 0.1, top, { padding: 6 }), hl(loc(aSum) + 0.7, loc(aCo) - 0.1, M.summary, { padding: 6 }), hl(loc(aCo) + 0.7, d - 1.2, M.coaching, { padding: 6 })],
      callouts: [co('Coaching for every executive', loc(aCo) + 1.0, d - 1.3, M.coaching, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, eye[0], eye[1]), pt(1.2, 1250, 240), pt(d, 1250, 240)] },
    }),
  });
}

// ============================================================ 08 EXECUTIVE PERFORMANCE
{
  const id = '08_performance', X = SEC[id], P = B.perf;
  const p0 = st(id, 0), p1 = st(id, 1), p2 = st(id, 2);
  const head = n => (P.heads.find(h => h[0] === n) || [])[1];
  const metrics = [head('Leads')[0], 465, head('AI Score')[0] + head('AI Score')[2] - head('Leads')[0], 268];
  const top1 = [277, 286, 523, 85], top3 = [277, 286, 1623, 86];
  const wl = at(id, 1, 'with leads'), ev = at(id, 2, 'and everyone');
  scene('p_perf', X.S, X.E, still('perf'), {
    tr: XF(0.5),
    build: (loc, d) => ({
      camera: [cam(0, { zoom: 1.0 }), cam(loc(p0) + 0.3, { zoom: 1.0 }), cam(loc(p1) - 0.1, { zoom: 1.12, focus: [1090, 360], ease: 'inOutSine' }),
        cam(loc(p1) + 0.8, { rect: P.formula, zoom: 2.2 }), cam(loc(wl) - 0.1, { rect: P.formula, zoom: 2.2 }),
        cam(loc(wl) + 0.9, { rect: metrics, zoom: 1.85 }), cam(loc(p2) - 0.1, { rect: metrics, zoom: 1.85 }),
        cam(loc(p2) + 0.8, { rect: top1, zoom: 2.2 }), cam(loc(ev) - 0.1, { rect: top1, zoom: 2.2 }), cam(loc(ev) + 1.0, { rect: top3, zoom: 1.12 }), cam(d, { zoom: 1.0 })],
      highlights: [hl(loc(p1) + 0.7, loc(wl) - 0.1, P.formula, { padding: 8 }), hl(loc(wl) + 0.8, loc(p2) - 0.1, metrics, { padding: 4 }), hl(loc(p2) + 0.7, loc(ev) - 0.1, top1, { padding: 4, radius: 14 })],
      callouts: [co('One score per executive', loc(p1) + 1.0, loc(wl) - 0.2, P.formula, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1150, 900), pt(loc(p1) + 0.8, 1560, 440), pt(loc(wl) + 0.9, 780, 640), pt(loc(p2) + 0.8, 560, 332), pt(d, 700, 600)] },
    }),
  });
}

// ============================================================ 09 CLOSING
{
  const id = '09_closing', X = SEC[id];
  const q0 = st(id, 0), q1 = st(id, 1);
  const nm = at(id, 0, 'never miss'), kn = at(id, 0, 'and know exactly');
  const slow = (d, f) => ({ camera: [cam(0, { zoom: 1.0 }), cam(d, { zoom: 1.12, focus: f, ease: 'inOutSine' })] });
  scene('q_leads', X.S, nm - 0.1, still('leads_nature'), { tr: XF(0.5), build: (loc, d) => slow(d, [900, 400]) });
  scene('q_fu', nm - 0.1, kn - 0.1, still('fu_kanban'), { tr: XF(0.4), build: (loc, d) => slow(d, [1000, 500]) });
  scene('q_perf', kn - 0.1, q1 - 0.2, still('perf'), { tr: XF(0.4), build: (loc, d) => slow(d, [1090, 400]) });
  scene('q_end', q1 - 0.2, TOTAL, card({ card: 'end', title: 'Bringing your business workflow together', cta: 'Capture every lead. Never miss a follow-up. Know how your team performs.', footnote: '', logo_size: 96, cta_size: 60, cta_width: 1500 }), { tr: XF(0.5) });
}

// ------------------------------------------------------------ write
for (let i = 1; i < scenes.length; i++) {
  if (Math.abs(scenes[i].start - scenes[i - 1].end) > 1e-6) throw new Error(`scene gap/overlap between ${scenes[i - 1].id} (${scenes[i - 1].end}) and ${scenes[i].id} (${scenes[i].start})`);
  if (scenes[i].end - scenes[i].start < 0.6) throw new Error(`scene ${scenes[i].id} is too short: ${(scenes[i].end - scenes[i].start).toFixed(2)}s`);
}
const timeline = {
  _comment: 'ProgBiz ERP product video (beta.progbiz.io). Generated by scripts/video/beta/06_build_timeline.js — edit the builder, not this file.',
  version: 1, width: 1920, height: 1080, fps: 30, duration: TOTAL, assets_root: '.', background: '#071527',
  brand: {
    name: 'ProgBiz ERP', tagline: 'Bringing your business workflow together',
    logo: rel(path.join(CAP, 'white-logo-1600.png')),
    colors: { primary: '#0068EE', accent: '#85C0FF', ink: '#071527', paper: '#FFFFFF', muted: '#5B667A' },
  },
  scenes,
};
fs.writeFileSync(path.join(BETA, 'timeline.json'), JSON.stringify(timeline, null, 1));
const voice = order.map(id => ({ file: rel(SEC[id].file), start_s: r3(SEC[id].V), gain: 1.0 }));
fs.writeFileSync(path.join(BETA, 'voice_cues.json'), JSON.stringify(voice, null, 1));
console.log(`sections (tail ${tail.toFixed(2)} s):`);
for (const id of order) console.log(`  ${id.padEnd(15)} ${SEC[id].S.toFixed(2).padStart(7)} -> ${SEC[id].E.toFixed(2).padStart(7)}   voice at ${SEC[id].V.toFixed(2)}`);
console.log(`scenes: ${scenes.length}`);
for (const s of scenes) console.log(`  ${s.id.padEnd(12)} ${s.start.toFixed(2).padStart(7)} -> ${s.end.toFixed(2).padStart(7)}  (${(s.end - s.start).toFixed(2)} s)  ${s.source.type}`);
