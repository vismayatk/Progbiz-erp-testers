'use strict';
/**
 * Runs 04_leads_followups_scout.js against the local mock (127.0.0.1) and checks that
 *  - the script finishes, - it sent no write request, - it found the demo rows, - the history is unchanged.
 * Output goes to the directory given as argv[2] (default: a temp folder), never to reports/video/scout.
 * Usage: node scripts/video/scout/selftest/run_selftest.js [outDir]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mock = require('./mock_server');

(async () => {
  const outDir = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'scout2-selftest-'));
  fs.mkdirSync(outDir, { recursive: true });
  const state = path.join(outDir, 'empty_state.json');
  fs.writeFileSync(state, JSON.stringify({ cookies: [], origins: [] }));
  const { server, calls, url } = await mock.start(0);
  const child = spawn(process.execPath, [path.join(__dirname, '..', '04_leads_followups_scout.js'), '--pace=150'], {
    cwd: path.join(__dirname, '..', '..', '..', '..'), stdio: 'inherit',
    env: Object.assign({}, process.env, { SCOUT_BASE_URL: url, SCOUT_OUT: outDir, SCOUT_STATE: state }),
  });
  const code = await new Promise((r) => child.on('exit', r));
  server.close();
  const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8')); } catch (_) { return null; } };
  const run = rd('scout2.run.json'); const leads = rd('leads.run.json'); const enq = rd('enquiry-overview.run.json'); const fu = rd('followups.run.json');
  const checks = {
    exitCode0: code === 0,
    noBlockers: !!run && run.blockers.length === 0,
    mockSawNoWrite: calls.filter((c) => c.write).length === 0,
    scriptBlockedNothing: !!run && run.network.blockedAsPossibleWrite === 0,
    readsWereNotBlocked: calls.filter((c) => /get-paged/.test(c.path)).length > 0,
    leadsDefaultTab: !!leads && leads.defaultTab === 'tab-lead-new',
    leadsDemoRowFoundInFollowUp: !!leads && !!leads.search && leads.search.demoRows.length === 1 && leads.search.demoRows[0].tab === 'tab-lead-infollowup',
    leadOpened: !!leads && !!leads.open && leads.open.resultUrl === '/enquiry-overview/534528',
    overviewMenuClosed: !!enq && !!enq.actionsMenu && enq.actionsMenu.closed && enq.actionsMenu.menu.items.length === 4,
    modalClosed: !!enq && !!enq.followupModal && enq.followupModal.stillOpen === false,
    historyUnchanged: !!enq && enq.historyUnchanged === true,
    overviewScrolled: !!enq && enq.screenshots.filter((s) => /^06_enquiry-overview_s\d+\.png$/.test(s.file)).length >= 2,
    followupsDemoRowUpcoming: !!fu && !!fu.demoRow && fu.demoRow.tab === 'tab-followup-upcoming',
    followupsModalClosed: !!fu && !!fu.openFollowupModal && fu.openFollowupModal.stillOpen === false,
    followupsOverviewOpened: !!fu && !!fu.openOverview && fu.openOverview.navigated === true,
  };
  console.log('\nSELFTEST against the local mock (not the product):');
  for (const [k, v] of Object.entries(checks)) console.log((v ? '  ok   ' : '  FAIL ') + k);
  console.log('  mock non-GET calls: ' + JSON.stringify(calls.reduce((a, c) => { a[c.path] = (a[c.path] || 0) + 1; return a; }, {})));
  console.log('  output: ' + outDir);
  process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
})();
