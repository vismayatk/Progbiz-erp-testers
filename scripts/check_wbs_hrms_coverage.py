# -*- coding: utf-8 -*-
"""Verify the HRMS WBS covers every crawled HRMS route.

Cross-checks docs/excel/WBS_HRMS.xlsx against the 80 routes captured in
hrms/data/pages/*.json, so the estimate can't silently miss a page.
"""
import openpyxl, json, os, re

HERE = os.path.dirname(__file__)
XLSX = os.path.join(HERE, "..", "docs", "excel", "WBS_HRMS.xlsx")
PAGES = os.path.join(HERE, "..", "hrms", "data", "pages")

routes = set()
for f in os.listdir(PAGES):
    if f.endswith(".json"):
        d = json.load(open(os.path.join(PAGES, f), encoding="utf-8"))
        if d.get("route"):
            routes.add(d["route"])

ws = openpyxl.load_workbook(XLSX)["WBS Tracker"]
text = " ".join(
    str(c.value or "")
    for row in ws.iter_rows(min_row=2)
    for c in row
)
mentioned = set(re.findall(r"/([A-Za-z0-9\-/]+)", text))

covered, missing = set(), set()
for r in sorted(routes):
    # a route counts as covered if it (or its page-name tail) appears in the WBS
    tail = r.split("/")[-1]
    if r in mentioned or tail in mentioned or tail in text:
        covered.add(r)
    else:
        missing.add(r)

print(f"crawled routes : {len(routes)}")
print(f"covered in WBS : {len(covered)}")
print(f"MISSING        : {len(missing)}")
for m in sorted(missing):
    print("   -", m)
