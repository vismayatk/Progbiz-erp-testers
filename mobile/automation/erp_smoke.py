#!/usr/bin/env python3
"""Progbiz ERP mobile app — read-only smoke test of every module.

Opens each module/screen from the side drawer, bottom bar and home tiles, waits for it to
finish loading, then records: load time, screenshot (top + after one scroll), on-screen
error text, empty states, app crashes/ANRs. Writes an HTML report.

It never types, saves, submits, deletes, approves, checks in or stops timers: `droid.DENY`
blocks those taps, and "New …" forms are only opened and closed again.

Usage (app must already be logged in on the emulator):
    python3 erp_smoke.py                       # every module on emulator-5554
    python3 erp_smoke.py --only crm,projects   # modules whose name/group contains these words
    python3 erp_smoke.py --serial emulator-5556
    python3 erp_smoke.py --list                # print the discovered module map
    python3 erp_smoke.py --tenant onetouch_test --no-detail
"""
import argparse
import base64
import datetime
import html
import io
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from droid import Device, UnsafeTap  # noqa: E402

QA_DIR = os.environ.get("QA_DIR") or os.path.expanduser("~/Progbiz/mobile-qa")   # reports go to $QA_DIR/reports

# Steps: "≡" open drawer · "+Sec" expand drawer section · "tab:N" bottom bar slot (0-4)
#        "Label" tap by accessibility label · re:<regex> tap by regex label
# Kinds: "list" scrolls once + opens the first record · "form" is opened then closed ·
#        "count" (home number cards) scrolls the whole list and compares its length with the card
# The module map is discovered from the running app (menus differ per tenant and role).
TAB_NAMES = ["Home", "Calendar", "Quick add (+)", "History", "Profile & settings"]
CARD_LABEL = re.compile(r"^(?:([^\n]+)\n(\d+)|(\d+)\n([^\n]+))$")   # "New Leads\n1" or "40\nDelayed"
NOT_A_RECORD = re.compile(r"CheckBox|Switch|RadioButton|ToggleButton|EditText|SeekBar", re.I)

ERROR_TEXT = re.compile(
    r"something went wrong|exception|\berror\b|failed|\bnull\b|undefined|\bnan\b|internal server|"
    r"timed? ?out|no internet|unauthori[sz]ed|forbidden|(status|error|code|http)\W{0,3}[45]\d\d\b|"
    r"invalid date|instance of '|type '.*' is not a subtype",
    re.I)
EMPTY_TEXT = re.compile(r"no data|no records?|no results?|nothing (here|to show)|not found|is empty|no \w+ found", re.I)
OFFLINE_TEXT = re.compile(r"no internet|Connection lost|isn.t reaching the internet", re.I)
HOME_MARK = re.compile(r"^Hello ")
DRAWER_MARK = re.compile(r"^Version \d")
# Safe "decline" answers for pop-ups that interrupt a run (checked in this order)
INTERRUPTS = [
    re.compile(r"^Continue Without Check-?in$", re.I),   # check-in gate on cold start → skip, never check in
    re.compile(r"^Maybe Later$", re.I),                   # "Update Available" prompt (2.0.61+) → stay on this build
    re.compile(r"^Not now$", re.I),                       # "Allow location all the time" explainer
    re.compile(r"^Don.t allow$", re.I),                   # Android permission dialog
    re.compile(r"^(Deny|Cancel|Close)$", re.I),
]
SLOW_SECS = 5.0


class Runner(object):
    def __init__(self, d, out_dir):
        self.d = d
        self.out = out_dir
        self.results = []
        self.interrupts = []
        self.relaunches = 0
        self.detail = True

    # ---- navigation ----------------------------------------------------------------------
    def at_home(self):
        return self.d.exists(HOME_MARK)

    def go_home(self):
        """Back to the top of Home without ever pressing Back on a root tab (that exits the app)."""
        for _ in range(6):
            if self.d.foreground_package() != self.d.package:
                self.relaunches += 1
                self.d.launch()
            self.dismiss_interrupts()
            if self.d.exists(DRAWER_MARK):      # Back doesn't close the drawer (app bug) — swipe it shut
                self.close_drawer()
            if self.at_home():
                self.home_top()
                self.wait_stable(15)          # Home reloads (skeleton + spinner) every time you return
                return True
            if len(self.bottom_bar()) == 5:
                self.tap_tab(0)
                continue
            self.d.back(1.0)
        return False

    def home_top(self):
        """Home keeps its scroll position — scroll up until the screen stops changing."""
        prev = None
        for _ in range(6):
            sig = tuple(re.sub(r"\d", "#", l) for l in self.d.labels())
            if sig == prev:
                return True
            prev = sig
            self.d.scroll_up(0.7)
        return True

    def dismiss_interrupts(self):
        """Decline the pop-ups that can appear on (re)launch: check-in gate, location/permission prompts."""
        for _ in range(4):
            ns = self.d.nodes()
            hit = None
            for rx in INTERRUPTS:
                hit = next((n for n in ns if n.label and rx.search(n.label)), None)
                if hit:
                    break
            if hit is None:
                return
            self.interrupts.append(hit.label.replace("\n", " "))
            self.d.tap(hit, settle=1.5)

    def close_drawer(self):
        w, h = self.d.size()
        self.d.swipe(int(w * 0.6), int(h * 0.5), int(w * 0.05), int(h * 0.5), 250)
        time.sleep(1.0)

    def bottom_bar(self):
        """The 5 bottom-bar slots [Home, Calendar, +, History, Profile] — [] unless all are found
        exactly where expected (the icons are unlabelled, and task play/stop icons sit just above)."""
        w, h = self.d.size()
        small = [n for n in self.d.nodes() if n.clickable and (not n.label or n.label.isdigit()) and n.area < w * h * 0.03
                 and n.center[1] > h * 0.8]
        if not small:
            return []
        lowest = max(n.bounds[3] for n in small)
        tabs = sorted([n for n in small if n.bounds[3] >= lowest - h * 0.01], key=lambda n: n.center[0])
        fab = [n for n in small if n not in tabs and abs(n.center[0] - w / 2) < w * 0.05]
        want = [0.097, 0.305, 0.695, 0.903]
        if len(tabs) != 4 or len(fab) != 1 or any(abs(t.center[0] - w * x) > w * 0.06 for t, x in zip(tabs, want)):
            return []
        return [tabs[0], tabs[1], fab[0], tabs[2], tabs[3]]

    def open_drawer(self):
        if not self.at_home():
            raise LookupError("drawer can only be opened from Home")
        # the hamburger has no accessibility label: top-left clickable icon
        w, h = self.d.size()
        icon = [n for n in self.d.nodes() if n.clickable and n.bounds[2] < w * 0.25 and n.bounds[3] < h * 0.15]
        if not icon:
            raise LookupError("drawer button not found")
        self.d.tap(icon[0], settle=1.2)
        if not self.d.wait_for(DRAWER_MARK, timeout=4):
            raise LookupError("drawer did not open")
        # the drawer remembers expanded sections — collapse them so item names are unambiguous
        for n in [x for x in self.d.nodes() if x.label.endswith(", Expanded")]:
            self.d.tap(n, settle=0.6)

    def tap_tab(self, i):
        bar = self.bottom_bar()
        if not bar:
            raise LookupError("bottom bar not visible")
        self.d.tap(bar[i], settle=1.2)

    def tap_drawer_item(self, label):
        """Tap the drawer entry `label` (below the expanded section if one is open), scrolling the drawer if needed."""
        w, h = self.d.size()
        for _ in range(3):
            ns = self.d.nodes()
            exp = [n for n in ns if n.label.endswith(", Expanded")]
            top = exp[0].bounds[3] if exp else 0
            hits = [n for n in ns if n.label == label and n.clickable and n.bounds[1] >= top - 5
                    and n.bounds[3] < h * 0.94]
            if hits:
                hits.sort(key=lambda n: n.bounds[1])
                self.d.tap(hits[0], settle=0.5)
                return
            self.d.swipe(int(w * 0.35), int(h * 0.8), int(w * 0.35), int(h * 0.45), 350)
            time.sleep(0.8)
        raise LookupError("drawer item %r not found" % label)

    def run_step(self, step, in_drawer=False):
        if step == "≡":
            self.open_drawer()
        elif step.startswith("+"):
            sec = self.d.find(step[1:] + ", Collapsed", exact=True)
            if sec:
                self.d.tap(sec, settle=1.0)
            elif not self.d.find(step[1:] + ", Expanded", exact=True):
                raise LookupError("drawer section %r not found" % step[1:])
        elif step.startswith("tab:"):
            self.tap_tab(int(step[4:]))
        elif step.startswith("re:"):
            self.d.tap(re.compile(step[3:]), settle=0.5)
        elif in_drawer:
            self.tap_drawer_item(step)
        else:
            hit = self.d.find(step, exact=True) or self.d.find(step)
            for _ in range(4):                  # e.g. "View All" sits below the Ongoing Task cards
                if hit is not None:
                    break
                self.d.scroll_down(0.6)
                hit = self.d.find(step, exact=True) or self.d.find(step)
            if hit is None:
                raise LookupError("not on screen: %r" % step)
            self.d.tap(hit, settle=0.5)

    def discover(self):
        """Build the module list from what this tenant/role actually shows."""
        from droid import DENY
        mods = [("Home", "Home screen", [], "list")]
        if not self.go_home():
            raise RuntimeError("app is not on its home screen — is it logged in?")
        seen = set()
        t0 = time.time()                       # Home can take 10 s+ to show its number cards
        while time.time() - t0 < 40 and not any(CARD_LABEL.match(n.label) for n in self.d.nodes()):
            time.sleep(2)
        for n in self.d.nodes():
            m = CARD_LABEL.match(n.label)
            if n.clickable and m:
                title = m.group(1) or m.group(4)
                if title in seen or DENY.search(title):
                    continue
                seen.add(title)
                rx = r"^(%s\n\d+|\d+\n%s)$" % (re.escape(title), re.escape(title))
                mods.append(("Home", "Card · " + title, ["re:" + rx], "count"))
        for n in self.d.nodes():
            if n.clickable and n.label in ("View All", "View all", "See All", "See all"):
                mods.append(("Home", "View All", [n.label], "list"))
                break
        if len(self.bottom_bar()) == 5:
            for i in range(1, 5):
                mods.append(("Bottom bar", TAB_NAMES[i], ["tab:%d" % i], "form" if i == 2 else "list"))
        self.open_drawer()
        top = [n.label for n in self.d.nodes() if n.clickable and n.label and not DRAWER_MARK.search(n.label)]
        for lab in top:
            if lab.endswith(", Collapsed"):
                sec = lab[:-len(", Collapsed")]
                self.d.tap(self.d.find(lab, exact=True), settle=1.0)
                ns = self.d.nodes()
                hdr = self.d.find(sec + ", Expanded", exact=True)
                below = sorted([x for x in ns if x.clickable and x.label and x.bounds[1] >= hdr.bounds[3] - 5],
                               key=lambda x: x.bounds[1])
                for x in below:
                    if not x.cls.endswith("Button"):   # sub-items are Buttons, top-level entries are not
                        break
                    kind = "form" if re.match(r"New\b", x.label) else "list"
                    mods.append((sec, x.label, ["≡", "+" + sec, x.label], kind))
                self.d.tap(self.d.find(sec + ", Expanded", exact=True), settle=0.8)
            elif not lab.endswith(", Expanded"):
                kind = "form" if re.search(r"assistant|new\b", lab, re.I) else "list"
                mods.append(("Menu", lab, ["≡", lab], kind))
        self.close_drawer()
        return mods

    def open_first_record(self, slug, r):
        """Open the first record of a list (read-only) → screenshot → back."""
        from droid import DENY
        w, h = self.d.size()
        before = set(self.d.labels())
        cands = [n for n in self.d.nodes() if n.clickable and n.label and h * 0.16 < n.center[1] < h * 0.85
                 and n.area > w * h * 0.02 and not NOT_A_RECORD.search(n.cls)
                 and not DENY.search(n.label.split("\n")[0])]
        if not cands:
            r["notes"].append("Detail: no openable record found")
            return
        cands.sort(key=lambda n: n.bounds[1])
        rec = cands[0]
        self.d.tap(rec, settle=0.5)
        settle, ns = self.wait_stable()
        label = rec.label.split("\n")[0][:60]
        if self.d.foreground_package() != self.d.package:
            r["notes"].append("Detail: tapping %r opened another app (%s)" % (label, self.d.foreground_package()))
            r["status"] = "WARN" if r["status"] == "PASS" else r["status"]
            return
        r["shots"].append(self.shot(slug + "_3-detail"))
        now = set(n.label for n in ns if n.label)
        if now == before:
            r["notes"].append("Detail: tapping %r did nothing" % label)
            r["status"] = "WARN" if r["status"] == "PASS" else r["status"]
        else:
            r["notes"].append("Detail opened: %r" % label)
            errs = sorted(set(l.replace("\n", " ")[:140] for l in now if ERROR_TEXT.search(l)))
            if errs:
                r["status"] = "WARN" if r["status"] == "PASS" else r["status"]
                r["notes"] += ["Detail error-like text: " + e for e in errs]
        if settle is None:
            r["notes"].append("Detail still loading after 20 s")
            r["status"] = "WARN" if r["status"] == "PASS" else r["status"]

    def wait_stable(self, timeout=20):
        """Wait until no progress indicator and two identical consecutive dumps.
        Returns (time the stable screen was first seen, nodes) — or (None, nodes) on timeout.
        Digits are masked so running timers/clocks don't count as "still changing"."""
        t_end = time.time() + timeout
        prev, prev_t = None, None
        while time.time() < t_end:
            t = time.time()
            ns = self.d.nodes()
            # Flutter spinners/skeletons aren't exposed as ProgressBar — a screen with nothing
            # labelled below the header is treated as still loading too
            w, h = self.d.size()
            busy = any("ProgressBar" in n.cls for n in ns) or \
                not any(n.label and n.center[1] > h * 0.21 for n in ns)
            sig = tuple(re.sub(r"\d", "#", n.label) for n in ns if n.label)
            if not busy and sig and sig == prev:
                return prev_t, ns
            prev, prev_t = sig, t
            time.sleep(0.3)
        return None, self.d.nodes()

    def count_list(self, top_frac=0.13, max_scrolls=25):
        """Scroll to the end of a list, return the set of distinct item labels seen below the header."""
        w, h = self.d.size()
        seen, stale = set(), 0
        for _ in range(max_scrolls):
            # list rows are full-width; header tabs/chips ("New 1", "Won 1") are narrow
            new = set(n.label for n in self.d.nodes()
                      if n.label and n.clickable and n.center[1] > h * top_frac and n.center[1] < h * 0.95
                      and n.bounds[2] - n.bounds[0] > w * 0.7)
            if new <= seen:
                stale += 1
                if stale >= 2:
                    break
            else:
                stale = 0
            seen |= new
            self.d.scroll_down(0.6)
        return seen

    # ---- one module ----------------------------------------------------------------------
    def check(self, group, name, steps, kind):
        slug = re.sub(r"[^a-z0-9]+", "-", (group + " " + name).lower()).strip("-")
        r = {"group": group, "name": name, "kind": kind, "status": "PASS", "notes": [],
             "shots": [], "load_s": None, "labels": []}
        self.d.clear_logs()
        try:
            if not self.go_home():
                raise RuntimeError("could not get back to the home screen")
            before_nodes = self.d.nodes()
            before = set(n.label for n in before_nodes if n.label)
            in_drawer = bool(steps) and steps[0] == "≡"
            for s in steps[:-1]:
                self.run_step(s, in_drawer)
            t0 = time.time()
            if steps:
                self.run_step(steps[-1], in_drawer)
                self.d.hide_keyboard()
            settle, ns = self.wait_stable()
            r["load_s"] = round(max(0.0, settle - t0), 1) if settle is not None else None
            labels = [n.label for n in ns if n.label]
            r["labels"] = labels
            r["shots"].append(self.shot(slug + "_1"))

            if steps and set(labels) == before:
                r["status"] = "FAIL"
                r["notes"].append("Screen did not change after navigating")
            if settle is None:
                r["status"] = "WARN"
                r["notes"].append("Still loading after 20 s")
            elif r["load_s"] and r["load_s"] > SLOW_SECS:
                r["notes"].append("Slow: %.1fs to load" % r["load_s"])
                if r["status"] == "PASS":
                    r["status"] = "WARN"
            errs = sorted(set(l.replace("\n", " ")[:140] for l in labels if ERROR_TEXT.search(l)))
            if errs:
                r["status"] = "WARN" if r["status"] == "PASS" else r["status"]
                r["notes"] += ["Error-like text on screen: " + e for e in errs]
            offline = [l.split("\n")[0] for l in labels if OFFLINE_TEXT.search(l)]
            if offline:
                r["notes"].append("Offline banner shown: " + offline[0])
            empties = sorted(set(l.replace("\n", " ")[:100] for l in labels if EMPTY_TEXT.search(l)))
            if empties:
                r["notes"] += ["Empty state: " + e for e in empties]

            if kind == "count":
                want = None
                m = re.match(r"re:(.*)", steps[-1])
                card = [n for n in before_nodes if m and re.search(m.group(1), n.label)]
                if card:
                    want = int(re.search(r"\d+", card[0].label).group(0))
                items = self.count_list()
                r["shots"].append(self.shot(slug + "_2-end-of-list"))
                r["notes"].append("Card says %s, list shows %d distinct items" % (want, len(items)))
                if want is not None and want != len(items):
                    r["status"] = "WARN" if r["status"] == "PASS" else r["status"]
                    r["notes"].append("Count mismatch: card %d vs list %d (identical rows count once)" % (want, len(items)))
            if kind == "list":
                self.d.scroll_down()
                time.sleep(1.5)
                r["shots"].append(self.shot(slug + "_2-scrolled"))
                if self.d.foreground_package() != self.d.package:
                    r["status"] = "FAIL"
                    r["notes"].append("App left the foreground after scrolling")
                elif steps and self.detail:
                    self.d.scroll_up(0.8)
                    self.open_first_record(slug, r)
        except UnsafeTap as e:
            r["status"] = "SKIP"
            r["notes"].append(str(e))
        except Exception as e:  # noqa: BLE001 — record and keep going
            r["status"] = "FAIL"
            r["notes"].append("%s: %s" % (type(e).__name__, e))
            try:
                r["shots"].append(self.shot(slug + "_error"))
            except Exception:  # noqa: BLE001
                pass

        if self.interrupts:
            r["notes"].append("Pop-ups declined: " + "; ".join(self.interrupts))
            self.interrupts = []
        crash = self.d.crash_log()
        if crash:
            r["status"] = "FAIL"
            r["notes"].append("CRASH/ANR:\n" + crash[:1500])
        if self.d.foreground_package() != self.d.package:
            r["status"] = "FAIL"
            r["notes"].append("App was not in the foreground at the end (crash or external app opened)")
        app_err = self.d.app_errors()
        if app_err:
            r["notes"].append("App log errors:\n" + app_err[:800])
        self.results.append(r)
        print("  %-5s %-16s %-28s %s" % (r["status"], group, name,
                                         ("%.1fs" % r["load_s"]) if r["load_s"] is not None else "-"))
        return r

    def shot(self, slug):
        rel = os.path.join("shots", slug + ".png")
        self.d.screenshot(os.path.join(self.out, rel))
        return rel


# ---- report -------------------------------------------------------------------------------
def embed_image(path, width=360):
    """Screenshot → small JPEG data URI, so the HTML report is one self-contained file."""
    try:
        from PIL import Image
        im = Image.open(path).convert("RGB")
        w, h = im.size
        if w > width:
            im = im.resize((width, int(h * width / w)))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=72, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:  # noqa: BLE001 — no Pillow: embed the PNG as is
        with open(path, "rb") as f:
            return "data:image/png;base64," + base64.b64encode(f.read()).decode()


def shot_html(out, rel):
    """Thumbnail (embedded) linking to the full-size screenshot next to the report."""
    path = os.path.join(out, rel)
    if not os.path.exists(path):
        return ""
    cap = html.escape(os.path.splitext(os.path.basename(rel))[0].replace("_", " "))
    return ('<figure><a href="%s" target="_blank"><img loading="lazy" src="%s" alt="%s"></a>'
            '<figcaption>%s</figcaption></figure>' % (html.escape(rel), embed_image(path), cap, cap))


def write_report(out, meta, results, title="smoke test", doc_title="ERP Mobile Smoke"):
    with open(os.path.join(out, "results.json"), "w") as f:
        json.dump({"meta": meta, "results": results}, f, indent=2)
    counts = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    esc = html.escape
    cards = []
    for r in results:
        notes = "".join("<li>%s</li>" % esc(n).replace("\n", "<br>") for n in r["notes"]) or "<li class=muted>No issues detected</li>"
        shots = "".join(shot_html(out, s) for s in r["shots"]) or '<p class="muted">No screenshot</p>'
        load = ("%.1fs" % r["load_s"]) if r["load_s"] is not None else "–"
        cards.append(
            '<article class="card %s"><header><span class="badge">%s</span><div><small>%s</small>'
            '<h2>%s</h2></div><span class="load">%s</span></header><div class="shots">%s</div><ul>%s</ul></article>'
            % (r["status"].lower(), r["status"], esc(r["group"]), esc(r["name"]), load, shots, notes))
    summary = " · ".join("%s %d" % (k, counts[k]) for k in ("PASS", "WARN", "FAIL", "SKIP") if k in counts)
    page = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>%s</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#14171c;--muted:#667085;--line:#e4e7ec;
--pass:#12805c;--warn:#b54708;--fail:#c01048;--skip:#475467}
@media (prefers-color-scheme:dark){:root{--bg:#0e1116;--card:#171b22;--ink:#e8eaee;--muted:#98a2b3;--line:#2a303a;
--pass:#3ccb7f;--warn:#fdb022;--fail:#f63d68;--skip:#98a2b3}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px}h1{margin:0 0 4px;font-size:24px}
.meta{color:var(--muted);margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--skip);border-radius:10px;padding:14px}
.card.pass{border-left-color:var(--pass)}.card.warn{border-left-color:var(--warn)}.card.fail{border-left-color:var(--fail)}
header{display:flex;gap:10px;align-items:center}header div{flex:1;min-width:0}h2{margin:0;font-size:16px}
small,.muted{color:var(--muted)}.load{color:var(--muted);font-variant-numeric:tabular-nums}
.badge{font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;color:#fff;background:var(--skip)}
.pass .badge{background:var(--pass)}.warn .badge{background:var(--warn)}.fail .badge{background:var(--fail)}
.shots{display:flex;gap:8px;margin:12px 0;overflow-x:auto}.shots figure{margin:0;flex:0 0 auto;width:140px}
.shots img{width:140px;border-radius:6px;border:1px solid var(--line);display:block}
.shots figcaption{font-size:11px;color:var(--muted);margin-top:3px;overflow-wrap:anywhere}
ul{margin:0;padding-left:18px;font-size:13px;overflow-wrap:anywhere}
</style></head><body><main>
<h1>Progbiz ERP mobile — %s</h1>
<p class="meta">%s</p><div class="grid">%s</div></main></body></html>""" % (
        esc(doc_title), esc(title), esc("App v%(app)s · Android %(android)s (%(serial)s) · tenant %(tenant)s · %(when)s · %(secs)ss · " % dict({"serial": "-", "secs": 0}, **meta)) + summary,
        "".join(cards))
    path = os.path.join(out, "report.html")
    with open(path, "w") as f:
        f.write(page)
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serial", default=os.environ.get("SERIAL", "emulator-5554"))
    ap.add_argument("--only", default="", help="comma-separated words matched against group/name")
    ap.add_argument("--tenant", default=os.environ.get("TENANT", "?"), help="label for the report only")
    ap.add_argument("--no-detail", action="store_true", help="don't open the first record of each list")
    ap.add_argument("--list", action="store_true", help="print the discovered module map and exit")
    a = ap.parse_args()

    d = Device(a.serial)
    android = d.android_version()
    if not android:
        print("No device %s — start one with: emu start 13" % a.serial)
        return 2
    if d.foreground_package() != d.package:
        d.launch()
    mods = Runner(d, "/tmp").discover()
    if a.only:
        words = [w.strip().lower() for w in a.only.split(",") if w.strip()]
        mods = [m for m in mods if any(w in (m[0] + " " + m[1]).lower() for w in words)]
    if a.list:
        for g, n, s, k in mods:
            print("%-16s %-28s %-5s %s" % (g, n, k, " > ".join(s) or "(home)"))
        return 0
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = os.path.join(QA_DIR, "reports", "erp-smoke_android%s_%s" % (android, stamp))
    os.makedirs(os.path.join(out, "shots"))
    print("Progbiz ERP smoke · Android %s · %d modules → %s" % (android, len(mods), out))

    runner = Runner(d, out)
    runner.detail = not a.no_detail
    if not runner.go_home():
        print("App is not on its home screen — is it logged in?")
        return 2
    t0 = time.time()
    for g, n, s, k in mods:
        runner.check(g, n, s, k)
    runner.go_home()
    if runner.relaunches:
        print("Note: app had to be relaunched %d time(s)" % runner.relaunches)
    meta = {"app": d.app_version(), "android": android, "serial": a.serial, "tenant": a.tenant,
            "when": datetime.datetime.now().strftime("%d %b %Y %H:%M"), "secs": int(time.time() - t0)}
    path = write_report(out, meta, runner.results)
    bad = sum(1 for r in runner.results if r["status"] == "FAIL")
    print("Report: %s" % path)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
