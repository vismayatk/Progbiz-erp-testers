# HRMS mobile — Android emulator

Ready-to-use Android emulator for the HRMS mobile app (APK to follow).

| | |
|---|---|
| Virtual device | `hrms_pixel` — Pixel 7, Android 14 (API 34), Google APIs, x86_64 |
| Acceleration | Windows Hypervisor Platform (WHPX) |
| SDK | `Z:\Android\Sdk` (adb, emulator) |
| Device data | `Z:\Android\avd` (kept off C:, which has little free space) |

## Emulator in Claude's side panel

Ask Claude to open the **emulator-panel** preview (defined in `.claude/launch.json`). The side panel
shows a live mirror of the phone at http://localhost:8790, and the panel server boots the emulator
without a window if none is running. A cold boot takes about a minute.

- **You:** the panel shows only the phone. Click to tap, drag to swipe, scroll with the mouse wheel, and
  type with the keyboard after clicking the screen. Esc or right-click is Back; middle-click is Home.
- **Claude:** acts through `node panel/emu.js …` (for example `ui`, `tap-text "Login"`, `wait-text`,
  `swipe`, `text`, `key BACK`, `shot`, `install app.apk`). Every action appears live in the panel,
  marked **Claude**.

The screen streams as H.264 video, decoded by the browser's built-in video decoder. If no video frame
arrives within 12 seconds, the page switches to screenshot polling. Only Node and adb are needed;
there are no npm packages.

- The emulator runs with its window hidden (`-qt-hide-window`). Set `EMULATOR_WINDOW=1` to show it.
  (`-no-window` is not used: it stalls about a minute into boot on this PC.)
- Stopping the panel, or ending the Claude session, also shuts down the emulator. Reopening the panel
  boots the phone again.
- The emulator's own output goes to `Z:\Android\logs\emulator.log`.

## Start the emulator in its own window

```powershell
powershell -ExecutionPolicy Bypass -File Z:\HRMS\mobile-app-tests\tools\start-emulator.ps1
```

A phone window opens; the script returns when Android has finished booting.
Add `-ColdBoot` to boot from scratch instead of the quick-boot snapshot.

## Install the APK (when it's ready)

Drag the `.apk` onto the emulator window, or:

```powershell
Z:\Android\Sdk\platform-tools\adb.exe install -r C:\path\to\app.apk
```

## adb / emulator in a terminal

```powershell
. Z:\HRMS\mobile-app-tests\tools\android-env.ps1   # this terminal only; nothing system-wide changes
adb devices
```

## Rebuild from scratch

```powershell
powershell -ExecutionPolicy Bypass -File Z:\HRMS\mobile-app-tests\tools\setup-android.ps1 -AcceptLicenses
```

`-AcceptLicenses` accepts the Android SDK License Agreement (https://developer.android.com/studio/terms).

## Notes

- Your machine-wide `JAVA_HOME` points at `...\jdk-25.0.2\bin` (one folder too deep), which breaks
  Google's SDK tools. The scripts correct it for their own process only.
- `support\`, `tools\probe-mobile.js` and `exploration\` are an unused prototype for testing the HRMS
  *web* app on phone screens — not needed for the APK; safe to delete.
