# HRMS mobile — Android emulator in the side panel

The user drives an Android emulator from chat: they prompt, Claude acts, and they watch it live
in Claude's side panel.

- **Show the emulator**: start the preview `emulator-panel` (`.claude/launch.json`) → the side panel
  opens http://localhost:8790, a live mirror of the default AVD. The server boots the AVD if nothing
  is connected (window hidden; cold boot ≈ 1-2 min).
- **AVDs**: `hrms_play` (Pixel 7, Android 14, **google_apis_playstore** — has the Play Store; current
  default in server.js) and `hrms_pixel` (google_apis, no Play Store). To install a Play Store app the
  user signs into Google in the panel themselves (never Claude), then installs from the Store.
- **Act on the device** with `node panel/emu.js …` — every action appears in the panel, marked
  "Claude". Prefer `ui` + `tap-text "<label>"` over raw coordinates, `wait-text` over sleeps, and
  `shot` + Read the PNG (or a Browser-pane screenshot) to check the result before the next step.
- **Credentials**: never type passwords or other secrets yourself — ask the user to click the phone
  screen in the panel and type them on their keyboard.
- **Panel shows only the phone** (user's request): no toolbars, text box or log. Actions are visible
  as a brief dot on the screen; the action history is in the panel server's log (preview logs).
- **Scope**: the HRMS APK had not been delivered as of 2026-09-12. Don't start test automation until
  the user provides it and asks; install it with `node panel/emu.js install <file.apk>`.
- Toolchain: SDK `Z:\Android\Sdk`, AVDs `Z:\Android\avd`; setup/boot scripts in `tools\` (see README.md).
