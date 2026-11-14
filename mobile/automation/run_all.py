#!/usr/bin/env python3
"""Run every Progbiz ERP mobile test suite in one go and write one combined report.

Suites, in this order (pick with --suites):
  release     erp_release.py     U1–U8  checks for the Oct 2026 release notes
  crm         erp_scenarios.py   S1–S6  Enquiry → Follow-up → Leads search → Quotation + PDF → Complaint → Task   (creates QA_MOB_ test data)
  regression  erp_regression.py  R1–R7  issues found in earlier rounds
  smoke       erp_smoke.py              every menu, tab and Home card            (~35 min)

Before the suites it can install an APK (--apk, keeps the login), launches the app, dismisses the
"Update Available" prompt with "Maybe Later", and makes sure the app is logged in. On the login screen it
fills the company code and username, then waits up to 10 minutes for YOU to type the password on the
emulator — it never types passwords.

Usage:
    python3 run_all.py --serial emulator-5554 --tenant ncore_test
    python3 run_all.py --serial emulator-5554 --tenant ncore_test --apk ~/Downloads/erp.apk --suites release,crm
"""
import argparse
import datetime
import glob
import html
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from droid import Device  # noqa: E402
from erp_smoke import Runner, QA_DIR, HOME_MARK, embed_image, write_report  # noqa: E402
from erp_scenarios import TEST_TENANTS  # noqa: E402

SUITES = {
    "release": ("erp_release.py", "Release-note checks (U1–U8)"),
    "crm": ("erp_scenarios.py", "CRM flow: enquiry → follow-up → search → quotation + PDF → complaint → task (S1–S6)"),
    "features": ("erp_features.py", "New features: mail, lead notes, Super Hot, WhatsApp window, purchase invoice, receipt (F1–F6)"),
    "regression": ("erp_regression.py", "Old issues re-check (R1–R7)"),
    "smoke": ("erp_smoke.py", "Every screen, tab and Home card"),
}
# Profile tab company name per tenant, to make sure test data goes to the right tenant
TENANT_COMPANY = {"ncore_test": "Ncore Builders"}


def log(msg):
    print(msg, flush=True)


def ensure_logged_in(d, tenant, user):
    rg = Runner(d, os.path.join(QA_DIR, "reports"))
    d.launch()
    t0 = time.time()
    prompted = False
    while time.time() - t0 < 660:
        rg.dismiss_interrupts()
        labels = d.labels()
        if any(HOME_MARK.match(l) for l in labels) or rg.at_home():
            return True
        edits = sorted([n for n in d.nodes() if n.cls.endswith("EditText")], key=lambda n: n.bounds[1])
        if any(l.startswith("Log in") for l in labels) and len(edits) >= 3 and not prompted:
            for i, value in ((0, tenant), (1, user)):
                if edits[i].text != value:
                    d.tap_xy(*edits[i].center)
                    time.sleep(1.2)
                    d.shell("input keyevent KEYCODE_MOVE_END")
                    for _ in range(30):
                        d.shell("input keyevent KEYCODE_DEL")
                    d.shell("input text " + value)
                    time.sleep(1)
                    edits = sorted([n for n in d.nodes() if n.cls.endswith("EditText")], key=lambda n: n.bounds[1])
            d.hide_keyboard()
            log("\n  >>> Login screen: company code %r and username %r are filled in.\n"
                "  >>> Type the password on the emulator and tap Log in (waiting up to 10 minutes)…\n" % (tenant, user))
            prompted = True
        time.sleep(5)
    return False


def profile_company(d):
    rg = Runner(d, os.path.join(QA_DIR, "reports"))
    rg.go_home()
    time.sleep(2)
    try:
        rg.tap_tab(4)
        time.sleep(4)
        labels = d.labels()
        i = next((k for k, l in enumerate(labels) if l in ("Owner", "Admin", "Super Admin")), None)
        name = labels[1] if len(labels) > 2 else "?"
        company = labels[2] if len(labels) > 2 else "?"
        if i is not None and i >= 2:
            name, company = labels[i - 2], labels[i - 1]
        return name, company
    finally:
        rg.go_home()


def run_suite(key, serial, tenant, out_dir, extra):
    script, _ = SUITES[key]
    cmd = [sys.executable, "-u", os.path.join(HERE, script), "--serial", serial, "--tenant", tenant] + extra
    logf = os.path.join(out_dir, "%s.log" % key)
    t0 = time.time()
    report = None
    with open(logf, "w") as f:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in p.stdout:
            f.write(line)
            print("    " + line.rstrip(), flush=True)
            m = re.match(r"^Report: (.+)$", line.strip())
            if m:
                report = m.group(1)
        p.wait()
    res = {"key": key, "title": SUITES[key][1], "rc": p.returncode, "secs": int(time.time() - t0),
           "report": report, "log": logf, "results": [], "meta": {}}
    if report and os.path.exists(os.path.join(os.path.dirname(report), "results.json")):
        with open(os.path.join(os.path.dirname(report), "results.json")) as f:
            data = json.load(f)
        res["results"], res["meta"] = data.get("results", []), data.get("meta", {})
    return res


SUITE_DIR = {"release": "erp-release", "crm": "erp-scenarios", "features": "erp-features", "regression": "erp-regression", "smoke": "erp-smoke"}
SUITE_TITLE = {"release": ("release-note checks", "ERP Release Checks"), "crm": ("scenario tests", "ERP Mobile Scenarios"),
               "features": ("new-feature scenarios", "ERP Mobile New Features"), "regression": ("regression checks", "ERP Regression Checks"), "smoke": ("smoke test", "ERP Mobile Smoke")}


def thumbs(result, run_dir, limit=4):
    out = []
    for rel in result.get("shots", [])[:limit]:
        path = os.path.join(result.get("_dir") or run_dir, rel)
        if os.path.exists(path):
            cap = html.escape(os.path.splitext(os.path.basename(rel))[0].replace("_", " "))
            out.append('<figure><img loading="lazy" src="%s" alt="%s"><figcaption>%s</figcaption></figure>'
                       % (embed_image(path, 300), cap, cap))
    return "".join(out) or '<p class="none">No screenshot</p>'


def write_index(out_dir, meta, runs):
    """Combined report: summary table, every FAIL/WARN with screenshots, then every check of every suite."""
    esc = html.escape
    rows, issues, sections = [], [], []
    total = {}
    for run in runs:
        c = {}
        run_dir = os.path.dirname(run["report"]) if run.get("report") else out_dir
        for r in run["results"]:
            c[r["status"]] = c.get(r["status"], 0) + 1
            total[r["status"]] = total.get(r["status"], 0) + 1
            if r["status"] in ("FAIL", "WARN"):
                issues.append((r["status"], run["title"], r, run_dir))
        link = os.path.relpath(run["report"], out_dir) if run.get("report") else None
        state = "FAIL" if c.get("FAIL") else ("WARN" if c.get("WARN") else ("PASS" if run["results"] else "ERROR"))
        files = ('<a href="%s">report</a>' % esc(link)) if link else "no report"
        if run.get("log"):
            files += ' · <a href="%s">log</a>' % esc(os.path.relpath(run["log"], out_dir))
        rows.append('<tr><td><span class="b %s">%s</span></td><td>%s</td><td class="n">%d</td><td class="n">%d</td>'
                    '<td class="n">%d</td><td class="n">%s</td><td>%s</td></tr>'
                    % (state.lower(), state, esc(run["title"]), c.get("PASS", 0), c.get("WARN", 0), c.get("FAIL", 0),
                       "%d min" % max(1, run["secs"] // 60), files))
        cards = "".join(
            '<article class="%s"><header><span class="b %s">%s</span><b>%s</b> %s</header><div class="shots">%s</div>'
            '<p>%s</p></article>'
            % (r["status"].lower(), r["status"].lower(), r["status"], esc(r["group"]), esc(r["name"]),
               thumbs(r, run_dir, 3), esc(" | ".join(n for n in r["notes"] if not re.match(r"^(Step time )?\d+s$", n))[:300]))
            for r in run["results"])
        sections.append('<h2>%s — all %d checks</h2><div class="grid">%s</div>' % (esc(run["title"]), len(run["results"]), cards))
    issues.sort(key=lambda x: 0 if x[0] == "FAIL" else 1)
    items = "".join('<li class="%s"><div><b>%s</b> · %s · <b>%s %s</b><br><span>%s</span></div><div class="shots">%s</div></li>'
                    % (s.lower(), s, esc(t), esc(r["group"]), esc(r["name"]),
                       esc(" | ".join(n for n in r["notes"] if not re.match(r"^(Step time )?\d+s$", n))[:600]),
                       thumbs(r, d)) for s, t, r, d in issues)
    page = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ERP Mobile Full Run</title>
<style>
/* Layout: one column — run summary table, every FAIL/WARN with its screenshots, then every check per suite */
:root{--bg:#f5f7fa;--card:#fff;--ink:#16191f;--muted:#5d6675;--line:#e1e5eb;--pass:#11805a;--warn:#b25000;--fail:#c0123d;--err:#5d6675}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1217;--card:#181c23;--ink:#e7eaef;--muted:#9aa3b2;--line:#2b313b;--pass:#41c98a;--warn:#f5a524;--fail:#ff5f7e;--err:#9aa3b2;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0f1217;--card:#181c23;--ink:#e7eaef;--muted:#9aa3b2;--line:#2b313b;--pass:#41c98a;--warn:#f5a524;--fail:#ff5f7e;--err:#9aa3b2;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding-block:24px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px}.meta{color:var(--muted);margin:0 0 18px}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:8px}table{width:100%%;border-collapse:collapse;background:var(--card);font-size:14px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
tr:last-child td{border-bottom:0}.n{text-align:right;font-variant-numeric:tabular-nums}a{color:inherit}
.b{font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;color:var(--card);background:var(--err);margin-right:6px}
.b.pass{background:var(--pass)}.b.warn{background:var(--warn)}.b.fail{background:var(--fail)}
ul{list-style:none;padding:0;margin:0;display:grid;gap:10px}
li{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--warn);border-radius:8px;padding:10px 12px;overflow-wrap:anywhere;min-width:0}
li.fail{border-left-color:var(--fail)}li span{color:var(--muted);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
article{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--pass);border-radius:8px;padding:10px 12px;min-width:0}
article.warn{border-left-color:var(--warn)}article.fail{border-left-color:var(--fail)}
article p{margin:6px 0 0;font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}article header{font-size:14px}
.shots{display:flex;gap:8px;margin-top:8px;overflow-x:auto}figure{margin:0;flex:0 0 auto;width:110px}
figure img{width:110px;display:block;border-radius:6px;border:1px solid var(--line)}
figcaption{font-size:10.5px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}.none{font-size:12px;color:var(--muted);margin:0}
</style></head><body><main><h1>Progbiz ERP mobile — full test run</h1><p class="meta">%s</p>
<div class="scroll"><table><tr><th>Result</th><th>Suite</th><th class="n">Pass</th><th class="n">Warn</th><th class="n">Fail</th><th class="n">Time</th><th>Files</th></tr>%s</table></div>
<h2>Failures and warnings (%d)</h2><ul>%s</ul>%s</main></body></html>""" % (
        esc("App v%(app)s · Android %(android)s · tenant %(tenant)s (%(company)s, %(user)s) · %(when)s · %(mins)s min · " % meta)
        + " · ".join("%s %d" % (k, total[k]) for k in ("PASS", "WARN", "FAIL") if k in total),
        "".join(rows), len(issues), items or "<li>None</li>", "".join(sections))
    path = os.path.join(out_dir, "index.html")
    with open(path, "w") as f:
        f.write(page)
    return path


def combine(tenant, day):
    """Latest result of every check across all of a day's runs for one tenant (same app version)."""
    runs, app, meta = [], None, None
    for sp in sorted(glob.glob(os.path.join(QA_DIR, "reports", "erp-all_%s_%s-*" % (tenant, day), "summary.json"))):
        meta = json.load(open(sp))["meta"]
    for key in SUITES:
        dirs = [d for d in sorted(glob.glob(os.path.join(QA_DIR, "reports", "%s_android*_%s-*" % (SUITE_DIR[key], day))))
                if os.path.exists(os.path.join(d, "results.json"))]
        merged, secs, last = {}, 0, None
        for d in dirs:
            data = json.load(open(os.path.join(d, "results.json")))
            m = data.get("meta", {})
            if m.get("tenant") != tenant:
                continue
            app = app or (meta or {}).get("app") or m.get("app")
            if m.get("app") != app:
                continue
            for r in data["results"]:
                merged[(r["group"], r["name"])] = dict(r, _dir=d)
            secs += m.get("secs", 0)
            last = (d, m)
        if merged:
            runs.append({"key": key, "title": SUITES[key][1], "secs": secs, "report": os.path.join(last[0], "report.html"),
                         "results": list(merged.values())})
            meta = meta or dict(last[1], company="-", user="-")
    if not runs:
        raise SystemExit("No %s runs found for %s" % (day, tenant))
    meta = dict(meta, mins=sum(r["secs"] for r in runs) // 60)
    out = os.path.join(QA_DIR, "reports", "erp-all_%s_%s-combined" % (tenant, day))
    os.makedirs(out, exist_ok=True)
    return write_index(out, meta, runs)


def rebuild(dirs):
    """Re-render suite report.html files (e.g. after a report-format change) from their results.json."""
    for d in dirs:
        key = next((k for k, pre in SUITE_DIR.items() if os.path.basename(d.rstrip("/")).startswith(pre + "_")), "smoke")
        data = json.load(open(os.path.join(d, "results.json")))
        print(write_report(d, data["meta"], data["results"], *SUITE_TITLE[key]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serial", default=os.environ.get("SERIAL", "emulator-5554"))
    ap.add_argument("--tenant", default=None, help="company code; data-creating suites need a test tenant: " + ", ".join(TEST_TENANTS))
    ap.add_argument("--user", default="admin", help="username filled on the login screen (default admin)")
    ap.add_argument("--apk", help="install this APK first (adb install -r keeps the login)")
    ap.add_argument("--suites", default="release,crm,features,regression,smoke", help="comma list of: " + ", ".join(SUITES))
    ap.add_argument("--print", dest="do_print", action="store_true", help="release U3: also open the Print PDF")
    ap.add_argument("--combine", metavar="YYYYMMDD", help="no device: one report with the latest result of every check "
                    "from that day's runs (e.g. after re-running a few checks)")
    ap.add_argument("--rebuild", nargs="+", metavar="DIR", help="no device: re-render these suite report folders")
    a = ap.parse_args()
    if a.rebuild:
        rebuild(a.rebuild)
        return 0
    if not a.tenant:
        ap.error("--tenant is required")
    if a.combine:
        log("Combined report: %s" % combine(a.tenant, a.combine))
        return 0
    suites = [s.strip().lower() for s in a.suites.split(",") if s.strip()]
    bad = [s for s in suites if s not in SUITES]
    if bad:
        log("Unknown suite(s): %s — choose from %s" % (", ".join(bad), ", ".join(SUITES)))
        return 2
    if "crm" in suites and a.tenant not in TEST_TENANTS:
        log("Refusing: the crm suite creates data — %r is not a test tenant (%s)" % (a.tenant, ", ".join(TEST_TENANTS)))
        return 2

    from droid import ADB as adb
    devs = subprocess.run([adb, "devices"], capture_output=True, text=True).stdout
    if a.serial not in devs:
        log("Device %s is not running — start it first, e.g.  emu start 13" % a.serial)
        return 2
    d = Device(a.serial)
    if a.apk:
        apk = os.path.expanduser(a.apk)
        log("Installing %s …" % apk)
        out = subprocess.run([adb, "-s", a.serial, "install", "-r", apk], capture_output=True, text=True)
        log("  " + (out.stdout.strip().splitlines() or [out.stderr.strip()])[-1])
        if "Success" not in out.stdout:
            return 2
    log("App version on %s: %s" % (a.serial, d.app_version()))
    if not ensure_logged_in(d, a.tenant, a.user):
        log("Not logged in after 10 minutes — stopping.")
        return 2
    name, company = profile_company(d)
    log("Logged in as %s · %s" % (name, company))
    want = TENANT_COMPANY.get(a.tenant)
    if want and want != company:
        log("Refusing: tenant %r should be %r but the app shows %r — log in to the right company first."
            % (a.tenant, want, company))
        return 2

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = os.path.join(QA_DIR, "reports", "erp-all_%s_%s" % (a.tenant, stamp))
    os.makedirs(out_dir)
    t0 = time.time()
    runs = []
    for key in suites:
        log("\n=== %s (%s) ===" % (SUITES[key][1], SUITES[key][0]))
        extra = ["--print"] if (key == "release" and a.do_print) else []
        runs.append(run_suite(key, a.serial, a.tenant, out_dir, extra))
        log("    → %s finished in %d min (exit %d)" % (key, runs[-1]["secs"] // 60, runs[-1]["rc"]))
    meta = {"app": d.app_version(), "android": d.android_version(), "tenant": a.tenant, "company": company,
            "user": name, "when": datetime.datetime.now().strftime("%d %b %Y %H:%M"), "mins": int((time.time() - t0) / 60)}
    with open(os.path.join(out_dir, "summary.json"), "w") as f:
        json.dump({"meta": meta, "runs": [{k: v for k, v in r.items() if k != "results"} for r in runs]}, f, indent=2)
    path = write_index(out_dir, meta, runs)
    log("\nAll done in %d min. Combined report: %s" % (meta["mins"], path))
    fails = sum(1 for r in runs for x in r["results"] if x["status"] == "FAIL")
    return 1 if fails or any(r["report"] is None for r in runs) else 0


if __name__ == "__main__":
    sys.exit(main())
