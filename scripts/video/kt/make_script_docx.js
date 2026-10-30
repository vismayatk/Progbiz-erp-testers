#!/usr/bin/env node
'use strict';
/**
 * Narration scripts of the KT videos as Word documents:
 *   Progbiz_ERP_KT_English_Script.docx    - English narration, timestamp and on-screen description per beat
 *   Progbiz_ERP_KT_Malayalam_Script.docx  - Malayalam narration, with the English line under it for review
 *
 *   node scripts/video/kt/make_script_docx.js
 *
 * Reads scripts/video/kt/storyboard.json, reports/video/kt/clips.json and
 * reports/video/kt/build/{sentences,chapters}_{en,ml}.json (written by build_kt.js).
 */
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, BorderStyle, PageBreak, Footer, PageNumber } = require('docx');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const KT = path.join(ROOT, 'reports', 'video', 'kt');
const SB = JSON.parse(fs.readFileSync(path.join(__dirname, 'storyboard.json'), 'utf8'));
const CLIPS = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(KT, 'clips.json'), 'utf8')).clips.map(c => [c.id, c]));
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const FONT = 'Arial', ML_FONT = 'Nirmala UI';

function visualText(v) {
  if (!v) return '';
  if (v.type === 'motion') return v.source && v.source.images && v.source.images.home ? 'Animated opening: module cards, questions, logo; the ERP window grows into the frame.' : 'Animated closing: three short lines and the Progbiz ERP logo.';
  if (v.type === 'title') return `Title card: ${v.title_en || v.title}`;
  if (v.type === 'section') return `Module title card: ${v.title_en || v.title}`;
  if (v.type === 'summary') return `Summary card: ${(v.title_en || v.title)}`;
  const c = CLIPS[v.clip];
  const src = c ? c.src : v.clip;
  if (v.type === 'still') return `Still frame: ${src} at ${mmss(v.at)}`;
  const marks = [...new Set([...(v.hl || []), ...(v.callouts || [])].map(h => h.label).filter(Boolean))];
  return `Screen recording: ${src}, ${mmss(v.from)}-${mmss(v.to)}` + (marks.length ? `. Highlighted: ${marks.join(', ')}` : '');
}

function build(lang) {
  const sents = JSON.parse(fs.readFileSync(path.join(KT, 'build', `sentences_${lang}.json`), 'utf8'));
  const chaps = JSON.parse(fs.readFileSync(path.join(KT, 'build', `chapters_${lang}.json`), 'utf8'));
  const enS = lang === 'ml' ? JSON.parse(fs.readFileSync(path.join(KT, 'build', 'sentences_en.json'), 'utf8')) : null;
  const byBeat = {};
  for (const s of sents) (byBeat[s.beat] = byBeat[s.beat] || []).push(s);
  const enByBeat = {};
  if (enS) for (const s of enS) (enByBeat[s.beat] = enByBeat[s.beat] || []).push(s);
  const isMl = lang === 'ml';
  const textRun = (t, o = {}) => new TextRun(Object.assign({ text: t, font: isMl && /[ഀ-ൿ]/.test(t) ? ML_FONT : FONT, size: 22 }, o));
  const para = (runs, o = {}) => new Paragraph(Object.assign({ children: Array.isArray(runs) ? runs : [runs], spacing: { after: 120 } }, o));
  const title = isMl ? 'Progbiz ERP: Complete Knowledge Transfer - Malayalam Narration Script' : 'Progbiz ERP: Complete Knowledge Transfer - English Narration Script';
  const video = (SB.output_names && SB.output_names[lang]) + '.mp4';
  const body = [];
  body.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, font: FONT, size: 40, bold: true })], spacing: { after: 160 } }));
  body.push(para(textRun(`Video: ${video}   ·   Length ${mmss(chaps.duration)}   ·   ${chaps.chapters.filter(c => c.number).length} modules   ·   ${new Date().toISOString().slice(0, 10)}`, { color: '5B667A', size: 20 })));
  body.push(para(textRun(isMl
    ? 'Narration: natural Kerala Malayalam with English ERP terms (voice: Microsoft ml-IN-SobhanaNeural). The English line under each paragraph is the matching English narration, so a reviewer can check that both versions say the same thing.'
    : 'Narration: Indian English (voice: Microsoft en-IN-NeerjaExpressiveNeural). Times are positions in the video. "On screen" says which source recording and time range is shown.', { size: 20 })));
  body.push(para(textRun('Only facts verified in the source recordings are stated as fact; explanations that are not shown on screen are attributed to the trainer, and failed or unsaved steps are said as such.', { size: 20, italics: true })));
  // chapter table
  const W = [1100, 6200, 1700];
  const cell = (t, w, head) => new TableCell({ width: { size: w, type: WidthType.DXA }, shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EAF2FE' } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: t, font: FONT, size: 20, bold: !!head })] })] });
  body.push(new Table({ width: { size: 9000, type: WidthType.DXA }, columnWidths: W, rows: [
    new TableRow({ tableHeader: true, children: [cell('Chapter', W[0], true), cell('Title', W[1], true), cell('Starts at', W[2], true)] }),
    ...chaps.chapters.map(c => new TableRow({ children: [cell(c.number ? String(c.number) : '-', W[0]), cell(c.title, W[1]), cell(mmss(c.start), W[2])] })),
  ] }));
  for (const ch of SB.chapters) {
    const cs = chaps.chapters.find(c => c.id === ch.id);
    body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 160 }, children: [new TextRun({ text: `${ch.number ? `Module ${ch.number} · ` : ''}${ch.title}${cs ? `   (${mmss(cs.start)})` : ''}`, font: FONT, size: 32, bold: true, color: '0068EE' })] }));
    for (const b of ch.beats) {
      const ss = byBeat[b.id] || [];
      if (!ss.length) continue;
      body.push(new Paragraph({ spacing: { before: 160, after: 60 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D5DCE6', space: 4 } },
        children: [new TextRun({ text: `${mmss(ss[0].start)}   `, font: FONT, size: 19, bold: true, color: '0068EE' }), new TextRun({ text: `On screen: ${visualText(b.visual)}`, font: FONT, size: 19, color: '5B667A' })] }));
      body.push(para(textRun(ss.map(s => s.text).join(' '), { size: isMl ? 24 : 22 }), { spacing: { after: isMl ? 40 : 100, line: isMl ? 340 : 280 } }));
      if (isMl && enByBeat[b.id]) body.push(para(new TextRun({ text: `English: ${enByBeat[b.id].map(s => s.text).join(' ')}`, font: FONT, size: 18, italics: true, color: '6B7280' })));
    }
  }
  const doc = new Document({
    creator: 'Progbiz Software Testing team', title,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1247, right: 1247 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Page ', font: FONT, size: 16, color: '5B667A' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '5B667A' })] })] }) },
      children: body }],
  });
  const out = path.join(KT, 'out', isMl ? 'Progbiz_ERP_KT_Malayalam_Script.docx' : 'Progbiz_ERP_KT_English_Script.docx');
  return Packer.toBuffer(doc).then(buf => { fs.writeFileSync(out, buf); console.log(`wrote ${path.relative(ROOT, out)} (${sents.length} sentences)`); });
}

fs.mkdirSync(path.join(KT, 'out'), { recursive: true });
build('en').then(() => build('ml')).catch(e => { console.error(e); process.exit(1); });
