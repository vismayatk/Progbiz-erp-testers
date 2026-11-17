#!/usr/bin/env node
'use strict';
/**
 * Progbiz ERP Knowledge Transfer (KT) video builder.
 *
 * storyboard.json (chapters -> beats; every beat = narration + one visual) + one WAV per sentence
 *   -> compositor timeline, narration WAV, subtitles (SRT, also drawn on screen), chapter list,
 *      then render (compose/render.js), encode (Swift encoder) and mux subtitles + chapters (ffmpeg).
 *
 *   node scripts/video/kt/build_kt.js --lang en --script-only       write reports/video/kt/script_en.json (for make_voice.py)
 *   node scripts/video/kt/build_kt.js --lang en [--placeholder]     timeline + narration + srt (placeholder = estimated timing, no audio)
 *   node scripts/video/kt/build_kt.js --lang en --render [--from s --to s] [--encode] [--workers N]
 *
 * Run from the repository root. Footage comes from make_footage.py (reports/video/kt/footage/<clip>/),
 * voice from make_voice.py (reports/video/kt/voice/<lang>/), privacy masks from privacy_masks.py.
 * Beat timing: the narration sets the length; the footage range of a beat is played at a speed that fits
 * (never faster than max_speed, which lengthens the beat instead) and holds its last frame if it is shorter.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const KT = path.join(ROOT, 'reports', 'video', 'kt');
const rel = p => path.relative(ROOT, p);

// ------------------------------------------------------------------ args
const A = { lang: 'en', scriptOnly: false, placeholder: false, render: false, encode: false, from: null, to: null, workers: null, storyboard: path.join(__dirname, 'storyboard.json') };
for (let i = 2; i < process.argv.length; i++) {
  const v = process.argv[i];
  if (v === '--lang') A.lang = process.argv[++i];
  else if (v === '--script-only') A.scriptOnly = true;
  else if (v === '--placeholder') A.placeholder = true;
  else if (v === '--render') A.render = true;
  else if (v === '--encode') A.encode = true;
  else if (v === '--from') A.from = +process.argv[++i];
  else if (v === '--to') A.to = +process.argv[++i];
  else if (v === '--workers') A.workers = +process.argv[++i];
  else if (v === '--storyboard') A.storyboard = path.resolve(process.argv[++i]);
  else throw new Error(`unknown option ${v}`);
}
const L = A.lang;
const SB = JSON.parse(fs.readFileSync(A.storyboard, 'utf8'));
const pick = (o, k) => (o == null ? null : o[`${k}_${L}`] != null ? o[`${k}_${L}`] : o[k] != null ? o[k] : o[`${k}_en`]);

// ------------------------------------------------------------------ sentences
// a sentence ends at . ! ? followed by a space (so 98.81 or 35.1 never split)
const splitSentences = s => String(s || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
const beats = [];
for (const ch of SB.chapters) for (const b of ch.beats) beats.push({ ch, b });
for (const x of beats) {
  x.sentences = splitSentences(pick(x.b, 'say')).map((text, k) => ({ id: `${x.b.id}_${k + 1}`, text }));
}
const allSentences = beats.flatMap(x => x.sentences);
{
  const seen = new Set();
  for (const x of beats) { if (seen.has(x.b.id)) throw new Error(`duplicate beat id ${x.b.id}`); seen.add(x.b.id); }
}
if (A.scriptOnly) {
  const out = path.join(KT, `script_${L}.json`);
  fs.writeFileSync(out, JSON.stringify({ lang: L, sentences: allSentences }, null, 1));
  const words = allSentences.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  console.log(`${allSentences.length} sentences, ${words} words -> ${rel(out)}`);
  process.exit(0);
}

// ------------------------------------------------------------------ durations
let DUR = {};
const voiceDir = path.join(KT, 'voice', L);
if (A.placeholder) {
  const cps = L === 'ml' ? 13 : 15;
  for (const s of allSentences) DUR[s.id] = Math.max(1.2, s.text.length / cps);
} else {
  DUR = JSON.parse(fs.readFileSync(path.join(voiceDir, 'durations.json'), 'utf8')).durations;
  const miss = allSentences.filter(s => DUR[s.id] == null);
  if (miss.length) throw new Error(`no voice for ${miss.length} sentence(s), e.g. ${miss[0].id} - run make_voice.py --lang ${L}`);
}

// ------------------------------------------------------------------ constants
const T = Object.assign({ lead: 0.35, gap: 0.34, tail: 0.5, card_min: 3.2, max_speed: 2.2, xfade: 0.4 }, SB.timing || {});
const W = 1920, H = 1080;
const STAGE = SB.stage || { scale: 0.85, y: 58, radius: 20 };
const meta = {};
function footage(id) {
  if (!meta[id]) {
    const f = path.join(KT, 'footage', id, 'meta.json');
    if (!fs.existsSync(f)) throw new Error(`footage ${id} not cut yet (${rel(f)}) - run make_footage.py`);
    meta[id] = JSON.parse(fs.readFileSync(f, 'utf8'));
    const mf = path.join(KT, 'footage', id, 'masks.json');
    meta[id].masks = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')).masks : [];
    meta[id].dur = meta[id].frames[meta[id].frames.length - 1].t_ms / 1000;
  }
  return meta[id];
}
// source-recording pixels -> footage pixels
function mapBox(m, b) {
  const g = m.geometry, [ax, ay] = g.app_rect;
  return [Math.round((b[0] - ax) * g.scale + g.ox), Math.round((b[1] - ay) * g.scale + g.oy), Math.round(b[2] * g.scale), Math.round(b[3] * g.scale)];
}
// OCR of the footage (5 samples/s, written by privacy_masks.py): [{ t, items: [{ text, box }] }], footage px
function ocrSamples(m, id) {
  if (!m.ocr) {
    const f = path.join(KT, 'footage', id, 'ocr_samples.json');
    const raw = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    const tOf = new Map(m.frames.map(fr => [fr.file, fr.t_ms / 1000]));
    m.ocr = Object.entries(raw).map(([file, items]) => ({ t: tOf.get(file), items })).filter(s => s.t != null).sort((a, b) => a.t - b.t);
  }
  return m.ocr;
}
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9ഀ-ൿ]+/g, '');
// Where a label is on screen between clip times t0 and t1: keys [{ t, rect }] in footage px, following it if it moves.
// spec: { label, expand: [left, top, right, bottom], near: source-px box to pick among repeats, box: fallback source-px box }
function locate(m, id, spec, t0, t1, who) {
  const want = norm(spec.label);
  const near = spec.near ? mapBox(m, spec.near) : spec.box ? mapBox(m, spec.box) : null;
  const ex = spec.expand || [8, 6, 8, 6];
  const keys = [];
  for (const s of ocrSamples(m, id)) {
    if (s.t < t0 - 0.21 || s.t > t1 + 0.21) continue;
    let best = null;
    for (const it of s.items) {
      const n = norm(it.text);
      if (!n) continue;
      let score = n === want ? 3 : n.startsWith(want) && n.length <= want.length + 3 ? 2 : (want.length >= 5 && n.includes(want)) ? 1 : 0;
      if (!score) continue;
      const d = near ? Math.hypot(it.box[0] - near[0], it.box[1] - near[1]) : 0;
      const val = score * 10000 - d;
      if (!best || val > best.val) best = { val, box: it.box };
    }
    if (best) keys.push({ t: s.t, rect: [best.box[0] - ex[0], best.box[1] - ex[1], best.box[2] + ex[0] + ex[2], best.box[3] + ex[1] + ex[3]] });
  }
  if (!keys.length) {
    if (spec.box) { warnings.push(`${who}: label "${spec.label}" not found by OCR in clip ${id} ${t0.toFixed(1)}-${t1.toFixed(1)} s; using its box`); return [{ t: t0, rect: mapBox(m, spec.box) }]; }
    warnings.push(`${who}: label "${spec.label}" not found in clip ${id} ${t0.toFixed(1)}-${t1.toFixed(1)} s - dropped`);
    return null;
  }
  // drop OCR jitter: keep a key only when the box moved by more than 3 px
  const out = [keys[0]];
  for (const k of keys.slice(1)) {
    const p = out[out.length - 1].rect;
    if (k.rect.some((v, i) => Math.abs(v - p[i]) > 3)) out.push(k);
  }
  out.first = keys[0].t; out.last = keys[keys.length - 1].t;
  return out;
}
const rectOf = (keys, t) => { let r = keys[0].rect; for (const k of keys) if (k.t <= t + 1e-6) r = k.rect; return r; };

// ------------------------------------------------------------------ layout
const scenes = [], audio = [], captions = [], chapters = [], barItems = [], warnings = [];
let t = 0, prev = null;

function narrate(x, t0) {
  let k = t0 + T.lead;
  for (const s of x.sentences) {
    s.start = k; s.dur = DUR[s.id]; s.end = k + s.dur;
    if (!A.placeholder) audio.push({ file: path.join(voiceDir, `${s.id}.wav`), start_s: +k.toFixed(3) });
    k = s.end + T.gap;
  }
  return x.sentences.length ? x.sentences[x.sentences.length - 1].end - t0 + T.tail : 0;
}

function timeMap(from, to, D, mode) {
  const Ls = to - from;
  if (mode === 'freeze' || Ls <= 0.001) return [{ t: 0, src: from }, { t: D, src: from }];
  if (Ls <= D) {
    const delay = mode === 'end' ? D - Ls : Math.min(T.lead, D - Ls);
    return [{ t: 0, src: from }, { t: delay, src: from }, { t: delay + Ls, src: to }, { t: D, src: to }];
  }
  return [{ t: 0, src: from }, { t: D, src: to }];
}
// scene time at which source time s (clip-relative) is shown
function lt(map, s) {
  if (s <= map[0].src) return 0;
  for (let i = 0; i < map.length - 1; i++) {
    const a = map[i], b = map[i + 1];
    if (b.src > a.src && s >= a.src && s <= b.src) return a.t + (s - a.src) / (b.src - a.src) * (b.t - a.t);
  }
  return map[map.length - 1].t;
}
const camState = c => ({ zoom: c.zoom, focus: c.focus ? c.focus.slice() : undefined, rect: c.rect ? c.rect.slice() : undefined, padding: c.padding });

// storyboard times are seconds of the SOURCE recording when SB.times === 'source'; the footage counts from the clip start
function toClipTimes(v0) {
  if (SB.times !== 'source' || !(v0.type === 'footage' || v0.type === 'still')) return v0;
  const off = footage(v0.clip).key.src_start;
  const v = JSON.parse(JSON.stringify(v0));
  const sh = (o, keys) => { for (const k of keys) if (typeof o[k] === 'number') o[k] = +(o[k] - off).toFixed(3); };
  sh(v, ['from', 'to', 'at']);
  for (const z of v.zoom || []) sh(z, ['at']);
  for (const h of v.hl || []) sh(h, ['from', 'to']);
  for (const c of v.callouts || []) sh(c, ['at', 'to']);
  for (const mk of v.masks || []) sh(mk, ['from', 'to']);
  return v;
}

for (const x of beats) {
  const { ch, b } = x;
  const v = toClipTimes(b.visual || { type: 'none' });
  const t0 = t;
  let D = Math.max(narrate(x, t0), b.min || 0);
  if (!ch._started) {
    ch._started = true;
    chapters.push({ id: ch.id, number: ch.number, title: pick(ch, 'title'), start: t0 });
  }
  let sc;
  if (v.type === 'title' || v.type === 'section' || v.type === 'summary' || v.type === 'end') {
    D = Math.max(D, T.card_min);
    const src = { type: 'card', card: v.type === 'summary' ? 'section' : v.type, theme: 'dark', background: SB.card_background || '#06101F' };
    if (v.type === 'title') Object.assign(src, { title: pick(v, 'title'), subtitle: pick(v, 'subtitle') });
    if (v.type === 'section') Object.assign(src, { eyebrow: pick(v, 'eyebrow'), title: pick(v, 'title'), subtitle: pick(v, 'subtitle'), title_size: v.title_size || 92 });
    if (v.type === 'summary') Object.assign(src, { eyebrow: pick(v, 'eyebrow'), title: pick(v, 'title'), points: pick(v, 'points'), title_size: 72, points_size: L === 'ml' ? 31 : 33 });
    if (v.type === 'end') Object.assign(src, { card: 'end', title: pick(v, 'title'), cta: pick(v, 'cta'), footnote: pick(v, 'footnote') || '' });
    sc = { id: b.id, source: src, transition: { type: 'crossfade', duration: T.xfade } };
  } else if (v.type === 'motion') {
    D = Math.max(D, v.min || 0);
    sc = { id: b.id, source: JSON.parse(JSON.stringify(v.source)), transition: { type: 'crossfade', duration: T.xfade } };
    const s = sc.source;
    // motion beats are authored in seconds of the English cut; stretch them to this beat's length
    const k = v.authored ? D / v.authored : 1;
    if (k !== 1) {
      const sc1 = a => (Array.isArray(a) ? a.map(n => +(n * k).toFixed(3)) : typeof a === 'number' ? +(a * k).toFixed(3) : a);
      for (const key of ['window', 'converge', 'scatter', 'dim', 'logo_at', 'text_out', 'tagline_at']) if (s[key] != null) s[key] = sc1(s[key]);
      for (const c of s.cards || []) c.t = sc1(c.t);
      for (const q of s.questions || []) q.t = sc1(q.t);
    }
    for (const q of s.questions || []) if (q[`text_${L}`]) q.text = q[`text_${L}`];
    for (const c of s.cards || []) { if (c[`title_${L}`]) c.title = c[`title_${L}`]; if (c[`sub_${L}`]) c.sub = c[`sub_${L}`]; }
    if (s[`tagline_${L}`]) s.tagline = s[`tagline_${L}`];
  } else if (v.type === 'footage' || v.type === 'still') {
    const m = footage(v.clip);
    const from = v.type === 'still' ? v.at : v.from, to = v.type === 'still' ? v.at : v.to;
    if (from < -0.01 || to > m.dur + 0.2) warnings.push(`${b.id}: range ${from}-${to} outside clip ${v.clip} (0-${m.dur.toFixed(1)})`);
    const maxSp = v.max_speed || T.max_speed;
    if (to - from > D * maxSp) D = (to - from) / maxSp;
    const map = timeMap(from, to, D, v.type === 'still' ? 'freeze' : v.mode);
    sc = { id: b.id, source: { type: 'shot', dir: rel(path.join(KT, 'footage', v.clip)), time_map: map } };
    const contiguous = prev && prev.clip === v.clip && Math.abs((prev.to || 0) - from) < 0.25 && v.type !== 'still';
    sc.transition = contiguous ? { type: 'cut' } : prev && prev.clip ? { type: v.transition || 'stage_push', duration: 0.5 } : { type: 'crossfade', duration: T.xfade };
    // camera
    const start = contiguous && prev.cam ? prev.cam : camState(v.camera0 || SB.camera0 || { zoom: 1 });
    const keys = [Object.assign({ t: 0 }, start)];
    let cur = start;
    for (const z of v.zoom || []) {
      const at = Math.max(0, Math.min(D, lt(map, z.at)));
      const move = z.move == null ? 0.8 : z.move;
      let zr = null;
      if (z.label) { const ks = locate(m, v.clip, z, z.at, z.at + 0.6, `${b.id} zoom`); if (ks) zr = rectOf(ks, z.at + 0.3); }
      else if (z.box) zr = mapBox(m, z.box);
      const nxt = z.out ? camState(SB.camera0 || { zoom: 1 }) : zr ? { rect: zr, zoom: z.zoom, padding: z.padding == null ? 60 : z.padding } : { zoom: z.zoom || 1, focus: z.focus ? mapBox(m, [z.focus[0], z.focus[1], 0, 0]).slice(0, 2) : undefined };
      const tPrev = keys[keys.length - 1].t;
      if (at - move > tPrev + 0.01) keys.push(Object.assign({ t: +(at - move).toFixed(3) }, cur));
      keys.push(Object.assign({ t: +Math.max(at, tPrev + 0.05).toFixed(3), ease: 'inOut' }, nxt));
      cur = nxt;
    }
    if (keys[keys.length - 1].t < D) keys.push(Object.assign({ t: +D.toFixed(3) }, cur));
    sc.camera = keys.map(k => { const o = Object.assign({}, k); for (const kk of Object.keys(o)) if (o[kk] === undefined) delete o[kk]; return o; });
    x.cam = cur;
    // highlights and callouts (times in clip seconds)
    const track = (spec, t0, t1, who) => {
      if (!spec.label) return spec.box ? { rect: mapBox(m, spec.box), first: t0, last: t1 } : null;
      const ks = locate(m, v.clip, spec, t0, t1, who);
      if (!ks) return null;
      // only while the label is on screen: a box left behind by scrolling would mark the wrong field
      const first = ks.first == null ? t0 : Math.max(t0, ks.first - 0.1), last = ks.last == null ? t1 : Math.min(t1, ks.last + 0.15);
      if (last < t1 - 0.5 || first > t0 + 0.5) warnings.push(`${who}: "${spec.label}" visible only ${first.toFixed(1)}-${last.toFixed(1)} s of ${t0.toFixed(1)}-${t1.toFixed(1)} s; shortened`);
      const base = { rect: ks[0].rect, first, last };
      return ks.length === 1 ? base : Object.assign(base, { keys: ks.map(k => ({ t: +lt(map, k.t).toFixed(3), rect: k.rect, ease: 'linear' })) });
    };
    sc.highlights = (v.hl || []).map((h, i) => {
      const tr = track(h, h.from, Math.min(h.to, to), `${b.id} hl${i + 1}`);
      if (!tr) return null;
      const o = { start: +lt(map, tr.first).toFixed(3), end: +(tr.last >= to - 0.01 ? D : lt(map, tr.last)).toFixed(3), rect: tr.rect, style: h.style || 'outline', radius: 10, padding: h.padding == null ? 4 : h.padding };
      if (tr.keys) o.rect_keys = tr.keys;
      return o;
    }).filter(Boolean);
    sc.callouts = (v.callouts || []).map((c, i) => {
      const o = { text: pick(c, 'text'), start: +lt(map, c.at).toFixed(3), end: +(c.to == null || c.to >= to ? D - 0.1 : lt(map, c.to)).toFixed(3), placement: c.placement || 'auto', size: c.size || 'normal' };
      if (c.label || c.box) {
        const tr = track(c, c.at, Math.min(c.to == null ? to : c.to, to), `${b.id} callout${i + 1}`);
        if (tr) {
          o.target = tr.rect; if (tr.keys) o.target_keys = tr.keys;
          o.start = +lt(map, Math.max(c.at, tr.first)).toFixed(3);
          if (tr.last < (c.to == null ? to : Math.min(c.to, to)) - 0.01) o.end = +lt(map, tr.last).toFixed(3);
        } else return null;
      }
      return o;
    }).filter(Boolean);
    // privacy masks that overlap this range
    sc.masks = [];
    for (const mk of m.masks) {
      if (mk.t1 < from - 0.01 || mk.t0 > to + 0.01) continue;
      const s0 = mk.t0 <= from ? 0 : lt(map, mk.t0);
      const s1 = mk.t1 >= to ? D + 1 : lt(map, mk.t1);
      sc.masks.push({ rect: mk.rect, start: +Math.max(0, s0 - 0.1).toFixed(3), end: +(s1 + 0.1).toFixed(3), style: 'blur', radius: mk.radius || 10, corner: 6 });
    }
    // storyboard masks: a source-px box, or a label (+ expand, footage px) that is followed while it is visible
    for (const [i, mk] of (v.masks || []).entries()) {
      const t0 = mk.from == null ? from : mk.from, t1 = mk.to == null ? to : mk.to;
      const o = { start: +Math.max(0, lt(map, t0) - 0.15).toFixed(3), end: +(t1 >= to - 0.01 ? D + 1 : lt(map, t1) + 0.15).toFixed(3), style: 'blur', radius: 14, corner: 8 };
      if (mk.label) {
        const tr = track(mk, t0, t1, `${b.id} mask${i + 1}`);
        if (!tr) continue;
        o.rect = tr.rect; if (tr.keys) o.rect_keys = tr.keys;
      } else o.rect = mapBox(m, mk.box);
      sc.masks.push(o);
    }
    x.clip = v.clip; x.to = to;
  } else {
    throw new Error(`${b.id}: unknown visual type ${v.type}`);
  }
  sc.start = +t0.toFixed(3); sc.end = +(t0 + D).toFixed(3);
  scenes.push(sc);
  if (v.type === 'footage' || v.type === 'still') barItems.push({ start: sc.start, end: sc.end, chapter: ch });
  prev = { clip: x.clip, to: x.to, cam: x.cam };
  t = t0 + D;
}
const total = +(t + 0.6).toFixed(3);
scenes[scenes.length - 1].end = total;

// chapter bar: merge consecutive footage scenes of a chapter into one item
const bar = [];
for (const it of barItems) {
  const last = bar[bar.length - 1];
  if (last && last.ch === it.chapter && Math.abs(last.end - it.start) < 0.01) last.end = it.end;
  else bar.push({ ch: it.chapter, start: it.start, end: it.end });
}
const chapterLabel = ch => (ch.number ? `${pick(SB.labels, 'module') || 'MODULE'} ${ch.number}  ·  ${String(pick(ch, 'title')).toUpperCase()}` : String(pick(ch, 'title')).toUpperCase());

// ------------------------------------------------------------------ captions
const CAP_MAX = L === 'ml' ? 74 : 86;
function chunks(text) {
  if (text.length <= CAP_MAX) return [text];
  const words = text.split(' ');
  const n = Math.ceil(text.length / CAP_MAX);
  const target = text.length / n;
  const out = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    const soft = /[,;:]$/.test(cur) && cur.length > target * 0.6;
    if (cur && (trial.length > CAP_MAX || (cur.length >= target && out.length < n - 1) || soft)) { out.push(cur); cur = w; } else cur = trial;
  }
  if (cur) out.push(cur);
  return out;
}
for (const x of beats) for (const s of x.sentences) {
  const parts = chunks(s.text);
  const totalChars = parts.reduce((n, p) => n + p.length, 0);
  let k = s.start;
  parts.forEach((p, i) => {
    const d = s.dur * p.length / totalChars;
    captions.push({ start: +k.toFixed(3), end: +(i === parts.length - 1 ? s.end + 0.25 : k + d).toFixed(3), text: p });
    k += d;
  });
}
for (let i = 0; i < captions.length - 1; i++) if (captions[i].end > captions[i + 1].start - 0.04) captions[i].end = +(captions[i + 1].start - 0.04).toFixed(3);

// ------------------------------------------------------------------ write
const tag = A.placeholder ? `${L}_placeholder` : L;
const timeline = {
  _comment: 'Progbiz ERP KT video. Generated by scripts/video/kt/build_kt.js from scripts/video/kt/storyboard.json - edit those, not this file.',
  version: 1, width: W, height: H, fps: 30, duration: total, assets_root: '.', background: '#06101F',
  stage: STAGE,
  brand: { name: 'Progbiz ERP', tagline: pick(SB, 'tagline') || '', logo: 'reports/video/beta/cap/white-logo-1600.png',
    colors: { primary: '#0068EE', accent: '#85C0FF', ink: '#071527', paper: '#FFFFFF', muted: '#5B667A' } },
  captions: { cues: captions, y: 1028, size: L === 'ml' ? 29 : 31, max_width: 1580 },
  chapter_bar: { y: 30, size: 21, x_left: 146, x_right: W - 146, items: bar.map(it => ({ start: it.start, end: it.end, left: chapterLabel(it.ch), right: pick(SB.labels, 'right') || 'Progbiz ERP  ·  Knowledge Transfer' })) },
  scenes,
};
const outDir = path.join(KT, 'build');
fs.mkdirSync(outDir, { recursive: true });
const tlFile = path.join(outDir, `timeline_${tag}.json`);
fs.writeFileSync(tlFile, JSON.stringify(timeline, null, 1));

const fmt = s => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(r).padStart(3, '0')}`; };
const srt = captions.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join('\n');
fs.writeFileSync(path.join(outDir, `subtitles_${tag}.srt`), srt);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
fs.writeFileSync(path.join(outDir, `chapters_${tag}.json`), JSON.stringify({ duration: total, chapters }, null, 1));
fs.writeFileSync(path.join(outDir, `chapters_${tag}.txt`), chapters.map(c => `${mmss(c.start)}  ${c.number ? `${c.number}. ` : ''}${c.title}`).join('\n') + '\n');
// ffmpeg chapter metadata
const ffmeta = [';FFMETADATA1', `title=${pick(SB, 'video_title') || 'Progbiz ERP Knowledge Transfer'}`];
chapters.forEach((c, i) => { const end = i + 1 < chapters.length ? chapters[i + 1].start : total; ffmeta.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.start * 1000)}`, `END=${Math.round(end * 1000)}`, `title=${c.number ? `${c.number}. ` : ''}${c.title}`); });
fs.writeFileSync(path.join(outDir, `chapters_${tag}.ffmeta`), ffmeta.join('\n') + '\n');
// sentence timing (for the scripts and the checks)
fs.writeFileSync(path.join(outDir, `sentences_${tag}.json`), JSON.stringify(beats.flatMap(x => x.sentences.map(s => ({ chapter: x.ch.id, beat: x.b.id, id: s.id, start: +s.start.toFixed(3), end: +s.end.toFixed(3), text: s.text }))), null, 1));

console.log(`timeline ${rel(tlFile)}: ${scenes.length} scenes, ${mmss(total)} (${total.toFixed(1)} s), ${captions.length} captions, ${chapters.length} chapters`);
for (const c of chapters) console.log(`  ${mmss(c.start).padStart(6)}  ${c.number || '-'}  ${c.title}`);
for (const w of warnings) console.log(`  WARN ${w}`);

// narration
if (!A.placeholder) {
  const cuesFile = path.join(outDir, `narration_${L}.cues.json`);
  fs.writeFileSync(cuesFile, JSON.stringify(audio, null, 0));
  execFileSync('python3', [path.join(ROOT, 'scripts/video/encode/mixwav.py'), cuesFile, String(total), path.join(outDir, `narration_${L}.wav`), '--strict'], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`narration ${rel(path.join(outDir, `narration_${L}.wav`))}`);
}

// ------------------------------------------------------------------ render / encode
if (A.render) {
  const frames = path.join(outDir, `frames_${tag}`);
  const args = [path.join(ROOT, 'scripts/video/compose/render.js'), tlFile, frames];
  if (A.from != null) args.push('--from', String(A.from));
  if (A.to != null) args.push('--to', String(A.to));
  if (A.workers) args.push('--workers', String(A.workers));
  if (A.from == null && A.to == null) args.push('--clean');
  execFileSync('node', args, { stdio: 'inherit', cwd: ROOT });
  if (A.encode) {
    const name = SB.output_names && SB.output_names[L] ? SB.output_names[L] : `Progbiz_ERP_Complete_KT_${L}`;
    const raw = path.join(outDir, `${name}_noSubs.mp4`);
    execFileSync(path.join(ROOT, 'reports/video/build/bin/encode'), [frames, '30', A.placeholder ? 'none' : path.join(outDir, `narration_${L}.wav`), raw], { stdio: 'inherit' });
    const ff = process.env.KT_FFMPEG || 'ffmpeg';
    const final = path.join(KT, 'out', `${name}.mp4`);
    fs.mkdirSync(path.dirname(final), { recursive: true });
    const langCode = L === 'ml' ? 'mal' : 'eng';
    execFileSync(ff, ['-v', 'error', '-y', '-i', raw, '-i', path.join(outDir, `subtitles_${tag}.srt`), '-i', path.join(outDir, `chapters_${tag}.ffmeta`),
      '-map', '0:v', '-map', '0:a?', '-map', '1:s', '-map_metadata', '2', '-map_chapters', '2', '-c:v', 'copy', '-c:a', 'copy', '-c:s', 'mov_text',
      '-metadata:s:s:0', `language=${langCode}`, '-movflags', '+faststart', final], { stdio: 'inherit' });
    fs.copyFileSync(path.join(outDir, `subtitles_${tag}.srt`), final.replace(/\.mp4$/, '.srt'));
    console.log(`video ${rel(final)}`);
  }
}
