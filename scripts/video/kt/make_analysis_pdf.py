#!/usr/bin/env python3
"""Progbiz_ERP_Video_Analysis_Report.pdf: what each source recording shows, from the per-recording analyses.

  python3 scripts/video/kt/make_analysis_pdf.py [--out reports/video/kt/out/Progbiz_ERP_Video_Analysis_Report.pdf]

Reads : reports/video/kt/analysis/<Name>/analysis.json (one per recording), reports/video/kt/sources.json (inventory + notes)
Personal data is never printed: privacy items are listed by kind and time only.
"""
import argparse
import datetime
import json
import os
import re
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
KT = os.path.join(ROOT, 'reports', 'video', 'kt')
SUP = '/System/Library/Fonts/Supplemental/'
pdfmetrics.registerFont(TTFont('Body', SUP + 'Arial Unicode.ttf'))
pdfmetrics.registerFont(TTFont('Bold', SUP + 'Arial Bold.ttf'))
BLUE = colors.HexColor('#0068EE')
INK = colors.HexColor('#0F172A')
MUTED = colors.HexColor('#5B667A')
LINE = colors.HexColor('#D5DCE6')
HEAD_BG = colors.HexColor('#EAF2FE')
STATUS_BG = {'verified': colors.HexColor('#E7F6EC'), 'inferred': colors.HexColor('#FFF6E0'), 'not_verified': colors.HexColor('#FDECEC')}

S = {
    'title': ParagraphStyle('title', fontName='Bold', fontSize=24, leading=29, textColor=INK, spaceAfter=6),
    'sub': ParagraphStyle('sub', fontName='Body', fontSize=12, leading=16, textColor=MUTED, spaceAfter=14),
    'h1': ParagraphStyle('h1', fontName='Bold', fontSize=17, leading=21, textColor=INK, spaceBefore=4, spaceAfter=8),
    'h2': ParagraphStyle('h2', fontName='Bold', fontSize=12.5, leading=16, textColor=BLUE, spaceBefore=12, spaceAfter=5),
    'p': ParagraphStyle('p', fontName='Body', fontSize=9.6, leading=13.4, textColor=INK, spaceAfter=5, alignment=TA_LEFT),
    'small': ParagraphStyle('small', fontName='Body', fontSize=8.2, leading=10.8, textColor=INK),
    'smallb': ParagraphStyle('smallb', fontName='Bold', fontSize=8.2, leading=10.8, textColor=INK),
    'note': ParagraphStyle('note', fontName='Body', fontSize=8.6, leading=11.6, textColor=MUTED, spaceAfter=4),
    'li': ParagraphStyle('li', fontName='Body', fontSize=9.4, leading=13, textColor=INK, leftIndent=12, bulletIndent=2, spaceAfter=2),
}


SCRUB = []          # privacy values from every analysis (filled in main), replaced by [masked]
KEEP = {'kannur', 'kasaragod', 'kasargod', 'main branch', 'india', 'kerala'}
PHONE = re.compile(r'\+?\d[\d \-]{8,}\d')
EMAIL = re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+')


def scrub(text):
    t = str(text if text is not None else '')
    t = EMAIL.sub('[masked]', t)
    def phone(m):
        g = m.group()
        n = len(re.sub(r'\D', '', g))
        # dates / recording names (2026-10-21 153033) and amounts are not phone numbers
        if re.search(r'\d{4}-\d{2}-\d{2}', g) or re.search(r'[.,]\d\d$', g) or not 10 <= n <= 13:
            return g
        return '[masked]'
    t = PHONE.sub(phone, t)
    for rx in SCRUB:
        t = rx.sub('[masked]', t)
    return t


def P(text, st='p'):
    return Paragraph(escape(scrub(text)).replace('\n', '<br/>'), S[st])


def mmss(s):
    s = float(s or 0)
    return f'{int(s // 60)}:{int(s % 60):02d}'


def rng(r):
    return f'{mmss(r[0])}-{mmss(r[1])}' if r else ''


def table(rows, widths, head=True, status_col=None):
    data = [[c if not isinstance(c, str) else Paragraph(escape(scrub(c)), S['smallb' if head and i == 0 else 'small']) for c in row] for i, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if head else 0)
    st = [('GRID', (0, 0), (-1, -1), 0.4, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
          ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4), ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]
    if head:
        st.append(('BACKGROUND', (0, 0), (-1, 0), HEAD_BG))
    if status_col is not None:
        for i, row in enumerate(rows[1:], start=1):
            bg = STATUS_BG.get(str(row[status_col]).strip().lower().replace(' ', '_'))
            if bg:
                st.append(('BACKGROUND', (status_col, i), (status_col, i), bg))
    t.setStyle(TableStyle(st))
    return t


def bullets(items):
    return [Paragraph(escape(scrub(x)), S['li'], bulletText='•') for x in items if str(x).strip()]


def recording_section(a, name, W):
    out = [P(a.get('recording', name), 'h1')]
    hosts = '; '.join(f"{h['host']} ({', '.join(rng(r) for r in h.get('src_ranges', []))})" for h in a.get('hosts', []))
    out.append(P(f"Duration {mmss(a.get('duration_s'))}  ·  Host(s): {hosts}", 'note'))
    out.append(P('Summary', 'h2'))
    out.append(P(a.get('summary', '')))

    out.append(P('Modules demonstrated', 'h2'))
    rows = [['Module / screen', 'Menu path', 'Route(s)', 'Time in recording']]
    for m in a.get('modules', []):
        rows.append([m.get('name', ''), m.get('menu_path', ''), ', '.join(m.get('routes', [])), ', '.join(rng(r) for r in m.get('src_ranges', []))])
    out.append(table(rows, [W * 0.22, W * 0.33, W * 0.25, W * 0.20]))

    out.append(P('Timestamped walkthrough', 'h2'))
    rows = [['Time', 'Screen', 'What happens / what the trainer says', 'Used in KT']]
    for s in a.get('segments', []):
        said = s.get('trainer_says') or ''
        txt = s.get('what_happens', '') + (f"  Trainer: {said}" if said and said.lower() != 'silent' else '')
        use = s.get('use_in_kt', '')
        if use != 'yes' and s.get('reason'):
            use = f"{use} ({s['reason']})"
        rows.append([f"{mmss(s.get('src_start'))}-{mmss(s.get('src_end'))}", s.get('screen', ''), txt, use])
    out.append(table(rows, [W * 0.10, W * 0.18, W * 0.55, W * 0.17]))

    out.append(P('Workflow steps', 'h2'))
    rows = [['Module', '#', 'Step', 'Status', 'Time', 'Evidence']]
    for w in a.get('workflow_steps', []):
        rows.append([w.get('module', ''), str(w.get('n', '')), w.get('step', ''), w.get('status', ''), mmss(w.get('src_t')), w.get('evidence', '')])
    out.append(table(rows, [W * 0.14, W * 0.04, W * 0.30, W * 0.10, W * 0.07, W * 0.35], status_col=3))

    out.append(P('Important fields, buttons, tabs and columns', 'h2'))
    rows = [['Screen', 'Field (as on screen)', 'Control', 'Purpose / options seen', 'Status', 'Time']]
    for f in a.get('fields', []):
        opts = f.get('options_seen') or []
        purpose = f.get('purpose', '') + (f"  Options: {', '.join(map(str, opts))}" if opts else '')
        rows.append([f"{f.get('module', '')} › {f.get('screen', '')}", f.get('label', ''), f.get('control', ''), purpose, f.get('status', ''), mmss(f.get('src_t'))])
    out.append(table(rows, [W * 0.19, W * 0.16, W * 0.10, W * 0.39, W * 0.09, W * 0.07], status_col=4))

    if a.get('rules'):
        out.append(P('Calculations, validations, dependencies and settings', 'h2'))
        rows = [['Module', 'Rule', 'Status', 'Evidence']]
        for r in a['rules']:
            rows.append([r.get('module', ''), r.get('rule', ''), r.get('status', ''), r.get('evidence', '')])
        out.append(table(rows, [W * 0.15, W * 0.40, W * 0.10, W * 0.35], status_col=2))
    if a.get('relationships'):
        out.append(P('Relationships between modules', 'h2'))
        rows = [['From', 'To', 'How', 'Status']]
        for r in a['relationships']:
            rows.append([r.get('from', ''), r.get('to', ''), r.get('how', ''), r.get('status', '')])
        out.append(table(rows, [W * 0.18, W * 0.18, W * 0.52, W * 0.12], status_col=3))
    if a.get('errors_or_issues'):
        out.append(P('Errors, failed actions and issues seen', 'h2'))
        rows = [['Time', 'What', 'Evidence']]
        for e in a['errors_or_issues']:
            rows.append([mmss(e.get('src_t')), e.get('what', ''), e.get('evidence', '')])
        out.append(table(rows, [W * 0.08, W * 0.46, W * 0.46]))
    out.append(P('Not verified / missing information', 'h2'))
    out += bullets(a.get('not_verified', []) or ['Nothing recorded.'])
    if a.get('privacy'):
        out.append(P('Personal or confidential data seen (masked in the KT videos)', 'h2'))
        out.append(P('Values are deliberately not reproduced here.', 'note'))
        rows = [['Time', 'Kind of data']]
        for pv in a['privacy']:
            rows.append([f"{mmss(pv.get('src_start'))}-{mmss(pv.get('src_end'))}", pv.get('what', '')])
        out.append(table(rows, [W * 0.14, W * 0.86]))
    if a.get('quality_notes'):
        out.append(P('Recording quality notes', 'h2'))
        out.append(P(a['quality_notes']))
    out.append(PageBreak())
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(KT, 'out', 'Progbiz_ERP_Video_Analysis_Report.pdf'))
    a = ap.parse_args()
    src = json.load(open(os.path.join(KT, 'sources.json'), encoding='utf-8'))
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    doc = SimpleDocTemplate(a.out, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title='Progbiz ERP: Video Analysis Report', author='Progbiz Software Testing team')
    W = A4[0] - 32 * mm
    vals = set()
    for s in src['recordings']:
        f = os.path.join(KT, 'analysis', s['folder'], 'analysis.json')
        if os.path.exists(f):
            for pv in json.load(open(f, encoding='utf-8')).get('privacy', []):
                for v in pv.get('texts', []) or []:
                    v = str(v).strip()
                    if len(v) >= 4 and v.lower() not in KEEP and not re.fullmatch(r'[\d.,\s₹-]+', v):
                        vals.add(v)
    for extra in json.load(open(os.path.join(KT, 'privacy_terms.json'), encoding='utf-8')).get('terms', []):
        vals.add(extra)
    SCRUB.extend(re.compile(re.escape(v), re.I) for v in sorted(vals, key=len, reverse=True))
    story = [P('Progbiz ERP: Video Analysis Report', 'title'),
             P(f"Source recordings for the Knowledge Transfer videos  ·  {datetime.date.today().strftime('%d %b %Y')}", 'sub')]
    story.append(P('Sources', 'h2'))
    rows = [['#', 'Recording', 'Length', 'Speech', 'Analysed', 'Main topics']]
    for i, s in enumerate(src['recordings'], 1):
        rows.append([str(i), s['file'], s['length'], s['speech'], s['analysed'], s['topics']])
    story.append(table(rows, [W * 0.04, W * 0.24, W * 0.08, W * 0.14, W * 0.10, W * 0.40]))
    for k in ('method', 'status_legend', 'limitations', 'missing'):
        if src.get(k):
            story.append(P(src[k]['title'], 'h2'))
            story += bullets(src[k]['items'])
    story.append(PageBreak())
    for s in src['recordings']:
        f = os.path.join(KT, 'analysis', s['folder'], 'analysis.json')
        if not os.path.exists(f):
            story += [P(s['file'], 'h1'), P('No analysis available for this recording.'), PageBreak()]
            continue
        story += recording_section(json.load(open(f, encoding='utf-8')), s['file'], W)

    def deco(c, d):
        c.saveState()
        c.setFont('Body', 7.5)
        c.setFillColor(MUTED)
        c.drawString(16 * mm, 9 * mm, 'Progbiz ERP · Video Analysis Report')
        c.drawRightString(A4[0] - 16 * mm, 9 * mm, f'Page {d.page}')
        c.restoreState()
    doc.build(story, onFirstPage=deco, onLaterPages=deco)
    print(f'wrote {os.path.relpath(a.out, ROOT)}')


if __name__ == '__main__':
    main()
