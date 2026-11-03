#!/usr/bin/env python3
"""Progbiz ERP mobile app — end-to-end scenario tests (these CREATE test data).

Scenarios (every record is named QA_MOB_<unix time>, on a TEST tenant only):
  S1  New Enquiry  — fill the Add Lead form (phone, name, place, item search, description,
                     next follow-up date, assignee) → Save → Enquiry Overview shows the same data
  S2  Follow-up    — on that enquiry: ⋮ → Followup → status "Call not answering", Lead Quality,
                     next date, description → Save → Follow-Up History shows the entry
  S3  Leads search — Leads → search the QA name (keyboard Enter) → found under "In Follow Up"

Safety: only records this run created are edited; nothing is deleted, approved, transferred,
checked in/out; the deny list in droid.py stays on for every tap except the explicit Saves.

Usage (app logged in on a test tenant):
    python3 erp_scenarios.py --serial emulator-5556 --tenant onetouch_test
    python3 erp_scenarios.py --only S1,S3
"""
import argparse
import datetime
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from droid import Device  # noqa: E402
from erp_smoke import Runner, write_report, QA_DIR, DRAWER_MARK  # noqa: E402

TEST_TENANTS = ("lesol_test", "onetouch_test", "ncore_test")
ITEM_SEARCH = {"ncore_test": "Test"}                 # item search text per tenant (default "Bio")
STATUS_PREF = ["Call not answering", "Contacted", "Follow-up Pending"]   # first one the tenant has is used
DATE_TIME = re.compile(r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2} [AP]M$")


class Fail(Exception):
    pass


class Scenarios(Runner):
    def __init__(self, d, out, tenant):
        Runner.__init__(self, d, out)
        self.ts = int(time.time())
        self.name = "QA_MOB_%d" % self.ts
        self.phone = "5" + str(self.ts)[-8:]          # UAE-style 9-digit mobile, obviously fake
        self.enq = None
        self.tenant = tenant
        self.user = "Super Admin"                     # assignee shown on the overview; read from Home in run()

    # ---- small helpers ---------------------------------------------------------------
    def edits(self):
        return [n for n in self.d.nodes() if n.cls.endswith("EditText")]

    def cust_field(self, i):
        """i-th EditText (0 phone, 1 name, 2 place) inside the CUSTOMER DETAILS card."""
        def pick(edits):
            for _ in range(3):
                grp = self.d.find(re.compile(r"^CUSTOMER DETAILS"))
                if grp:
                    x1, y1, x2, y2 = grp.bounds
                    inside = sorted([e for e in self.edits() if y1 <= e.center[1] <= y2], key=lambda e: e.bounds[1])
                    if len(inside) >= 3:
                        return inside[i]
                self.d.scroll_up(0.5)
            raise Fail("Customer Details fields not found")
        return pick

    def type_into(self, pick, text, what, hide=True):
        """pick(edits) -> EditText node. Close the keyboard (it scrolls the form), tap, type, verify.
        hide=False inside sheets/search bars, where Back would close the sheet instead."""
        for attempt in range(2):
            if hide:
                self.d.hide_keyboard()
                time.sleep(0.6)
            node = pick(self.edits())
            self.d.tap(node, allow_unsafe=True, settle=1.3)   # form field, not an action button
            self.d.shell("input text %s" % text.replace(" ", "%s"))
            time.sleep(0.8)
            if any(e.text == text for e in self.edits()):
                return
        raise Fail("could not type %s" % what)

    def must(self, label, timeout=15, what=None):
        n = self.d.wait_for(label, timeout=timeout)
        if n is None:
            raise Fail("%s not shown within %ds" % (what or repr(label), timeout))
        return n

    def tap_right_of(self, y):
        w, h = self.d.size()
        self.d.tap_xy(int(w * 0.8), int(y))
        time.sleep(1.5)

    def pick_date(self, days_ahead):
        """Date picker → day N days ahead (next month if needed) → confirm → time picker → confirm.
        v2.0.59+: bottom sheet (Today/Yesterday/Tomorrow chips, bare day numbers, Select button).
        Older builds: Material dialog ("Select date", "15, Thursday, October 15, 2026", OK)."""
        day = datetime.date.today() + datetime.timedelta(days=days_ahead)
        new = None
        t0 = time.time()
        while time.time() - t0 < 8:
            if self.d.exists("Tomorrow", exact=True):
                new = True
                break
            if self.d.exists(re.compile(r"^Select date")):
                new = False
                break
            time.sleep(0.6)
        if new is None:
            raise Fail("date picker not shown within 8s")
        if new:
            if day.month != datetime.date.today().month:       # arrow right of the month title, no label
                arrows = sorted([n for n in self.d.nodes() if n.clickable and not n.label
                                 and abs(n.bounds[1] - self.d.find(re.compile(r"^\w+ \d{4}$")).bounds[1]) < 20],
                                key=lambda n: n.bounds[0])
                self.d.tap(arrows[-1], allow_unsafe=True, settle=1.0)
            cells = [n for n in self.d.nodes() if n.label == str(day.day) and n.clickable
                     and n.bounds[1] > self.d.size()[1] * 0.55]     # grid cells, not other screens' numbers
            if not cells:
                raise Fail("day %d not found in the date picker" % day.day)
            self.d.tap(cells[0], allow_unsafe=True, settle=0.6)
            confirm = "Select"
        else:
            if day.month != datetime.date.today().month:
                self.d.tap("Next month", allow_unsafe=True, settle=1.0)
            self.d.tap(re.compile(r"^%d, \w+, %s %d, %d" % (day.day, day.strftime("%B"), day.day, day.year)),
                       allow_unsafe=True, settle=0.6)
            confirm = "OK"
        self.d.tap(self.d.find(confirm, exact=True), allow_unsafe=True, settle=1.5)
        self.must("Now" if new else re.compile(r"Select time"), 8, "time picker")
        self.d.tap(self.d.find(confirm, exact=True), allow_unsafe=True, settle=1.5)
        return day

    def save_and_wait(self, until, timeout=60):
        t0 = time.time()
        self.d.tap(self.d.find("Save", exact=True), allow_unsafe=True, settle=0.5)
        n = self.d.wait_for(until, timeout=timeout, interval=1.0)
        if n is None:
            raise Fail("after Save, %r did not appear within %ds" % (until, timeout))
        return round(time.time() - t0, 1)

    def banner_note(self, r):
        offline = [l for l in self.d.labels() if re.search(r"no internet|Connection lost", l)]
        if offline:
            r["notes"].append("App showed offline banner: " + offline[0].split("\n")[0])

    def open_drawer_item(self, section, item):
        if not self.go_home():
            raise Fail("could not reach Home")
        self.open_drawer()
        self.run_step("+" + section, in_drawer=True)
        self.tap_drawer_item(item)

    # ---- scenarios -------------------------------------------------------------------
    def s1_new_enquiry(self, r):
        self.open_drawer_item("CRM", "New Enquiry")
        self.must("Add Lead", 15, "Add Lead form")
        time.sleep(2)                                   # form loads masters (spinner)
        self.type_into(self.cust_field(0), self.phone, "phone")
        # Entering the phone starts a customer lookup: Customer Name becomes a loading placeholder
        # and anything typed before it finishes is lost. Wait for the field to come back.
        self.d.hide_keyboard()
        t0 = time.time()
        time.sleep(2)                                   # let the lookup start
        while time.time() - t0 < 180:
            grp = self.d.find(re.compile(r"^CUSTOMER DETAILS"))
            if grp and len([e for e in self.edits() if grp.bounds[1] <= e.center[1] <= grp.bounds[3]]) >= 3:
                break
            time.sleep(2)
        else:
            raise Fail("customer lookup after entering the phone did not finish in 180s")
        look = time.time() - t0
        r["notes"].append("Phone lookup (Customer Name locked) took %.0fs" % look)
        if look > 5:
            r["status"] = "WARN"
        self.type_into(self.cust_field(1), self.name, "customer name")
        self.type_into(self.cust_field(2), "QA_Place", "place")
        self.d.hide_keyboard()
        time.sleep(1)
        # Item: the row directly above the Quantity field (EditText showing "1")
        qty = next(e for e in self.edits() if e.text == "1")
        self.tap_right_of(qty.bounds[1] - (qty.bounds[3] - qty.bounds[1]) / 2)
        self.must("Search Items", 10, "item search sheet")
        term = ITEM_SEARCH.get(self.tenant, "Bio")
        self.type_into(lambda e: e[0], term, "item search", hide=False)
        time.sleep(2.5)
        items = [n for n in self.d.nodes() if n.cls.endswith("Button") and "\nPrice" in n.label]
        if not items:
            raise Fail("item search for %r returned nothing" % term)
        item = items[0].label.split("\n")[0]
        self.d.tap(items[0], allow_unsafe=True, settle=2)
        self.d.hide_keyboard()
        self.must(item, 8, "selected item on the form")
        desc = "QA_mobile_automation_%d" % self.ts
        self.type_into(lambda e: [x for x in e if x.text == "" and x.bounds[3] - x.bounds[1] > 200][0],
                       desc, "description")
        self.d.hide_keyboard()
        self.d.scroll_down(0.4)
        sw = [n for n in self.d.nodes() if n.cls.endswith("Switch")]
        if not sw:
            raise Fail("Next Followup switch not found")
        self.tap_right_of(sw[0].bounds[3] + (sw[0].bounds[3] - sw[0].bounds[1]) * 0.6)
        day = self.pick_date(2)
        if not self.d.wait_for(DATE_TIME, timeout=5):
            raise Fail("next follow-up date not shown on the form")
        choose = self.d.find("Choose", exact=True)
        if choose:                                      # Assign To resets after the phone lookup
            self.d.tap(choose, allow_unsafe=True, settle=1.2)
            self.d.tap(self.d.find("You", exact=True), allow_unsafe=True, settle=1.2)
        r["shots"].append(self.shot("s1_form_filled"))
        # re-check the customer fields right before saving (once seen: name blank at Save)
        self.d.scroll_up(0.9)
        self.d.scroll_up(0.9)
        vals = [e.text for e in self.edits()]
        if self.name not in vals:
            r["notes"].append("Customer Name was blank again before Save (typed earlier) — re-typed it")
            r["status"] = "WARN"
            self.type_into(self.cust_field(1), self.name, "customer name (retry)")
            self.d.hide_keyboard()
        secs = self.save_and_wait(re.compile(r"^Enquiry Number"), 60)
        r["load_s"] = secs
        self.banner_note(r)
        info = self.must(re.compile(r"^Enquiry Number"), 5).label.replace("\n", " ")
        r["shots"].append(self.shot("s1_overview"))
        m = re.search(r"Enquiry Number\s+(ENQ-\d+)", info)
        self.enq = m.group(1) if m else "?"
        for want in (self.name, "QA_Place", "New", self.user, day.strftime("%d/%m/%Y")):
            if want not in info:
                raise Fail("Enquiry Overview is missing %r" % want)
        phone = self.d.find(re.compile(r"\+\d{1,3}" + self.phone))   # +971 on onetouch, +91 on ncore
        if not phone:
            raise Fail("Enquiry Overview is missing the phone number")
        self.d.tap("Item Details", allow_unsafe=True, settle=2)
        det = " ".join(self.d.labels())
        if item not in det or desc not in det:
            raise Fail("Item Details tab is missing the item or description")
        r["notes"].append("Created %s for %s (item %s); save took %.1fs" % (self.enq, self.name, item, secs))
        if secs > 10:
            r["notes"].append("Slow save: %.1fs from Save to the overview" % secs)
            r["status"] = "WARN"

    def open_enquiry(self, name):
        """Leads → search name (Enter) → open the row → wait for Enquiry Overview."""
        self.open_drawer_item("CRM", "Leads")
        self.must(re.compile(r"^In Follow Up"), 30, "Leads tabs")
        w, h = self.d.size()
        icons = sorted([n for n in self.d.nodes() if n.clickable and not n.label and n.bounds[3] < h * 0.13
                        and n.bounds[0] > w * 0.6], key=lambda n: n.bounds[0])
        self.d.tap(icons[0], allow_unsafe=True, settle=2)            # magnifier (left of filter)
        self.type_into(lambda e: e[0], name, "search text", hide=False)
        self.d.shell("input keyevent 66")                             # search runs on Enter only
        self.d.hide_keyboard()
        # the search box also contains the name — the result row starts with the ENQ number
        return self.must(re.compile(r"^ENQ-\d+\n.*" + re.escape(name), re.S), 60, "search result row")

    def s2_followup(self, r):
        if not self.enq:
            raise Fail("S1 did not create an enquiry")
        if not self.d.exists("Enquiry Overview", exact=True):
            row = self.open_enquiry(self.name)
            m = re.match(r"(ENQ-\d+)", row.label)
            self.enq = m.group(1) if m else self.enq
            self.d.tap(row, allow_unsafe=True, settle=2)
            t0 = time.time()
            self.must(re.compile(r"^Enquiry Number"), 120, "Enquiry Overview")
            r["notes"].append("Opening %s took %.0fs" % (self.enq, time.time() - t0))
        w, h = self.d.size()
        menu = [n for n in self.d.nodes() if n.clickable and n.bounds[0] > w * 0.85 and n.bounds[3] < h * 0.13]
        self.d.tap(menu[0], allow_unsafe=True, settle=1.5)
        self.d.tap(self.must("Followup", 10, "Actions menu"), allow_unsafe=True, settle=3)
        self.must("Followup Status", 15, "Followup form")
        t0 = time.time()
        self.d.tap(self.must("Choose", 120, "Followup Status options (still loading)"), allow_unsafe=True, settle=1.5)
        if time.time() - t0 > 5:
            r["notes"].append("Followup Status options took %.0fs to load" % (time.time() - t0))
            r["status"] = "WARN"
        # status lists differ per tenant (onetouch: Call not answering…; ncore: Contacted, Follow-up Pending…)
        self.must(re.compile(r"."), 15)
        time.sleep(1)
        status = next((st for st in STATUS_PREF if self.d.exists(st, exact=True)), None)
        if status is None:
            raise Fail("no follow-up status from %s in the list: %s" % (STATUS_PREF, ", ".join(self.d.labels()[:15])))
        self.d.tap(self.d.find(status, exact=True), allow_unsafe=True, settle=2)
        self.status = status
        self.quality = None
        if self.d.exists("Lead Quality", exact=True):  # not every tenant has Lead Quality
            self.d.tap(self.must("Choose", 30, "Lead Quality options"), allow_unsafe=True, settle=1.5)
            self.d.tap(self.must("Warm", 15), allow_unsafe=True, settle=1.5)
            self.quality = "Warm"
        else:
            r["notes"].append("No Lead Quality field on this tenant's Followup form")
        lbl = self.must(re.compile(r"^Next Follow-?up Date$"), 10, "Next Followup Date")
        self.tap_right_of(lbl.center[1])
        day = self.pick_date(4)
        desc = "QA_followup_%d" % self.ts
        self.type_into(lambda e: [x for x in e if x.bounds[3] - x.bounds[1] > 200][0], desc, "follow-up description")
        self.d.hide_keyboard()
        r["shots"].append(self.shot("s2_followup_form"))
        secs = self.save_and_wait(re.compile(r"Enquiry Overview"), 60)
        r["load_s"] = secs
        self.banner_note(r)
        self.d.tap(re.compile(r"^Follow-Up History"), allow_unsafe=True, settle=2)
        squash = lambda t: re.sub(r"\s+", "", t)       # long values wrap onto two lines
        t0 = time.time()
        while True:
            hist = squash(" ".join(self.d.labels()))
            missing = [w for w in (squash(self.status), day.strftime("%d/%m/%Y"), squash(desc)) if w not in hist]
            if squash(desc) in hist and not missing or time.time() - t0 > 30:
                break
            time.sleep(2)
        r["shots"].append(self.shot("s2_history"))
        if squash(desc) not in hist:
            raise Fail("Follow-Up History is missing the description %r" % desc)
        if missing:
            # v2.0.59: the history card's accessibility label is the description only — status and next
            # follow-up date are on screen but not exposed (screen readers/automation can't read them).
            r["notes"].append("History card exposes only the description to accessibility; not readable: %s "
                              "— check s2_history.png" % ", ".join(missing))
            r["status"] = "WARN"
        r["notes"].append("Follow-up saved on %s in %.1fs" % (self.enq, secs))
        r["notes"].insert(0, "Status: %s" % self.status)
        if self.quality and self.quality not in hist:
            r["notes"].append("Lead Quality (%s) is not shown in Follow-Up History" % self.quality)
        if secs > 10:
            r["notes"].append("Slow save: %.1fs" % secs)
            r["status"] = "WARN"

    def s3_search(self, r):
        self.d.back(1.5)
        t0 = time.time()
        self.open_enquiry(self.name)
        self.must(re.compile(r"^In Follow Up\n1\b"), 60, "search result count")
        self.d.tap(re.compile(r"^In Follow Up"), allow_unsafe=True, settle=3)
        row = self.must(re.compile(r"^ENQ-\d+\n.*" + re.escape(self.name), re.S), 15, "search result row")
        r["load_s"] = round(time.time() - t0, 1)
        r["shots"].append(self.shot("s3_search"))
        if getattr(self, "quality", None) and self.quality not in row.label:
            r["notes"].append("Result row does not show the Lead Quality")
        r["notes"].append("Found %s under In Follow Up" % self.enq)

    def run(self, only):
        if self.go_home():                            # "Hello Nihal" → the assignee the overview should show
            hello = next((l for l in self.d.labels() if l.startswith("Hello ")), "")
            name = re.sub(r"[^\w .'-]", "", hello[len("Hello "):]).strip()
            if name:
                self.user = name
        plan = [("S1", "New Enquiry → overview", self.s1_new_enquiry),
                ("S2", "Follow-up update → history", self.s2_followup),
                ("S3", "Leads search", self.s3_search)]
        for sid, title, fn in plan:
            if only and sid not in only:
                continue
            r = {"group": sid, "name": title, "kind": "scenario", "status": "PASS", "notes": [],
                 "shots": [], "load_s": None, "labels": []}
            self.d.clear_logs()
            t0 = time.time()
            try:
                fn(r)
            except Exception as e:  # noqa: BLE001
                r["status"] = "FAIL"
                r["notes"].append("%s: %s" % (type(e).__name__, e))
                try:
                    r["shots"].append(self.shot("%s_error" % sid.lower()))
                except Exception:  # noqa: BLE001
                    pass
            crash = self.d.crash_log()
            if crash:
                r["status"] = "FAIL"
                r["notes"].append("CRASH/ANR:\n" + crash[:1500])
            if not r["shots"]:
                try:
                    r["shots"].append(self.shot("%s_end" % sid.lower()))
                except Exception:  # noqa: BLE001
                    pass
            r["notes"].append("Step time %.0fs" % (time.time() - t0))
            self.results.append(r)
            print("  %-5s %s %-30s %s" % (r["status"], sid, title, " | ".join(r["notes"])[:160]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serial", default=os.environ.get("SERIAL", "emulator-5556"))
    ap.add_argument("--tenant", required=True, help="must be a test tenant: " + ", ".join(TEST_TENANTS))
    ap.add_argument("--only", default="", help="e.g. S1,S3")
    ap.add_argument("--enquiry", default="", help="reuse an enquiry this suite created earlier (QA_MOB_...) and skip S1")
    a = ap.parse_args()
    if a.tenant not in TEST_TENANTS:
        print("Refusing: scenario tests create data — use a test tenant (%s)" % ", ".join(TEST_TENANTS))
        return 2
    d = Device(a.serial)
    android = d.android_version()
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = os.path.join(QA_DIR, "reports", "erp-scenarios_android%s_%s" % (android, stamp))
    os.makedirs(os.path.join(out, "shots"))
    sc = Scenarios(d, out, a.tenant)
    sc.detail = False
    only = [x.strip().upper() for x in a.only.split(",") if x.strip()]
    if a.enquiry:
        if not a.enquiry.startswith("QA_MOB_"):
            print("Refusing: --enquiry must be a QA_MOB_ record created by this suite")
            return 2
        sc.name, sc.enq = a.enquiry, "existing"
        sc.ts = int(a.enquiry.split("_")[-1])
        only = [x for x in (only or ["S2", "S3"]) if x != "S1"]
    print("Progbiz ERP scenarios · Android %s · %s · data prefix %s → %s" % (android, a.tenant, sc.name, out))
    t0 = time.time()
    sc.run(only)
    sc.go_home()
    meta = {"app": d.app_version(), "android": android, "serial": a.serial, "tenant": a.tenant,
            "when": datetime.datetime.now().strftime("%d %b %Y %H:%M"), "secs": int(time.time() - t0)}
    path = write_report(out, meta, sc.results, "scenario tests", "ERP Mobile Scenarios")
    print("Created: %s (%s)" % (sc.name, sc.enq or "no enquiry"))
    print("Report: %s" % path)
    return 1 if any(r["status"] == "FAIL" for r in sc.results) else 0


if __name__ == "__main__":
    sys.exit(main())
