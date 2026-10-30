'use strict';
/**
 * Language-neutral edit of the beta product video (the v3 edit of 08_build_timeline_v3.js):
 * introduction, the CRM walkthrough, the WhatsApp module, Lead Expenses, Executive Performance
 * and the closing. The PICTURE is the same for every language; the TIMING follows the narration
 * of that language and every text on screen comes from the language pack.
 *
 * Run:   node scripts/video/beta/09_build_timeline_lang.js --lang <code> --cues <path to cues.json>
 *             [--total N] [--tag NAME] [--count grapheme|codepoint] [--tidy] [--report file.json] [--verbose]
 *             [--pack file.json] [--out dir]      (for tests: another language pack file, another output folder)
 *        node scripts/video/beta/09_build_timeline_lang.js --emit-pack --cues reports/video/beta/audio_v3/Samantha/cues.json
 *             (writes scripts/video/beta/lang/en.json from vo_script_v3.json and the phrases used below)
 *
 * Inputs : <cues.json>                            timing only: sections[].id, .duration_s, .file,
 *                                                 sections[].sentences[].start_s, .duration_s
 *          scripts/video/beta/lang/<code>.json    sentence TEXT, anchors, screen_text
 *          reports/video/beta/cap/*               the captured pictures (shared by all languages)
 * Outputs: reports/video/beta/timeline_<tag>.json, voice_cues_<tag>.json, sections_<tag>.json
 *          reports/video/beta/cap/leads_views_<tag>/, cap/fu_tabs_<tag>/   (composite shots)
 *          <tag> defaults to v3_<code>. The tag "v3" is refused: it belongs to the English edit.
 *
 * Anchors. Every zoom, highlight, callout and cursor click is tied to the sentence, or to a
 * phrase inside it, that mentions the feature. The code below names each phrase by its ENGLISH
 * wording (the key); the language pack gives the phrase of that language, which must appear
 * verbatim in the sentence. Its time is
 *      sentence start + sentence duration x (characters before the phrase / characters in the sentence)
 * with characters counted as Unicode grapheme clusters (one Malayalam akshara with its vowel sign
 * or conjunct = one unit; for English this equals the plain string index used by 08).
 *
 * Word order.
 *   - Order does not matter (items are sorted by their time): the question chips of 03_ai
 *     sentence 3, the stage names of 04_dashboard sentence 2, the filter fields of 05_leads
 *     sentence 3.
 *   - Order matters (the build stops with a message naming section, sentence and anchors):
 *     scene cuts, zoom sequences, the scroll direction of 04_dashboard sentence 4, the tab clicks
 *     of 06_followups sentence 2, the Kanban click before the card zoom.
 *   - Phrases in the right order but very close together: a warning is printed. The camera copes
 *     by itself (the compositor plays its keys in time order); a highlight or callout that has no
 *     time to show is kept as 08 would write it, or left out with --tidy.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const BETA = path.join(ROOT, 'reports', 'video', 'beta');
const CAP = path.join(BETA, 'cap');
const LANGDIR = path.join(__dirname, 'lang');
const ME = path.basename(__filename);
const rel = p => path.relative(ROOT, p);
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);

class BuildError extends Error {}
const fail = msg => { throw new BuildError(msg); };
process.on('uncaughtException', e => {
  console.error(e instanceof BuildError ? `error: ${e.message}` : e);
  console.error('nothing was written.');
  process.exit(1);
});
const WARN = [];
const warn = msg => { if (!WARN.includes(msg)) WARN.push(msg); };

const EMIT = argv.includes('--emit-pack');          // write lang/en.json instead of a timeline
const VERBOSE = argv.includes('--verbose');
const TIDY = argv.includes('--tidy');               // leave out highlights and callouts that have no time to show
const LANG = EMIT ? 'en' : opt('--lang');
const CUES = opt('--cues');
if (!LANG || !CUES || argv.includes('-h') || argv.includes('--help')) {
  console.log(`usage: node scripts/video/beta/${ME} --lang <code> --cues <cues.json> [--total N] [--tag NAME] [--count grapheme|codepoint] [--tidy] [--report file.json] [--verbose]\n       node scripts/video/beta/${ME} --emit-pack --cues reports/video/beta/audio_v3/Samantha/cues.json`);
  process.exit(LANG && CUES ? 0 : 2);
}
if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(LANG)) fail(`--lang "${LANG}" is not a language code`);
const TAG = opt('--tag', `v3_${LANG}`);
if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(TAG)) fail(`--tag "${TAG}": use letters, digits, "_" and "-" only`);
if (TAG === 'v3') fail('--tag v3 is the English edit made by 08_build_timeline_v3.js; choose another tag (default: v3_<lang>)');
const COUNT = opt('--count', 'grapheme');
if (!['grapheme', 'codepoint'].includes(COUNT)) fail('--count must be grapheme or codepoint');

const CUES_FILE = path.resolve(process.cwd(), CUES);
if (!fs.existsSync(CUES_FILE)) fail(`cues file not found: ${CUES}`);
const AUDIO = path.dirname(CUES_FILE);
const cues = JSON.parse(fs.readFileSync(CUES_FILE, 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(CAP, 'boxes.json'), 'utf8'));
const r3 = v => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------ language pack
const PACK_FILE = !EMIT && opt('--pack') ? path.resolve(process.cwd(), opt('--pack')) : path.join(LANGDIR, `${LANG}.json`);
const OUT = opt('--out') ? path.resolve(process.cwd(), opt('--out')) : BETA;   // where the three json files go
let PACK;
if (EMIT) {
  const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'vo_script_v3.json'), 'utf8'));
  PACK = { lang: 'en', name: 'English', sections: script.sections.map(s => ({ id: s.id, sentences: s.sentences.map(text => ({ text, anchors: {} })) })), screen_text: {} };
} else {
  if (!fs.existsSync(PACK_FILE)) fail(`language pack not found: ${rel(PACK_FILE)}`);
  PACK = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
  if (PACK.lang && PACK.lang !== LANG) warn(`${rel(PACK_FILE)} says "lang": "${PACK.lang}" but was loaded as --lang ${LANG}`);
}
if (!Array.isArray(cues.sections) || !cues.sections.length) fail(`${CUES}: no sections`);
if (!Array.isArray(PACK.sections)) fail(`${rel(PACK_FILE)}: "sections" is missing`);
PACK.screen_text = PACK.screen_text || {};
{
  const a = cues.sections.map(s => s.id).join(' '), b = PACK.sections.map(s => s.id).join(' ');
  if (a !== b) fail(`the cues file and the language pack do not list the same sections in the same order\n  cues: ${a}\n  pack: ${b}`);
  cues.sections.forEach((s, i) => {
    const p = PACK.sections[i];
    if (!(typeof s.duration_s === 'number' && s.duration_s > 0)) fail(`${CUES}: section ${s.id} has no duration_s`);
    if (!s.file) fail(`${CUES}: section ${s.id} has no file`);
    if (!Array.isArray(s.sentences) || !Array.isArray(p.sentences) || s.sentences.length !== p.sentences.length) {
      fail(`${s.id}: the cues file has ${(s.sentences || []).length} sentence(s), the language pack has ${(p.sentences || []).length}; they must match one to one`);
    }
    s.sentences.forEach((c, k) => {
      if (!(typeof c.start_s === 'number' && typeof c.duration_s === 'number' && c.duration_s > 0)) fail(`${CUES}: ${s.id} sentence ${k + 1} needs numeric start_s and duration_s`);
      if (k > 0 && c.start_s < s.sentences[k - 1].start_s + s.sentences[k - 1].duration_s - 0.05) fail(`${CUES}: ${s.id} sentence ${k + 1} starts at ${c.start_s} s, before sentence ${k} has ended`);
      if (c.start_s + c.duration_s > s.duration_s + 0.05) fail(`${CUES}: ${s.id} sentence ${k + 1} ends after the section file (${s.duration_s} s)`);
      const q = p.sentences[k];
      if (!q || typeof q.text !== 'string' || !q.text.trim()) fail(`${rel(PACK_FILE)}: ${s.id} sentence ${k + 1} has no text`);
    });
  });
}
/** Text shown on screen (callout or card): the language pack's wording of an English text. */
const missingText = new Set();
function T(text) {
  if (text == null || text === '') return text;
  if (EMIT) { PACK.screen_text[text] = text; return text; }
  const v = PACK.screen_text[text];
  if (typeof v === 'string' && v.trim()) return v;
  if (!missingText.has(text)) { missingText.add(text); warn(`screen_text has no entry for "${text}": the English text is shown`); }
  return text;
}

// ------------------------------------------------------------ section layout
const SEC = {};
const order = cues.sections.map(s => s.id);
const LEAD = { '01_intro': 0.8 };
const CLOSING_TAIL = 4.5;
const speech = cues.sections.reduce((a, s) => a + s.duration_s, 0);
const leads = order.reduce((a, id) => a + (LEAD[id] || 0.6), 0);
const TAIL = 2.0;
const TOTAL = Number(opt('--total', Math.ceil((speech + leads + CLOSING_TAIL + TAIL * (order.length - 1)) / 5) * 5));
if (!(TOTAL > 0)) fail('--total needs a number of seconds');
const tail = (TOTAL - speech - leads - CLOSING_TAIL) / (order.length - 1);
if (tail < 1.2) fail(`narration too long for ${TOTAL} s: only ${tail.toFixed(2)} s of pause per section (1.2 s needed). Narration ${speech.toFixed(1)} s; use --total ${Math.ceil((speech + leads + CLOSING_TAIL + TAIL * (order.length - 1)) / 5) * 5} or leave --total out`);
let t = 0;
cues.sections.forEach((s, i) => {
  const lead = LEAD[s.id] || 0.6;
  const S = t, V = S + lead, E = V + s.duration_s + (s.id === order[order.length - 1] ? CLOSING_TAIL : tail);
  const sent = s.sentences.map((c, k) => ({ start_s: c.start_s, duration_s: c.duration_s, text: PACK.sections[i].sentences[k].text, anchors: PACK.sections[i].sentences[k].anchors || {} }));
  SEC[s.id] = { S, V, E, sent, file: path.join(AUDIO, s.file) };
  t = E;
});
SEC[order[order.length - 1]].E = TOTAL;
const st = (id, k) => SEC[id].V + SEC[id].sent[k].start_s;
const sd = (id, k) => SEC[id].sent[k].duration_s;

// ------------------------------------------------------------ anchors
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** Number of characters of `txt` that START before string index i (all of them when i is omitted). */
function units(txt, i) {
  const end = i == null ? txt.length : i;
  let n = 0;
  if (COUNT === 'grapheme') { for (const g of SEGMENTER.segment(txt)) { if (g.index < end) n++; else break; } }
  else for (let j = 0; j < end; j += txt.codePointAt(j) > 0xffff ? 2 : 1) n++;
  return n;
}
// loose comparison, used only when the exact phrase is not found: case, curly apostrophes and
// the invisible joiners (ZWJ, ZWNJ) are ignored. `map` gives the string index of every kept character.
function fold(s) {
  let out = '';
  const map = [];
  for (let j = 0; j < s.length; j++) {
    const ch = s[j];
    if (ch === '‌' || ch === '‍') continue;
    const f = (ch === '‘' || ch === '’') ? "'" : ch.toLowerCase();
    if (f.length !== 1) { out += ch; map.push(j); continue; }
    out += f; map.push(j);
  }
  return { out, map };
}
function locate(txt, phrase) {
  const i = txt.indexOf(phrase);
  if (i >= 0) return { i, exact: true, again: txt.indexOf(phrase, i + 1) >= 0 };
  const a = fold(txt), b = fold(phrase);
  const j = b.out ? a.out.indexOf(b.out) : -1;
  if (j < 0) return { i: -1 };
  return { i: a.map[j], exact: false, again: a.out.indexOf(b.out, j + 1) >= 0 };
}
const where = (id, k) => `${id} sentence ${k + 1}`;
const ANCHORS = [];                                  // every phrase the edit asked for, with its time
/**
 * Global time at which a phrase is spoken inside sentence k (0-based) of section id.
 * `key` is the ENGLISH anchor phrase; the language pack says how it reads in this language.
 */
function at(id, k, key) {
  const s = SEC[id] && SEC[id].sent[k];
  if (!s) fail(`${where(id, k)} does not exist (anchor "${key}")`);
  const done = ANCHORS.find(a => a.id === id && a.k === k && a.key === key);
  if (done) return done.t;
  let phrase = s.anchors[key];
  if (EMIT) phrase = key;
  if (typeof phrase !== 'string' || !phrase) fail(`${where(id, k)}: the language pack ${rel(PACK_FILE)} has no anchor for "${key}".\n  sentence: ${s.text}\n  add  "anchors": { "${key}": "<the phrase of this sentence that means the same>" }`);
  const m = locate(s.text, phrase);
  if (m.i < 0) fail(`${where(id, k)}: anchor "${key}" is given as "${phrase}", which does not appear in the sentence.\n  sentence: ${s.text}\n  the phrase must be copied from the sentence character for character`);
  if (EMIT) PACK.sections[order.indexOf(id)].sentences[k].anchors[key] = s.text.substr(m.i, phrase.length);
  else if (!m.exact) warn(`${where(id, k)}: anchor "${key}" = "${phrase}" matches the sentence only when case, apostrophes or joiners are ignored`);
  if (m.again) warn(`${where(id, k)}: anchor "${key}" = "${phrase}" occurs more than once in the sentence; the first occurrence is used`);
  const pos = units(s.text, m.i), len = units(s.text);
  const tt = st(id, k) + sd(id, k) * (pos / len);
  ANCHORS.push({ id, k, key, phrase: EMIT ? key : phrase, pos, len, t: tt });
  return tt;
}
/**
 * The picture needs these moments in this order. items = [label, time] where label is an English
 * anchor phrase of sentence k, or a description in brackets such as "(start of the sentence)".
 */
function inOrder(id, k, items, minGap, why) {
  const gap = minGap || 0;
  const name = ([label, tt]) => {
    const a = ANCHORS.find(x => x.id === id && x.k === k && x.key === label);
    return a ? `"${label}"${a.phrase !== label ? ` = "${a.phrase}"` : ''} at ${tt.toFixed(2)} s` : `${label} at ${tt.toFixed(2)} s`;
  };
  for (let i = 1; i < items.length; i++) {
    const d = items[i][1] - items[i - 1][1];
    if (d > gap) continue;
    const list = items.map(it => (it[0].startsWith('(') ? it[0] : `"${it[0]}"`)).join('  ->  ');
    fail(`${where(id, k)}: ${why || 'the picture follows these phrases'}, so they must be spoken in this order${gap ? `, at least ${gap} s apart` : ''}:\n  ${list}\n  but ${name(items[i - 1])} and ${name(items[i])}${d < 0 ? ' (wrong order)' : d === 0 ? ' (same moment)' : ` (only ${d.toFixed(2)} s apart)`}.\n  sentence: ${SEC[id].sent[k].text}\n  change the word order of this sentence in ${rel(PACK_FILE)} (and record it again), or correct the anchor phrases`);
  }
}

// ------------------------------------------------------------ helpers
const scenes = [];
const XF = d => ({ type: 'crossfade', duration: d || 0.5 });
const CUT = { type: 'cut' };
/** Scroll keys must not run backwards. A key that would come after its successor is pulled forward
 *  to it: what is said LATER keeps its time, the scroll before it becomes quicker.
 *  (Camera and cursor keys need no such care: the compositor puts them in time order by itself.) */
function forward(sceneId, what, keys) {
  let moved = 0;
  for (let i = keys.length - 2; i >= 0; i--) if (keys[i].t > keys[i + 1].t) { moved = Math.max(moved, keys[i].t - keys[i + 1].t); keys[i].t = keys[i + 1].t; }
  if (moved > 0) warn(`scene ${sceneId}: ${what} keys were up to ${moved.toFixed(2)} s too late for what follows and were moved forward (the phrases of this scene are close together)`);
  return keys;
}
function scene(id, start, end, source, o = {}) {
  const loc = v => r3(v - start);
  const sc = { id, start: r3(start), end: r3(end), source };
  if (o.tr) sc.transition = o.tr;
  if (!(end - start > 0)) fail(`scene ${id} would run from ${start.toFixed(2)} s to ${end.toFixed(2)} s: the phrases that start and end it are spoken in the wrong order`);
  const f = o.build ? o.build(loc, r3(end - start)) : {};
  // Without --tidy nothing is changed here (the edit stays exactly the one of 08); the warnings
  // say what --tidy would leave out.
  if (f.highlights) f.highlights = f.highlights.filter(h => {
    const d = h.end - h.start;
    if (d >= 0.3) return true;
    warn(`scene ${id}: the highlight from ${h.start} s to ${h.end} s ${d <= 0 ? 'never shows' : `only flashes for ${d.toFixed(2)} s`} (the phrases around it are close together)${TIDY ? '; left out' : '; --tidy leaves it out'}`);
    return !TIDY;
  });
  if (f.callouts) f.callouts = f.callouts.filter(c => {
    const d = c.end - c.start;
    if (d < 0.8) { warn(`scene ${id}: callout "${c.text}" ${d <= 0 ? 'never shows' : `shows for ${d.toFixed(2)} s only`}${TIDY ? '; left out' : '; --tidy leaves it out'}`); return !TIDY; }
    if (d < 1.2) warn(`scene ${id}: callout "${c.text}" shows for ${d.toFixed(2)} s only; hard to read`);
    return true;
  });
  for (const k of ['camera', 'cursor', 'highlights', 'callouts', 'masks']) if (f[k]) sc[k] = f[k];
  if (f.map) sc.source.time_map = f.map;
  scenes.push(sc);
  return sc;
}
const still = name => ({ type: 'still', path: rel(path.join(CAP, `${name}.jpg`)), css_width: 1920, css_height: 1080 });
const shot = (dir, extra) => Object.assign({ type: 'shot', dir: rel(path.join(CAP, dir)) }, extra || {});
const CARD_TEXT = ['eyebrow', 'title', 'subtitle', 'cta', 'footnote'];
const card = o => {
  const c = Object.assign({ type: 'card', theme: 'dark' }, o);
  for (const k of CARD_TEXT) if (typeof c[k] === 'string' && c[k]) c[k] = T(c[k]);
  return c;
};
const cam = (tt, o) => Object.assign({ t: r3(Math.max(0, tt)) }, o);
const hl = (s, e, rect, o) => Object.assign({ start: r3(s), end: r3(e), rect, style: 'outline', radius: 12, padding: 6 }, o || {});
const co = (text, s, e, target, o) => {
  const shown = T(text);
  const n = units(shown), words = shown.trim().split(/\s+/).length;
  if (n > 30 || words > 6) warn(`callout "${shown}" (for "${text}") has ${n} characters in ${words} words; callouts sit in a small pill: 2 to 5 words, about 30 characters`);
  return Object.assign({ text: shown, start: r3(s), end: r3(e), target }, o || {});
};
const pt = (tt, x, y, click) => (click ? { t: r3(tt), x, y, click: true } : { t: r3(tt), x, y });
const union = rs => { const x = Math.min(...rs.map(r => r[0])), y = Math.min(...rs.map(r => r[1])); return [x, y, Math.max(...rs.map(r => r[0] + r[2])) - x, Math.max(...rs.map(r => r[1] + r[3])) - y]; };
const mid = r => [Math.round(r[0] + r[2] / 2), Math.round(r[1] + r[3] / 2)];
const slow = (d, f, z0, z1) => ({ camera: [cam(0, { zoom: z0 || 1.0, focus: f }), cam(d, { zoom: z1 || 1.12, focus: f, ease: 'inOutSine' })] });
const byTime = (a, b) => a.t - b.t;

function scrollMap(sceneId, keys) {
  forward(sceneId, 'scroll', keys);
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
// Composite shots (a few stills shown one after the other) are written at the very end, when the
// whole edit is known to be valid. Their folder carries the tag, so every language has its own.
const COMPOSITES = [];
function composite(name, parts) {
  const id = `${name}_${TAG}`;
  for (let i = 1; i < parts.length; i++) if (!(parts[i].t > parts[i - 1].t)) fail(`composite shot ${id}: picture "${parts[i].still}" (${parts[i].t.toFixed(2)} s) does not come after "${parts[i - 1].still}" (${parts[i - 1].t.toFixed(2)} s)`);
  COMPOSITES.push({ id, parts });
  return shot(id, { time_map: [{ t: 0, src: 0 }, { t: 1000, src: 1000 }] });
}
function writeComposite({ id, parts }) {
  const dir = path.join(CAP, id);
  const metaFile = path.join(dir, 'meta.json');
  if (fs.existsSync(dir)) {
    let mine = false;
    try { mine = JSON.parse(fs.readFileSync(metaFile, 'utf8')).generated_by === ME; } catch (_) { /* not ours */ }
    if (!mine) fail(`${rel(dir)} exists and was not made by ${ME}; it is left alone. Choose another --tag`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
  const frames = parts.map((p, i) => {
    const file = `frames/f_${String(i + 1).padStart(6, '0')}.jpg`;
    fs.copyFileSync(path.join(CAP, `${p.still}.jpg`), path.join(dir, file));
    return { file, t_ms: Math.round(p.t * 1000) };
  });
  fs.writeFileSync(metaFile, JSON.stringify({ shot_id: id, css_width: 1920, css_height: 1080, dsf: 2, frame_width: 3840, frame_height: 2160, frames, events: [], generated_by: ME }, null, 1));
}
const ROI_Y = B.dash_scroll.target / 1000;           // dash_scroll source time of the Lead Source ROI table
const roiShot = () => shot('dash_scroll', { freeze_at: ROI_Y });
const ROI = { costLead: [900, 165, 170, 340], ret: [1500, 165, 400, 340], table: [276, 95, 1624, 420] };

// ============================================================ 01 INTRODUCTION
{
  const id = '01_intro', X = SEC[id];
  const s1 = st(id, 1), s2 = st(id, 2), s3 = st(id, 3), s4 = st(id, 4);
  const mg = at(id, 3, 'managers see'), bo = at(id, 3, 'and business owners');
  inOrder(id, 3, [['(start of the sentence: sales executives)', s3], ['managers see', mg], ['and business owners', bo], ['(start of sentence 5)', s4]], 0.7, 'one scene each is cut for sales executives, managers and business owners');
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
  inOrder(id, 1, [['(start of the sentence: the four summary cards)', a1], ['with today', sch], ['recent follow-up history', hist], ['and a lead summary', sum]], 0, 'the camera visits the summary cards, the schedule, the history and the lead summary one after the other');
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
    .map(([ph, name]) => ({ t: at(id, 2, ph), box: chipBox(name) })).sort(byTime);   // any word order works
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
  // the stage names are highlighted in the order in which they are spoken (any order works);
  // the camera moves to the stages when the grouping or the first stage is mentioned
  const stageSeq = [['new', stage('New')], ['cold', stage('Cold')], ['warm', stage('Warm')], ['hot', stage('Hot')], ['won and lost', union([stage('Won'), [995, 530, 339, 76]])]]
    .map(([ph, r]) => ({ t: at(id, 1, ph), r })).sort(byTime);
  const phases = stageSeq.map(s => s.t);
  const g0 = at(id, 1, 'with every lead grouped');
  const grouped = Math.min(g0, phases[0]);
  if (phases[0] < g0) warn(`${where(id, 1)}: a stage name is spoken before "with every lead grouped"; the camera moves to the stages at the first stage name`);
  inOrder(id, 1, [['(start of the sentence: the rates)', c1], [phases[0] < g0 ? '(the first stage name)' : 'with every lead grouped', grouped]], 0, 'the camera shows the rates first and the stages after them');
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
        ...stageSeq.map((s, i) => hl(loc(phases[i]) - 0.05, i < stageSeq.length - 1 ? loc(phases[i + 1]) - 0.05 : loc(c2) - 0.1, s.r, { padding: 4 })),
        hl(loc(c2) + 0.7, d - 1.0, fuCounts),
      ],
      callouts: [co('Your pipeline at a glance', loc(c1) + 1.0, loc(grouped) - 0.2, D.rates, { placement: 'bottom' }), co('Today • Delayed • Upcoming', loc(c2) + 1.0, d - 1.1, fuCounts, { placement: 'bottom' })],
      cursor: { mode: 'waypoints', points: [pt(0, 1200, 900), pt(loc(c1) + 0.8, 1180, 360), pt(loc(grouped) + 0.9, 700, 660), pt(loc(c2) + 0.9, 1640, 520), pt(d, 1300, 700)] },
    }),
  });
  const S = B.dash_scroll, exY = S.execTable[1] - 100, caY = S.callActivity[1] - 120, roiY = S.target;
  const fca = at(id, 3, 'follow call activity'), src = at(id, 3, 'and see which lead sources');
  inOrder(id, 3, [['(start of the sentence: comparing executives)', c3], ['follow call activity', fca], ['and see which lead sources', src]], 0, 'the page scrolls DOWN from the executive table to call activity and then to the lead sources');
  scene('d_scroll', c3 + 0.3, X.E, shot('dash_scroll'), {
    tr: CUT,
    build: (loc, d) => ({
      map: scrollMap('d_scroll', [{ t: 0, y: 0 }, { t: 1.6, y: exY }, { t: loc(fca) - 0.3, y: exY }, { t: loc(fca) + 1.1, y: caY }, { t: loc(src) - 0.3, y: caY }, { t: loc(src) + 1.5, y: roiY }, { t: d, y: roiY }]),
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
  inOrder(id, 1, [['(start of the sentence: the tabs)', e1], ['won and lost', at(id, 1, 'won and lost')], ['and Status View', at(id, 1, 'and Status View')]], 0, 'the camera follows the tab row to the right and the pointer then clicks Status View');
  const S = X.S;
  const src = composite('leads_views', [{ still: 'leads_nature', t: 0 }, { still: 'leads_status', t: clickStatus - S }]);
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
  const seq = [['by source', F.source], ['quality', F.quality], ['assignee', F.assignee], ['date', F.date], ['facebook campaign', F.fb]]
    .map(([ph, r]) => ({ t: at(id, 2, ph), r })).sort(byTime);                       // any word order works
  // the Facebook campaign field sits lower in the panel: the camera goes down for it and comes back up for what follows
  const iFb = seq.findIndex(s => s.r === F.fb);
  const up = { zoom: 1.45, focus: [1480, 460] }, down = { zoom: 1.45, focus: [1480, 700] };
  const filterCam = (loc, d) => {
    const keys = [cam(0, { zoom: 1.3, focus: [1500, 300] }), cam(0.8, { zoom: 1.45, focus: [1480, 440] }), cam(loc(seq[iFb].t) - 0.2, up), cam(loc(seq[iFb].t) + 0.8, down)];
    if (iFb === seq.length - 1) keys.push(cam(d, down));
    else keys.push(cam(loc(seq[iFb + 1].t) - 0.2, down), cam(loc(seq[iFb + 1].t) + 0.8, up), cam(d, up));
    return keys;
  };
  scene('l_filter', clickFilter + 0.15, e3 - 0.1, still('leads_filter'), {
    tr: XF(0.25),
    build: (loc, d) => ({
      camera: filterCam(loc, d),
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
  inOrder(id, 1, [["(start of the sentence: today's)", f1], ['delayed', at(id, 1, 'delayed')], ['upcoming', at(id, 1, 'upcoming')], ['non follow-up', at(id, 1, 'non follow-up')]], 0, 'the pointer clicks the tabs from left to right');
  inOrder(id, 2, [['(start of the sentence)', f2], ['Kanban View', at(id, 2, 'Kanban View')], ['with the next date', at(id, 2, 'with the next date')]], 0, 'Kanban View is clicked first and the camera then zooms into a card of the board');
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
  inOrder(id, 1, [['(start of the sentence: the shared inbox)', w1], ['with search and unread filters', sf]], 0, 'the camera shows the inbox first and the search and filter row after it');
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
  inOrder(id, 1, [['(start of the sentence: picking the template)', v1], ['choose your customers', cc], ['and send it immediately', si], ['(start of sentence 3)', v2]], 0.7, 'the template list, the recipients and the send options are shown one after the other');
  inOrder(id, 2, [['(start of the sentence)', v2], ['sent, delivered', sdv], ['along with the enquiries', enq]], 0, 'the camera moves from the delivery columns to the result columns');
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
  inOrder(id, 1, [['(start of the sentence: the scores)', g1], ['and managers can listen', lis]], 0, 'the camera shows the score columns first and the recording column after them');
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
  inOrder(id, 2, [['(start of the sentence: opening the call)', g2], ['an AI summary', aSum], ['and a coaching note', aCo]], 0, 'the camera moves down from the summary to the coaching note');
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
  inOrder(id, 1, [['(start of the sentence: the score formula)', p1], ['so your best performers', bp], ['and everyone', ev]], 0, 'the camera goes from the formula to the top performer and then to the whole row');
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
  inOrder(id, 0, [['(start of the section: fewer missed leads)', X.S], ['faster replies', fr], ['a sales team', tm], ['and marketing money', mk], ['(start of sentence 2)', q1]], 0.8, 'one scene each is cut for the four benefits');
  scene('q_fu', X.S, fr - 0.1, still('fu_kanban'), { tr: XF(0.5), build: (loc, d) => Object.assign(slow(d, [1000, 500]), { callouts: [co('Fewer missed leads', 0.7, d - 0.1, null, { placement: 'bottom' })] }) });
  scene('q_wa', fr - 0.1, tm - 0.1, still('wa_chat'), { tr: XF(0.4), build: (loc, d) => Object.assign(slow(d, [700, 500], 1.2, 1.35), { callouts: [co('Faster WhatsApp replies', 0.5, d - 0.1, null, { placement: 'bottom' })] }) });
  scene('q_coach', tm - 0.1, mk - 0.1, still('calls_detail'), { tr: XF(0.4), build: (loc, d) => Object.assign(slow(d, [960, 400], 1.3, 1.45), { callouts: [co('A team you can coach', 0.5, d - 0.1, null, { placement: 'bottom' })] }) });
  scene('q_roi', mk - 0.1, q1 - 0.2, roiShot(), { tr: XF(0.4), build: (loc, d) => Object.assign(slow(d, [1200, 330], 1.2, 1.35), { callouts: [co('Marketing that pays back', 0.5, d - 0.1, null, { placement: 'bottom' })] }) });
  scene('q_end', q1 - 0.2, TOTAL, card({ card: 'end', title: 'Bringing your business workflow together', cta: 'Capture every lead. Reply faster on WhatsApp. Know how your team performs.', footnote: '', logo_size: 96, cta_size: 56, cta_width: 1560 }), { tr: XF(0.5) });
}

// ------------------------------------------------------------ checks
for (const sc of scenes) for (const c of (sc.callouts || [])) if (c.target === null) delete c.target;
for (let i = 0; i < scenes.length; i++) {
  const sc = scenes[i];
  if (i > 0 && Math.abs(sc.start - scenes[i - 1].end) > 1e-6) fail(`scene gap/overlap between ${scenes[i - 1].id} (${scenes[i - 1].end}) and ${sc.id} (${sc.start})`);
  if (i > 0 && sc.end - sc.start < 0.6) fail(`scene ${sc.id} is too short: ${(sc.end - sc.start).toFixed(2)} s (0.6 s needed). The phrases that start and end it are too close together; see the anchors of its section in ${rel(PACK_FILE)}`);
  const tm = sc.source.time_map || [];
  for (let k = 1; k < tm.length; k++) if (tm[k].t < tm[k - 1].t || tm[k].src < tm[k - 1].src) fail(`scene ${sc.id}: its source would play backwards at ${tm[k].t} s (scene time): the phrases of its section are too close together or in the wrong order`);
  const keys = (sc.camera || []).map((k, n) => ({ k, n })).sort((a, b) => a.k.t - b.k.t || a.n - b.n).map(x => x.k);   // the order in which the compositor plays them
  for (let k = 1; k < keys.length; k++) {
    const a = keys[k - 1], b = keys[k], d = b.t - a.t;
    const same = JSON.stringify(Object.assign({}, a, { t: 0, ease: 0 })) === JSON.stringify(Object.assign({}, b, { t: 0, ease: 0 }));
    if (!same && d < 0.3) warn(`scene ${sc.id}: the camera has only ${d.toFixed(2)} s for its move at ${b.t} s (scene time); the phrases of this sentence are close together`);
  }
}

// ------------------------------------------------------------ language pack (--emit-pack)
if (EMIT) {
  fs.mkdirSync(LANGDIR, { recursive: true });
  fs.writeFileSync(PACK_FILE, `${JSON.stringify(PACK, null, 2)}\n`);
  const n = PACK.sections.reduce((a, s) => a + s.sentences.reduce((b, q) => b + Object.keys(q.anchors).length, 0), 0);
  console.log(`wrote ${rel(PACK_FILE)}: ${PACK.sections.length} sections, ${PACK.sections.reduce((a, s) => a + s.sentences.length, 0)} sentences, ${n} anchors, ${Object.keys(PACK.screen_text).length} screen texts`);
  for (const w of WARN) console.log(`warning: ${w}`);
  process.exit(0);
}

// ------------------------------------------------------------ write
const unusedText = Object.keys(PACK.screen_text).filter(k => !scenes.some(sc => (sc.callouts || []).some(c => c.text === PACK.screen_text[k]) || (sc.source.type === 'card' && CARD_TEXT.some(f => sc.source[f] === PACK.screen_text[k]))));
if (unusedText.length) warn(`screen_text entries that the edit does not use (check their keys, they must equal the English text exactly): ${unusedText.map(k => `"${k}"`).join(', ')}`);
for (const s of PACK.sections) s.sentences.forEach((q, k) => {
  for (const key of Object.keys(q.anchors || {})) if (!ANCHORS.some(a => a.id === s.id && a.k === k && a.key === key)) warn(`${where(s.id, k)}: anchor "${key}" of the language pack is not used by the edit (check its spelling and its sentence)`);
});
const timeline = {
  _comment: `ProgBiz ERP product video ${TAG}, language ${LANG}${PACK.name ? ` (${PACK.name})` : ''} (beta.progbiz.io). Generated by scripts/video/beta/${ME} — edit the builder or the language pack, not this file.`,
  version: 1, width: 1920, height: 1080, fps: 30, duration: TOTAL, assets_root: '.', background: '#071527',
  brand: {
    name: 'ProgBiz ERP', tagline: T('Bringing your business workflow together'),
    logo: rel(path.join(CAP, 'white-logo-1600.png')),
    colors: { primary: '#0068EE', accent: '#85C0FF', ink: '#071527', paper: '#FFFFFF', muted: '#5B667A' },
  },
  scenes,
};
const voice = order.map(id => ({ file: rel(SEC[id].file), start_s: r3(SEC[id].V), gain: 1.0 }));
const missingAudio = voice.filter(v => !fs.existsSync(path.join(ROOT, v.file))).map(v => v.file);
if (missingAudio.length) warn(`${missingAudio.length} narration file(s) named by the cues do not exist yet, first: ${missingAudio[0]}`);
COMPOSITES.forEach(writeComposite);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `timeline_${TAG}.json`), JSON.stringify(timeline, null, 1));
fs.writeFileSync(path.join(OUT, `voice_cues_${TAG}.json`), JSON.stringify(voice, null, 1));
fs.writeFileSync(path.join(OUT, `sections_${TAG}.json`), JSON.stringify({ total: TOTAL, sections: order.map(id => ({ id, start: r3(SEC[id].S), voice: r3(SEC[id].V), end: r3(SEC[id].E) })) }, null, 1));
const anchorsOut = ANCHORS.map(a => ({ section: a.id, sentence: a.k + 1, anchor: a.key, phrase: a.phrase, position: `${a.pos}/${a.len}`, time_s: r3(a.t) }));
if (opt('--report')) fs.writeFileSync(path.resolve(process.cwd(), opt('--report')), JSON.stringify({ lang: LANG, tag: TAG, cues: rel(CUES_FILE), count: COUNT, total: TOTAL, narration_s: r3(speech), tail_per_section_s: r3(tail), warnings: WARN, anchors: anchorsOut }, null, 1));

console.log(`language ${LANG}, tag ${TAG}, characters counted as ${COUNT}s`);
console.log(`total ${TOTAL} s, narration ${speech.toFixed(1)} s, tail per section ${tail.toFixed(2)} s`);
for (const id of order) console.log(`  ${id.padEnd(16)} ${SEC[id].S.toFixed(2).padStart(7)} -> ${SEC[id].E.toFixed(2).padStart(7)}   voice at ${SEC[id].V.toFixed(2)}`);
console.log(`scenes: ${scenes.length}`);
for (const s of scenes) console.log(`  ${s.id.padEnd(12)} ${s.start.toFixed(2).padStart(7)} -> ${s.end.toFixed(2).padStart(7)}  (${(s.end - s.start).toFixed(2)} s)  ${s.source.type}`);
if (VERBOSE) {
  console.log(`anchors: ${anchorsOut.length}`);
  for (const a of anchorsOut) console.log(`  ${a.section.padEnd(16)} s${a.sentence}  ${a.time_s.toFixed(2).padStart(7)} s  ${a.position.padStart(7)}  "${a.anchor}"${a.phrase !== a.anchor ? `  =  "${a.phrase}"` : ''}`);
}
console.log(`wrote ${rel(path.join(OUT, `timeline_${TAG}.json`))}, voice_cues_${TAG}.json, sections_${TAG}.json${COMPOSITES.length ? `, cap/${COMPOSITES.map(c => c.id).join(', cap/')}` : ''}`);
for (const w of WARN) console.log(`warning: ${w}`);
console.log(WARN.length ? `${WARN.length} warning(s)` : 'no warnings');
