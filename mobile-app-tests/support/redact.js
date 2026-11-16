'use strict';

/**
 * Keeps credentials and personal data out of evidence and reports.
 *  scrub()      strips ANSI colours and replaces known secret values (password from .env)
 *  redactUrl()  masks token/auth/key/password-like query parameters
 *  redactPII()  scrub() + masks e-mail addresses and Indian mobile numbers (DOM / UI dumps)
 * Screenshots cannot be redacted — the report says so.
 */
const ANSI = /\[[0-9;]*[A-Za-z]/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MOBILE_IN = /\b(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;

function secrets() {
  // Values shorter than 6 chars can't be replaced safely (they'd mangle ordinary numbers/words);
  // for those we rely on never logging them (login tests run with trace off).
  return ['HRMS_PASSWORD', 'PASSWORD'].map(k => process.env[k]).filter(v => v && v.length >= 6);
}

function scrub(text) {
  let out = String(text == null ? '' : text).replace(ANSI, '');
  for (const s of secrets()) out = out.split(s).join('••••••');
  return out;
}

function redactUrl(u) {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (/token|auth|key|pass|secret|session|sig|otp/i.test(k)) url.searchParams.set(k, 'REDACTED');
    }
    return scrub(url.toString());
  } catch {
    return scrub(u);
  }
}

function redactPII(text) {
  return scrub(text).replace(EMAIL, '[email]').replace(MOBILE_IN, m => m.replace(/\d/g, '#'));
}

module.exports = { scrub, redactUrl, redactPII };
