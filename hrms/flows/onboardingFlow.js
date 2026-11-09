'use strict';

/**
 * Onboarding flow helpers. Onboarding execution (Start Onboarding, Start/Manage Probation) acts on
 * an EMPLOYEE, so the module drives a DEDICATED throwaway employee created fresh for the run — never
 * a shared/real record. Reuses the generic throwaway-employee creator.
 */
const { createExitEmployee } = require('./resignationFlow');

/** Create a fresh throwaway employee to onboard / put on probation. Returns {code, display, first, …}. */
async function createOnboardingEmployee(page, overrides = {}) {
  return createExitEmployee(page, overrides);
}

module.exports = { createOnboardingEmployee };
