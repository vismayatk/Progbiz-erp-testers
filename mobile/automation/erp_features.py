#!/usr/bin/env python3
"""New-feature scenarios for app v2.0.65+ — every step asserts that what was entered is DISPLAYED on the next screen.

  F1 Mail            compose → Sent/Inbox show subject+body → open → Reply (Re:, quoted) → Forward (Fwd:) → Star → Trash
  F2 Lead notes      Leads › lead › Notes: add → shown with author+date → @ lists colleagues → edit (edited tag) → delete
  F3 Super Hot       Leads › lead › Followup: Lead Quality list contains Super Hot, picking it shows "Super Hot" (not saved)
  F4 WhatsApp window Chat older than 24 h must show "The 24-hour reply window has closed." instead of the message box
  F5 Purchase invoice  Inventory › Purchase Invoices: supplier+item+payment → overview + list show the same totals
  F6 Receipt voucher   Accounts › Vouchers › Receipts: narration + ledger + amount → saved dialog + list + View show them

Safe by design: runs on TEST_TENANTS only, data is named QA_*, mails go to the logged-in user, nothing is sent to customers,
only records created here are deleted. Run:  python3 erp_features.py --serial emulator-5554 --tenant lesol_test [--only F1,F2]
"""
import argparse
import datetime
import os
import re
import sys
import time
import traceback

from droid import Device
from erp_release import Release, Missing, NotTestable
from erp_scenarios import TEST_TENANTS, Fail
from erp_smoke import QA_DIR, write_report


class Features(Release):
    def __init__(self, d, out, tenant):
        super().__init__(d, out, tenant)
        self.ts = int(time.time())
        self.user = ""
        self.mail_subject = "QA_mail_%d" % self.ts

    # ---- helpers ---------------------------------------------------------------------
    def abandon_forms(self):
        """Close any form left open by a failed scenario (Cancel → Discard) so the next scenario starts from Home."""
        for _ in range(4):
            c = self.d.find("Cancel", exact=True)
            if c is None:
                break
            self.d.tap(c, allow_unsafe=True, settle=2)
            for t in ("Discard", "Yes", "OK"):
                n = self.d.find(t, exact=True)
                if n:
                    self.d.tap(n, allow_unsafe=True, settle=2)
                    break

    def ass(self, cond, msg):
        if not cond:
            raise Fail(msg)

    def flat(self):
        return " ".join(l.replace("\n", " ") for l in self.d.labels())

    def eds(self):
        return sorted([n for n in self.d.nodes() if n.cls.endswith("EditText")], key=lambda n: (n.bounds[1], n.bounds[0]))

    def type_in(self, node, text):
        self.d.hide_keyboard()
        time.sleep(0.8)
        node = node() if callable(node) else node                  # re-read positions after the keyboard is gone
        self.d.tap(node, allow_unsafe=True, settle=1.2)
        self.d.shell("input keyevent KEYCODE_MOVE_END")
        for _ in range(12):                                         # fields such as Quantity start with "1"
            self.d.shell("input keyevent KEYCODE_DEL")
        self.d.shell("input text %s" % text.replace(" ", "%s"))
        time.sleep(0.8)
        self.d.hide_keyboard()
        time.sleep(0.6)

    def top_menu(self, label, wait=8):
        self.go_home()
        self.drawer()
        w, h = self.d.size()
        n = None
        for _ in range(6):
            n = next((x for x in self.d.nodes() if x.clickable and x.label.split("\n")[0] == label and x.bounds[1] > h * 0.2), None)
            if n:
                break
            if self.d.find(re.compile(r"^Search menu")) is None:
                self.drawer()
            self.d.swipe(400, int(h * 0.8), 400, int(h * 0.45), 500)
            time.sleep(1)
        self.ass(n is not None, "menu item %r not found in the side menu" % label)
        self.d.tap(n, allow_unsafe=True, settle=wait)

    def fab(self):
        w, h = self.d.size()
        self.d.tap_xy(int(w * 0.893), int(h * 0.925))
        time.sleep(3.5)

    def error_dialog(self, r, where):
        """An unexpected error dialog (e.g. 'Not found') right after opening a screen is a product bug: record it, dismiss it."""
        if self.d.exists("Not found", exact=True) or self.d.exists("The requested resource was not found."):
            r["notes"].append("Error dialog 'Not found – The requested resource was not found.' appears when opening %s" % where)
            r["status"] = "WARN"
            r["shots"].append(self.shot("err_" + re.sub(r"\W+", "_", where.lower())[:24]))
            ok = self.d.find("OK", exact=True)
            if ok:
                self.d.tap(ok, allow_unsafe=True, settle=2)
            return True
        return False

    def band(self, row):
        """All text on the same card as a list row (the row label alone may hold only the title)."""
        return " ".join(n.label.replace("\n", " ") for n in self.d.nodes()
                        if n.label and n.bounds[1] <= row.bounds[3] and n.bounds[3] >= row.bounds[1]
                        and n.bounds[3] - n.bounds[1] < 450)

    def open_form(self, r, title, where, timeout=14):
        """Wait for a form title; an error dialog on top of it is recorded as a bug and dismissed."""
        t0 = time.time()
        while time.time() - t0 < timeout:
            self.error_dialog(r, where)
            if self.d.exists(title, exact=True):
                return
            time.sleep(1)
        raise Fail("%s not shown within %ds" % (title, timeout))

    def rows(self, needle):
        return sorted([n for n in self.d.nodes() if needle in n.label and n.bounds[3] - n.bounds[1] < 700],
                      key=lambda n: (not n.clickable, n.bounds[1]))

    def wait_row(self, needle, timeout=30):
        t0 = time.time()
        while time.time() - t0 < timeout:
            rs = self.rows(needle)
            if rs:
                return rs[0]
            time.sleep(1.5)
        return None

    def tab(self, name):
        n = self.d.find(re.compile(r"^(\d+\n)?%s(\n|$)" % re.escape(name)))
        self.ass(n is not None, "tab %s not found" % name)
        self.d.tap(n, allow_unsafe=True, settle=4)

    def pick_user(self, name):
        n = None
        for _ in range(8):
            n = next((x for x in self.d.nodes() if x.clickable and re.search(r"\n%s(\n|$)" % re.escape(name), x.label)), None)
            if n:
                return n
            time.sleep(1)
        return None

    # ---- F1 mail --------------------------------------------------------------------
    def f1_mail(self, r):
        subj, body = self.mail_subject, "QA_body_%d" % self.ts
        self.top_menu("Mail")
        self.d.tap(self.d.find("Compose", exact=True), allow_unsafe=True, settle=4)
        to = self.eds()[0]
        self.d.tap(to, allow_unsafe=True, settle=1.5)
        self.d.shell("input text %s" % self.user.split()[0][:4])
        who = self.pick_user(self.user)
        self.ass(who is not None, "recipient list does not show the logged-in user %r" % self.user)
        self.d.tap(who, allow_unsafe=True, settle=2)
        self.ass(self.user in self.flat(), "To chip does not show %r" % self.user)
        self.type_in(lambda: [e for e in self.eds() if e.bounds[1] > 500][0], subj)
        self.d.tap(self.d.find("Write your mail"), allow_unsafe=True, settle=1.2)
        self.d.shell("input text %s" % body)
        time.sleep(0.8)
        self.d.hide_keyboard()
        r["shots"].append(self.shot("f1_compose"))
        t0 = time.time()
        self.d.tap(self.d.find("Send", exact=True), allow_unsafe=True, settle=1)
        self.ass(self.d.wait_for("New mail", timeout=40, gone=True), "compose screen did not close after Send")
        secs = time.time() - t0
        r["load_s"] = secs
        time.sleep(3)
        self.tab("Sent")
        row = self.wait_row(subj)
        self.ass(row is not None, "Sent does not list %s" % subj)
        self.ass(body in row.label and ("To: " + self.user) in row.label, "Sent row misses body or 'To: %s': %r" % (self.user, row.label[:120]))
        r["shots"].append(self.shot("f1_sent"))
        self.tab("Inbox")
        row = self.wait_row(subj)
        self.ass(row is not None, "Inbox does not list the mail sent to the user")
        self.d.tap(row, allow_unsafe=True, settle=5)
        txt = self.flat()
        self.ass(subj in txt and body in txt and "to you" in txt, "opened mail does not show subject/body/'to you'")
        r["shots"].append(self.shot("f1_opened"))
        # Reply
        self.d.tap(self.d.find("Reply", exact=True), allow_unsafe=True, settle=4)
        txt = self.flat()
        self.ass("Re: " + subj in txt, "reply subject is not 'Re: %s'" % subj)
        self.ass(self.user in txt and body in txt, "reply does not show recipient and the quoted body")
        self.d.tap(self.d.find("Send", exact=True), allow_unsafe=True, settle=1)
        time.sleep(6)
        self.d.back(3)
        self.tab("Inbox")
        self.ass(self.wait_row("Re: " + subj) is not None, "the reply is not in Inbox")
        # Forward + Star + Trash on the original
        self.d.tap(self.wait_row(subj + "\n" + body) or self.rows(subj)[-1], allow_unsafe=True, settle=5)
        w, h = self.d.size()
        self.d.tap_xy(int(w * 0.927), int(h * 0.153))                 # star the original first
        time.sleep(3)
        self.d.tap(self.d.find("Forward", exact=True), allow_unsafe=True, settle=4)
        txt = self.flat()
        self.ass("Fwd: " + subj in txt and "Forwarded message" in txt, "forward does not show 'Fwd: %s' and the forwarded block" % subj)
        self.d.tap(self.eds()[0], allow_unsafe=True, settle=1.5)
        self.d.shell("input text %s" % self.user.split()[0][:4])
        self.d.tap(self.pick_user(self.user), allow_unsafe=True, settle=2)
        self.d.tap(self.d.find("Send", exact=True), allow_unsafe=True, settle=1)
        time.sleep(6)
        self.d.back(3)
        self.tab("Starred")
        self.ass(self.wait_row(subj) is not None, "the starred mail is not in Starred")
        r["shots"].append(self.shot("f1_starred"))
        self.tab("Inbox")
        row = next((x for x in self.rows(subj) if "Re:" not in x.label and "Fwd:" not in x.label), None)
        self.ass(row is not None, "original mail missing in Inbox before trashing")
        self.d.tap(row, allow_unsafe=True, settle=5)
        self.d.tap(self.d.find("Move to Trash", exact=True), allow_unsafe=True, settle=4)
        self.tab("Trash")
        self.ass(self.wait_row(subj) is not None, "the trashed mail is not in Trash")
        r["shots"].append(self.shot("f1_trash"))
        self.tab("Starred")
        if self.rows(subj + "\n" + body):
            r["notes"].append("A trashed mail is still listed under Starred")
            r["status"] = "WARN"
        r["notes"].append("Mail %s sent to %s in %.1fs; Sent, Inbox, open, Reply (Re:), Forward (Fwd:), Star and Trash all showed it" % (subj, self.user, secs))

    # ---- F2 lead notes -------------------------------------------------------------
    def open_first_lead(self):
        self.go_home()
        self.open_path("CRM", "Leads")
        time.sleep(8)
        row = None
        for _ in range(6):
            row = next((n for n in self.d.nodes() if re.match(r"^(ENQ|QUO)-\d+", n.label) and n.clickable), None)
            if row:
                break
            time.sleep(2)
        self.ass(row is not None, "Leads list shows no lead")
        num = re.match(r"^((?:ENQ|QUO)-\d+)", row.label).group(1)
        self.d.tap(row, allow_unsafe=True, settle=5)
        return num

    def delete_note_row(self, row, r=None):
        w, h = self.d.size()
        self.d.tap_xy(int(w * 0.91), int((row.bounds[1] + row.bounds[3]) / 2))
        time.sleep(2)
        self.d.tap(self.d.find("Delete", exact=True), allow_unsafe=True, settle=2.5)
        confirm = [x for x in self.d.nodes() if x.label == "Delete" and x.clickable]
        if confirm:
            self.d.tap(confirm[-1], allow_unsafe=True, settle=3)
        elif r is not None:
            r["notes"].append("Deleting a note asks for no confirmation")
            r["status"] = "WARN"
        time.sleep(2)

    def f2_notes(self, r):
        note = "QA_note_%d" % self.ts
        num = self.open_first_lead()
        self.d.swipe(900, 330, 200, 330, 400)
        time.sleep(1.5)
        n = self.d.find(re.compile(r"^Notes\nTab \d of \d"))
        self.ass(n is not None, "Notes tab not found on the lead")
        self.d.tap(n, allow_unsafe=True, settle=3)
        for _ in range(5):                                           # clean up QA notes left by an earlier failed run
            old = next((x for x in self.rows("QA_note_") if self.user in x.label), None)
            if old is None:
                break
            self.delete_note_row(old)
        self.fab()
        self.must("Add Note", 8, "Add Note sheet")
        e = self.eds()[0]
        self.d.tap(e, allow_unsafe=True, settle=1.2)
        self.d.shell("input text %s" % note)
        time.sleep(0.8)
        self.d.shell("input keyevent 62")
        self.d.shell("input keyevent 77")                             # '@'
        time.sleep(3)
        mentions = [x for x in self.d.nodes() if x.clickable and re.match(r"^\w{1,2}\n\w", x.label)]
        self.ass(len(mentions) >= 1, "typing @ shows no colleague list")
        r["shots"].append(self.shot("f2_mention"))
        self.d.shell("input keyevent KEYCODE_DEL")
        self.d.shell("input keyevent KEYCODE_DEL")
        self.d.hide_keyboard()
        self.d.tap(self.d.find("Save", exact=True), allow_unsafe=True, settle=4)
        row = self.wait_row(note, 20)
        self.ass(row is not None, "the saved note %s is not listed on %s" % (note, num))
        today = datetime.date.today().strftime("%d/%m/%Y")
        band = self.band(row)
        self.ass(today in band, "note %s has no today's date %s next to it: %r" % (note, today, band))
        self.ass(self.user in band, "note %s has no author %r next to it: %r" % (note, self.user, band))
        r["shots"].append(self.shot("f2_note_added"))
        # edit
        w, h = self.d.size()
        self.d.tap_xy(int(w * 0.91), int((row.bounds[1] + row.bounds[3]) / 2))
        time.sleep(2)
        self.d.tap(self.d.find("Edit", exact=True), allow_unsafe=True, settle=3)
        e = self.eds()[0]
        self.d.tap(e, allow_unsafe=True, settle=1.2)
        self.d.shell("input keyevent KEYCODE_MOVE_END")
        self.d.shell("input text _edited")
        time.sleep(0.8)
        self.d.hide_keyboard()
        self.d.tap(self.d.find("Save", exact=True), allow_unsafe=True, settle=4)
        row = self.wait_row(note + "_edited", 20)
        self.ass(row is not None, "edited note text %s_edited is not shown" % note)
        self.ass("edited" in self.band(row).replace(note + "_edited", ""), "edited note has no 'edited' tag: %r" % self.band(row))
        r["shots"].append(self.shot("f2_note_edited"))
        # delete
        self.delete_note_row(row, r)
        time.sleep(2)
        self.ass(not self.rows(note), "the note is still listed after Delete")
        r["shots"].append(self.shot("f2_note_deleted"))
        r["notes"].append("Note added/edited/deleted on %s; author %s, date and 'edited' tag shown" % (num, self.user))

    # ---- F3 super hot -----------------------------------------------------------------
    def f3_super_hot(self, r):
        num = self.open_first_lead()
        w, h = self.d.size()
        self.d.tap_xy(int(w * 0.94), int(h * 0.09))
        time.sleep(2)
        self.d.tap(self.must("Followup", 6, "Followup menu"), allow_unsafe=True, settle=4)
        self.d.tap_xy(int(w * 0.72), 443)
        time.sleep(2.5)
        opts = [n for n in self.d.nodes() if n.clickable and n.label and "\n" not in n.label and n.label not in ("Dismiss",)]
        self.ass(opts, "Followup Status list is empty")
        status = opts[0].label
        self.d.tap(opts[0], allow_unsafe=True, settle=3)
        q = self.d.find("Lead Quality", exact=True)
        self.ass(q is not None, "Lead Quality does not appear after choosing status %r" % status)
        self.d.tap_xy(int(w * 0.72), int((q.bounds[1] + q.bounds[3]) / 2))
        time.sleep(2.5)
        names = [n.label for n in self.d.nodes() if n.clickable and n.label and n.label != "Dismiss"]
        r["shots"].append(self.shot("f3_quality_list"))
        self.ass("Super Hot" in names, "Lead Quality list has no 'Super Hot' (%s)" % ", ".join(names))
        self.d.tap(self.d.find("Super Hot", exact=True), allow_unsafe=True, settle=2)
        self.ass(self.d.exists("Super Hot", exact=True), "after choosing it the field does not display 'Super Hot'")
        r["shots"].append(self.shot("f3_super_hot_selected"))
        self.d.tap(self.d.find("Cancel", exact=True), allow_unsafe=True, settle=2.5)
        for t in ("Discard", "Yes"):
            nn = self.d.find(t, exact=True)
            if nn:
                self.d.tap(nn, allow_unsafe=True, settle=2)
        r["notes"].append("Lead Quality list on %s: %s; 'Super Hot' selectable and displayed (not saved). Colour (red) must be checked in the screenshot" % (num, ", ".join(names)))

    # ---- F4 whatsapp window ---------------------------------------------------------
    def f4_whatsapp(self, r):
        self.top_menu("WhatsApp Chat", 10)
        self.ass(self.d.exists("Chats", exact=True), "WhatsApp Chat did not open a chat list")
        old = None
        for n in self.d.nodes():
            m = re.search(r"(\d\d)/(\d\d)/(\d\d)\b", n.label)
            if n.clickable and m:
                dt = datetime.date(2000 + int(m.group(3)), int(m.group(2)), int(m.group(1)))
                if (datetime.date.today() - dt).days >= 3:
                    old = (n, dt)
                    break
        if old is None:
            raise NotTestable("no chat older than 3 days on this tenant")
        self.d.tap(old[0], allow_unsafe=True, settle=7)
        r["shots"].append(self.shot("f4_old_chat"))
        has_box = any(n.cls.endswith("EditText") for n in self.d.nodes())
        notice = "24-hour reply window" in self.flat()
        self.ass(notice and not has_box,
                 "chat whose last activity is %s still shows the normal message box and no '24-hour reply window has closed' notice"
                 % old[1].strftime("%d %b %Y"))
        r["notes"].append("Old chat shows the window-closed notice")

    # ---- F5 purchase invoice ---------------------------------------------------------
    def pick_first(self, trigger_label, skip=()):
        self.d.tap(self.must(trigger_label, 8, trigger_label), allow_unsafe=True, settle=3)
        opts = [n for n in self.d.nodes() if n.clickable and n.label and n.label not in ("Dismiss", "Scrim") and n.label not in skip]
        self.ass(opts, "%s list is empty" % trigger_label)
        name = opts[0].label.split("\n")[0]
        self.d.tap(opts[0], allow_unsafe=True, settle=2.5)
        return name

    def f5_purchase(self, r):
        self.go_home()
        self.open_path("Inventory", "Purchase", "Purchase Invoices")
        time.sleep(7)
        before = next((l for l in self.d.labels() if re.match(r"^All\n\d+", l)), "All\n0")
        n_before = int(re.search(r"\d+", before).group(0))
        self.fab()
        self.open_form(r, "Purchase Invoice", "Purchase Invoice")
        time.sleep(1)
        self.error_dialog(r, "Purchase Invoice")
        w, h = self.d.size()
        sl = self.must(re.compile(r"^Supplier\n"), 8, "Supplier row")
        self.d.tap_xy(int(w * 0.72), int((sl.bounds[1] + sl.bounds[3]) / 2))
        time.sleep(3)
        sup = next((n for n in self.d.nodes() if n.clickable and "\n" in n.label), None) or \
            next((n for n in self.d.nodes() if n.clickable and n.label and n.label not in ("Scrim", "Close", "Dismiss", "Cancel")
                  and not n.label.startswith(("Choose supplier", "Add", "New"))), None)
        self.ass(sup is not None, "supplier list is empty")
        supplier = sup.label.split("\n")[0]
        self.d.tap(sup, allow_unsafe=True, settle=3)
        self.ass(supplier in self.flat(), "chosen supplier %r is not displayed on the form" % supplier)
        for _ in range(4):
            if self.d.find("ADD ITEM", exact=True) and self.d.find("ADD ITEM", exact=True).bounds[3] < h * 0.93:
                break
            self.d.swipe(w // 2, int(h * 0.8), w // 2, int(h * 0.4), 500)
            time.sleep(1)
        self.d.tap(self.d.find("ADD ITEM", exact=True), allow_unsafe=True, settle=3)
        item = self.pick_first("Choose")
        self.type_in(lambda: self.eds()[0], "50")
        self.type_in(lambda: self.eds()[1], "10")
        sheet = self.flat()
        pct = re.search(r"(\d+(?:\.\d+)?)\s?%", sheet)
        net = round(500 * (1 + (float(pct.group(1)) if pct else 0) / 100), 2)
        self.ass("%.2f" % net in sheet, "item sheet does not show Net %.2f (50 × 10 = 500.00 + %s%% tax): %s" % (net, pct.group(1) if pct else 0, sheet[-170:]))
        self.d.tap(self.d.find("Save", exact=True), allow_unsafe=True, settle=3)
        card = self.flat()
        self.ass(item in card and "Quantity 10" in card and "Rate 50.00" in card and "%.2f" % net in card,
                 "item card does not show item/qty 10/rate 50.00/total %.2f: %s" % (net, card[-200:]))
        # payment = full amount
        for _ in range(6):
            a = self.d.find("ADD ENTRY", exact=True)
            if a and a.bounds[3] < h * 0.93:
                break
            self.d.swipe(w // 2, int(h * 0.8), w // 2, int(h * 0.4), 500)
            time.sleep(1)
        self.d.tap(self.d.find("ADD ENTRY", exact=True), allow_unsafe=True, settle=3)
        self.d.tap([x for x in self.d.nodes() if x.label == "Choose"][-1], allow_unsafe=True, settle=2)
        self.d.tap(self.d.find("Cash", exact=True), allow_unsafe=True, settle=2)
        self.d.tap(self.d.find("Save", exact=True), allow_unsafe=True, settle=2.5)
        self.ass("Total Payment" in self.flat() and "%.2f" % net in self.flat(), "payment total %.2f not displayed" % net)
        r["shots"].append(self.shot("f5_form"))
        t0 = time.time()
        self.d.tap(self.d.find("Save", exact=True), allow_unsafe=True, settle=1)
        self.ass(self.must("Invoice Overview", 60, "Invoice Overview"), "overview not shown")
        r["load_s"] = time.time() - t0
        time.sleep(2)
        head = self.flat()
        m = re.search(r"(PO-\d+)", head)
        self.ass(m is not None, "overview has no PO number")
        po = m.group(1)
        self.ass(supplier in head and "%.2f" % net in head and "Confirmed" in head,
                 "overview %s does not show supplier %r, total %.2f and status Confirmed: %s" % (po, supplier, net, head[:200]))
        r["shots"].append(self.shot("f5_overview"))
        self.d.tap(self.d.find(re.compile(r"^Items")), allow_unsafe=True, settle=3)
        it = self.flat()
        self.ass(item in it and "Qty 10" in it and "Rate 50.00" in it, "Items tab does not show %s / Qty 10 / Rate 50.00" % item)
        self.d.back(3)
        time.sleep(3)
        row = self.wait_row(po, 20)
        self.ass(row is not None and "%.2f" % net in row.label, "list does not show %s with %.2f" % (po, net))
        now = re.search(r"\d+", next((l for l in self.d.labels() if re.match(r"^All\n\d+", l)), "All\n0")).group(0)
        self.ass(int(now) == n_before + 1, "All count went %d → %s (expected +1)" % (n_before, now))
        r["shots"].append(self.shot("f5_list"))
        r["notes"].append("Created %s: %s × 10 at 50.00 = %.2f from %s; form, overview, Items tab and list agree" % (po, item, net, supplier))
        if r["load_s"] > 10:
            r["notes"].append("Slow save: %.1fs" % r["load_s"])
            r["status"] = "WARN"

    # ---- F6 receipt ------------------------------------------------------------------
    def f6_receipt(self, r):
        narr = "QA_receipt_%d" % self.ts
        self.go_home()
        self.open_path("Accounts", "Vouchers", "Receipts")
        time.sleep(7)
        cnt = next((l for l in self.d.labels() if re.search(r"\d+ vouchers?", l)), "0 vouchers")
        n_before = int(re.search(r"\d+", cnt).group(0))
        self.fab()
        self.open_form(r, "New Receipt", "New Receipt")
        time.sleep(1)
        self.error_dialog(r, "New Receipt")
        w, h = self.d.size()
        for _ in range(4):
            a = self.d.find("Add line", exact=True)
            if a and a.bounds[3] < h * 0.9:
                break
            self.d.swipe(w // 2, int(h * 0.75), w // 2, int(h * 0.4), 500)
            time.sleep(1)
        self.d.tap(self.d.find("Add line", exact=True), allow_unsafe=True, settle=3)
        ln = self.must("Ledger", 8, "Ledger row")
        self.d.tap_xy(int(w * 0.72), int((ln.bounds[1] + ln.bounds[3]) / 2))
        time.sleep(3)
        opt = next((n for n in self.d.nodes() if n.clickable and n.label and n.label.split("\n")[0] not in ("Scrim", "Close", "Dismiss")
                    and "Ledger" not in n.label.split("\n")[0]), None)
        self.ass(opt is not None, "ledger list is empty")
        ledger = opt.label.split("\n")[0]
        self.d.tap(opt, allow_unsafe=True, settle=2.5)
        self.type_in(lambda: self.eds()[-1], "100")
        self.d.tap(self.d.find("Done", exact=True), allow_unsafe=True, settle=2.5)
        for _ in range(3):
            self.d.swipe(w // 2, int(h * 0.75), w // 2, int(h * 0.4), 500)
            time.sleep(1)
        txt = self.flat()
        self.ass(ledger.lower() in txt.lower() and "100.00" in txt, "the line does not display ledger %r and 100.00: %s" % (ledger, txt[-160:]))
        for _ in range(4):
            a2 = self.d.find("Received In", exact=True)
            if a2 and a2.bounds[3] < h * 0.9:
                break
            self.d.swipe(w // 2, int(h * 0.75), w // 2, int(h * 0.4), 500)
            time.sleep(1)
        time.sleep(2)
        rin = next((n for n in self.d.nodes() if n.label.startswith("Received In\n")), None)
        self.ass(rin is not None, "Received In row not found")
        self.d.tap_xy(int(w * 0.83), int((rin.bounds[1] + rin.bounds[3]) / 2))
        time.sleep(2.5)
        self.ass(self.d.exists("Dismiss", exact=True), "the Received In list did not open")
        acct = next((n for n in self.d.nodes() if n.clickable and n.label and n.label not in ("Dismiss", "Scrim")), None)
        self.ass(acct is not None, "Received In list is empty")
        self.d.tap(acct, allow_unsafe=True, settle=2)
        self.ass(acct.label.split("\n")[0] in self.flat(), "chosen account %r is not displayed" % acct.label.split("\n")[0])
        for _ in range(4):
            self.d.swipe(w // 2, int(h * 0.35), w // 2, int(h * 0.75), 500)
            time.sleep(0.8)
        time.sleep(1.5)
        self.type_in(lambda: max(self.eds(), key=lambda e: e.bounds[3] - e.bounds[1]), narr)   # the tall box; the first edit is Voucher No
        self.ass(narr in self.flat() or any(narr in e.text for e in self.eds()), "the narration %s is not displayed in the form" % narr)
        r["shots"].append(self.shot("f6_form"))
        t0 = time.time()
        self.d.tap(self.d.find("Save", exact=True), allow_unsafe=True, settle=1)
        self.ass(self.d.wait_for("Voucher saved", timeout=40) is not None, "no 'Voucher saved' dialog after Save")
        r["load_s"] = time.time() - t0
        dlg = self.flat()
        m = re.search(r"Voucher No\. (R-\d+)", dlg)
        self.ass(m is not None and "100.00" in dlg, "saved dialog does not show the voucher number and 100.00: %s" % dlg[:160])
        rno = m.group(1)
        r["shots"].append(self.shot("f6_saved"))
        self.d.tap(self.d.find("Not now", exact=True), allow_unsafe=True, settle=3)
        row = self.wait_row(rno, 20)
        self.ass(row is not None and "100.00" in row.label, "list does not show %s with 100.00" % rno)
        now = int(re.search(r"\d+", next((l for l in self.d.labels() if re.search(r"\d+ vouchers?", l)), "0")).group(0))
        self.ass(now == n_before + 1, "voucher count went %d → %d (expected +1)" % (n_before, now))
        self.d.tap(next(x for x in self.d.nodes() if x.label == "More actions"), allow_unsafe=True, settle=2)
        self.d.tap(self.d.find("View", exact=True), allow_unsafe=True, settle=4)
        view = self.flat()
        self.ass(narr in view and ledger.lower() in view.lower() and "100.00" in view,
                 "View of %s does not show narration %s, ledger %s and 100.00: %s" % (rno, narr, ledger, view[:200]))
        r["shots"].append(self.shot("f6_view"))
        r["notes"].append("Receipt %s (%s, 100.00, narration shown) saved; list count +1" % (rno, ledger))

    # ---- runner ----------------------------------------------------------------------
    def run(self, only):
        if self.go_home():
            hello = next((l for l in self.d.labels() if l.startswith("Hello ")), "")
            self.user = re.sub(r"[^\w .'-]", "", hello[len("Hello "):]).strip()
        plan = [("F1", "Mail send/reply/forward/star/trash", self.f1_mail), ("F2", "Lead notes add/edit/delete", self.f2_notes),
                ("F3", "Super Hot in Lead Quality", self.f3_super_hot), ("F4", "WhatsApp 24-hour window", self.f4_whatsapp),
                ("F5", "Purchase invoice", self.f5_purchase), ("F6", "Receipt voucher", self.f6_receipt)]
        for fid, title, fn in plan:
            if only and fid not in only:
                continue
            r = {"group": fid, "name": title, "kind": "scenario", "status": "PASS", "notes": [], "shots": [], "load_s": None, "labels": []}
            self.d.clear_logs()
            t0 = time.time()
            try:
                fn(r)
            except NotTestable as e:
                r["status"] = "WARN"
                r["notes"].append("Not testable: %s" % e)
            except Exception as e:  # noqa: BLE001
                r["status"] = "FAIL"
                r["notes"].append("%s: %s" % (type(e).__name__, e))
                if not isinstance(e, Fail):
                    r["notes"].append("at " + " ← ".join(l.strip() for l in traceback.format_exc().splitlines() if 'erp_features.py' in l)[:300])
                try:
                    r["shots"].append(self.shot("%s_error" % fid.lower()))
                except Exception:  # noqa: BLE001
                    pass
            crash = self.d.crash_log()
            if crash:
                r["status"] = "FAIL"
                r["notes"].append("CRASH/ANR:\n" + crash[:1500])
            r["notes"].append("Step time %.0fs" % (time.time() - t0))
            self.results.append(r)
            print("  %-5s %s %-36s %s" % (r["status"], fid, title, " | ".join(r["notes"])[:170]), flush=True)
            try:
                self.abandon_forms()
                self.go_home()
            except Exception:  # noqa: BLE001
                pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serial", default=os.environ.get("SERIAL", "emulator-5554"))
    ap.add_argument("--tenant", required=True)
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    if a.tenant not in TEST_TENANTS:
        print("Refusing: these scenarios create data — use a test tenant (%s)" % ", ".join(TEST_TENANTS))
        return 2
    d = Device(a.serial).ensure_online()
    android = d.android_version()
    out = os.path.join(QA_DIR, "reports", "erp-features_android%s_%s" % (android, datetime.datetime.now().strftime("%Y%m%d-%H%M%S")))
    os.makedirs(os.path.join(out, "shots"))
    fx = Features(d, out, a.tenant)
    fx.detail = False
    only = [x.strip().upper() for x in a.only.split(",") if x.strip()]
    print("Progbiz ERP new-feature scenarios · Android %s · %s → %s" % (android, a.tenant, out), flush=True)
    t0 = time.time()
    fx.run(only)
    meta = {"app": d.app_version(), "android": android, "serial": a.serial, "tenant": a.tenant,
            "when": datetime.datetime.now().strftime("%d %b %Y %H:%M"), "secs": int(time.time() - t0)}
    path = write_report(out, meta, fx.results, "new-feature scenarios", "ERP Mobile New Features")
    print("Report: %s" % path)
    return 1 if any(r["status"] == "FAIL" for r in fx.results) else 0


if __name__ == "__main__":
    sys.exit(main())
