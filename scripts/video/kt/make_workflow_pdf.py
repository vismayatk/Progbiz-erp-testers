#!/usr/bin/env python3
"""Progbiz_ERP_Module_Workflow_Summary.pdf: one section per KT module - purpose, menu path, verified steps,
key fields, rules and calculations, and what the recordings do not show - with the chapter time in both videos.

  python3 scripts/video/kt/make_workflow_pdf.py

Reads : scripts/video/kt/kt_modules.py, reports/video/kt/build/chapters_{en,ml}.json
Writes: reports/video/kt/out/Progbiz_ERP_Module_Workflow_Summary.pdf
"""
import datetime
import json
import os
import sys
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

sys.path.insert(0, os.path.dirname(__file__))
from kt_modules import MODULES  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
KT = os.path.join(ROOT, 'reports', 'video', 'kt')
SUP = '/System/Library/Fonts/Supplemental/'
pdfmetrics.registerFont(TTFont('Body', SUP + 'Arial Unicode.ttf'))
pdfmetrics.registerFont(TTFont('Bold', SUP + 'Arial Bold.ttf'))
BLUE, INK, MUTED, LINE, HEAD = colors.HexColor('#0068EE'), colors.HexColor('#0F172A'), colors.HexColor('#5B667A'), colors.HexColor('#D5DCE6'), colors.HexColor('#EAF2FE')
NOTE_BG = colors.HexColor('#FFF6E0')
S = {
    'title': ParagraphStyle('t', fontName='Bold', fontSize=24, leading=29, textColor=INK, spaceAfter=6),
    'sub': ParagraphStyle('s', fontName='Body', fontSize=12, leading=16, textColor=MUTED, spaceAfter=14),
    'h1': ParagraphStyle('h1', fontName='Bold', fontSize=17, leading=21, textColor=INK, spaceAfter=4),
    'meta': ParagraphStyle('m', fontName='Body', fontSize=8.8, leading=12, textColor=MUTED, spaceAfter=8),
    'h2': ParagraphStyle('h2', fontName='Bold', fontSize=11.5, leading=15, textColor=BLUE, spaceBefore=9, spaceAfter=4),
    'p': ParagraphStyle('p', fontName='Body', fontSize=9.8, leading=13.6, textColor=INK, spaceAfter=4),
    'li': ParagraphStyle('li', fontName='Body', fontSize=9.6, leading=13.2, textColor=INK, leftIndent=16, bulletIndent=2, spaceAfter=2.5),
    'cell': ParagraphStyle('c', fontName='Body', fontSize=8.8, leading=11.6, textColor=INK),
    'cellb': ParagraphStyle('cb', fontName='Bold', fontSize=8.8, leading=11.6, textColor=INK),
}
P = lambda t, s='p': Paragraph(escape(str(t)), S[s])


def mmss(s):
    return f'{int(s // 60)}:{int(s % 60):02d}'


def chapter_times(lang):
    f = os.path.join(KT, 'build', f'chapters_{lang}.json')
    if not os.path.exists(f):
        return {}
    return {c['number']: c['start'] for c in json.load(open(f))['chapters'] if c.get('number')}


def table(rows, widths, bold_first_col=False):
    data = []
    for i, r in enumerate(rows):
        data.append([Paragraph(escape(str(c)), S['cellb' if i == 0 or (bold_first_col and j == 0) else 'cell']) for j, c in enumerate(r)])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, LINE), ('BACKGROUND', (0, 0), (-1, 0), HEAD), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                           ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5), ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]))
    return t


def main():
    out = os.path.join(KT, 'out', 'Progbiz_ERP_Module_Workflow_Summary.pdf')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    en, ml = chapter_times('en'), chapter_times('ml')
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title='Progbiz ERP: Module Workflow Summary', author='Progbiz Software Testing team')
    W = A4[0] - 32 * mm
    story = [P('Progbiz ERP: Module Workflow Summary', 'title'),
             P(f"Companion to the Knowledge Transfer videos (English and Malayalam)  ·  {datetime.date.today().strftime('%d %b %Y')}", 'sub'),
             P('Every step, field and rule below was verified in the source training recordings. Explanations the trainer gave but did not show are marked "(trainer)". '
               'The "Seen in the recording / not shown" box lists failed actions, unsaved steps and missing parts, so they are not mistaken for working behaviour.'),
             Spacer(1, 6)]
    rows = [['#', 'Module', 'Source recording', 'English video', 'Malayalam video']]
    for m in MODULES:
        rows.append([str(m['n']), m['title'], m['src'], mmss(en[m['n']]) if m['n'] in en else '-', mmss(ml[m['n']]) if m['n'] in ml else '-'])
    story += [table(rows, [W * 0.05, W * 0.27, W * 0.38, W * 0.15, W * 0.15]), PageBreak()]
    for m in MODULES:
        head = [P(f"Module {m['n']} · {m['title']}", 'h1'),
                P(f"Source: {m['src']}   ·   English video {mmss(en[m['n']]) if m['n'] in en else '-'}   ·   Malayalam video {mmss(ml[m['n']]) if m['n'] in ml else '-'}", 'meta'),
                P(m['purpose']), P('Menu path', 'h2'), P(m['menu'])]
        story.append(KeepTogether(head))
        story.append(P('Workflow (verified)', 'h2'))
        story += [Paragraph(escape(s), S['li'], bulletText=f'{i}.') for i, s in enumerate(m['steps'], 1)]
        if m['fields']:
            story.append(P('Key fields', 'h2'))
            story.append(table([['Field (as on screen)', 'What it is for']] + [list(f) for f in m['fields']], [W * 0.32, W * 0.68], bold_first_col=True))
        if m['rules']:
            story.append(P('Rules and calculations', 'h2'))
            story += [Paragraph(escape(r), S['li'], bulletText='•') for r in m['rules']]
        if m['notes']:
            box = Table([[Paragraph('<b>Seen in the recording / not shown</b>', S['cell'])]] + [[Paragraph('• ' + escape(n), S['cell'])] for n in m['notes']], colWidths=[W])
            box.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), NOTE_BG), ('LEFTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 2.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5)]))
            story += [Spacer(1, 8), box]
        story.append(PageBreak())

    def deco(c, d):
        c.saveState(); c.setFont('Body', 7.5); c.setFillColor(MUTED)
        c.drawString(16 * mm, 9 * mm, 'Progbiz ERP · Module Workflow Summary'); c.drawRightString(A4[0] - 16 * mm, 9 * mm, f'Page {d.page}')
        c.restoreState()
    doc.build(story, onFirstPage=deco, onLaterPages=deco)
    print(f'wrote {os.path.relpath(out, ROOT)}')


if __name__ == '__main__':
    main()
