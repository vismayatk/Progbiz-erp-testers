'use strict';
/**
 * Build HRMS_Module_Study.docx from the 6 markdown docs in hrms/docs/.
 * - mermaid fences → rendered PNGs from docs/assets (landscape section)
 * - md headings/tables/bullets/code fences → styled Word equivalents
 * Output: hrms/docs/HRMS_Module_Study.docx
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, ImageRun, PageBreak, TableOfContents, ShadingType,
  LevelFormat, PageOrientation, BorderStyle,
} = require('docx');

const DOCS = path.join(__dirname, '..', 'docs');
const ASSETS = path.join(DOCS, 'assets');
const flows = JSON.parse(fs.readFileSync(path.join(ASSETS, 'flowcharts.json'), 'utf8'));

const FONT = 'Segoe UI';
const MONO = 'Consolas';
const ACCENT = '1F4E79';
const PORTRAIT_PX = 624;   // 6.5" usable width
const LANDSCAPE_PX = 864;  // 9"  usable width

// ---------- inline markdown → TextRuns ----------
function inline(text, base = {}) {
  const runs = [];
  // links → keep the text only
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) runs.push(new TextRun({ text: tok.slice(2, -2), bold: true, font: FONT, ...base }));
    else if (tok.startsWith('`')) runs.push(new TextRun({ text: tok.slice(1, -1), font: MONO, color: 'C7254E', ...base }));
    else runs.push(new TextRun({ text: tok.slice(1, -1), italics: true, font: FONT, ...base }));
    last = m.index + tok.length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return runs.length ? runs : [new TextRun({ text: '', font: FONT })];
}

// ---------- md table → docx Table ----------
function mdTable(rows) {
  const cells = rows.map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  const header = cells[0];
  const body = cells.slice(2); // skip |---| separator
  const nCols = header.length;
  const weights = header.map((_, i) => Math.max(4, ...cells.filter((_, ri) => ri !== 1).map(r => (r[i] || '').length)));
  const totW = weights.reduce((a, b) => a + b, 0);
  const TABLE_DXA = 9360;
  const colW = weights.map(w => Math.max(700, Math.round((w / totW) * TABLE_DXA)));

  const mkRow = (cols, isHeader) => new TableRow({
    tableHeader: isHeader,
    children: cols.map((c, i) => new TableCell({
      width: { size: colW[i] || 700, type: WidthType.DXA },
      shading: isHeader ? { type: ShadingType.CLEAR, fill: ACCENT } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        children: inline(c || '', isHeader ? { bold: true, color: 'FFFFFF', size: 18 } : { size: 18 }),
      })],
    })),
  });

  return new Table({
    width: { size: TABLE_DXA, type: WidthType.DXA },
    columnWidths: colW,
    rows: [mkRow(header, true), ...body.map(r => mkRow(r, false))],
  });
}

function flowImage(flow, maxPx) {
  const scale = Math.min(1, maxPx / flow.w);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
      children: [new ImageRun({
        type: 'png',
        data: fs.readFileSync(path.join(DOCS, flow.file)),
        transformation: { width: Math.round(flow.w * scale), height: Math.round(flow.h * scale) },
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 240 },
      children: [new TextRun({ text: `Figure ${flow.index}: ${flow.caption}`, italics: true, size: 18, color: '666666', font: FONT })],
    }),
  ];
}

// ---------- md file → array of docx children ----------
function mdToChildren(mdText, { headingShift = 0, imgMaxPx = PORTRAIT_PX, chapterTitle = null } = {}) {
  const out = [];
  let flowCursor = 0;
  const lines = mdText.split(/\r?\n/);
  let i = 0;

  if (chapterTitle) out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: inline(chapterTitle, { color: ACCENT }) }));

  while (i < lines.length) {
    const line = lines[i];

    if (/^```mermaid/.test(line)) {                       // mermaid → image
      while (i < lines.length && !/^```\s*$/.test(lines[++i])) {} i++;
      const flow = flows[flowCursor++];
      if (flow) out.push(...flowImage(flow, imgMaxPx));
      continue;
    }
    if (/^```/.test(line)) {                              // code fence → mono block
      i++;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      for (const b of buf) out.push(new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
        spacing: { after: 0 },
        children: [new TextRun({ text: b.replace(/^ +/, s => ' '.repeat(s.length)) || ' ', font: MONO, size: 15 })],
      }));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {                                              // heading
      if (h[1].length === 1 && chapterTitle) { i++; continue; }  // file title already emitted as chapter
      const lvl = Math.min(4, h[1].length + headingShift);
      const map = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 };
      out.push(new Paragraph({ heading: map[lvl], spacing: { before: 200, after: 100 }, children: inline(h[2].replace(/[#]+$/, '').trim(), { color: ACCENT }) }));
      i++; continue;
    }
    if (/^\|/.test(line)) {                               // table
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      if (rows.length >= 2) { out.push(mdTable(rows)); out.push(new Paragraph({ spacing: { after: 120 }, children: [] })); }
      continue;
    }
    if (/^>\s?/.test(line)) {                             // blockquote
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      for (const b of buf) out.push(new Paragraph({
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT } },
        spacing: { after: 60 },
        children: inline(b, { italics: true, size: 19, color: '444444' }),
      }));
      continue;
    }
    const bullet = line.match(/^(\s*)-\s+(.*)/);
    if (bullet) {                                         // bullet list
      const level = Math.min(2, Math.floor(bullet[1].length / 2));
      out.push(new Paragraph({ numbering: { reference: 'bullets', level }, spacing: { after: 40 }, children: inline(bullet[2], { size: 20 }) }));
      i++; continue;
    }
    const num = line.match(/^\s*(\d+)\.\s+(.*)/);
    if (num) {                                            // numbered list (render as "N." text to keep original numbers)
      out.push(new Paragraph({ indent: { left: 360, hanging: 240 }, spacing: { after: 40 }, children: [new TextRun({ text: `${num[1]}.  `, bold: true, font: FONT, size: 20 }), ...inline(num[2], { size: 20 })] }));
      i++; continue;
    }
    if (/^---\s*$/.test(line)) { i++; continue; }         // hr → skip
    if (/^\s*$/.test(line)) { i++; continue; }            // blank

    out.push(new Paragraph({ spacing: { after: 100 }, children: inline(line.trim(), { size: 20 }) }));  // paragraph
    i++;
  }
  return out;
}

// ---------- assemble ----------
const read = f => fs.readFileSync(path.join(DOCS, f), 'utf8');
const master = read('00_HRMS_OVERVIEW_AND_FLOWCHART.md');

// split master: before flowcharts (§1-2) / flowcharts (§3-4) / after (§5-7)
const idx3 = master.indexOf('## 3.');
const idx5 = master.indexOf('## 5.');
const masterPre = master.slice(0, idx3);
const masterFlows = master.slice(idx3, idx5);
const masterPost = master.slice(idx5);

const PAGE_PORTRAIT = { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } };
const PAGE_LANDSCAPE = { size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } };

const titleChildren = [
  new Paragraph({ spacing: { before: 3200 }, children: [] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'HRMS Module', font: FONT, size: 72, bold: true, color: ACCENT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: 'Study, Page Connections & Flowcharts', font: FONT, size: 40, color: '444444' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [new TextRun({ text: 'ProgBiz ERP — https://hrms-erp.progbiz.in  ·  tenant "Hrms"', font: FONT, size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 }, children: [new TextRun({ text: '80 pages crawled live · 6 sub-modules · prepared for Playwright automation', font: FONT, size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 }, children: [new TextRun({ text: '20 July 2026', font: FONT, size: 24, color: '888888' })] }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Contents', font: FONT, color: ACCENT })] }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
];

const doc = new Document({
  creator: 'erp-tests automation study',
  title: 'HRMS Module — Study & Flowcharts',
  styles: {
    default: { document: { run: { font: FONT, size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true, color: ACCENT } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 26, bold: true, color: ACCENT } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 22, bold: true, color: '2E74B5' } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 20, bold: true, italics: true, color: '2E74B5' } },
    ],
  },
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [0, 1, 2].map(l => ({
        level: l, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][l], alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360 + l * 360, hanging: 240 } } },
      })),
    }],
  },
  sections: [
    { properties: { page: PAGE_PORTRAIT }, children: [...titleChildren, ...mdToChildren(masterPre)] },
    { properties: { page: PAGE_LANDSCAPE }, children: mdToChildren(masterFlows, { imgMaxPx: LANDSCAPE_PX }) },
    { properties: { page: PAGE_PORTRAIT }, children: mdToChildren(masterPost) },
    { properties: { page: PAGE_PORTRAIT }, children: mdToChildren(read('01_CORE_HR.md'), { chapterTitle: 'Deep Dive — Core HR' }) },
    { properties: { page: PAGE_PORTRAIT }, children: mdToChildren(read('02_RECRUITMENT.md'), { chapterTitle: 'Deep Dive — Recruitment & Onboarding' }) },
    { properties: { page: PAGE_PORTRAIT }, children: mdToChildren(read('03_ATTENDANCE.md'), { chapterTitle: 'Deep Dive — Attendance & Time' }) },
    { properties: { page: PAGE_PORTRAIT }, children: mdToChildren(read('04_LEAVE_MANAGEMENT.md'), { chapterTitle: 'Deep Dive — Leave Management' }) },
    { properties: { page: PAGE_PORTRAIT }, children: mdToChildren(read('05_ESS_MY_WORKSPACE.md'), { chapterTitle: 'Deep Dive — My Workspace (ESS)' }) },
  ],
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(DOCS, 'HRMS_Module_Study.docx');
  fs.writeFileSync(out, buf);
  console.log('✅ written:', out, `(${Math.round(buf.length / 1024)} KB)`);
});
