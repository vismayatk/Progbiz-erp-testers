# Progbiz ERP — mobile app (Android) test automation

Python + adb scripts that drive the Progbiz ERP Android app (`io.progbiz.erp`) on the local emulators and write
HTML reports with screenshots. No Appium or extra packages needed. The Playwright web tests are in the repo root.

| Start here | |
|---|---|
| [automation/SETUP.md](automation/SETUP.md) | requirements, install, first run, troubleshooting |
| [automation/README.md](automation/README.md) | what each suite checks, safety rules, files |
| `bin/emu` | emulator switcher: `emu start 13`, `emu install app.apk`, `emu all 13 <tenant>` |

One command runs everything (release-note checks, CRM flow, old-bug re-check, every screen) and writes one
combined report: `emu all 13 ncore_test`.

Test tenants only — the data-creating suites refuse any company code not listed in `TEST_TENANTS`.
Passwords are never typed by the scripts and are never stored here.
