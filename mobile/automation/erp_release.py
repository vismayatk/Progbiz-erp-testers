#!/usr/bin/env python3
"""Progbiz ERP mobile app — release-note checks (Oct 2026 release notes, first verified on v2.0.61).

  U1  Complaints: attach images, files and voice notes        New Complaint → attach a test photo → Remove → Cancel
  U2  Cheque Management module                                6 screens + 3 add forms opened and closed
  U3  Work Flow Collection: next follow-up, opening collection, print
  U4  Profile: Availability option                            read only — the toggle is never switched
  U5  Work Flow / Work Flow task custom fields                 New <work flow> form + a work flow task
  U6  Work Flow (Solar section): Consumer field               only testable when the tenant has a Solar type
  U7  Work Flow Collection cards show "Added by"
  U8  Phone number fields accept only 5–20 digits             Add Lead form, 4 / 21 / 6 / 20 digits

Everything is read-only (forms are opened and cancelled) except:
  * U1 pushes a small QA_attach_test.png into the emulator's Download folder (the photo is never saved);
  * U8 saves an Add Lead when the app ACCEPTS a phone length (6 or 20 digits) — at most two leads named
    QA_MOB_<timestamp>, and only on a test tenant. Numbers that match an existing customer are skipped.
Voice notes are not recorded (that needs the microphone), and Print opens the PDF viewer only with --print.

Usage (logged in):
    python3 erp_release.py --serial emulator-5554 --tenant ncore_test [--only U1,U8] [--print]
"""
import argparse
import datetime
import os
import re
import struct
import sys
import time
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from droid import Device  # noqa: E402
from erp_smoke import write_report, QA_DIR  # noqa: E402
from erp_scenarios import Scenarios, Fail, TEST_TENANTS, ITEM_SEARCH, DATE_TIME, IMAGE_NAME  # noqa: E402

HEADER = re.compile(r"^(.+), (Collapsed|Expanded)$")
COUNTER = re.compile(r"^\d+/\d+$")
NOT_WORKFLOW = {"Dashboard", "Task Management", "CRM", "Complaints", "Accounts", "HRMS", "My Workspace"}
CHEQUE = [("Cheque Collection", "Cheques Collected", "New Collection"),
          ("Cheque Collection", "Ready for Deposit", None),
          ("Cheque Collection", "Deposited Cheques", None),
          ("Cheque Issue", "Issued Cheques", "Issue Cheques"),
          ("Cheque Issue", "Uncleared Cheques", None),
          ("Cheque Issue", "Cheque Master", "Add Cheque Book")]


class Missing(Exception):
    """The release-note feature is not in the app (reported as FAIL)."""


class NotTestable(Exception):
    """The tenant has no data/setup to test this item (reported as WARN)."""


class Release(Scenarios):
    def __init__(self, d, out, tenant, do_print=False):
        Scenarios.__init__(self, d, out, tenant)
        self.do_print = do_print
        self._wf = None
        self._toplevel = None
        self.coll = {}                     # what U3 learned, reused by U7

    # ---- menu helpers --------------------------------------------------------------------
    def drawer(self):
        for _ in range(3):
            if self.go_home():
                break
            time.sleep(3)
        time.sleep(2)
        self.open_drawer()
        time.sleep(1)

    def find_scrolling(self, label, tries=4):
        get = (lambda: self.d.find(label, exact=True)) if isinstance(label, str) else (lambda: self.d.find(label))
        n, k = get(), 0
        while n is None and k < tries:
            self.d.scroll_down(0.4)
            time.sleep(0.6)
            n, k = get(), k + 1
        return n

    def expand(self, sec):
        if self.d.find(sec + ", Expanded", exact=True):
            return
        n = self.find_scrolling(sec + ", Collapsed")
        if n is None:
            raise Missing("menu section %r not found" % sec)
        self.d.tap(n, allow_unsafe=True, settle=1.2)

    def open_path(self, *path):
        """open_path("Accounts", "Cheque Collection", "Cheques Collected")"""
        self.drawer()
        for sec in path[:-1]:
            self.expand(sec)
            self.d.scroll_down(0.3)
            time.sleep(0.5)
        item = path[-1]
        hdr = self.d.find(path[-2] + ", Expanded", exact=True) if len(path) > 1 else None
        cands = [n for n in self.d.nodes() if n.label == item and n.clickable
                 and (hdr is None or n.bounds[1] > hdr.bounds[1])]
        if not cands:
            n = self.find_scrolling(item)
            if n is None:
                raise Missing("menu item %r not found" % " > ".join(path))
            cands = [n]
        self.d.tap(cands[0], allow_unsafe=True, settle=3)

    def toplevel(self):
        """Top-level menu entries that are not sections (AI Assistant, Customers, …) and the section names."""
        if self._toplevel is None:
            self.drawer()
            items, secs = [], []
            for _ in range(4):
                for n in self.d.nodes():
                    if not n.clickable or not n.label or re.match(r"^Version \d", n.label):
                        continue
                    m = HEADER.match(n.label)
                    if m and m.group(1) not in secs:
                        secs.append(m.group(1))
                    elif not m and n.label not in items:
                        items.append(n.label)
                self.d.scroll_down(0.4)
                time.sleep(0.5)
            self._toplevel = (items, secs)
        return self._toplevel

    def section_items(self, sec):
        top, _ = self.toplevel()
        self.drawer()
        self.expand(sec)
        items = []
        for _ in range(3):
            nodes = sorted([n for n in self.d.nodes() if n.clickable and n.label], key=lambda n: n.bounds[1])
            idx = next((i for i, n in enumerate(nodes) if n.label == sec + ", Expanded"), -1)
            stop = False
            for n in nodes[idx + 1:]:
                if HEADER.match(n.label) or n.label in top:
                    stop = True
                    break
                if n.label not in items:
                    items.append(n.label)
            if stop:
                break
            self.d.scroll_down(0.4)
            time.sleep(0.6)
        return items

    def workflows(self):
        """Menu sections that have a Collections entry = work flow modules (Projects, Construction Projects, …)."""
        if self._wf is None:
            _, secs = self.toplevel()
            self._wf = []
            for sec in secs:
                if sec in NOT_WORKFLOW:
                    continue
                items = self.section_items(sec)
                if "Collections" in items:
                    self._wf.append({"section": sec, "items": items,
                                     "new": next((i for i in items if i.startswith("New ")), None),
                                     "list": sec if sec in items else None})
            print("    work flow modules: %s" % ", ".join(w["section"] for w in self._wf), flush=True)
        if not self._wf:
            raise NotTestable("no work flow module (menu section with Collections) on this tenant")
        return self._wf

    # ---- screen helpers ------------------------------------------------------------------
    def fab(self):
        w, h = self.d.size()
        c = [n for n in self.d.nodes() if n.clickable and not n.label and n.bounds[0] > w * 0.7 and n.bounds[1] > h * 0.7]
        return c[-1] if c else None

    def top_right(self):
        w, h = self.d.size()
        c = [n for n in self.d.nodes() if n.clickable and n.bounds[0] > w * 0.8 and n.bounds[3] < h * 0.15]
        return c[0] if c else None

    def cancel_form(self):
        c = self.d.find("Cancel", exact=True)
        if c:
            self.d.tap(c, allow_unsafe=True, settle=2)
            for lbl in ("Discard", "Yes"):          # "discard changes?" style prompts
                n = self.d.find(lbl, exact=True)
                if n and self.d.exists(re.compile(r"discard|unsaved|sure", re.I)):
                    self.d.tap(n, allow_unsafe=True, settle=1.5)

    def form_labels(self, max_scrolls=6):
        seen = []
        for _ in range(max_scrolls):
            for n in self.d.nodes():
                if n.label and n.label not in seen and n.label != "Scrim":
                    seen.append(n.label)
            before = self.d.labels()
            self.d.scroll_down(0.6)
            time.sleep(1.2)
            if self.d.labels() == before:
                break
        for _ in range(max_scrolls):
            self.d.scroll_up(0.9)
        return seen

    def tap_value_of(self, label_rx):
        lab = self.d.find(label_rx)
        if lab is None:
            raise Fail("field %s not found" % label_rx.pattern)
        w, h = self.d.size()
        self.d.tap_xy(int(w * 0.8), lab.center[1])
        time.sleep(2.5)

    # ---- U1 ------------------------------------------------------------------------------
    def u1_complaint_attachments(self, r):
        self.push_test_image()
        self.open_path("Complaints", "New Complaint")
        self.must("New Complaint", 20, "New Complaint form")
        time.sleep(2)
        labels = self.d.labels()
        if "Attachments" not in labels:
            self.d.scroll_down(0.5)
            labels = self.d.labels()
        r["shots"].append(self.shot("u1_complaint_form"))
        missing = [w for w in ("Attachments", "Photos", "Camera", "File", "Voice note") if w not in labels]
        if missing:
            self.cancel_form()
            raise Missing("New Complaint form has no %s" % ", ".join(missing))
        limit = next((l for l in labels if COUNTER.match(l)), "?/?")
        r["notes"].append("Attachments section: Photos, Camera, File, Voice note (limit %s)" % limit.split("/")[-1])
        self.d.tap(self.d.find("Photos", exact=True), allow_unsafe=True, settle=2)
        if self.pick_test_image():
            after = self.d.labels()
            cnt = next((l for l in after if COUNTER.match(l)), "?")
            thumb = next((l for l in after if IMAGE_NAME.split(".")[0] in l), None)
            if cnt.startswith("1/") and thumb:
                r["notes"].append("Photo attached: counter %s, thumbnail %r" % (cnt, thumb))
                r["shots"].append(self.shot("u1_photo_attached"))
                rm = self.d.find("Remove", exact=True)
                if rm:
                    self.d.tap(rm, allow_unsafe=True, settle=1.5)
                    cnt2 = next((l for l in self.d.labels() if COUNTER.match(l)), "?")
                    r["notes"].append("Remove → counter %s" % cnt2)
                    if not cnt2.startswith("0/"):
                        r["status"] = "WARN"
            else:
                r["status"] = "WARN"
                r["notes"].append("Picked the test image but the form shows counter %s, thumbnail %s" % (cnt, thumb))
        else:
            r["status"] = "WARN"
            r["notes"].append("Could not pick the test image in the system photo picker (attach not verified)")
        r["notes"].append("Not exercised: Camera, File picker selection, Voice note recording (need camera/microphone)")
        self.cancel_form()

    # ---- U2 ------------------------------------------------------------------------------
    def u2_cheque_management(self, r):
        problems, opened, forms = [], [], []
        _, secs = self.toplevel()
        if "Accounts" not in secs:      # whole section hidden = permission / module setting, not the release
            r["shots"].append(self.shot("u2_menu"))
            raise NotTestable("no Accounts section in the menu for this user (menu: %s) — check the user's "
                              "Accounts permission / tenant modules" % ", ".join(secs))
        for sub, item, form in CHEQUE:
            self.open_path("Accounts", sub, item)
            if self.d.wait_for(item, timeout=20) is None:
                problems.append("%s did not open" % item)
                continue
            time.sleep(2)
            empty = next((l for l in self.d.labels() if l.startswith("No ")), None)
            opened.append(item + (" (%s)" % empty if empty else ""))
            if form:
                plus = self.fab()
                if plus is None:
                    problems.append("%s has no + button" % item)
                    continue
                self.d.tap(plus, allow_unsafe=True, settle=3)
                if self.d.wait_for(form, timeout=10) is None:
                    problems.append("%s: + did not open %r" % (item, form))
                else:
                    labels = [l for l in self.d.labels() if l not in ("Scrim", "Cancel", "Save", form)]
                    forms.append("%s: %s" % (form, ", ".join(labels[:8])))
                    r["shots"].append(self.shot("u2_" + re.sub(r"\W+", "_", form.lower())))
                self.d.back(1.5)
        r["notes"].append("Screens: " + "; ".join(opened))
        r["notes"] += ["Form " + f for f in forms]
        if problems:
            raise Missing("; ".join(problems))

    # ---- U3 + U7 -------------------------------------------------------------------------
    def first_collection(self):
        for wf in self.workflows():
            self.open_path(wf["section"], "Collections")
            time.sleep(5)
            cards = [n for n in self.d.nodes() if n.clickable and re.search(r"\d+\.\d{2}", n.label)]
            if cards:
                return wf, cards[0]
        raise NotTestable("no collection records in any work flow module")

    def open_record(self, wf, name):
        self.open_path(wf["section"], wf["list"] or wf["section"])
        time.sleep(5)
        for _ in range(6):
            row = self.d.find(re.compile(r"^" + re.escape(name)))
            if row:
                self.d.tap(row, allow_unsafe=True, settle=5)
                return True
            tabs = [n for n in self.d.nodes() if re.match(r"^[^\n]+\n[1-9]\d*\nTab \d+ of \d+$", n.label)]
            tried = self.coll.setdefault("tabs_tried", set())
            nxt = next((t for t in tabs if t.label not in tried), None)
            if nxt is None:
                break
            tried.add(nxt.label)
            self.d.tap(nxt, allow_unsafe=True, settle=4)
        return False

    def record_tab(self, title):
        for _ in range(8):
            t = self.d.find(re.compile(r"^%s\nTab \d+ of \d+$" % re.escape(title)))
            if t:
                self.d.tap(t, allow_unsafe=True, settle=4)
                return t
            tabs = [n for n in self.d.nodes() if re.match(r"^.+\nTab (\d+) of \d+$", n.label)]
            if not tabs:
                return None
            nums = [int(re.search(r"Tab (\d+) of", n.label).group(1)) for n in tabs]
            y = tabs[0].center[1]
            a, b = (200, 900) if min(nums) > 6 else (900, 200)
            self.d.shell("input swipe %d %d %d %d 400" % (a, y, b, y))
            time.sleep(1)
        return None

    def u3_collection(self, r):
        problems = []
        wf, card = self.first_collection()
        self.coll["card"] = card.label
        self.coll["module"] = wf["section"]
        self.coll["list_shot"] = self.shot("u3_collections_list")
        r["shots"].append(self.coll["list_shot"])
        name = card.label.split("\n")[1] if "\n" in card.label else card.label
        r["notes"].append("Work flow %r, collection card: %s" % (wf["section"], card.label.replace("\n", " | ")))
        # Print — in the record's ⋮ menu
        self.d.tap(card, allow_unsafe=True, settle=4)
        self.must(re.compile(r"Collection Overview"), 20, "Collection Overview")
        time.sleep(2)
        rec = next((l for l in self.d.labels() if l.startswith("Recorded by")), None)
        if rec is None:
            self.d.scroll_down(0.6)
            rec = next((l for l in self.d.labels() if l.startswith("Recorded by")), None)
        self.coll["recorded_by"] = rec
        menu = self.top_right()
        if menu is None:
            problems.append("no ⋮ menu on Collection Overview")
        else:
            self.d.tap(menu, allow_unsafe=True, settle=2)
            acts = [n.label for n in self.d.nodes() if n.clickable and n.label and n.label != "Scrim"]
            r["notes"].append("Collection ⋮ menu: " + ", ".join(acts))
            if "Print" not in acts:
                problems.append("Print is not in the collection menu")
                self.d.back(1.5)
            elif self.do_print:
                self.d.tap(self.d.find("Print", exact=True), allow_unsafe=True, settle=1)
                time.sleep(9)
                top = self.d.shell("dumpsys activity activities | grep topResumedActivity | head -1")
                self.d.screenshot(os.path.join(self.out, "shots", "u3_print.png"))   # screencap only (viewer is heavy)
                r["shots"].append("shots/u3_print.png")
                r["notes"].append("Print opened: %s" % (re.search(r"u0 (\S+)", top).group(1) if "u0 " in top else top.strip()))
                self.d.back(2)
            else:
                r["notes"].append("Print present (not opened; run with --print to open the PDF)")
                self.d.back(1.5)
        r["shots"].append(self.shot("u3_collection_overview"))
        # Next follow-up — Add Collection form, after a record is chosen
        self.open_path(wf["section"], "Collections")
        time.sleep(4)
        plus = self.fab()
        if plus is None:
            problems.append("Collections list has no + button")
        else:
            self.d.tap(plus, allow_unsafe=True, settle=3)
            self.must("Add Collection", 10, "Add Collection form")
            self.tap_value_of(re.compile(r"Name$"))
            pick = [n for n in self.d.nodes() if n.clickable and n.cls.endswith("Button") and "\n" in n.label]
            pick.sort(key=lambda n: not n.label.startswith(name))     # the collection's own record first
            if pick:
                self.d.tap(pick[0], allow_unsafe=True, settle=4)
                time.sleep(2)
            labels = self.d.labels()
            r["shots"].append(self.shot("u3_add_collection"))
            if "Next Follow-up" in labels:
                r["notes"].append("Add Collection has a FOLLOW-UP section: Next Follow-up + Remarks"
                                  + (" + save without receipt" if any("without a receipt" in l for l in labels) else ""))
            else:
                problems.append("Add Collection has no Next Follow-up")
            self.cancel_form()
        # Opening collection — record → Collections tab → Add ▾
        if self.open_record(wf, name) and self.record_tab("Collections"):
            time.sleep(2)
            add = self.d.find(re.compile(r"^Add"))
            if add is None:
                problems.append("record Collections tab has no Add button")
            else:
                self.d.tap(add, allow_unsafe=True, settle=2)
                opts = [n.label for n in self.d.nodes() if n.clickable and n.label and n.label != "Scrim"]
                if "Opening Collection" in opts:
                    self.d.tap(self.d.find("Opening Collection", exact=True), allow_unsafe=True, settle=3)
                    flds = [l for l in self.d.labels() if len(l) < 40 and l not in ("Scrim", "Cancel", "Save")]
                    r["notes"].append("Add ▾ → %s; Opening Collection form: %s" % (", ".join(opts), ", ".join(flds)))
                    r["shots"].append(self.shot("u3_opening_collection"))
                    self.cancel_form()
                else:
                    problems.append("Add on the record's Collections tab offers %s — no Opening Collection" % opts)
                    if "Add Collection" in self.d.labels():
                        self.cancel_form()
                    else:
                        self.d.back(1.5)
        else:
            r["status"] = "WARN"
            r["notes"].append("Could not open record %r to check Opening Collection" % name)
        if problems:
            raise Missing("; ".join(problems))

    def u7_added_by(self, r):
        if "card" not in self.coll:
            wf, card = self.first_collection()
            self.coll["card"], self.coll["module"] = card.label, wf["section"]
            self.coll["list_shot"] = self.shot("u7_collections_list")
            self.d.tap(card, allow_unsafe=True, settle=4)
            time.sleep(2)
            self.d.scroll_down(0.6)
            self.coll["recorded_by"] = next((l for l in self.d.labels() if l.startswith("Recorded by")), None)
        card = self.coll["card"]
        if self.coll.get("list_shot"):
            r["shots"].append(self.coll["list_shot"])
        r["notes"].append("%s Collections card: %s" % (self.coll["module"], card.replace("\n", " | ")))
        if self.coll.get("recorded_by"):
            r["notes"].append("Collection detail: " + self.coll["recorded_by"].replace("\n", " "))
        if not re.search(r"added by|recorded by|\bby\b", card, re.I):
            raise Missing("the Collections list card does not show who added the record")

    # ---- U4 ------------------------------------------------------------------------------
    def u4_availability(self, r):
        self.go_home()
        self.tap_tab(4)
        time.sleep(4)
        labels = self.d.labels()
        r["shots"].append(self.shot("u4_profile"))
        if "Available" not in labels and not any(re.search(r"availab", l, re.I) for l in labels):
            raise Missing("Profile has no Availability option (rows: %s)" % ", ".join(labels[:12]))
        r["notes"].append("Profile shows 'Available' toggle (left unchanged)")
        self.go_home()

    # ---- U5 + U6 -------------------------------------------------------------------------
    def new_form(self, wf):
        self.open_path(wf["section"], wf["new"])
        self.must(wf["new"], 20, wf["new"] + " form")
        time.sleep(3)

    def u5_custom_fields(self, r):
        found, types = [], {}
        for wf in self.workflows():
            if not wf["new"]:
                continue
            self.new_form(wf)
            labels = self.form_labels()
            typ = next((l for l in labels if l.endswith("Type") and l != "Voucher Type"), None)
            if typ:
                self.tap_value_of(re.compile("^" + re.escape(typ) + "$"))
                types[wf["section"]] = [n.label for n in self.d.nodes()
                                        if n.clickable and n.label and n.label not in ("Dismiss", "Scrim", "Cancel", "Save")]
                self.coll.setdefault("type_shots", []).append(
                    self.shot("u5_types_" + re.sub(r"\W+", "_", wf["section"].lower())))
                self.d.back(1.5)
            # custom fields sit between "Lead Source" and the next UPPER-CASE section heading
            custom = []
            if "Lead Source" in labels:
                for l in labels[labels.index("Lead Source") + 1:]:
                    if l.isupper() or l.startswith("+") or l.startswith("Contact") or l.startswith("Site Contacts"):
                        break
                    if l not in ("Choose", "Calculated") and not l.startswith("Tap to"):
                        custom.append(l)
            r["notes"].append("%s (%s): %s" % (wf["new"], ", ".join(types.get(wf["section"], [])) or "?",
                                               ("custom fields: " + ", ".join(custom)) if custom else "no custom fields"))
            if custom:
                found.append(wf["new"])
                r["shots"].append(self.shot("u5_" + re.sub(r"\W+", "_", wf["new"].lower())))
            self.cancel_form()
        self.coll["types"] = types
        if not found:
            raise NotTestable("no custom fields shown on any work flow form (none configured on this tenant?)")

    def u6_solar_consumer(self, r):
        if "types" not in self.coll:
            self.u5_custom_fields({"notes": [], "shots": [], "status": "PASS"})
        r["shots"] += self.coll.get("type_shots", [])
        solar = [(sec, t) for sec, ts in self.coll["types"].items() for t in ts if re.search(r"solar", t, re.I)]
        r["notes"].append("Work flow types: " + "; ".join("%s: %s" % (s, ", ".join(t)) for s, t in self.coll["types"].items()))
        if not solar:
            raise NotTestable("no Solar work flow type on this tenant — Consumer field can't be checked")
        sec, typ = solar[0]
        wf = next(w for w in self.workflows() if w["section"] == sec)
        self.new_form(wf)
        cur = next((l for l in self.d.labels() if l.endswith("Type")), None)
        self.tap_value_of(re.compile("^" + re.escape(cur) + "$"))
        self.d.tap(self.d.find(typ, exact=True), allow_unsafe=True, settle=3)
        labels = self.form_labels()
        r["shots"].append(self.shot("u6_solar_form"))
        self.cancel_form()
        if not any(re.match(r"^Consumer", l) for l in labels):
            raise Missing("%s form with type %r has no Consumer field" % (wf["new"], typ))
        r["notes"].append("%s / %s has a Consumer field" % (wf["new"], typ))

    # ---- U8 ------------------------------------------------------------------------------
    def phone_field(self):
        return [n for n in self.d.nodes() if n.cls.endswith("EditText") and n.bounds[0] < 400 and n.bounds[2] > 900][0]

    def lead_form(self):
        self.open_drawer_item("CRM", "New Enquiry")
        self.must("Add Lead", 15, "Add Lead form")
        time.sleep(3)
        self.lead_ready = False

    def set_phone(self, num):
        """Type the number, wait for the customer lookup; False if it matched an existing customer."""
        for _ in range(3):
            self.d.scroll_up(0.9)
        n = self.phone_field()
        self.d.tap(n, allow_unsafe=True, settle=1.2)
        self.d.shell("input keyevent KEYCODE_MOVE_END")
        for _ in range(30):
            self.d.shell("input keyevent KEYCODE_DEL")
        self.d.shell("input text " + num)
        time.sleep(1.2)
        self.d.hide_keyboard()
        t0 = time.time()
        time.sleep(2)
        while time.time() - t0 < 120:
            grp = self.d.find(re.compile(r"^CUSTOMER DETAILS"))
            if grp and len([e for e in self.edits() if grp.bounds[1] <= e.center[1] <= grp.bounds[3]]) >= 3:
                break
            time.sleep(2)
        if self.d.exists("UPDATE INFO", exact=True) or self.d.exists("Customer Profile", exact=True):
            return False                                        # existing customer — never save onto it
        return True

    def fill_rest(self):
        if not any(e.text == self.name for e in self.edits()):
            self.type_into(self.cust_field(1), self.name, "customer name")
            self.d.hide_keyboard()
        if not self.lead_ready:
            qty = next(e for e in self.edits() if e.text == "1")
            self.tap_right_of(qty.bounds[1] - (qty.bounds[3] - qty.bounds[1]) / 2)
            self.must("Search Items", 10, "item search sheet")
            self.type_into(lambda e: e[0], ITEM_SEARCH.get(self.tenant, "Bio"), "item search", hide=False)
            time.sleep(2.5)
            items = [n for n in self.d.nodes() if n.cls.endswith("Button") and "\nPrice" in n.label]
            if not items:
                raise Fail("item search returned nothing")
            self.d.tap(items[0], allow_unsafe=True, settle=2)
            self.d.hide_keyboard()
            self.d.scroll_down(0.4)
            sw = [n for n in self.d.nodes() if n.cls.endswith("Switch")]
            self.tap_right_of(sw[0].bounds[3] + (sw[0].bounds[3] - sw[0].bounds[1]) * 0.6)
            self.pick_date(2)
            self.lead_ready = True
        self.d.scroll_down(0.9)
        ch = self.d.find("Choose", exact=True)
        if ch:
            self.d.tap(ch, allow_unsafe=True, settle=1.2)
            self.d.tap(self.d.find("You", exact=True), allow_unsafe=True, settle=1.2)

    def try_save(self, wait=40, slug=None):
        """Save → ("blocked", message) / ("saved", None) / ("nothing", None); screenshots the outcome."""
        t0 = time.time()
        self.d.tap(self.d.find("Save", exact=True), allow_unsafe=True, settle=0.3)
        self.last_shot = None
        while time.time() - t0 < wait:
            ls = self.d.labels()
            if "Can't continue" in ls:
                msg = next((l for l in ls if l not in ("Dismiss", "OK", "Can't continue")), "?")
                secs = time.time() - t0
                if slug:
                    self.last_shot = self.shot(slug)
                self.d.tap(self.d.find("OK", exact=True), allow_unsafe=True, settle=1.2)
                return "blocked", msg, secs
            if any(l.startswith(("Enquiry Overview", "Enquiry Number")) for l in ls):
                secs = time.time() - t0
                if slug:
                    self.last_shot = self.shot(slug)
                return "saved", None, secs
            time.sleep(0.7)
        if slug:
            self.last_shot = self.shot(slug)           # the form, still open, no message
        return "nothing", None, time.time() - t0

    def u8_phone_length(self, r):
        if self.tenant not in TEST_TENANTS:
            raise NotTestable("U8 may save a lead — only runs on a test tenant (%s)" % ", ".join(TEST_TENANTS))
        base = str(int(time.time()))
        cases = [(4, False), (21, False), (6, True), (20, True)]   # (digits, should save per release note)
        wrong, results = [], []
        self.lead_form()
        for k, (n, should) in enumerate(cases):
            num = None
            for attempt in range(3):                       # unique numbers that match no existing customer
                cand = ("7%d%d" % (k, attempt) + base[::-1] + "8" * 20)[:n]
                if self.set_phone(cand):
                    num = cand
                    break
            if num is None:
                results.append("%d digits: skipped (numbers matched existing customers)" % n)
                continue
            self.fill_rest()
            outcome, msg, secs = self.try_save(slug="u8_%02d_digits" % n)
            if self.last_shot:
                r["shots"].append(self.last_shot)
            results.append("%2d digits → %s%s (%.0fs)" % (n, outcome, (": " + msg) if msg else "", secs))
            if outcome == "saved":
                r["notes"].append("Saved lead %s with phone %s (QA test data)" % (self.name, num))
                if not should:
                    wrong.append("%d digits was accepted" % n)
                if k < len(cases) - 1:
                    self.name = "QA_MOB_%d" % int(time.time())
                    self.lead_form()
            else:
                if should:
                    wrong.append("%d digits was rejected%s" % (n, (" (%s)" % msg) if msg else ""))
                if outcome == "nothing":
                    r["status"] = "WARN"
        if self.d.exists("Add Lead", exact=True):
            self.cancel_form()
        r["notes"] += results
        if wrong:
            raise Missing("release note says 5–20 digits, but " + "; ".join(wrong))

    # ---- runner --------------------------------------------------------------------------
    def run(self, only):
        plan = [("U1", "Complaint attachments (images, files, voice)", self.u1_complaint_attachments),
                ("U2", "Cheque Management module", self.u2_cheque_management),
                ("U3", "Collection: next follow-up, opening, print", self.u3_collection),
                ("U4", "Profile: Availability option", self.u4_availability),
                ("U5", "Work Flow custom fields", self.u5_custom_fields),
                ("U6", "Work Flow Solar: Consumer field", self.u6_solar_consumer),
                ("U7", "Collection cards show Added by", self.u7_added_by),
                ("U8", "Phone numbers: 5–20 digits only", self.u8_phone_length)]
        for uid, title, fn in plan:
            if only and uid not in only:
                continue
            r = {"group": uid, "name": title, "kind": "release", "status": "PASS", "notes": [],
                 "shots": [], "load_s": None, "labels": []}
            t0 = time.time()
            try:
                fn(r)
            except Missing as e:
                r["status"] = "FAIL"
                r["notes"].insert(0, "NOT AS RELEASED: %s" % e)
            except NotTestable as e:
                r["status"] = "WARN"
                r["notes"].insert(0, "Not testable here: %s" % e)
            except Exception as e:  # noqa: BLE001
                r["status"] = "WARN"
                r["notes"].insert(0, "Could not check: %s: %s" % (type(e).__name__, e))
                try:
                    r["shots"].append(self.shot("%s_error" % uid.lower()))
                    self.cancel_form()
                except Exception:  # noqa: BLE001
                    pass
            if not r["shots"]:
                try:
                    r["shots"].append(self.shot("%s_end" % uid.lower()))
                except Exception:  # noqa: BLE001
                    pass
            r["notes"].append("%.0fs" % (time.time() - t0))
            self.results.append(r)
            print("  %-5s %s %-44s %s" % (r["status"], uid, title, " | ".join(r["notes"])[:160]), flush=True)
        self.go_home()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serial", default=os.environ.get("SERIAL", "emulator-5554"))
    ap.add_argument("--tenant", required=True, help="tenant label; U8 runs only on " + ", ".join(TEST_TENANTS))
    ap.add_argument("--only", default="", help="e.g. U1,U3")
    ap.add_argument("--print", dest="do_print", action="store_true", help="U3: also open the Print PDF")
    a = ap.parse_args()
    d = Device(a.serial).ensure_online()
    android = d.android_version()
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = os.path.join(QA_DIR, "reports", "erp-release_android%s_%s" % (android, stamp))
    os.makedirs(os.path.join(out, "shots"))
    rl = Release(d, out, a.tenant, a.do_print)
    rl.detail = False
    only = [x.strip().upper() for x in a.only.split(",") if x.strip()]
    print("Progbiz ERP release-note checks · Android %s · app %s · %s → %s" % (android, d.app_version(), a.tenant, out),
          flush=True)
    t0 = time.time()
    rl.run(only)
    meta = {"app": d.app_version(), "android": android, "serial": a.serial, "tenant": a.tenant,
            "when": datetime.datetime.now().strftime("%d %b %Y %H:%M"), "secs": int(time.time() - t0)}
    path = write_report(out, meta, rl.results, "release-note checks", "ERP Release Checks")
    print("Report: %s" % path)
    return 1 if any(r["status"] == "FAIL" for r in rl.results) else 0


if __name__ == "__main__":
    sys.exit(main())
