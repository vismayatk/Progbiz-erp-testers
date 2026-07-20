'use strict';

/**
 * Recruitment & Onboarding — interaction suite (15 pages, POM-driven).
 *
 * PRIMARY interactions only, STRICTLY non-destructive:
 *   - open a create-form/modal → assert it (and its named fields, where the
 *     crawl captured them) → dismiss WITHOUT saving
 *   - apply a filter / search and assert the grid re-renders (rowCount >= 0,
 *     grid still attached, no /login bounce, no crash)
 *   - switch tabs / status buckets and assert the active state
 *   - assert documented empty-states where captures showed them (tolerant of
 *     data having been seeded since the crawl)
 *
 * Every test navigates independently via its POM (no shared state).
 * No Save / Submit / Delete / Approve / Reject / Start is ever confirmed.
 */
const { test, expect } = require('@playwright/test');

const { RequisitionListPage }       = require('../../pages/recruitment/RequisitionListPage');
const { VacancyListPage }           = require('../../pages/recruitment/VacancyListPage');
const { CurrentOpeningsPage }       = require('../../pages/recruitment/CurrentOpeningsPage');
const { JobApplicationsListPage }   = require('../../pages/recruitment/JobApplicationsListPage');
const { CandidatesPage }            = require('../../pages/recruitment/CandidatesPage');
const { AssessmentListPage }        = require('../../pages/recruitment/AssessmentListPage');
const { InterviewSchedulesPage }    = require('../../pages/recruitment/InterviewSchedulesPage');
const { OfferListPage }             = require('../../pages/recruitment/OfferListPage');
const { RecruitmentPipelinePage }   = require('../../pages/recruitment/RecruitmentPipelinePage');
const { CommunicationTemplatesPage }= require('../../pages/recruitment/CommunicationTemplatesPage');
const { TalentPoolPage }            = require('../../pages/recruitment/TalentPoolPage');
const { CandidateStatusPage }       = require('../../pages/recruitment/CandidateStatusPage');
const { InterviewRoundsPage }       = require('../../pages/recruitment/InterviewRoundsPage');
const { OnboardingTemplatesPage }   = require('../../pages/recruitment/OnboardingTemplatesPage');
const { OnboardingPipelinePage }    = require('../../pages/recruitment/OnboardingPipelinePage');

// ── /requisition-list ────────────────────────────────────────────────────────

test.describe('recruitment: /requisition-list (Job Requisitions)', () => {
  test('create-requisition form opens and dismisses without saving', async ({ page }) => {
    const po = new RequisitionListPage(page);
    await po.goto();
    await po.openCreateForm();
    expect(await po.createFormVisible(), 'New Requisition should open a form').toBeTruthy();
    await po.closeCreateForm();
    await expect(po.newRequisitionBtn).toBeVisible();   // back on the list view
  });

  test('status filter and designation search re-render the grid', async ({ page }) => {
    const po = new RequisitionListPage(page);
    await po.goto();
    await po.filterByStatus('Draft');
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);

    await po.searchDesignation('zz-no-such-designation');
    await expect(po.grid).toBeVisible();                // empty result must not crash
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /vacancy-list ────────────────────────────────────────────────────────────

test.describe('recruitment: /vacancy-list (Hiring)', () => {
  test('tab strip switches between hiring views', async ({ page }) => {
    const po = new VacancyListPage(page);
    await po.goto();
    for (const name of ['Candidates', 'Talent Pools', 'Job Openings']) {
      await po.switchTab(name);
      await expect(po.tab(name), `tab "${name}" should stay visible after switch`).toBeVisible();
      expect(await po.isTabActive(name), `tab "${name}" should be active`).toBeTruthy();
    }
  });

  test('Add Job Opening form opens and dismisses without saving', async ({ page }) => {
    const po = new VacancyListPage(page);
    await po.goto();
    await po.openCreateForm();
    expect(await po.createFormVisible(), 'Add Job Opening should open a form').toBeTruthy();
    await po.closeCreateForm();
    await expect(po.addJobOpeningBtn).toBeVisible();
  });

  test('status filter re-renders the openings grid; publish counters visible', async ({ page }) => {
    const po = new VacancyListPage(page);
    await po.goto();
    await expect(po.publishSummary, '"N published · N total" counter').toBeVisible();
    await po.filterByStatus('Open');
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /current-openings (public careers) ───────────────────────────────────────

test.describe('recruitment: /current-openings (Join Our Team)', () => {
  test('public picker renders with its "Choose" placeholder', async ({ page }) => {
    const po = new CurrentOpeningsPage(page);
    await po.goto();
    await expect(po.heading).toBeVisible();
    await expect(po.openingSelect).toBeVisible();
    const options = await po.openingOptions();
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options[0].trim(), 'first option is the "Choose" placeholder').toMatch(/^choose$/i);
    // No published opening is a valid state — only note whether the list is populated.
    test.info().annotations.push({ type: 'openings', description: String(await po.hasOpenings()) });
  });
});

// ── /job-applications-list ───────────────────────────────────────────────────

test.describe('recruitment: /job-applications-list (Job Applications)', () => {
  test('applicant grid renders its per-row action columns (empty state ok)', async ({ page }) => {
    const po = new JobApplicationsListPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Position Applied For', 'Details', 'Schedule Interview', 'Reject']) {
      expect(headers.map(h => h.toLowerCase()), `column "${col}"`).toContain(col.toLowerCase());
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);   // captured empty — 0 rows is the baseline
  });
});

// ── /candidates ──────────────────────────────────────────────────────────────

test.describe('recruitment: /candidates (Candidates)', () => {
  test('Add New form exposes Candidate Name + Phone Number, then dismisses', async ({ page }) => {
    const po = new CandidatesPage(page);
    await po.goto();
    await po.openAddForm();
    await expect(po.candidateNameInput, 'Candidate Name field').toBeVisible();
    await expect(po.phoneNumberInput,   'Phone Number field').toBeVisible();
    await po.closeAddForm();
    await expect(po.addNewBtn).toBeVisible();
  });

  test('status buckets switch and keep their live counts', async ({ page }) => {
    const po = new CandidatesPage(page);
    await po.goto();
    for (const name of ['In Progress', 'Shortlisted', 'Selected', 'Rejected', 'New']) {
      await po.selectBucket(name);
      const label = (await po.bucket(name).innerText()).trim();
      expect(label, `bucket "${name}" keeps its "<name> <count>" label`)
        .toMatch(new RegExp(`^${name}\\s*\\d+$`, 'i'));
      expect(await po.bucketCount(name)).toBeGreaterThanOrEqual(0);
    }
  });

  test('name/phone search re-renders the register without crashing', async ({ page }) => {
    const po = new CandidatesPage(page);
    await po.goto();
    await po.search('zz-no-such-candidate');
    await expect(po.grid).toBeVisible();
    // NOTE: grid may render a single EMPTY placeholder row — count is not data.
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /assessment-list ─────────────────────────────────────────────────────────

test.describe('recruitment: /assessment-list (Assessments)', () => {
  test('library grid loads past its async "Loading..." row', async ({ page }) => {
    const po = new AssessmentListPage(page);
    await po.goto();
    await po.waitLoaded();
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('New Assessment form opens and dismisses without saving', async ({ page }) => {
    const po = new AssessmentListPage(page);
    await po.goto();
    await po.waitLoaded();
    await po.openCreateForm();
    expect(await po.createFormVisible(), 'New Assessment should open a form').toBeTruthy();
    await po.closeCreateForm();
    await expect(po.newAssessmentBtn).toBeVisible();
  });
});

// ── /interview-schedules ─────────────────────────────────────────────────────

test.describe('recruitment: /interview-schedules (Interviews)', () => {
  test('schedule grid renders (0 rows is the documented baseline)', async ({ page }) => {
    const po = new InterviewSchedulesPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('Schedule Interview form opens and dismisses without saving', async ({ page }) => {
    const po = new InterviewSchedulesPage(page);
    await po.goto();
    await po.openScheduleForm();
    expect(await po.scheduleFormVisible(), 'Schedule Interview should open a form').toBeTruthy();
    await po.closeScheduleForm();
    await expect(po.scheduleInterviewBtn).toBeVisible();
  });
});

// ── /offer-list ──────────────────────────────────────────────────────────────

test.describe('recruitment: /offer-list (Offers)', () => {
  test('offers grid renders (0 rows is the documented baseline)', async ({ page }) => {
    const po = new OfferListPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('New Offer form opens and dismisses without saving', async ({ page }) => {
    const po = new OfferListPage(page);
    await po.goto();
    await po.openCreateForm();
    expect(await po.createFormVisible(), 'New Offer should open a form').toBeTruthy();
    await po.closeCreateForm();
    await expect(po.newOfferBtn).toBeVisible();
  });
});

// ── /recruitment-pipeline ────────────────────────────────────────────────────

test.describe('recruitment: /recruitment-pipeline (Kanban)', () => {
  test('vacancy picker is the mandatory filter; "All vacancies" renders the board area', async ({ page }) => {
    const po = new RecruitmentPipelinePage(page);
    await po.goto();
    const options = await po.vacancyOptions();
    expect(options.join(' | ')).toMatch(/select a vacancy/i);
    expect(options.join(' | ')).toMatch(/all vacancies/i);

    await po.selectVacancy('All vacancies');            // read-only view change
    expect(page.url()).not.toContain('/login');
    expect(await po.containsText('Recruitment Pipeline')).toBeTruthy();
    // Auto-Sync is read, never toggled (it persists configuration).
    expect(typeof await po.isAutoSyncChecked()).toBe('boolean');
  });

  test('Configure Stages opens the stage editor and is dismissed unsaved', async ({ page }) => {
    const po = new RecruitmentPipelinePage(page);
    await po.goto();
    await po.openStageConfig();
    expect(await po.stageConfigVisible(), 'Configure Stages should open the stage editor').toBeTruthy();
    await po.closeStageConfig();                        // dismissed WITHOUT saving stages
    await expect(po.configureStagesBtn).toBeVisible();  // back on the board baseline
  });
});

// ── /communication-templates ─────────────────────────────────────────────────

test.describe('recruitment: /communication-templates (Candidate Communication)', () => {
  test('template grid loads past its async "Loading..." row', async ({ page }) => {
    const po = new CommunicationTemplatesPage(page);
    await po.goto();
    await po.waitLoaded();
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('New Template form opens and dismisses without saving', async ({ page }) => {
    const po = new CommunicationTemplatesPage(page);
    await po.goto();
    await po.waitLoaded();
    await po.openCreateForm();
    expect(await po.createFormVisible(), 'New Template should open a form').toBeTruthy();
    await po.closeCreateForm();
    await expect(po.newTemplateBtn).toBeVisible();
  });
});

// ── /talent-pool ─────────────────────────────────────────────────────────────

test.describe('recruitment: /talent-pool (Talent Pool & Archive)', () => {
  test('button-driven search re-renders the pool grid', async ({ page }) => {
    const po = new TalentPoolPage(page);
    await po.goto();
    await po.waitLoaded();
    await po.search({ query: 'zz-no-such-person', pool: 'All' });
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('pool filter switches between Archived / Active / All views', async ({ page }) => {
    const po = new TalentPoolPage(page);
    await po.goto();
    await po.waitLoaded();
    for (const pool of ['Active', 'All', 'Archived (talent pool)']) {
      await po.setPool(pool);
      await expect(po.grid, `grid intact after Pool="${pool}"`).toBeVisible();
      expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── /candidate-status (Settings master) ──────────────────────────────────────

test.describe('recruitment: /candidate-status (Candidate Followup Status)', () => {
  test('status master grid loads (note "Sl No" header spelling)', async ({ page }) => {
    const po = new CandidateStatusPage(page);
    await po.goto();
    await po.waitLoaded();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    expect(headers.map(h => h.toLowerCase())).toContain('sl no');   // page-specific spelling
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('Add Followup Status modal opens and dismisses without saving', async ({ page }) => {
    const po = new CandidateStatusPage(page);
    await po.goto();
    await po.waitLoaded();
    await po.openCreateForm();
    expect(await po.createFormVisible(), 'Add Followup Status should open a form').toBeTruthy();
    await po.closeCreateForm();                          // shared master data — never mutated
    await expect(po.addFollowupStatusBtn).toBeVisible();
  });
});

// ── /interview-rounds (Settings master) ──────────────────────────────────────

test.describe('recruitment: /interview-rounds (Interview Rounds)', () => {
  test('rounds master grid loads (note "Sl No" header spelling)', async ({ page }) => {
    const po = new InterviewRoundsPage(page);
    await po.goto();
    await po.waitLoaded();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    expect(headers.map(h => h.toLowerCase())).toContain('round name');
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });

  test('Add Round modal opens and dismisses without saving', async ({ page }) => {
    const po = new InterviewRoundsPage(page);
    await po.goto();
    await po.waitLoaded();
    await po.openCreateForm();
    expect(await po.createFormVisible(), 'Add Round should open a form').toBeTruthy();
    await po.closeCreateForm();                          // shared master data — never mutated
    await expect(po.addRoundBtn).toBeVisible();
  });
});

// ── /onboarding-templates ────────────────────────────────────────────────────

test.describe('recruitment: /onboarding-templates (Onboarding Templates)', () => {
  test('master/detail panel shows its documented empty states (when no templates)', async ({ page }) => {
    const po = new OnboardingTemplatesPage(page);
    await po.goto();
    if (await po.isEmpty()) {
      await expect(po.emptyListText,   '"No templates yet."').toBeVisible();
      await expect(po.emptyDetailText, '"Select a template or create a new one."').toBeVisible();
    } else {
      // Data exists since the crawl — the panel itself must still render.
      expect(await po.containsText('Templates')).toBeTruthy();
    }
  });

  test('New Template editor opens and is discarded unsaved', async ({ page }) => {
    const po = new OnboardingTemplatesPage(page);
    await po.goto();
    await po.openCreateEditor();
    expect(await po.createEditorVisible(), 'New Template should open an editor').toBeTruthy();
    await po.closeCreateEditor();                        // discard — nothing was saved
    await expect(po.newTemplateBtn).toBeVisible();
  });
});

// ── /onboarding-pipeline ─────────────────────────────────────────────────────

test.describe('recruitment: /onboarding-pipeline (Onboarding Pipeline)', () => {
  test('documented empty state "No active onboardings." (when none running)', async ({ page }) => {
    const po = new OnboardingPipelinePage(page);
    await po.goto();
    if (await po.hasActiveOnboardings()) {
      // Onboardings exist since the crawl — page identity must still render.
      expect(await po.containsText('Onboarding Pipeline')).toBeTruthy();
    } else {
      await expect(po.emptyState).toBeVisible();
    }
  });

  test('Start Onboarding wizard opens and is dismissed WITHOUT starting', async ({ page }) => {
    const po = new OnboardingPipelinePage(page);
    await po.goto();
    await po.openStartWizard();
    expect(await po.startWizardVisible(), 'Start Onboarding should open a wizard').toBeTruthy();
    await po.closeStartWizard();                         // never confirms Start
    await expect(po.startOnboardingBtn).toBeVisible();
  });
});
