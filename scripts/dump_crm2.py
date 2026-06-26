import openpyxl
wb = openpyxl.load_workbook(r"C:\Users\PROBOOK\Downloads\CRM- Test Case.xlsx", data_only=True)
ws = wb["Demo Flow"]
rows = list(ws.iter_rows(min_col=1, max_col=6, values_only=True))
from collections import OrderedDict
groups = OrderedDict()
cur = None
ncases = 0
for i, r in enumerate(rows[1:], start=2):
    scn, tid, title, pre, steps, exp = [(c.strip() if isinstance(c,str) else c) for c in r]
    if scn: cur = scn
    if tid:
        ncases += 1
        groups.setdefault(cur or '(none)', []).append((tid, title))
print("TOTAL test-case IDs:", ncases)
print("SCENARIO GROUPS:", len(groups))
for g, items in groups.items():
    print(f"\n## {g}  ({len(items)} cases)")
    for tid, title in items[:60]:
        print(f"   {tid} | {title}")
