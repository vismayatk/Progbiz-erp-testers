'use strict';

/**
 * Company-standard names for the test data the automation creates.
 *
 *  • PEOPLE get realistic names (letters only — HRMS name fields reject digits), e.g.
 *    "Ananya Menon". Tests tell people apart by e-mail or employee code, never by name.
 *  • RECORDS get a realistic business name plus a readable run tag, e.g.
 *      "Technical Round 1 (Auto 08-Oct 13.12.45)"
 *    The tag lets each test find exactly the record it created, and lets the team see at a
 *    glance which records came from automation (and clean them up).
 *  • CODES / e-mails / usernames carry the compact run id (DDMMHHMMSS), e.g. "0810131245".
 *  • LETTERS-ONLY record names (leave type / pattern) can't carry the tag, so they use a
 *    realistic name + a place name — see `lettersOnlyCandidates()`.
 *
 * The tag is fixed for the whole test process, so every record from one run shares it.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');
const START = new Date();

/**
 * Readable run tag, e.g. "Auto 08-Oct 13.12.45". Dots, not colons, in the time: some HRMS
 * name fields (e.g. Letter Template name) only allow letters, numbers, spaces and
 * - _ / & . , ( ) ' [ ] — a colon is rejected.
 */
const RUN_TAG = `Auto ${pad(START.getDate())}-${MON[START.getMonth()]} ${pad(START.getHours())}.${pad(START.getMinutes())}.${pad(START.getSeconds())}`;
/** Compact run id for codes / e-mails / usernames, e.g. "0810131245" (DDMMHHMMSS). */
const RUN_ID = `${pad(START.getDate())}${pad(START.getMonth() + 1)}${pad(START.getHours())}${pad(START.getMinutes())}${pad(START.getSeconds())}`;

/** "<base> (Auto 08-Oct 13.12.45)" */
const tagged = base => `${base} (${RUN_TAG})`;

const FIRST = {
  female: ['Ananya', 'Diya', 'Kavya', 'Sneha', 'Aditi', 'Nandana', 'Gayathri', 'Lakshmi', 'Anjali', 'Riya',
    'Sruthi', 'Divya', 'Aparna', 'Keerthi', 'Neha', 'Pooja', 'Shruti', 'Tara', 'Nithya', 'Revathi'],
  male: ['Rohan', 'Arjun', 'Vishnu', 'Abhinav', 'Nikhil', 'Sanjay', 'Aditya', 'Varun', 'Gokul', 'Akhil',
    'Jithin', 'Manu', 'Siddharth', 'Harish', 'Vivek', 'Anand', 'Pranav', 'Kiran', 'Deepak', 'Ajay'],
};
const LAST = ['Menon', 'Nair', 'Pillai', 'Varghese', 'Kurian', 'Thomas', 'Joseph', 'Iyer', 'Krishnan', 'Mathew',
  'Rajan', 'Das', 'Shenoy', 'Kamath', 'Pai', 'Warrier', 'George', 'Philip', 'Chandran', 'Raghavan',
  'Bhat', 'Reddy', 'Rao', 'Mehta', 'Kapoor', 'Joshi', 'Iyengar', 'Panicker', 'Kaimal', 'Unnikrishnan'];

/** Kerala / Indian place names — the distinguishing word for letters-only record names. */
const PLACES = ['Kochi', 'Kannur', 'Kozhikode', 'Thrissur', 'Kollam', 'Alappuzha', 'Palakkad', 'Kottayam',
  'Malappuram', 'Kasaragod', 'Idukki', 'Wayanad', 'Pathanamthitta', 'Ernakulam', 'Munnar', 'Varkala',
  'Guruvayur', 'Thalassery', 'Ponnani', 'Changanassery', 'Chennai', 'Bengaluru', 'Mysuru', 'Mangaluru',
  'Coimbatore', 'Madurai', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi', 'Jaipur', 'Kolkata', 'Bhopal', 'Indore',
  'Nagpur', 'Surat', 'Vadodara', 'Lucknow', 'Patna', 'Ranchi'];

let peopleIssued = 0;

/**
 * A realistic person for this run. Each call returns a different person.
 * @param {{gender?: 'female'|'male'}} opts
 * @returns {{first: string, last: string, full: string, gender: 'Female'|'Male', email: string, username: string, handle: string}}
 */
function person({ gender } = {}) {
  const n = peopleIssued++;
  const seed = Number(RUN_ID.slice(-6)) + n * 7919;          // spread picks across the pools
  const g = gender || (seed % 2 ? 'female' : 'male');
  const firsts = FIRST[g];
  const first = firsts[seed % firsts.length];
  const last = LAST[Math.floor(seed / firsts.length) % LAST.length];
  const handle = `${first}.${last}`.toLowerCase();
  return {
    first, last, full: `${first} ${last}`,
    gender: g === 'female' ? 'Female' : 'Male',
    handle,
    email: `${handle}.${RUN_ID}${n}@example.com`,                  // reserved test domain — never delivered
    username: `${first}${last}${RUN_ID}${n}`.toLowerCase(),
  };
}

/**
 * Candidate names for a letters-only, must-be-unique record (e.g. a leave type), in a stable
 * order starting from this run: "<base> Kochi", "<base> Kannur", … Pick the first one that is
 * not already on the list page.
 */
function lettersOnlyCandidates(base) {
  const start = Number(RUN_ID.slice(-4)) % PLACES.length;
  return PLACES.map((_, i) => `${base} ${PLACES[(start + i) % PLACES.length]}`);
}

/** First candidate name that does not appear in `existingText`. */
function firstUnused(candidates, existingText) {
  return candidates.find(c => !existingText.includes(c)) || candidates[0];
}

module.exports = { RUN_TAG, RUN_ID, tagged, person, lettersOnlyCandidates, firstUnused };
