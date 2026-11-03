"""Tiny adb + uiautomator driver for black-box testing of release APKs (Flutter included).

Flutter exposes its widgets to Android accessibility, so `uiautomator dump` gives us
labels (content-desc) and bounds we can find and tap — no debug build or Appium needed.

    from droid import Device
    d = Device("emulator-5554")
    d.tap("Customers")              # find by label (exact, then substring) and tap
    d.wait_for(r"Search", timeout=10)
    d.screenshot("out/customers.png")
"""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET

ADB = os.environ.get("ADB") or os.path.join(os.environ.get("ANDROID_HOME") or os.path.expanduser("~/Library/Android/sdk"),
                                           "platform-tools", "adb")

# Never tap anything whose label matches this — keeps automated runs read-only.
DENY = re.compile(
    r"^(log ?out|check[ -]?in|check[ -]?out|punch|delete|remove|deactivate|approve|reject|"
    r"submit|save|send|confirm|update|create|add|stop|pause|start|clock[ -]?(in|out)|yes|ok|"
    r"allow|while using|only this time|continue(?! without check)|call|dial)\b",
    re.I,
)


class UnsafeTap(Exception):
    pass


class Node(object):
    __slots__ = ("text", "desc", "cls", "rid", "bounds", "clickable", "scrollable", "checked", "focused", "enabled", "hint")

    def __init__(self, a):
        self.text = a.get("text", "")
        self.desc = a.get("content-desc", "")
        self.cls = a.get("class", "")
        self.rid = a.get("resource-id", "")
        b = [int(n) for n in re.findall(r"\d+", a.get("bounds", "[0,0][0,0]"))]
        self.bounds = tuple(b)
        self.clickable = a.get("clickable") == "true"
        self.scrollable = a.get("scrollable") == "true"
        self.checked = a.get("checked") == "true"
        self.focused = a.get("focused") == "true"
        self.enabled = a.get("enabled", "true") == "true"
        self.hint = a.get("hint", "")

    @property
    def label(self):
        return (self.desc or self.text).strip()

    @property
    def center(self):
        x1, y1, x2, y2 = self.bounds
        return (x1 + x2) // 2, (y1 + y2) // 2

    @property
    def area(self):
        x1, y1, x2, y2 = self.bounds
        return max(0, x2 - x1) * max(0, y2 - y1)

    def __repr__(self):
        short = self.cls.split(".")[-1]
        return "<%s %r %s%s>" % (short, self.label[:60], self.bounds, " *" if self.clickable else "")


class Device(object):
    def __init__(self, serial="emulator-5554", package="io.progbiz.erp"):
        self.serial = serial
        self.package = package
        self._nodes = None

    # ---- raw adb -------------------------------------------------------------------------
    def adb(self, *args, **kw):
        timeout = kw.get("timeout", 30)
        binary = kw.get("binary", False)
        p = subprocess.run([ADB, "-s", self.serial] + list(args), stdin=subprocess.DEVNULL,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        return p.stdout if binary else p.stdout.decode("utf-8", "replace")

    def shell(self, cmd, **kw):
        return self.adb("shell", cmd, **kw)

    # ---- screen state --------------------------------------------------------------------
    def nodes(self, fresh=True):
        if fresh or self._nodes is None:
            xml = ""
            for _ in range(3):  # dump fails while animations run; retry
                xml = self.shell("uiautomator dump /sdcard/_ui.xml >/dev/null 2>&1; cat /sdcard/_ui.xml")
                if xml.startswith("<?xml"):
                    break
                time.sleep(0.7)
            try:
                root = ET.fromstring(xml)
                self._nodes = [Node(n.attrib) for n in root.iter("node")]
            except ET.ParseError:
                self._nodes = []
        return self._nodes

    def labels(self, fresh=True):
        return [n.label for n in self.nodes(fresh) if n.label]

    def find(self, label, exact=False, fresh=True, clickable_first=True):
        """label = plain text (exact match first, then case-insensitive substring) or compiled regex."""
        ns = [n for n in self.nodes(fresh) if n.label]
        if hasattr(label, "search"):
            hits = [n for n in ns if label.search(n.label)]
        else:
            low = label.lower()
            hits = [n for n in ns if n.label.lower() == low]
            if not hits and not exact:
                hits = [n for n in ns if n.label.lower().startswith(low)] or \
                       [n for n in ns if low in n.label.lower()]
        if clickable_first:
            hits.sort(key=lambda n: (not n.clickable, n.area))
        return hits[0] if hits else None

    def exists(self, label, **kw):
        return self.find(label, **kw) is not None

    def wait_for(self, label, timeout=15, gone=False, interval=0.6):
        end = time.time() + timeout
        while True:
            hit = self.find(label)
            if (hit is None) == gone:
                return True if gone else hit
            if time.time() > end:
                return None if not gone else False
            time.sleep(interval)

    def foreground_package(self):
        out = self.shell("dumpsys window | grep -E 'mCurrentFocus'")
        m = re.search(r"u0 ([\w.]+)/", out)
        return m.group(1) if m else ""

    # ---- input ---------------------------------------------------------------------------
    def tap_xy(self, x, y):
        self.shell("input tap %d %d" % (x, y))

    def tap(self, target, timeout=8, allow_unsafe=False, settle=1.2):
        node = target if isinstance(target, Node) else self.wait_for(target, timeout=timeout)
        if node is None:
            raise LookupError("not on screen: %r" % (target,))
        first_line = node.label.split("\n")[0].strip()
        if not allow_unsafe and DENY.search(first_line):
            raise UnsafeTap("refusing to tap %r (on the read-only deny list)" % first_line)
        self.tap_xy(*node.center)
        time.sleep(settle)
        return node

    def back(self, settle=1.0):
        self.shell("input keyevent 4")
        time.sleep(settle)

    def swipe(self, x1, y1, x2, y2, ms=350):
        self.shell("input swipe %d %d %d %d %d" % (x1, y1, x2, y2, ms))

    def scroll_down(self, frac=0.55):
        w, h = self.size()
        self.swipe(w // 2, int(h * 0.75), w // 2, int(h * (0.75 - frac)))
        time.sleep(0.8)

    def scroll_up(self, frac=0.55):
        w, h = self.size()
        self.swipe(w // 2, int(h * 0.25), w // 2, int(h * (0.25 + frac)))
        time.sleep(0.8)

    def size(self):
        if not hasattr(self, "_size"):
            m = re.search(r"(\d+)x(\d+)", self.shell("wm size"))
            self._size = (int(m.group(1)), int(m.group(2))) if m else (1080, 2400)
        return self._size

    def hide_keyboard(self):
        if "mInputShown=true" in self.shell("dumpsys input_method | grep mInputShown"):
            self.back(0.6)

    # ---- app lifecycle -------------------------------------------------------------------
    def launch(self, wait=6):
        self.shell("monkey -p %s -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1" % self.package)
        time.sleep(wait)

    def force_stop(self):
        self.shell("am force-stop %s" % self.package)

    def app_version(self):
        out = self.shell("dumpsys package %s | grep -m1 versionName" % self.package)
        return out.split("=")[-1].strip()

    def android_version(self):
        return self.shell("getprop ro.build.version.release").strip()

    # ---- evidence ------------------------------------------------------------------------
    def screenshot(self, path):
        d = os.path.dirname(path)
        if d and not os.path.isdir(d):
            os.makedirs(d)
        png = self.adb("exec-out", "screencap", "-p", binary=True)
        with open(path, "wb") as f:
            f.write(png)
        return path

    def clear_logs(self):
        self.adb("logcat", "-b", "all", "-c")

    def crash_log(self):
        """Crashes/ANRs of *this app* since the last clear_logs() (other processes are ignored —
        e.g. uiautomator crashes if two dumps run at once)."""
        crash = self.adb("logcat", "-b", "crash", "-d")
        blocks = re.split(r"(?=^.*FATAL EXCEPTION)", crash, flags=re.M)
        mine = [blk.strip() for blk in blocks if "Process: %s" % self.package in blk]
        anr = [l for l in self.adb("logcat", "-d", "-s", "ActivityManager:E").splitlines()
               if "ANR in %s" % self.package in l]
        return "\n\n".join(mine[:2] + anr)

    def app_errors(self):
        """Flutter/Dart errors the app printed (release builds still log uncaught ones)."""
        out = self.adb("logcat", "-d", "-s", "flutter:*", "AndroidRuntime:E")
        return "\n".join(l for l in out.splitlines()
                         if re.search(r"exception|error|failed|unhandled", l, re.I))


if __name__ == "__main__":
    import sys
    d = Device(os.environ.get("SERIAL", "emulator-5554"))
    if len(sys.argv) > 1 and sys.argv[1] == "tap":
        print(d.tap(" ".join(sys.argv[2:])))
    else:  # default: list what's on screen
        for n in d.nodes():
            if n.label or n.clickable or n.scrollable:
                print(n)
