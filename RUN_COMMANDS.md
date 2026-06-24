# Run Commands — Progbiz ERP Test Suite

> Always run from the project root: `cd C:\Users\PROBOOK\erp-tests` (NOT `git_max`).
> Environment + credentials live in **`.env`** (the only place to change them).

## 0. One-time setup (fresh machine)
```powershell
npm install
npx playwright install chromium
# create .env from template, then edit:
copy .env.example .env
```

## 1. Run ALL tests
```powershell
npm test                      # all tests, headless (regenerates TEST_CASES.md first)
npm run test:headed           # all tests, visible browser
npm run chrome                # all tests in ONE real Chrome window (single worker)
```

## 2. Run a SINGLE test / module  (-g matches the title)
```powershell
npx playwright test -g "TC-01 \|"                 # Login
npx playwright test -g "valid data"               # Create enquiry (new customer)
npx playwright test -g "TC-02B \|"                # Create enquiry (existing customer)
npx playwright test -g "TC-04 \|"                 # Add follow-up
npx playwright test -g "TC-06 \|"                 # Convert to quotation
npx playwright test -g "Update enquiry status"    # Won / Lost / In-Follow-Up (TC-08/09/10)
npx playwright test -g "TC-11 \|"                 # Leads listing
npx playwright test -g "Lead Transfer"            # TC-12
npx playwright test -g "TC-13 \|"                 # Lead Sources (Settings)
npx playwright test -g "TC-14 \|"                 # Lead Status (Settings)
npx playwright test -g "TC-15 \|"                 # Item Categories
npx playwright test -g "TC-16 \|"                 # Items (Product)
```

## 3. Task Management module
```powershell
npx playwright test tests/task_management.spec.js   # all 3
npx playwright test -g "TM-01 \|"                    # My Tasks loads
npx playwright test -g "TM-02 \|"                    # Create a task
npx playwright test -g "TM-03 \|"                    # All task pages reachable
```

## 4. Visible browser / real Chrome  (watch it run)
```powershell
npx playwright test --headed -g "TC-12 \|"                          # visible (bundled Chromium)
npm run chrome -- -g "TC-12 \|"                                     # single real Chrome window
$env:HEADED=1; npx playwright test -g "TC-12 \|"                    # visible + slow-mo
$env:CHANNEL="chrome"; $env:HEADED=1; npx playwright test           # real Chrome, all tests
Remove-Item Env:HEADED,Env:CHANNEL -ErrorAction SilentlyContinue   # reset after
```

## 5. Interactive / reports
```powershell
npx playwright test --ui          # interactive runner (pick/watch/debug)
npm run report                    # open last HTML report (http://localhost:9323)
npx playwright test --list        # list all tests without running
```

## 6. Standalone scripts (plain Node, no test runner)
```powershell
node verify_create_enquiry.js     # create one enquiry end-to-end (verbose)
node verify_lead_transfer.js      # transfer a lead + verify assignee change
node verify_dashboard.js          # dashboard sum-integrity across filter combos
node backend_error_scenario.js    # probe intermittent backend errors
$env:ITER=20; node backend_error_scenario.js
node crm_full_audit.js            # re-audit all CRM pages -> crm_audit.json + screenshots
```

## 7. Docs & Excel
```powershell
npm run docs                      # regenerate TEST_CASES.md from test titles
python gen_excel.py               # rebuild CRM_Test_Cases.xlsx (621 cases)
python update_status.py           # write automation Pass/Fail into the Excel Status column
```

## 8. Switch environment (edit .env)
```
# Dev:   BASE_URL=https://devtest.progbiz.in   COMPANY_CODE=Lesol_dev
# Test:  BASE_URL=https://erptest.progbiz.in   COMPANY_CODE=lesol_test
# (CRM_USERNAME=admin  PASSWORD=123)
```

## Notes
- `-g` is a regex on the test title; `"TC-02 \|"` matches TC-02 only (not TC-02B).
- Tests create real data and clean up after themselves (unique names per run).
- If a run fails on a login timeout or "Error Code …", it's the backend being slow/unstable — retry.
- See **TEST_CASES.md** for the always-current list of every test ID + command.
