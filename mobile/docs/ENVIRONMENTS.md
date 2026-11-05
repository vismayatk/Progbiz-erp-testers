# Environments, tenants and accounts

Where the mobile tests run, which tenant to use for what, and how to log in on the emulator.

> **Passwords are not stored in this repository** (it is public). Ask the QA lead for them. The mobile scripts never type a
> password: on the login screen they fill in the company code and username, then wait for the tester to type the password.

## Server

| | |
|---|---|
| Test web app | `https://test.erp.progbiz.in` (Blazor WASM). Safe test host — all tenants below live on it |
| Mobile app | `io.progbiz.erp` (Flutter, Android). It only asks for a **company code**, username and password and finds the server itself |
| Other web hosts used by the Playwright suite | `https://erptest.progbiz.in` (tenant `lesol_test`), `https://devtest.progbiz.in` (tenant `Lesol_dev`) — see the repo root README |
| Latest app build tested | **v2.0.61** (build 2142). The app prompts "Update Available — 2.0.63"; the scripts answer **Maybe Later** |

## Tenants

| Company code | Username | Shows as | Phones | Use it for | Notes |
|---|---|---|---|---|---|
| `ncore_test` | `admin` | **Nihal** · Owner · "Ncore Builders" | +91 | release-note checks, CRM flow, regression, every-screen run | Interior/construction tenant. Menus: CRM, Task Management, Complaints, **Construction Projects**, **Projects**, Customers, WhatsApp Chat, Team Chat, **Accounts** (cheques). Only item is "Test item". Follow-up statuses: Contacted, Follow-up Pending, … **Do not change Tenant Settings.** |
| `onetouch_test` | `admin` | **Super Admin** | +971 | CRM flow, regression, every-screen run | Items start with "Bio…". Follow-up status "Call not answering" exists. Another QA automation may write to this tenant at the same time |
| `lesol_test` | `admin` | Super Admin | — | CRM flow, every-screen run | Tenant with the most sample data |

Rules that apply to every tenant:

- Data-creating suites (`erp_scenarios.py`, U8 in `erp_release.py`) refuse any company code that is not in `TEST_TENANTS`
  (`erp_scenarios.py`). `run_all.py` also checks the **Profile company name** before it creates anything
  (`TENANT_COMPANY` in `run_all.py`: `ncore_test` → "Ncore Builders").
- Test data is always named `QA_MOB_<timestamp>` (follow-up text `QA_followup_<timestamp>`, place `QA_Place`).
  The scripts **never delete** it — clean it up by hand (the scripts block Delete on purpose).
- The user must not be checked in or out by the tests. If the app shows the Check-In screen, the scripts tap
  **Continue Without Check-in**.

## Logging in on the emulator

1. `emu start 13` (or let `emu all 13 <tenant>` start it) — a phone window opens.
2. The app opens on the login screen. (Right after a fresh install a location-permission prompt can appear — choose
   **Don't allow**, and on the "Update Available" prompt choose **Maybe Later**.)
3. `run_all.py` fills **Company Code** and **Username** for you and prints:
   `Login screen: company code '…' and username '…' are filled in. Type the password on the emulator…`
4. **Type the password yourself in the emulator window and tap Log in.** The script waits up to 10 minutes.
5. When Home shows "Hello <name>" the script checks Profile → company name, then starts the suites.

To switch tenant on the same emulator: clear the app data (`adb shell pm clear io.progbiz.erp`) — that logs out — then log in
to the other company. Check `adb shell dumpsys package io.progbiz.erp | grep versionName` after any emulator restart:
after a crash the emulator can come back with an older app version.

## Where the results go

`$QA_DIR/reports/` (git-ignored): one folder per suite run plus `erp-all_<tenant>_<time>/index.html`, the combined report with
a screenshot for every check. See [TEST-FLOW.md](TEST-FLOW.md).
