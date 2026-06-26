import openpyxl
wb = openpyxl.load_workbook(r"C:\Users\PROBOOK\Downloads\CRM- Test Case.xlsx", data_only=True)
ws = wb["Demo Flow"]
rows = list(ws.iter_rows(min_col=1, max_col=6, values_only=True))
cur=None
out=[]
for r in rows[1:]:
    scn,tid,title,pre,steps,exp=[(c.strip() if isinstance(c,str) else c) for c in r]
    if scn: cur=scn
    if tid:
        out.append(f"[{cur}] {tid} :: {title}\n   PRE: {pre}\n   STEPS: {steps}\n   EXP: {exp}\n")
open(r"C:\Users\PROBOOK\AppData\Local\Temp\claude\C--Users-PROBOOK-erp-tests-git-max\869abd7a-95ac-4eca-b345-a3e4f14e8d15\scratchpad\crm_cases.txt","w",encoding="utf-8").write("\n".join(out))
print("wrote", len(out), "cases")
