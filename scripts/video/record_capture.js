'use strict';
/**
 * PHASE 2 — the actual RECORDED footage for the CRM product-demo video.
 * Mostly navigation and viewing (per the brief: "smooth cursor movement,
 * deliberate clicks... avoid rapid cursor movement"), following the brief's
 * shot list A–G against the real "Demo Customer" record from Phase 1.
 *
 * Uses Playwright's native video recording (no ffmpeg needed to CAPTURE —
 * only needed later to EDIT/composite). Output is one .webm per shot section
 * so each can be trimmed/arranged independently during editing.
 *
 * Run:  node scripts/video/record_capture.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const path = require('path');
const { LoginPage } = require('../../erp/common/LoginPage');

const C = {
  company: process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD || '123',
};
const BASE = process.env.BASE_URL;
const OUT_DIR = path.join(__dirname, '..', '..', 'reports', 'video', 'raw');
const DEMO_NAME = 'Demo Customer';
const VIEWPORT = { width: 1920, height: 1080 };

const pause = (page, ms) => page.waitForTimeout(ms);

/** Smoothly move the mouse toward a locator instead of teleporting the
 *  cursor — the brief explicitly wants deliberate, non-jumpy movement. */
async function smoothHover(page, locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 25 });
}

(async () => {
  const browser = await chromium.launch();

  // One fresh context per major section = one clean video file per section,
  // which is far easier to trim/re-order in editing than one long take.
  async function newRecordedPage(name) {
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: OUT_DIR, size: VIEWPORT },
    });
    const page = await ctx.newPage();
    page.__sectionName = name;
    return { ctx, page };
  }
  async function closeAndName(ctx, page, finalName) {
    await page.close();
    const videoPath = await page.video().path();
    await ctx.close();
    const fs = require('fs');
    const dest = path.join(OUT_DIR, `${finalName}.webm`);
    fs.renameSync(videoPath, dest);
    console.log(`  🎥 saved ${finalName}.webm`);
  }

  try {
    require('fs').mkdirSync(OUT_DIR, { recursive: true });

    // ── A) Home ──────────────────────────────────────────────────────────
    {
      const { ctx, page } = await newRecordedPage('A_home');
      const lp = new LoginPage(page);
      await lp.goto();
      await lp.login(C.company, C.username, C.password);
      await pause(page, 1000);
      await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
      await pause(page, 3500); // let cards render, hold for the narration beat
      await closeAndName(ctx, page, 'A_home');
    }

    // ── B) CRM Dashboard ─────────────────────────────────────────────────
    {
      const { ctx, page } = await newRecordedPage('B_dashboard');
      const lp = new LoginPage(page);
      await lp.goto();
      await lp.login(C.company, C.username, C.password);
      await page.goto(`${BASE}/crm-dashboard`, { waitUntil: 'domcontentloaded' });
      await pause(page, 3500);
      // gentle scroll to reveal more KPIs, matching "subtle zoom-ins" pacing
      await page.mouse.wheel(0, 400);
      await pause(page, 2500);
      await page.mouse.wheel(0, 300);
      await pause(page, 2500);
      await closeAndName(ctx, page, 'B_dashboard');
    }

    // ── C) Leads — search + open Demo Customer ──────────────────────────
    {
      const { ctx, page } = await newRecordedPage('C_leads');
      const lp = new LoginPage(page);
      await lp.goto();
      await lp.login(C.company, C.username, C.password);
      await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded' });
      await pause(page, 2500);

      const search = page.locator('input[type="search"], input[placeholder*="search" i]').first();
      if (await search.isVisible().catch(() => false)) {
        await smoothHover(page, search);
        await search.click();
        await page.keyboard.type(DEMO_NAME, { delay: 90 }); // deliberate, visible typing
        await pause(page, 2500);
      }

      // D) open the Demo Customer row
      const row = page.locator('table tbody tr', { hasText: DEMO_NAME }).first();
      await row.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await smoothHover(page, row);
      await pause(page, 700);
      await row.click({ timeout: 8000 }).catch(() => {});
      await pause(page, 3500); // hold on the lead/enquiry overview
      await closeAndName(ctx, page, 'C_leads_and_detail');
    }

    // ── E) Follow-ups listing + F) open the Demo Customer follow-up ────
    {
      const { ctx, page } = await newRecordedPage('E_followups');
      const lp = new LoginPage(page);
      await lp.goto();
      await lp.login(C.company, C.username, C.password);
      await page.goto(`${BASE}/followups`, { waitUntil: 'domcontentloaded' });
      await pause(page, 3000);

      const fRow = page.locator('table tbody tr', { hasText: DEMO_NAME }).first();
      const found = await fRow.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
      if (found) {
        await smoothHover(page, fRow);
        await pause(page, 700);
        await fRow.click({ timeout: 8000 }).catch(() => {});
        await pause(page, 3500);
      } else {
        console.log('  ⚠️  Demo Customer follow-up not visible on page 1 of /followups (may need pagination) — captured listing only');
      }
      await closeAndName(ctx, page, 'E_followups_and_detail');
    }

    // ── G) Return to Dashboard — close the loop ─────────────────────────
    {
      const { ctx, page } = await newRecordedPage('G_dashboard_return');
      const lp = new LoginPage(page);
      await lp.goto();
      await lp.login(C.company, C.username, C.password);
      await page.goto(`${BASE}/crm-dashboard`, { waitUntil: 'domcontentloaded' });
      await pause(page, 4000);
      await closeAndName(ctx, page, 'G_dashboard_return');
    }

    console.log(`\n✅ All sections captured in ${OUT_DIR}`);
  } catch (e) {
    console.log('ERROR', e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
})();
