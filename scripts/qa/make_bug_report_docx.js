'use strict';

/**
 * Build the Word bug report from a data file.
 *
 *   node scripts/qa/make_bug_report_docx.js <data.json> <out.docx>
 *
 * The data file holds everything that is written: title lines, summary, the modules table, the bugs
 * (with steps, expected, actual and screenshots), design changes, questions and test data. This
 * script only lays it out in the team's format: title block, summary table, one section per bug,
 * marked screenshots, Calibri, US Letter.
 *
 * The data file is JSON, or a .js module that exports the same object (it can then read the facts the
 * capture script saved). Screenshot paths are relative to `shotsDir` when the data gives one, otherwise
 * to the data file's folder.
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  HeadingLevel, BorderStyle, ShadingType, LevelFormat, Footer, PageNumber, PageBreak, VerticalAlign, TableLayoutType,
} = require('docx');

const [, , dataFile, outFile] = process.argv;
if (!dataFile || !outFile) { console.error('usage: node scripts/qa/make_bug_report_docx.js <data.json> <out.docx>'); process.exit(1); }
const D = /\.js$/.test(dataFile) ? require(path.resolve(dataFile)) : JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const baseDir = D.shotsDir ? path.resolve(D.shotsDir) : path.dirname(path.resolve(dataFile));

const FONT = 'Calibri';
const BASE = D.baseSize || 21;                                   // half-points: 21 = 10.5 pt
const NUMBERED = D.numbered !== false;
const PAGE_W = 12240, PAGE_H = 15840, MARGIN = 1080;          // US Letter, 0.75" margins
const CONTENT_W = PAGE_W - 2 * MARGIN;                         // 10080 DXA = 7.0"
const INK = '1F2937', MUTED = '6B7280', LINE = 'D1D5DB', HEAD_FILL = 'E8EEF7', BRAND = '1F4E79';
const SEV_FILL = { Critical: 'F8D7DA', High: 'FDE2E1', Medium: 'FFF1CC', Low: 'E7F3E7', Question: 'E6ECF5', Data: 'EDEDED', P1: 'FDE2E1', P2: 'FFF1CC', P3: 'E7F3E7', Works: 'E7F3E7', Fails: 'FDE2E1', Partly: 'FFF1CC', 'Not tested': 'EDEDED', Pass: 'E7F3E7', Fail: 'FDE2E1', Blocked: 'E6ECF5', 'Not run': 'EDEDED' };

// "text with **bold** parts" -> runs
function runs(text, opts = {}) {
  const parts = String(text == null ? '' : text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((s) => s !== '');
  return parts.map((p) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return new TextRun({ text: p.slice(2, -2), bold: true, font: FONT, size: opts.size || BASE, color: opts.color || INK });
    if (/^`[^`]+`$/.test(p)) return new TextRun({ text: p.slice(1, -1), font: 'Consolas', size: (opts.size || BASE) - 2, color: opts.color || INK });
    return new TextRun({ text: p, font: FONT, size: opts.size || BASE, bold: opts.bold, italics: opts.italics, color: opts.color || INK });
  });
}
const para = (text, o = {}) => new Paragraph({
  children: runs(text, o), alignment: o.align, keepNext: o.keepNext,
  spacing: { before: o.before == null ? 0 : o.before, after: o.after == null ? 120 : o.after, line: 276 },
});
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, font: FONT })] });
const h2 = (text, o = {}) => new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: !!o.pageBreakBefore, children: [new TextRun({ text, font: FONT })] });
const label = (name, text) => new Paragraph({
  spacing: { before: 60, after: 80, line: 276 }, keepNext: true,
  children: [new TextRun({ text: `${name}  `, bold: true, font: FONT, size: 21, color: BRAND }), ...runs(text)],
});
const bullets = (items) => items.map((t) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60, line: 276 }, children: runs(t) }));
let stepsSeq = 0;
function steps(items) {
  stepsSeq += 1;
  const ref = `steps${stepsSeq}`;
  numberingConfigs.push({
    reference: ref,
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { run: { font: FONT, size: 21 }, paragraph: { indent: { left: 540, hanging: 300 } } } }],
  });
  return items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 40, line: 276 }, children: runs(t) }));
}
const numberingConfigs = [{
  reference: 'bullets',
  levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }],
}];

const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };
function cell(text, width, o = {}) {
  const lines = Array.isArray(text) ? text : [text];
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.TOP,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    children: lines.map((t) => new Paragraph({ spacing: { after: 0, line: 259 }, children: runs(t, { size: o.size || 19, bold: o.bold, color: o.color }) })),
  });
}
function table(headers, widths, rows, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = CONTENT_W / total;
  const w = widths.map((x) => Math.round(x * scale));
  w[w.length - 1] += CONTENT_W - w.reduce((a, b) => a + b, 0);
  const head = new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, w[i], { fill: HEAD_FILL, bold: true, color: BRAND })) });
  const body = rows.map((r) => new TableRow({
    cantSplit: true,
    children: r.map((c, i) => {
      const fill = o.fillFor ? o.fillFor(c, i, r) : undefined;
      return cell(c, w[i], { fill });
    }),
  }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, rows: [head, ...body] });
}
const gap = (after = 120) => new Paragraph({ spacing: { after }, children: [] });

function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
let shotNo = 0;
function screenshot(s) {
  const file = path.resolve(baseDir, s.file);
  if (!fs.existsSync(file)) { console.warn(`  missing screenshot: ${s.file}`); return [para(`[screenshot not captured: ${s.caption}]`, { italics: true, color: MUTED })]; }
  const buf = fs.readFileSync(file);
  const { w, h } = pngSize(buf);
  const maxW = 672, maxH = s.tall ? 900 : 520;                // px at 96 dpi: 7.0" wide
  const k = Math.min(maxW / w, maxH / h, 1);
  shotNo += 1;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 100, after: 40 },
      border: { top: border, bottom: border, left: border, right: border },
      children: [new ImageRun({ type: 'png', data: buf, transformation: { width: Math.round(w * k), height: Math.round(h * k) }, altText: { title: s.caption, description: s.caption, name: path.basename(file) } })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: runs(`Screenshot ${shotNo}: ${s.caption}`, { size: 18, italics: true, color: MUTED }) }),
  ];
}

const children = [];
// ── Title block ──────────────────────────────────────────────────────────────
children.push(new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: D.title.brand, font: FONT, size: 26, bold: true, color: BRAND })] }));
children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: D.title.name, font: FONT })] }));
children.push(para(D.title.sub, { size: 23, color: MUTED, after: 40 }));
children.push(new Paragraph({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: BRAND, space: 6 } }, children: runs(D.title.meta, { size: 20, color: MUTED }) }));

let sec = 0;
const section = (name) => { sec += 1; children.push(h1(NUMBERED ? `${sec}. ${name}` : name)); };

// ── Summary ──────────────────────────────────────────────────────────────────
if (D.summary) { section(D.summaryTitle || 'Summary'); for (const p of D.summary) children.push(para(p)); }
if (D.counts) {
  children.push(table(D.counts.headers, D.counts.widths, D.counts.rows, { fillFor: (c, i) => (i === 0 ? SEV_FILL[c] : undefined) }));
  children.push(gap());
}

// ── Environment ──────────────────────────────────────────────────────────────
if (D.environment) {
  section('Test environment');
  children.push(table(['Item', 'Detail'], [22, 78], D.environment));
  children.push(gap());
}

// ── Modules ──────────────────────────────────────────────────────────────────
if (D.modules) {
  section((D.headings && D.headings.modules) || 'Modules checked');
  if (D.modulesNote) children.push(para(D.modulesNote));
  children.push(table((D.headings && D.headings.modulesHeaders) || ['Module', 'What was run', 'Result', 'Bugs seen'], (D.headings && D.headings.modulesWidths) || [16, 34, 26, 24], D.modules, D.headings && D.headings.modulesFillCol != null ? { fillFor: (c, i) => (i === D.headings.modulesFillCol ? SEV_FILL[c] : undefined) } : {}));
  children.push(gap());
}

// ── Sections that come before the bugs ─────────────────────────────────────
const tip = (text) => new Paragraph({
  spacing: { before: 80, after: 160, line: 276 }, indent: { left: 160, right: 160 },
  shading: { fill: 'FFF8DB', type: ShadingType.CLEAR, color: 'auto' },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'E0B400', space: 8 } },
  children: runs(text),
});
function extraSection(extra) {
  sec += 1;
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !!extra.pageBreak, children: [new TextRun({ text: NUMBERED ? `${sec}. ${extra.title}` : extra.title, font: FONT })] }));
  for (const block of extra.blocks) {
    if (block.h2) children.push(h2(block.h2, { pageBreakBefore: !!block.pageBreak }));
    if (block.p) children.push(para(block.p));
    if (block.steps) children.push(...steps(block.steps));
    if (block.tip) children.push(tip(block.tip));
    if (block.bullets) children.push(...bullets(block.bullets));
    if (block.table) { children.push(table(block.table.headers, block.table.widths, block.table.rows, block.table.fillCol != null ? { fillFor: (c, i) => (i === block.table.fillCol ? SEV_FILL[c] : undefined) } : {})); children.push(gap()); }
    if (block.shots) for (const s of block.shots) children.push(...screenshot(s));
  }
}
for (const extra of D.before || []) extraSection(extra);

if (D.bugs && D.bugs.length) {
// ── Bug summary ──────────────────────────────────────────────────────────────
section((D.headings && D.headings.bugSummary) || 'Bug summary');
if (D.bugsNote) children.push(para(D.bugsNote));
children.push(table(['ID', 'Bug', 'Module', 'Severity', 'Status'], [10, 50, 14, 10, 16],
  D.bugs.map((b) => [b.id, b.title, b.module, b.severity, b.status]),
  { fillFor: (c, i) => (i === 3 ? SEV_FILL[c] : undefined) }));
children.push(gap());

// ── Bug details ──────────────────────────────────────────────────────────────
section((D.headings && D.headings.bugDetails) || 'Bug details');
D.bugs.forEach((b, i) => {
  children.push(h2(`${b.id}  ${b.title}`, { pageBreakBefore: i > 0 }));
  children.push(new Paragraph({
    spacing: { after: 120 }, keepNext: true,
    children: runs(`**Severity:** ${b.severity}   ·   **Category:** ${b.category}   ·   **Module:** ${b.module}   ·   **Status:** ${b.status}`, { size: 20 }),
  }));
  children.push(label('Where', b.where));
  children.push(new Paragraph({ spacing: { before: 60, after: 60 }, keepNext: true, children: [new TextRun({ text: 'Steps to reproduce', bold: true, font: FONT, size: 21, color: BRAND })] }));
  children.push(...steps(b.steps));
  children.push(label('Expected', b.expected));
  children.push(label('Actual', b.actual));
  if (b.note) children.push(label('Note', b.note));
  if (b.test) children.push(label('Automated check', b.test));
  for (const s of b.shots || []) children.push(...screenshot(s));
});
}

// ── Other sections ───────────────────────────────────────────────────────────
for (const extra of D.sections || []) extraSection(extra);

const doc = new Document({
  creator: 'Progbiz QA', title: `${D.title.brand} ${D.title.name}`, description: D.title.sub || '',
  styles: {
    default: {
      document: { run: { font: FONT, size: 21, color: INK } },
      title: { run: { font: FONT, size: 48, bold: true, color: INK }, paragraph: { spacing: { before: 0, after: 80 }, keepNext: true } },
      heading1: { run: { font: FONT, size: 30, bold: true, color: BRAND }, paragraph: { spacing: { before: 320, after: 140 }, keepNext: true } },
      heading2: { run: { font: FONT, size: 25, bold: true, color: INK }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true } },
    },
  },
  numbering: { config: numberingConfigs },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `${D.title.footer}   ·   Page `, font: FONT, size: 17, color: MUTED }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 17, color: MUTED }),
            new TextRun({ text: ' of ', font: FONT, size: 17, color: MUTED }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 17, color: MUTED }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outFile, buf);
  console.log(`wrote ${outFile}  (${(buf.length / 1024 / 1024).toFixed(1)} MB, ${(D.bugs || []).length} bugs, ${shotNo} screenshots)`);
});
