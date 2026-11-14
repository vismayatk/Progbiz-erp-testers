# Setup — Progbiz ERP mobile test code

How to get the emulator test code running on a Mac. For what each suite checks, see `README.md`.

## What you need

| Item | Notes |
|---|---|
| macOS (Apple Silicon) | Tested on an M-series Mac with 16 GB RAM |
| Android SDK | Android Studio's default location `~/Library/Android/sdk`, with `platform-tools`, `emulator` and an arm64 Google APIs system image |
| JDK 17 | Only needed by `emu` for `sdkmanager` / `avdmanager` (creating emulators) |
| Python 3.9+ | The system `python3` is enough; no pip packages are required |
| Pillow (optional) | `pip3 install --user pillow` makes the embedded report screenshots smaller (JPEG thumbnails); without it the PNGs are embedded as they are |
| The ERP APK | e.g. `progbiz-erp-v2.0.61.apk` |

No Appium, Maestro or Espresso — the scripts drive the app over `adb` + `uiautomator`, so they work on the release APK.

## Install

1. Unzip so the folders are:

   ```
   ~/Progbiz/mobile-qa/automation/   ← the .py files, README.md, SETUP.md
   ~/.local/bin/emu                  ← the emulator switcher (from bin/emu in the zip)
   ```

   Then make the switcher runnable: `chmod +x ~/.local/bin/emu`, and add `~/.local/bin` to your PATH
   (`echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc`).

2. Somewhere else? Set the paths instead of editing code:

   | Variable | Default | Used for |
   |---|---|---|
   | `QA_DIR` | `~/Progbiz/mobile-qa` | reports, screenshots, logs (`$QA_DIR/reports/…`) — the code must be in `$QA_DIR/automation` for `emu` |
   | `ANDROID_HOME` | `~/Library/Android/sdk` | adb, emulator |
   | `ADB` | `$ANDROID_HOME/platform-tools/adb` | a different adb binary |
   | `JAVA_HOME` | `~/.local/jdk-17/Contents/Home` | `emu` only |

3. Emulators (one per Android version, named `QA_Android_<ver>`) are created the first time you start them —
   `emu start 13` downloads the Android 13 image and creates `QA_Android_13` (or `emu create 13` to only create it).
   `emu help` lists every command.

## From the GitHub repo (`mobile/` folder of Progbiz-erp-testers)

```bash
git clone https://github.com/vismayatk/Progbiz-erp-testers.git
cd Progbiz-erp-testers/mobile
export QA_DIR="$PWD"                           # reports/ and .logs/ are created here (git-ignored)
mkdir -p ~/.local/bin && cp bin/emu ~/.local/bin/emu && chmod +x ~/.local/bin/emu
echo 'export QA_DIR="'"$PWD"'"' >> ~/.zshrc    # so `emu` finds automation/ in new terminals
```

Then continue with "First run" below. Put APKs in `$QA_DIR/apks/` (git-ignored — never commit them).

## First run

```bash
emu start 13                                   # boots Android 13
emu install ~/Downloads/erp.apk                # installs / updates the app
```

Open the app on the emulator and log in (company code, username, password — the scripts never type passwords).
Then:

```bash
emu all 13 ncore_test                          # everything, ~80 min → one combined report with screenshots
```

Other ways to run:

```bash
emu all 13 ncore_test ~/Downloads/erp.apk      # install this APK first, then everything
emu all 13 ncore_test - release,crm            # only some suites (- = no APK)
emu release 13 ncore_test                      # only the release-note checks U1–U8
emu test 13                                    # only the every-screen check
emu scenarios 13 ncore_test                    # only the CRM flow (creates QA_MOB_ data)
```

Without `emu` (any adb device):

```bash
cd ~/Progbiz/mobile-qa/automation
python3 run_all.py --serial emulator-5554 --tenant ncore_test
python3 erp_release.py --serial emulator-5554 --tenant ncore_test --only U3,U8
python3 erp_regression.py --serial emulator-5554 --tenant ncore_test --only R4
python3 run_all.py --tenant ncore_test --combine 20261028      # one report from a day's runs (no device)
```

## Reports

Every run writes a folder in `$QA_DIR/reports/`:

| Folder | Contents |
|---|---|
| `erp-all_<tenant>_<time>/index.html` | combined report: summary table, every FAIL/WARN with screenshots, every check of every suite with thumbnails |
| `erp-release_…`, `erp-scenarios_…`, `erp-regression_…`, `erp-smoke_…` | each suite's `report.html`, `results.json` and full-size `shots/` |

The HTML files embed their screenshots, so a single `index.html` or `report.html` can be sent on its own
(click a thumbnail for the full-size image when the `shots/` folder is next to it).

## Safety rules built into the code

- Passwords are never typed; on the login screen only company code and username are filled.
- Data-creating suites (CRM flow, U8) refuse tenants not listed in `TEST_TENANTS` (`erp_scenarios.py`),
  and `run_all.py` checks the Profile company before creating data (`TENANT_COMPANY` in `run_all.py`).
- Test data is named `QA_MOB_<timestamp>`; phone numbers that match an existing customer are skipped.
- `droid.DENY` blocks taps on Logout, Check In/Out, Delete, Approve/Reject, Start/Stop and similar.
  The "Update Available" prompt is answered with "Maybe Later".

## Adding a tenant

1. Add it to `TEST_TENANTS` (and an item search word to `ITEM_SEARCH` if its items aren't "Bio…") in `erp_scenarios.py`.
2. Add its Profile company name to `TENANT_COMPANY` in `run_all.py`.
3. If its follow-up statuses differ, add one to `STATUS_PREF` in `erp_scenarios.py`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Emulator closes by itself ("hanging thread" in `$QA_DIR/.logs/android-13.log`) | the Mac is overloaded (load average > ~25, e.g. a large Playwright run) — wait or stop the other job |
| After an emulator crash the app version is older | the emulator reloaded an old snapshot — check `adb shell dumpsys package io.progbiz.erp \| grep versionName` and reinstall |
| `uiautomator` errors / empty screens | never run two scripts on the same emulator at once |
| A check says WARN "Could not check" | open its screenshot in the report — usually a screen that changed in a new app version |
