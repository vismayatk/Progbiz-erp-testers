'use strict';

/** Shared path scheme for fixtures (which write evidence) and the reporter (which links it). */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUTH_STATE = path.join(ROOT, '.auth', 'state.json');

function runId() { return process.env.MOBILE_RUN_ID || 'adhoc'; }

function artifactsDir() { return path.join(ROOT, 'artifacts', runId()); }

/** "SMK-03 Invalid password is rejected" → "SMK-03"; "REG-LOGIN-02 …" → "REG-LOGIN-02". */
function testIdOf(title) {
  const m = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,3})\b/.exec(title);
  return m ? m[1] : title.replace(/[^\w-]+/g, '_').slice(0, 60);
}

/** artifacts/<run>/<project>/<test-id>/attempt-<n> */
function attemptDir(project, title, retry) {
  return path.join(artifactsDir(), project, testIdOf(title), `attempt-${retry + 1}`);
}

module.exports = { ROOT, AUTH_STATE, runId, artifactsDir, testIdOf, attemptDir };
