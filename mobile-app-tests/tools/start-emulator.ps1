<#
.SYNOPSIS
  Opens the hrms_pixel Android emulator in a normal window and waits until Android has booted.
  Running it again while the emulator is up just prints the device info.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\start-emulator.ps1
  powershell -ExecutionPolicy Bypass -File tools\start-emulator.ps1 -ColdBoot

  Then install your app:  adb install -r C:\path\to\app.apk   (or drag the .apk onto the emulator window)
#>
param(
  [string]$AvdName = 'hrms_pixel',
  [int]$BootTimeoutSec = 600,
  [switch]$ColdBoot              # ignore the quick-boot snapshot and boot from scratch
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'android-env.ps1')
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'

function Log($msg) { Write-Host ('[{0:HH:mm:ss}] {1}' -f (Get-Date), $msg) }
# via cmd so adb's "no devices" stderr while booting doesn't become a PowerShell error
function Test-Booted { ((cmd /c "`"$adb`" shell getprop sys.boot_completed 2>nul") -join '') -match '1' }

& $adb start-server | Out-Null
if (-not ((& $adb devices) -match '^emulator-\d+\s+device$')) {
  $emuArgs = @('-avd', $AvdName)
  if ($ColdBoot) { $emuArgs += '-no-snapshot-load' }
  Log "Starting emulator '$AvdName' - a window will open (first boot takes a few minutes)"
  Start-Process -FilePath (Join-Path $env:ANDROID_HOME 'emulator\emulator.exe') -ArgumentList $emuArgs
  $deadline = (Get-Date).AddSeconds($BootTimeoutSec)
  while (-not (Test-Booted)) {
    if ((Get-Date) -gt $deadline) { throw "Emulator did not finish booting within $BootTimeoutSec s" }
    Start-Sleep -Seconds 3       # poll interval while Android boots
  }
}

$serial = (((& $adb devices) -match '^emulator-\d+') | Select-Object -First 1) -replace '\s.*$', ''
$ver = (& $adb -s $serial shell getprop ro.build.version.release).Trim()
$api = (& $adb -s $serial shell getprop ro.build.version.sdk).Trim()
Log "Ready: $serial - Android $ver (API $api)"
Log "Install your app with:  $adb install -r <path-to-app.apk>"
