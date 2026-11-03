#!/usr/bin/env python3
"""Progbiz ERP mobile app — regression checks for issues found in earlier QA rounds.

Each check reports FIXED (PASS) or STILL PRESENT (FAIL). All checks are read-only (forms are
opened and cancelled, never saved) except R8, which logs out and is only run with --logout.

  R1  Back button closes the side drawer
  R2  Leads search filters without pressing Enter
  R3  Follow-up date picker blocks past dates (New Enquiry form; cancelled, not saved)
  R4  Complaint Dashboard shows readable status names (no raw keys like newComplaint)
  R5  Menu "New Enquiry" opens a form with a matching title
  R6  Screens load without the false offline banner (Home, Leads, CRM dashboard)
  R7  WhatsApp Chat explains what to do when no account is connected
  R8  Logout confirmation logs out                       (--logout; ends the session)
  R9  Login fields have accessibility labels             (checked after R8)

Usage (logged in, any tenant — nothing is created):
    python3 erp_regression.py --serial emulator-5554 --tenant onetouch_test [--logout]
"""
import argparse
import datetime
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from droid import Device  # noqa: E402
from erp_smoke import Runner, write_report, QA_DIR, DRAWER_MARK, OFFLINE_TEXT  # noqa: E402


class Still(Exception):
    """The old issue is still present."""


class Regression(Runner):
    def must(self, label, timeout=20, what=None):
        n = self.d.wait_for(label, timeout=timeout)
        if n is None:
            raise RuntimeError("%s not shown within %ds" % (what or repr(label), timeout))
        return n

    def drawer_item(self, section, item):
        if not self.go_home():
            raise RuntimeError("could not reach Home")
        self.open_drawer()
        if section:
            self.run_step("+" + section, in_drawer=True)
        self.tap_drawer_item(item)

    # R1
    def r1_back_closes_drawer(self, r):
        self.go_home()
        self.open_drawer()
        self.d.back(1.5)
        r["shots"].append(self.shot("r1_after_back"))
        if self.d.exists(DRAWER_MARK):
            self.close_drawer()
            raise Still("drawer still open after pressing Back")

    # R2
    def r2_search_without_enter(self, r):
        self.drawer_item("CRM", "Leads")
        self.must(re.compile(r"^In Follow Up\n\d+"), 60, "Leads counts")
        before = sorted(n.label for n in self.d.nodes() if re.match(r"^ENQ-\d+\n", n.label))
        w, h = self.d.size()
        icons = sorted([n for n in self.d.nodes() if n.clickable and not n.label and n.bounds[3] < h * 0.13
                        and n.bounds[0] > w * 0.6], key=lambda n: n.bounds[0])
        self.d.tap(icons[0], allow_unsafe=True, settle=1.5)
        box = [n for n in self.d.nodes() if n.cls.endswith("EditText")][0]
        self.d.tap(box, allow_unsafe=True, settle=1.2)
        self.d.shell("input text zzqq_no_such_lead")          # no Enter on purpose
        time.sleep(8)
        after = [n.label for n in self.d.nodes() if re.match(r"^ENQ-\d+\n", n.label)]
        r["shots"].append(self.shot("r2_typed_no_enter"))
        self.d.hide_keyboard()
        # a nonsense search must leave no lead rows; rows still listed = the search didn't run
        if after:
            raise Still("all leads still listed 8 s after typing a non-matching search (search only runs on Enter)")

    # R3
    def r3_past_dates_blocked(self, r):
        self.drawer_item("CRM", "New Enquiry")
        self.must("Add Lead", 20, "Add Lead form")
        time.sleep(4)                                 # masters load behind a spinner
        sw = []
        for _ in range(3):                            # bring the Next Followup switch well on screen
            self.d.scroll_down(0.5)
            w, h = self.d.size()
            sw = [n for n in self.d.nodes() if n.cls.endswith("Switch") and n.bounds[3] < h * 0.8]
            if sw:
                break
        if not sw:
            raise RuntimeError("Next Followup row not found")
        w, h = self.d.size()
        self.d.tap_xy(int(w * 0.8), int(sw[0].bounds[3] + (sw[0].bounds[3] - sw[0].bounds[1]) * 0.6))
        t0 = time.time()
        while time.time() - t0 < 10 and not (self.d.exists("Tomorrow", exact=True) or self.d.exists(re.compile(r"^Select date"))):
            time.sleep(0.6)
        y = datetime.date.today() - datetime.timedelta(days=1)
        if self.d.exists("Tomorrow", exact=True):                 # v2.0.59+ bottom-sheet picker
            chip = self.d.find("Yesterday", exact=True)
            if y.month != datetime.date.today().month:            # unlabelled left arrow by the month title
                title = self.d.find(re.compile(r"^\w+ \d{4}$"))
                arrows = sorted([n for n in self.d.nodes() if n.clickable and not n.label
                                 and abs(n.bounds[1] - title.bounds[1]) < 20], key=lambda n: n.bounds[0])
                self.d.tap(arrows[0], allow_unsafe=True, settle=1.0)
            h = self.d.size()[1]
            cells = [n for n in self.d.nodes() if n.label == str(y.day) and n.bounds[1] > h * 0.55]
            enabled = (chip is not None and chip.enabled) or (bool(cells) and cells[0].enabled)
            r["shots"].append(self.shot("r3_date_picker"))
        else:
            if y.month != datetime.date.today().month:
                self.d.tap("Previous month", allow_unsafe=True, settle=1.0)
            day = self.d.find(re.compile(r"^%d, \w+, %s %d, %d" % (y.day, y.strftime("%B"), y.day, y.year)))
            r["shots"].append(self.shot("r3_date_picker"))
            enabled = day is not None and day.enabled
        self.d.tap(self.d.find("Cancel", exact=True), allow_unsafe=True, settle=1.0)   # close picker
        self.d.tap(self.d.find("Cancel", exact=True), allow_unsafe=True, settle=1.5)   # discard the form
        if enabled:
            raise Still("yesterday (%s) can still be picked as the next follow-up" % y.strftime("%d %b"))

    # R4
    def r4_complaint_status_names(self, r):
        self.drawer_item("Dashboard", "Complaint")
        self.must(re.compile(r"Complaints Overview"), 60, "Complaint Dashboard")
        time.sleep(3)
        found, rows = [], []
        for _ in range(3):
            labels = self.d.labels()
            rows += [l for l in labels if re.search(r"Open By Status", l)]
            # the chart is ONE multi-line label ("Open By Status & Priority\nHigh\n…\nnewComplaint\n1…"),
            # so look at every line, not just the first
            found += [ln for l in labels for ln in l.split("\n") if re.fullmatch(r"[a-z]+[A-Z][A-Za-z]+", ln)]
            if found:
                break
            self.d.scroll_down(0.6)
        r["shots"].append(self.shot("r4_complaint_dashboard"))
        raw = sorted(set(found))
        if raw:
            raise Still("raw status keys shown: " + ", ".join(raw))
        # The "Open By Status & Priority" rows (where newComplaint / onHold appeared) are not exposed to
        # accessibility; the readable Open / In Progress / Resolved rows belong to the overview, so they
        # prove nothing. Never claim a fix we can't see.
        if not any(l.count("\n") > 4 for l in rows):          # chart missing or empty — nothing to judge
            raise RuntimeError("'Open By Status & Priority' rows are not readable by automation — "
                               "check r4_complaint_dashboard.png for keys like newComplaint / onHold")

    # R5
    def r5_new_enquiry_title(self, r):
        self.drawer_item("CRM", "New Enquiry")
        time.sleep(3)
        title = "Add Lead" if self.d.exists("Add Lead", exact=True) else \
            ("New Enquiry" if self.d.exists("New Enquiry", exact=True) else "?")
        r["shots"].append(self.shot("r5_form_title"))
        cancel = self.d.find("Cancel", exact=True)
        if cancel:
            self.d.tap(cancel, allow_unsafe=True, settle=1.5)
        if title == "Add Lead":
            raise Still("menu says New Enquiry, form is titled Add Lead")
        r["notes"].append("Form title: %s" % title)

    # R6
    def r6_offline_banner(self, r):
        seen = []
        for sec, item in ((None, None), ("CRM", "Leads"), ("Dashboard", "CRM")):
            if item:
                self.drawer_item(sec, item)
            else:
                self.go_home()
            t0 = time.time()
            while time.time() - t0 < 25:
                hit = [l.split("\n")[0] for l in self.d.labels() if OFFLINE_TEXT.search(l)]
                if hit:
                    seen.append("%s: %s" % (item or "Home", hit[0]))
                    break
                time.sleep(2)
            r["shots"].append(self.shot("r6_" + re.sub(r"\W+", "_", (item or "home").lower())))
        if seen:
            raise Still("; ".join(seen))

    # R7
    def r7_whatsapp_guidance(self, r):
        self.drawer_item(None, "WhatsApp Chat")
        time.sleep(1.5)
        r["shots"].append(self.shot("r7_whatsapp"))
        labels = " ".join(self.d.labels())
        if "Please add whatsapp account" in labels or not re.search(r"connect|set ?up|settings|contact", labels, re.I):
            raise Still("only a 'Please add whatsapp account' message, no guidance")

    # R8 + R9
    def r8_logout(self, r):
        self.go_home()
        self.tap_tab(4)
        self.must("Logout", 20, "Logout row")
        rows = [n for n in self.d.nodes() if n.label == "Logout"]
        self.d.tap(rows[-1], allow_unsafe=True, settle=1.5)
        dlg = self.must(re.compile(r"sure you want to log out"), 10, "logout dialog")
        btn = [n for n in self.d.nodes() if n.label == "Logout" and n.cls.endswith("Button")]
        self.d.tap(btn[-1], allow_unsafe=True, settle=1)
        ok = self.d.wait_for(re.compile(r"^Welcome to Progbiz|Log in to manage"), timeout=30)
        r["shots"].append(self.shot("r8_after_logout"))
        if ok is None:
            raise Still("still on the logout dialog/Profile 30 s after tapping Logout")

    def r9_login_labels(self, r):
        fields = [n for n in self.d.nodes() if n.cls.endswith("EditText")]
        unlabelled = [i for i, n in enumerate(fields) if not (n.desc or n.hint or n.text)]
        r["notes"].append("%d login fields, %d without a label" % (len(fields), len(unlabelled)))
        if unlabelled:
            raise Still("login fields have no accessibility label (screen readers can't name them)")

    def run(self, logout, only=()):
        plan = [("R1", "Back closes the side drawer", self.r1_back_closes_drawer),
                ("R2", "Leads search without Enter", self.r2_search_without_enter),
                ("R3", "Past follow-up dates blocked", self.r3_past_dates_blocked),
                ("R4", "Complaint statuses readable", self.r4_complaint_status_names),
                ("R5", "New Enquiry form title", self.r5_new_enquiry_title),
                ("R6", "No false offline banner", self.r6_offline_banner),
                ("R7", "WhatsApp setup guidance", self.r7_whatsapp_guidance)]
        if logout:
            plan += [("R8", "Logout works", self.r8_logout), ("R9", "Login field labels", self.r9_login_labels)]
        for rid, title, fn in plan:
            if only and rid not in only:
                continue
            r = {"group": rid, "name": title, "kind": "regression", "status": "PASS", "notes": [],
                 "shots": [], "load_s": None, "labels": []}
            t0 = time.time()
            try:
                fn(r)
                r["notes"].insert(0, "FIXED / OK")
            except Still as e:
                r["status"] = "FAIL"
                r["notes"].insert(0, "STILL PRESENT: %s" % e)
            except Exception as e:  # noqa: BLE001
                r["status"] = "WARN"
                r["notes"].insert(0, "Could not check: %s: %s" % (type(e).__name__, e))
                try:
                    r["shots"].append(self.shot("%s_error" % rid.lower()))
                except Exception:  # noqa: BLE001
                    pass
            if not r["shots"]:
                try:
                    r["shots"].append(self.shot("%s_end" % rid.lower()))
                except Exception:  # noqa: BLE001
                    pass
            r["notes"].append("%.0fs" % (time.time() - t0))
            self.results.append(r)
            print("  %-5s %s %-30s %s" % (r["status"], rid, title, " | ".join(r["notes"])[:150]))
            if rid == "R8" and r["status"] != "PASS":
                break                      # R9 needs the login screen


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serial", default=os.environ.get("SERIAL", "emulator-5554"))
    ap.add_argument("--tenant", default="?")
    ap.add_argument("--logout", action="store_true", help="also run R8/R9 (logs the app out at the end)")
    ap.add_argument("--only", default="", help="e.g. R4,R6")
    a = ap.parse_args()
    d = Device(a.serial)
    android = d.android_version()
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = os.path.join(QA_DIR, "reports", "erp-regression_android%s_%s" % (android, stamp))
    os.makedirs(os.path.join(out, "shots"))
    rg = Regression(d, out)
    rg.detail = False
    print("Progbiz ERP regression · Android %s · app %s → %s" % (android, d.app_version(), out))
    t0 = time.time()
    rg.run(a.logout, [x.strip().upper() for x in a.only.split(",") if x.strip()])
    meta = {"app": d.app_version(), "android": android, "serial": a.serial, "tenant": a.tenant,
            "when": datetime.datetime.now().strftime("%d %b %Y %H:%M"), "secs": int(time.time() - t0)}
    path = write_report(out, meta, rg.results, "regression checks", "ERP Regression Checks")
    print("Report: %s" % path)
    return 1 if any(r["status"] == "FAIL" for r in rg.results) else 0


if __name__ == "__main__":
    sys.exit(main())
