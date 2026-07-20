# HRMS Module — Automation Study & Data

Study of the **HRMS ERP** (https://hrms-erp.progbiz.in, tenant `Hrms`) done as preparation for
Playwright automation code. Every one of the module's **80 pages** was crawled live and captured.

## Start here

| Doc | What it covers |
|---|---|
| [docs/HRMS_Module_Study.docx](docs/HRMS_Module_Study.docx) | **Deliverable Word document** — all 6 docs consolidated, flowcharts as images, TOC (50 pp). PDF twin beside it. |
| [docs/00_HRMS_OVERVIEW_AND_FLOWCHART.md](docs/00_HRMS_OVERVIEW_AND_FLOWCHART.md) | Module map, menu tree, mermaid flowcharts, ESS↔admin connections, automation notes |
| [docs/01_CORE_HR.md](docs/01_CORE_HR.md) | Core HR deep dive (18 pages) |
| [docs/02_RECRUITMENT.md](docs/02_RECRUITMENT.md) | Recruitment & Onboarding deep dive (15 pages) |
| [docs/03_ATTENDANCE.md](docs/03_ATTENDANCE.md) | Attendance & Time deep dive (15 pages) |
| [docs/04_LEAVE_MANAGEMENT.md](docs/04_LEAVE_MANAGEMENT.md) | Leave Management deep dive (21 pages) |
| [docs/05_ESS_MY_WORKSPACE.md](docs/05_ESS_MY_WORKSPACE.md) | My Workspace / ESS deep dive (11 pages) |

## Folder contents

```
hrms/
├── README.md                  ← you are here
├── docs/                      ← module documentation + flowcharts (mermaid)
├── data/
│   ├── nav.json               ← full navigation capture (anchors, sidebar tree, app shell)
│   ├── pages/*.json           ← 80 per-page captures: buttons, tabs, table columns, inputs, links
│   ├── summary.json           ← merged per-group data
│   └── summary.txt            ← human-readable merge
├── screenshots/
│   ├── 00_login.png, 01_landing.png, 02_menu_expanded.png
│   └── <group>/<route>.png    ← one screenshot per page (core-hr / recruitment / attendance / leave / ess)
├── exploration/               ← re-runnable crawl scripts
│   ├── 01_login_and_nav.js    ← login + capture nav structure
│   ├── 02_crawl_pages.js      ← crawl a group: node 02_crawl_pages.js <core-hr|recruitment|attendance|leave|ess>
│   ├── 03_summarize.js        ← merge page JSONs into summary
│   └── 04_recapture_ess.js    ← re-capture lazy-loading ESS pages (longer settle)
└── pages/
    └── HrmsLoginPage.js       ← Playwright POM login for the HRMS tenant (env-driven creds)
```

## Re-running the crawl

```bash
node hrms/exploration/01_login_and_nav.js        # nav + login check
node hrms/exploration/02_crawl_pages.js core-hr  # per group (5 groups)
node hrms/exploration/03_summarize.js            # rebuild summary
```

Credentials are read from env in test code (`HRMS_BASE_URL`, `HRMS_COMPANY_CODE`, `HRMS_USERNAME`, `HRMS_PASSWORD`);
the exploration scripts currently use the shared test-tenant login.

## Next step (not yet done)

Test-case authoring + spec skeletons per sub-module, reusing `pages/HrmsLoginPage.js` and following
the `erp/<module>/{pages,tests}` POM convention of this repo.
