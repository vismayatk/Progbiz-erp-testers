'use strict';

/**
 * Browser window sizing — one place for every browser/context the suite opens.
 *
 * Headed (HEADED=1): the window opens MAXIMIZED at the top-left of the primary screen and the page
 * fills it (viewport = null), so it fits that one screen whatever its size or display scaling —
 * a fixed 1600×900 page is wider than a scaled laptop screen and spills onto a second monitor.
 * Headless: a fixed 1600×900 page, so screenshots and recordings are consistent.
 */
const HEADED = !!process.env.HEADED;

/** Chromium launch args. */
const LAUNCH_ARGS = HEADED ? ['--start-maximized', '--window-position=0,0'] : [];

/** Context viewport: null (= follow the maximized window) when headed. */
const VIEWPORT = HEADED ? null : { width: 1600, height: 900 };

/** Recording size (videos are scaled into this frame). */
const VIDEO_SIZE = { width: 1600, height: 900 };

module.exports = { HEADED, LAUNCH_ARGS, VIEWPORT, VIDEO_SIZE };
