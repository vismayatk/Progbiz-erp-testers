'use strict';
/**
 * One command that joins the two finished Progbiz product videos into ONE film, in English or in Malayalam:
 *
 *   common introduction (from the CRM video)  ->  CRM chapter (Home ... WhatsApp)
 *   -> one bridge line into Work Flow          ->  Work Flow chapter (Dashboard ... Maintenance)
 *   -> one common closing
 *
 * English: nothing is re-written and nothing is re-recorded. Every spoken word is a sentence of the two existing scripts
 * (scripts/video/beta/vo_script_v4.json and scripts/video/workflow/vo_script_workflow.json) in the existing Kanika voice.
 * The Work Flow introduction (the problem statement) is dropped, because the common introduction already opens the film;
 * only its last sentence ("Progbiz Workflow turns every project into one clear, trackable process.") stays, as the bridge.
 *
 *   node scripts/video/combined/make_video_combined.js [--copy-to ~/Downloads]
 *
 * Malayalam: the picture is the English edit, re-timed. Every time in every scene (cuts, camera moves, highlights, callouts,
 * intro animation, sound effects) is moved with a piecewise-linear map that sends each English sentence to the same sentence of the
 * Malayalam narration (a feature mentioned at 40 % of an English sentence is shown at 40 % of the Malayalam sentence), and every
 * text on screen comes from scripts/video/combined/lang/ml.json. The narration is a recording of the 22 sections of
 * reports/video/combined/vo_script_combined.ml.json (written by this script together with a recording sheet):
 *
 *   node scripts/video/combined/make_video_combined.js --lang ml                      write the script, sheets and per-section text files only
 *   node scripts/video/combined/make_video_combined.js --lang ml --voice-dir DIR      DIR: one file per section (01.mp3 ... 22.mp3)
 *   node scripts/video/combined/make_video_combined.js --lang ml --voice-files a.mp3,b.mp3   parts in script order, each ending at a section end
 *   node scripts/video/combined/make_video_combined.js --lang ml --voice-file whole.mp3      one long recording
 *   node scripts/video/combined/make_video_combined.js --lang ml --skip-ingest        reuse reports/video/combined/audio_ml/<name>/cues.json
 *
 * Malayalam through a voice changer (the route used for the English Work Flow film): make the guide voice with
 * scripts/video/combined/make_ml_guide_voice.py, then
 *   node scripts/video/combined/make_video_combined.js --lang ml --skip-ingest --name Sobhana --prepare
 *        builds the timeline from the guide voice, renders the frames, and writes the voice-only parts (reports/video/combined/voice_parts_ml/)
 *        to put through the voice changer (it keeps the timing)
 *   node scripts/video/combined/make_video_combined.js --lang ml --skip-ingest --name Sobhana --skip-render --voice-swap p1.mp3,p2.mp3,p3.mp3 --copy-to ~/Downloads
 *        puts the changed parts back on the film (aligned by their loudness envelope, level-matched), mixes and exports
 *
 * Needs the finished runs of both English videos (their timelines, sentence times, Kanika voice tracks):
 *   reports/video/beta/{timeline_v4k,sections_v4k,sentences_v4k,sfx_v4k}.json, build/voice_v4k.wav
 *   reports/video/workflow/{timeline_wf,sections_wf,sentences_wf,sfx_wf}.json, build/voice_wf_kanika.wav
 * Options
 *   --lang en|ml     default en
 *   --name N         voice name (folder and file names)       default Kanika
 *   --out-name X     base name of the files
 *   --overrides F    hand corrections of sentence boundaries for ingest_recording.py (scripts/video/vo/INGEST.md)
 *   --prepare        Malayalam: build timeline, voice track and parts, render the frames, then stop (before music, mix and export)
 *   --voice-swap A,B Malayalam: the voice-changed parts, in order, to use instead of the guide voice
 *   --part-max S     longest voice part in seconds (default 200)
 *   --placeholder [F]  Malayalam only: no audio, the English timing x F (default 1.25), to check layout; implies --only-build
 *   --copy-to DIR    also copy MP4, share MP4, SRT and script sheet there (Malayalam: also the recording sheet and text files)
 *   --only-build     write timeline, voice and effects, then stop (to preview scenes with render.js --from/--to)
 *   --skip-render    reuse the frames of the last run
 *   --workers N      render workers                    default 6
 *   --dry-run        print the commands only
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readWav, writeWav16, integratedLoudness, SR } = require('../audio/lib.js');
const { alignShift } = require('./voice_align.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const BETA = path.join(ROOT, 'reports', 'video', 'beta');
const WF = path.join(ROOT, 'reports', 'video', 'workflow');
const OUTD = path.join(ROOT, 'reports', 'video', 'combined');
const LANGD = path.join(__dirname, 'lang');
const argv = process.argv.slice(2);
const flag = k => argv.includes(k);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const LANG = opt('--lang', 'en');
if (!['en', 'ml'].includes(LANG)) { console.error('--lang must be en or ml'); process.exit(2); }
const NAME = opt('--name', 'Kanika');
const TAG = LANG === 'en' ? 'combo' : `combo_${LANG}`;
const OUT = opt('--out-name', LANG === 'en' ? `Progbiz_ERP_CRM_Workflow_Video_${NAME}` : `Progbiz_ERP_CRM_Workflow_Video_Malayalam_${NAME}`);
const DRY = flag('--dry-run');
const PLACEHOLDER = flag('--placeholder');
const PREPARE = flag('--prepare');
const SWAP = opt('--voice-swap', null);
const r3 = v => Math.round(v * 1000) / 1000;
const rel = p => path.relative(ROOT, p);
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const EPS = 1e-6;
for (const d of ['build', 'audio', 'ml_text']) fs.mkdirSync(path.join(OUTD, d), { recursive: true });

// ------------------------------------------------------------ inputs
const v4 = readJson(path.join(BETA, 'timeline_v4k.json')), v4sec = readJson(path.join(BETA, 'sections_v4k.json')).sections;
const v4sent = readJson(path.join(BETA, 'sentences_v4k.json')), v4sfx = readJson(path.join(BETA, 'sfx_v4k.json'));
const wf = readJson(path.join(WF, 'timeline_wf.json')), wfsec = readJson(path.join(WF, 'sections_wf.json')).sections;
const wfsent = readJson(path.join(WF, 'sentences_wf.json')), wfsfx = readJson(path.join(WF, 'sfx_wf.json'));
const sec = (list, id) => { const s = list.find(x => x.id === id); if (!s) throw new Error(`no section ${id}`); return s; };
const sentOf = (list, id) => list.filter(x => x.section === id);

// ------------------------------------------------------------ the pieces and where they land
const CRM_END = sec(v4sec, '11_closing').start;            // CRM chapter = 0 .. here (its own closing is not used)
const WF_FROM = sec(wfsec, '02_dashboard').start;          // Work Flow chapter = here .. WF_TO (its introduction and closing are not used)
const WF_TO = sec(wfsec, '12_closing').start;
const bridgeSrc = sentOf(wfsent, '01_intro')[2];           // "Progbiz Workflow turns every project into one clear, trackable process."
const BS = CRM_END, BVS = r3(BS + 0.9), BVE = r3(BVS + (bridgeSrc.end_s - bridgeSrc.start_s));
const BWIN = [r3(BVE + 0.35 - BS), r3(BVE + 1.75 - BS)], BE = r3(BVE + 1.9);   // the same rhythm as the Work Flow introduction's ending
const DT = r3(BE - WF_FROM);                               // Work Flow time -> film time
const TOTAL_EN = r3(readJson(path.join(WF, 'sections_wf.json')).total + DT);
const lastCrm = sentOf(v4sent, '10_whatsapp').pop();
if (lastCrm.end_s > CRM_END - 0.3) throw new Error('the last CRM sentence runs into the closing');

// the 22 sections of the film, in order: ids 01-10 are the CRM video's, 11 the bridge, 12-22 the Work Flow video's (its number + 10)
const titles = { v4: {}, wf: {} };
for (const [k, f] of [['v4', 'scripts/video/beta/vo_script_v4.json'], ['wf', 'scripts/video/workflow/vo_script_workflow.json']]) for (const s of readJson(path.join(ROOT, f)).sections) titles[k][s.id] = s.title;
const wfId = id => String(Number(id.slice(0, 2)) + 10) + id.slice(2);
const shiftSent = (s, id) => ({ section: id, n: s.n, text: s.text, start_s: r3(s.start_s + DT), end_s: r3(s.end_s + DT) });
const SECS = [];
for (const s of v4sec.filter(x => x.id !== '11_closing')) SECS.push({ id: s.id, title: titles.v4[s.id], S: s.start, V: s.voice, E: s.end, sent: sentOf(v4sent, s.id).map(x => ({ section: s.id, n: x.n, text: x.text, start_s: x.start_s, end_s: x.end_s })) });
SECS.push({ id: '11_bridge', title: 'Work Flow', S: BS, V: BVS, E: BE, sent: [{ section: '11_bridge', n: 1, text: bridgeSrc.text, start_s: BVS, end_s: BVE }] });
for (const s of wfsec.filter(x => x.start >= WF_FROM - EPS)) SECS.push({ id: wfId(s.id), title: titles.wf[s.id], S: r3(s.start + DT), V: r3(s.voice + DT), E: r3(s.end + DT), sent: sentOf(wfsent, s.id).map(x => shiftSent(x, wfId(s.id))) });
if (SECS.length !== 22) throw new Error(`expected 22 sections, got ${SECS.length}`);
for (let i = 1; i < SECS.length; i++) if (Math.abs(SECS[i].S - SECS[i - 1].E) > 0.002) throw new Error(`sections ${SECS[i - 1].id} and ${SECS[i].id} do not touch`);
const enScript = {
  lang: 'en', _source: 'Combined Progbiz ERP film: the common introduction and CRM sections of vo_script_v4.json, the bridge sentence and the Work Flow sections of vo_script_workflow.json. Generated by scripts/video/combined/make_video_combined.js.',
  video: { width: 1920, height: 1080, fps: 30 },
  sections: SECS.map(s => ({ id: s.id, title: s.title, slot: [0, 60], sentences: s.sent.map(x => x.text) })),
};
fs.writeFileSync(path.join(OUTD, 'vo_script_combined.json'), JSON.stringify(enScript, null, 2) + '\n');

// ------------------------------------------------------------ scenes (English edit)
const shift = (sc, d) => Object.assign({}, sc, { start: r3(sc.start + d), end: r3(sc.end + d) });
let scenes = [];
v4.scenes.filter(s => s.end <= CRM_END + EPS).forEach(s => scenes.push(s));
if (Math.abs(scenes[scenes.length - 1].end - CRM_END) > EPS) throw new Error('CRM scenes do not end at the closing');

// bridge: the sentence on a dark title card, then the Work Flow dashboard opens into the stage frame
const idx = bridgeSrc.text.toLowerCase().indexOf('one clear') / bridgeSrc.text.length;
scenes.push({
  id: 'b_bridge', start: BS, end: BE,
  source: {
    type: 'motion', preset: 'intro', seed: 5, pings: false,
    images: { home: rel(path.join(WF, 'cap', 'wf_dash.jpg')) },
    questions: [
      { t: r3(BVS - BS - 0.15), text: 'Progbiz Workflow', y: 400 },
      { t: r3(BVS - BS + (BVE - BVS) * idx - 0.15), text: 'One clear, trackable process.', y: 516 },
    ],
    question_size: 76, text_out: r3(BVE - BS + 0.15),
    window: BWIN, window_from: [960 - 240, 660, 480, 270],
  },
  transition: { type: 'crossfade', duration: 0.45 },
});

// (scene ids must be unique in one timeline: both videos have a "d_top", so the Work Flow ids get a prefix)
wf.scenes.filter(s => s.start >= WF_FROM - EPS && s.end <= WF_TO + EPS).forEach(s => scenes.push(Object.assign(shift(s, DT), { id: 'wf_' + s.id })));

// closing: one montage that shows both modules while the Work Flow closing line is spoken, then the end card
const C = sentOf(wfsent, '12_closing'), C0 = C[0];
const at = phrase => C0.start_s + (C0.end_s - C0.start_s) * (C0.text.toLowerCase().indexOf(phrase) / C0.text.length);
const still = p => { if (!fs.existsSync(path.join(ROOT, p))) throw new Error(`missing still ${p}`); return { type: 'still', path: p, css_width: 1920, css_height: 1080 }; };
const CRMCAP = 'reports/video/beta/cap/', WFCAP = 'reports/video/workflow/cap/';
const beats = [
  [WF_TO, CRMCAP + 'home.jpg', [1088, 520]],
  [at('first enquiry') - 0.1, CRMCAP + 'leads_nature.jpg', [1088, 420]],
  [at('last service visit') - 0.1, WFCAP + 'wf_maint.jpg', [1088, 420]],
  [at('keeps every project') - 0.1, WFCAP + 'wf_status.jpg', [1088, 540]],
  [at('on track') - 0.1, WFCAP + 'wf_list_phases.jpg', [1088, 400]],
];
const endAt = C0.end_s + 0.35;
beats.forEach(([t0, p, f], i) => {
  const t1 = i < beats.length - 1 ? beats[i + 1][0] : endAt, d = r3(t1 - t0);
  scenes.push({
    id: `q_${i + 1}_${path.basename(p, '.jpg')}`, start: r3(t0 + DT), end: r3(t1 + DT), source: still(p),
    transition: i === 0 ? { type: 'stage_push', duration: 0.5 } : { type: 'crossfade', duration: 0.25 },
    camera: [{ t: 0, zoom: i % 2 ? 1.28 : 1.18, focus: f }, { t: d, zoom: i % 2 ? 1.18 : 1.3, focus: f, ease: 'linear' }],
  });
});
const qEnd = shift(wf.scenes.find(s => s.id === 'q_end'), DT);
if (Math.abs(qEnd.start - r3(endAt + DT)) > 0.002) throw new Error(`end card starts at ${qEnd.start}, montage ends at ${r3(endAt + DT)}`);
qEnd.start = scenes[scenes.length - 1].end;                 // the two differ by at most 2 ms (rounding)
qEnd.source = Object.assign({}, qEnd.source, { tagline: v4.brand.tagline + '.' });
scenes.push(qEnd);

// ------------------------------------------------------------ sound effects (English): the two sets, shifted
let sfx = v4sfx.filter(e => e.t < CRM_END + 0.6)                    // up to and including the chapter whoosh/impact at the bridge
  .concat([{ file: path.join(WF, 'audio', 'music', 'sfx', 'shimmer.wav'), t: r3(BVE - 0.2), gain_db: -16, pan: 0 }])
  .concat(wfsfx.filter(e => e.t >= WF_FROM - 0.5).map(e => Object.assign({}, e, { t: r3(e.t + DT) })));

let sentences = SECS.flatMap(s => s.sent);
let sectionStarts = SECS.slice(1).map(s => s.S);                    // where the music starts a new section
let TOTAL = TOTAL_EN;
let timeline = Object.assign({}, v4, {
  _comment: 'Progbiz ERP film: common introduction + CRM + Work Flow + common closing. Generated by scripts/video/combined/make_video_combined.js — edit the builder, not this file.',
});

// ------------------------------------------------------------ Malayalam: script, recording sheets, re-timed edit
const SHEET_DIR = path.join(OUTD, 'ml_text');
let MLSECS = null;                                                 // Malayalam: the new layout of the 22 sections (S, V, E)
let voiceCues = null;                                              // Malayalam: cues for mixwav.py
let ingestArgs = null;                                             // Malayalam: the ingest command, when a recording was given
if (LANG === 'ml') {
  const pack = readJson(path.join(LANGD, 'ml.json'));
  for (const s of SECS) {
    const t = pack.sentences[s.id];
    if (!t || t.length !== s.sent.length) throw new Error(`ml.json: section ${s.id} needs ${s.sent.length} sentences, has ${t ? t.length : 0}`);
    t.forEach(x => { if (/[‌‍]/.test(x) || x !== x.normalize('NFC')) throw new Error(`ml.json ${s.id}: ZWJ/ZWNJ or non-NFC text`); });
  }
  const mlScript = Object.assign({}, enScript, { lang: 'ml', sections: enScript.sections.map(s => Object.assign({}, s, { sentences: pack.sentences[s.id] })) });
  fs.writeFileSync(path.join(OUTD, 'vo_script_combined.ml.json'), JSON.stringify(mlScript, null, 2) + '\n');
  writeMlSheets(pack);

  // timing of the Malayalam narration: cues.json of the recording, or the English timing x F as a placeholder
  const cuesFile = path.join(OUTD, 'audio_ml', NAME, 'cues.json');
  let cues;
  if (PLACEHOLDER) {
    const F = Number(opt('--placeholder', 1.25)) || 1.25;
    cues = { sections: SECS.map(s => ({ id: s.id, file: null, sentences: s.sent.map(x => ({ start_s: 0.15 + (x.start_s - s.V) * F, duration_s: (x.end_s - x.start_s) * F })) })) };
    console.log(`placeholder timing: English x ${F}, no audio`);
  } else if (flag('--voice-dir') || flag('--voice-file') || flag('--voice-files')) {
    const o = rel(path.join(OUTD, 'audio_ml', NAME));
    const base = ['scripts/video/vo/ingest_recording.py', '--script', rel(path.join(OUTD, 'vo_script_combined.ml.json')), '--out', o, '--label', `Malayalam - ${NAME}`, '--quiet'];
    if (opt('--overrides', null)) base.push('--overrides', opt('--overrides'));
    if (flag('--voice-dir')) ingestArgs = base.concat(['--in', opt('--voice-dir')]);
    else if (flag('--voice-file')) ingestArgs = base.concat(['--single', opt('--voice-file')]);
    else ingestArgs = base.concat(['--single', rel(joinParts(opt('--voice-files').split(',')))]);
    if (!DRY) {
      console.log(`ingest: python3 ${ingestArgs.join(' ')}`);
      const r = spawnSync('python3', ingestArgs, { cwd: ROOT, stdio: 'inherit' });
      if (r.status !== 0) { console.error('ingest failed'); process.exit(r.status || 1); }
    }
    cues = fs.existsSync(cuesFile) ? readJson(cuesFile) : null;
  } else if (flag('--skip-ingest')) cues = readJson(cuesFile);
  if (!cues) {
    copyMlSheets();
    console.log(`\nMalayalam script, recording sheet and per-section text files are ready in ${rel(OUTD)}.`);
    console.log('Give the recording with --voice-dir / --voice-files / --voice-file (or --skip-ingest) to build the film; --placeholder checks the layout without audio.');
    process.exit(0);
  }

  // new section layout: the lead and the tail of every section stay as in the English edit, the voice takes as long as the recording
  const by = Object.fromEntries(cues.sections.map(s => [s.id, s]));
  const knots = [];
  let t0 = 0;
  const L = [];                                                    // per section: new S, V, E and sentences
  for (const s of SECS) {
    const c = by[s.id];
    if (!c || (!PLACEHOLDER && c.present === false)) throw new Error(`no recording for section ${s.id}`);
    if (c.sentences.length !== s.sent.length) throw new Error(`section ${s.id}: recording has ${c.sentences.length} sentences, the script ${s.sent.length}`);
    const f0 = c.sentences[0].start_s, last = c.sentences[c.sentences.length - 1];
    const span = last.start_s + last.duration_s - f0;
    const lead = s.V - s.S, tail = s.E - s.sent[s.sent.length - 1].end_s;
    const S2 = t0, V2 = S2 + lead, E2 = V2 + span + tail;
    const sents = c.sentences.map((x, k) => ({ section: s.id, n: k + 1, text: pack.sentences[s.id][k], start_s: r3(V2 + x.start_s - f0), end_s: r3(V2 + x.start_s - f0 + x.duration_s) }));
    knots.push([s.S, S2], [s.V, V2]);
    s.sent.forEach((x, k) => knots.push([x.start_s, sents[k].start_s], [x.end_s, sents[k].end_s]));
    knots.push([s.E, E2]);
    L.push({ id: s.id, S: S2, V: V2, E: E2, f0, file: c.file ? path.join(path.dirname(cuesFile), c.file) : null, sents });
    t0 = E2;
  }
  const warp = makeWarp(knots);
  const miss = new Set();
  const tx = v => { if (typeof v !== 'string') return v; const m = pack.screen_text[v]; if (m == null) { miss.add(v); return v; } return m; };
  scenes = scenes.map(sc => retime(sc, warp, tx));
  if (miss.size) throw new Error(`ml.json screen_text lacks ${miss.size} text(s):\n  ${[...miss].join('\n  ')}`);
  sfx = sfx.map(e => Object.assign({}, e, { t: r3(warp(e.t)) }));
  sentences = L.flatMap(x => x.sents);
  sectionStarts = L.slice(1).map(x => r3(x.S));
  TOTAL = r3(L[L.length - 1].E);
  timeline.brand = Object.assign({}, timeline.brand, { tagline: tx(timeline.brand.tagline) });
  MLSECS = L;
  voiceCues = PLACEHOLDER ? null : L.map(x => ({ file: rel(x.file), start_s: r3(x.V - x.f0), gain: 1.0 }));
  const lens = L.map((x, i) => `${x.id.padEnd(15)} ${(x.E - x.S).toFixed(1).padStart(6)} s (English ${(SECS[i].E - SECS[i].S).toFixed(1)} s)`);
  console.log(lens.join('\n'));
}

for (let i = 1; i < scenes.length; i++) {
  if (Math.abs(scenes[i].start - scenes[i - 1].end) > 0.002) throw new Error(`gap/overlap between ${scenes[i - 1].id} (${scenes[i - 1].end}) and ${scenes[i].id} (${scenes[i].start})`);
  if (scenes[i].end - scenes[i].start < 0.6) throw new Error(`scene ${scenes[i].id} is too short: ${(scenes[i].end - scenes[i].start).toFixed(2)} s`);
}
scenes[scenes.length - 1].end = TOTAL;
timeline = Object.assign(timeline, { duration: TOTAL, scenes });
const p = f => path.join(OUTD, f);
fs.writeFileSync(p(`timeline_${TAG}.json`), JSON.stringify(timeline, null, 1));
fs.writeFileSync(p(`sentences_${TAG}.json`), JSON.stringify(sentences, null, 1));
fs.writeFileSync(p(`sfx_${TAG}.json`), JSON.stringify(sfx.sort((a, b) => a.t - b.t), null, 1));
if (voiceCues) fs.writeFileSync(p(`voice_cues_${TAG}.json`), JSON.stringify(voiceCues, null, 1));

// script sheet: the narration in reading order
{
  const sheet = [`# Progbiz ERP: CRM and Work Flow in one film${LANG === 'ml' ? ' (Malayalam)' : ''}`, '', `Length ${clock(TOTAL)}. ${LANG === 'ml' ? 'Malayalam narration of the combined film.' : 'Every sentence is from the two approved scripts; the Work Flow introduction is replaced by the common introduction.'}`, ''];
  let cur = null;
  for (const s of sentences) {
    if (s.section !== cur) { sheet.push('', `## ${(SECS.find(x => x.id === s.section) || {}).title || s.section} (${clock(s.start_s)})`, ''); cur = s.section; }
    sheet.push(s.text);
  }
  fs.writeFileSync(p(`${OUT}_script.md`), sheet.join('\n') + '\n');
}

// ------------------------------------------------------------ narration track
const OUTRO = r3(sentences[sentences.length - 1].start_s - 0.19);
const frames = rel(p(`build/frames_${TAG}`));
let GAIN_DB = 0;
if (LANG === 'en') {
  // the two Kanika tracks, level-matched
  const rv = readWav(path.join(BETA, 'build', 'voice_v4k.wav')), rw = readWav(path.join(WF, 'build', 'voice_wf_kanika.wav'));
  for (const [n, w] of [['voice_v4k', rv], ['voice_wf_kanika', rw]]) if (w.sr !== SR || w.ch !== 1) throw new Error(`${n} must be 48 kHz mono`);
  GAIN_DB = r3(integratedLoudness(rv.chans) - integratedLoudness(rw.chans));    // bring the Work Flow track to the CRM track's loudness
  const GAIN = Math.pow(10, GAIN_DB / 20);
  const voice = new Float32Array(Math.round(TOTAL * SR));
  const place = (src, a0, a1, to, g) => {
    const a = Math.round(a0 * SR), b = Math.min(src.length, Math.round(a1 * SR)), d = Math.round(to * SR), F = Math.round(0.025 * SR);
    for (let i = a; i < b; i++) {
      const j = d + (i - a);
      if (j < 0 || j >= voice.length) continue;
      const k = Math.min(i - a, b - 1 - i);
      voice[j] += src[i] * g * (k < F ? 0.5 - 0.5 * Math.cos(Math.PI * k / F) : 1);
    }
  };
  place(rv.chans[0], 0, CRM_END, 0, 1);                                                          // intro + CRM sentences
  place(rw.chans[0], bridgeSrc.start_s - 0.25, bridgeSrc.end_s + 0.3, BVS - 0.25, GAIN);         // the bridge sentence
  place(rw.chans[0], WF_FROM, rw.frames / SR, WF_FROM + DT, GAIN);                               // Work Flow sentences + closing
  writeWav16(p(`build/voice_${TAG}.wav`), [voice], SR);
}

console.log(`film ${TOTAL} s (${clock(TOTAL)}), ${scenes.length} scenes, ${sentences.length} sentences, ${sfx.length} effects`);
if (LANG === 'en') console.log(`  Work Flow voice level raised ${GAIN_DB} dB to match the CRM voice; outro at ${OUTRO}`);
if (flag('--only-build') || PLACEHOLDER) { console.log('built, stopping (--only-build / --placeholder)'); process.exit(0); }

// ------------------------------------------------------------ frames, music, mix, export
let step = 0;
function run(title, cmd, args) {
  step++;
  console.log(`\n[${step}] ${title}\n    ${[cmd].concat(args.map(a => (/\s/.test(a) ? JSON.stringify(a) : a))).join(' ')}`);
  if (DRY) return;
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\nFAILED at step ${step} (${title}), exit ${r.status}`); process.exit(r.status || 1); }
  console.log(`    done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
const o = f => rel(p(f));
if (LANG === 'ml' && !SWAP) run('voice track (the recorded sections placed on the film)', 'python3', ['scripts/video/encode/mixwav.py', o(`voice_cues_${TAG}.json`), String(TOTAL), o(`build/voice_${TAG}.wav`)]);
if (LANG === 'ml' && !SWAP && !DRY) exportVoiceParts();
if (LANG === 'ml' && SWAP && !DRY) swapVoice();
if (!flag('--skip-render')) run('render every frame', 'node', ['scripts/video/compose/render.js', o(`timeline_${TAG}.json`), frames, '--workers', opt('--workers', '6'), '--clean']);
run('check that the pictures are really right', 'python3', ['scripts/video/beta/check_frames.py', frames]);
if (PREPARE) {
  console.log(`\nprepared: ${frames} is rendered. Voice parts to change: ${o('voice_parts_ml')}. Then run again with --skip-render --voice-swap <the changed parts>.`);
  process.exit(0);
}
run('music bed (keynote)', 'node', ['scripts/video/audio/make_music.js', '--dur', String(TOTAL), '--out', o(`audio/music_${TAG}.wav`), '--outro-at', String(OUTRO), '--style', 'keynote', '--sections', sectionStarts.join(',')]);
run('mix: voice on top, music ducked under it, effects', 'node', ['scripts/video/audio/mix.js', '--voice', o(`build/voice_${TAG}.wav`), '--music', o(`audio/music_${TAG}.wav`), '--sfx', o(`sfx_${TAG}.json`),
  '--dur', String(TOTAL), '--out', o(`build/mix_${TAG}.wav`), '--report', o(`build/mix_${TAG}.report.json`), '--duck-db', '-13']);
const enc = 'reports/video/build/bin/encode';
run('export the full-quality MP4', enc, [frames, '30', o(`build/mix_${TAG}.wav`), o(`${OUT}.mp4`)]);
run('export the smaller share MP4', enc, [frames, '30', o(`build/mix_${TAG}.wav`), o(`${OUT}_share.mp4`), '--bitrate', '5000000']);
run('subtitles (SRT)', 'python3', ['scripts/video/beta/11_make_srt.py', '--tag', TAG, '--dir', rel(OUTD), '--out', o(`${OUT}.srt`)]);
if (opt('--copy-to', null) && !DRY) {
  const d = opt('--copy-to').replace(/^~/, process.env.HOME);
  fs.mkdirSync(d, { recursive: true });
  for (const f of [`${OUT}.mp4`, `${OUT}_share.mp4`, `${OUT}.srt`, `${OUT}_script.md`]) fs.copyFileSync(p(f), path.join(d, f));
  console.log(`\ncopied to ${d}`);
}
if (LANG === 'ml') copyMlSheets();
console.log(`\nREADY\n  ${o(OUT + '.mp4')}\n  ${o(OUT + '_share.mp4')}\n  ${o(OUT + '.srt')}`);

// ============================================================ helpers
/** Piecewise-linear, strictly increasing map through the knots [x, y]; slope 1 outside. */
function makeWarp(knots) {
  const k = knots.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((v, i, a) => i === 0 || v[0] - a[i - 1][0] > 1e-9);
  for (let i = 1; i < k.length; i++) if (k[i][1] < k[i - 1][1] - 1e-9) throw new Error(`time map is not monotonic at ${k[i][0]} -> ${k[i][1]} (previous ${k[i - 1][0]} -> ${k[i - 1][1]})`);
  const n = k.length;
  return t => {
    if (t <= k[0][0]) return k[0][1] + (t - k[0][0]);
    if (t >= k[n - 1][0]) return k[n - 1][1] + (t - k[n - 1][0]);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (k[m][0] <= t) lo = m; else hi = m; }
    return k[lo][1] + (t - k[lo][0]) * (k[hi][1] - k[lo][1]) / (k[hi][0] - k[lo][0]);
  };
}

/** The same scene with every time moved through the map f and every text through tx. Spatial values are not touched. */
function retime(sc, f, tx) {
  const out = JSON.parse(JSON.stringify(sc));
  const s1 = f(sc.start);
  const Lt = t => (typeof t !== 'number' || t >= 1e5 ? t : r3(f(sc.start + t) - s1));      // 1e6 = "never" in the motion preset
  out.start = r3(s1); out.end = r3(f(sc.end));
  let prev = -1;
  for (const c of out.camera || []) { c.t = Lt(c.t); if (c.t <= prev) c.t = r3(prev + 0.01); prev = c.t; }
  for (const k of ['highlights', 'callouts', 'overlays', 'masks']) {
    out[k] = (out[k] || []).map(x => {
      if (x.start != null) x.start = Lt(x.start);
      if (x.end != null) x.end = Lt(x.end);
      if (Array.isArray(x.move)) x.move = x.move.map(Lt);
      for (const q of ['text', 'from', 'to', 'chip']) if (x[q] != null) x[q] = tx(x[q]);
      return x;
    }).filter(x => x.start == null || x.end == null || x.end > x.start + 0.05);
    if (!out[k].length && !(k in sc)) delete out[k];
  }
  const src = out.source;
  for (const m of src.time_map || []) m.t = Lt(m.t);
  if (src.type === 'motion') {
    for (const c of src.cards || []) { c.t = Lt(c.t); c.title = tx(c.title); if (c.sub) c.sub = tx(c.sub); }
    for (const q of src.questions || []) { q.t = Lt(q.t); q.text = tx(q.text); }
    for (const k of ['scatter', 'dim', 'converge', 'logo_at', 'window']) if (Array.isArray(src[k])) src[k] = src[k].map(Lt);
    for (const k of ['text_out', 'tagline_at']) if (src[k] != null) src[k] = Lt(src[k]);
    if (src.tagline) src.tagline = tx(src.tagline);
  }
  return out;
}

/** Parts of one recording, in script order, joined with 2.5 s of silence (the section pause ingest_recording.py looks for). */
function joinParts(files) {
  const dir = path.join(OUTD, 'audio_ml', NAME);
  fs.mkdirSync(dir, { recursive: true });
  const pieces = files.map((f, i) => {
    const w = path.join(dir, `part_${i + 1}.wav`);
    const r = spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', path.resolve(f.replace(/^~/, process.env.HOME)), w]);
    if (r.status !== 0) throw new Error(`afconvert could not read ${f}`);
    return readWav(w).chans[0];
  });
  const gap = Math.round(2.5 * SR), n = pieces.reduce((a, x) => a + x.length, 0) + gap * (pieces.length - 1);
  const all = new Float32Array(n);
  let o = 0;
  pieces.forEach(x => { all.set(x, o); o += x.length + gap; });
  const whole = path.join(dir, 'whole.wav');
  writeWav16(whole, [all], SR);
  return whole;
}

/** The guide voice track cut into parts (at section ends, where it is silent) that a voice changer can take; manifest in parts.json. */
function exportVoiceParts() {
  const dir = path.join(OUTD, 'voice_parts_ml');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const track = readWav(p(`build/voice_${TAG}.wav`)).chans[0], max = Number(opt('--part-max', 200));
  const groups = [];
  let cur = null;
  for (const x of MLSECS) {
    if (!cur || x.E - cur.start > max) { cur = { start: r3(x.S), end: r3(x.E), sections: [] }; groups.push(cur); }
    cur.end = r3(x.E); cur.sections.push(x.id);
  }
  const manifest = groups.map((g, i) => {
    const a = Math.round(g.start * SR), b = Math.min(track.length, Math.round(g.end * SR));
    const file = path.join(dir, `part_${i + 1}.wav`);
    writeWav16(file, [track.subarray(a, b)], SR);
    return { n: i + 1, file: rel(file), start_s: g.start, end_s: g.end, sections: g.sections };
  });
  fs.writeFileSync(path.join(dir, 'parts.json'), JSON.stringify(manifest, null, 1));
  fs.copyFileSync(p(`build/voice_${TAG}.wav`), path.join(dir, 'voice_full.wav'));
  console.log(`voice parts: ${manifest.map(m => `${m.n}: ${m.start_s}-${m.end_s} s (${m.sections[0].slice(0, 2)}-${m.sections[m.sections.length - 1].slice(0, 2)})`).join('   ')}`);
}

/** Voice-changed parts back onto the film: each is aligned to its guide part, the parts are level-matched, and the track replaces the guide voice. */
function swapVoice() {
  const manifest = readJson(path.join(OUTD, 'voice_parts_ml', 'parts.json'));
  const files = SWAP.split(',').map(f => f.trim().replace(/^~/, process.env.HOME));
  if (files.length !== manifest.length) throw new Error(`the guide has ${manifest.length} voice parts, --voice-swap lists ${files.length}`);
  const out = new Float32Array(Math.round(TOTAL * SR));
  const placed = files.map((f, i) => {
    const w = p(`build/swap_part_${i + 1}.wav`);
    if (spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', path.resolve(f), w]).status !== 0) throw new Error(`afconvert could not read ${f}`);
    const ret = readWav(w).chans[0], guide = readWav(path.join(ROOT, manifest[i].file)).chans[0];
    const al = alignShift(guide, ret);
    console.log(`  part ${i + 1}: shifted ${al.ms >= 0 ? '+' : ''}${al.ms} ms, envelope match ${al.corr.toFixed(3)}, length ${(ret.length / SR).toFixed(2)} s (guide ${(guide.length / SR).toFixed(2)} s)`);
    if (al.corr < 0.75) throw new Error(`part ${i + 1} does not follow the timing of the guide (match ${al.corr.toFixed(2)}); the voice changer must keep the timing`);
    const seg = new Float32Array(guide.length);
    for (let k = 0; k < guide.length; k++) { const j = k + al.shift; if (j >= 0 && j < ret.length) seg[k] = ret[j]; }
    return { seg, start: Math.round(manifest[i].start_s * SR) };
  });
  const loud = placed.map(x => integratedLoudness([x.seg])), sorted = loud.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
  placed.forEach((x, i) => {
    const g = Math.pow(10, Math.max(-4, Math.min(4, med - loud[i])) / 20);
    console.log(`  part ${i + 1}: loudness ${loud[i].toFixed(1)} LUFS, level change ${(20 * Math.log10(g)).toFixed(1)} dB`);
    for (let k = 0; k < x.seg.length; k++) if (x.start + k < out.length) out[x.start + k] = x.seg[k] * g;
  });
  writeWav16(p(`build/voice_${TAG}.wav`), [out], SR);
}

/** The Malayalam script (DOCX, TXT) and the 22 per-section text files into the --copy-to folder. */
function copyMlSheets() {
  if (!opt('--copy-to', null) || DRY) return;
  const d = opt('--copy-to').replace(/^~/, process.env.HOME), t = path.join(d, 'Progbiz_Malayalam_Sections');
  fs.mkdirSync(t, { recursive: true });
  for (const f of ['Progbiz_ERP_Malayalam_Script.docx', 'Progbiz_ERP_Malayalam_Script.txt']) if (fs.existsSync(path.join(OUTD, f))) fs.copyFileSync(path.join(OUTD, f), path.join(d, f));
  for (const f of fs.readdirSync(SHEET_DIR)) fs.copyFileSync(path.join(SHEET_DIR, f), path.join(t, f));
  console.log(`copied the Malayalam script to ${d} (sections in ${t})`);
}

/** Recording sheet (HTML + DOCX), one text file per section for pasting into a text-to-speech tool, one combined text file. */
function writeMlSheets(pack) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const secHtml = SECS.map(s => `<h2>${s.id.slice(0, 2)} &nbsp;${esc(s.title)}</h2><p class="meta">file name <b>${s.id.slice(0, 2)}</b> &middot; ${s.sent.length} sentence${s.sent.length > 1 ? 's' : ''}</p>` +
    s.sent.map((x, k) => `<p class="ml">${k + 1}. ${esc(pack.sentences[s.id][k])}</p><p class="en">${esc(x.text)}</p>`).join('')).join('\n');
  const words = SECS.reduce((a, s) => a + pack.sentences[s.id].join(' ').split(/\s+/).length, 0);
  const html = `<!doctype html><html lang="ml"><head><meta charset="utf-8"><title>Progbiz ERP: Malayalam narration</title>
<style>body{font-family:"Noto Sans Malayalam","Malayalam Sangam MN",Helvetica,Arial,sans-serif;max-width:860px;margin:30px auto;padding:0 18px;color:#111}
h1{font-size:26px}h2{margin-top:34px;border-top:2px solid #0068EE;padding-top:12px;font-size:20px}.meta{color:#666;font-size:13px}
.ml{font-size:20px;line-height:1.7;margin:14px 0 2px}.en{color:#777;font-size:12.5px;margin:0 0 6px}li{margin:4px 0}</style></head><body>
<h1>Progbiz ERP &mdash; Malayalam narration (CRM + Work Flow)</h1>
<p>22 sections &middot; ${SECS.reduce((a, s) => a + s.sent.length, 0)} sentences &middot; about ${words} words &middot; source: <code>scripts/video/combined/lang/ml.json</code></p>
<h3>How the voice is made</h3><ol>
<li>Use the same voice as the English film (ElevenLabs &ldquo;Kanika&rdquo;) with a model that speaks Malayalam (Eleven v3 lists Malayalam; please test one section first).</li>
<li>Read only the large Malayalam lines. The small grey English lines are the meaning, for review.</li>
<li>Words in English letters (Progbiz ERP, Progbiz Workflow, AI, CRM, PDF) are said in English. Product words in Malayalam letters (ലീഡ്, ഫോളോ-അപ്പ്, ഡാഷ്ബോർഡ്, ടാസ്ക്, ഫേസ്, കോസ്റ്റിംഗ്, മെയിന്റനൻസ് &hellip;) are said as people say them in an office.</li>
<li>Easiest: one audio file per section, named <b>01 &hellip; 22</b> (the section number). One long file or a few parts also work.</li>
<li>About one second of silence between sentences, a longer pause between sections. If a sentence boundary is wrong the build tool shows it and it can be corrected by hand.</li>
<li>Keep the order of the words exactly as written: the pictures change on certain words.</li></ol>
${secHtml}</body></html>`;
  fs.writeFileSync(path.join(OUTD, 'Progbiz_ERP_Malayalam_Script.html'), html);
  const txt = SECS.map(s => `==== ${s.id.slice(0, 2)}  ${s.title} ====\n\n` + pack.sentences[s.id].join('\n\n')).join('\n\n\n') + '\n';
  fs.writeFileSync(path.join(OUTD, 'Progbiz_ERP_Malayalam_Script.txt'), txt);
  for (const s of SECS) fs.writeFileSync(path.join(SHEET_DIR, `${s.id}.txt`), pack.sentences[s.id].join('\n\n') + '\n');
  spawnSync('textutil', ['-convert', 'docx', path.join(OUTD, 'Progbiz_ERP_Malayalam_Script.html'), '-output', path.join(OUTD, 'Progbiz_ERP_Malayalam_Script.docx')]);
}
