<#
.SYNOPSIS
  Minimal Android emulator toolchain on Z: (no Android Studio).
  Idempotent: re-running skips whatever is already installed.

.STAGES
  tools     download + SHA-1 verify + unpack Google's command-line tools   (no licence needed)
  packages  platform-tools, emulator, platform, system image via android.exe (needs -AcceptLicenses)
  avd       create the "hrms_pixel" Pixel 7 AVD on Z:
  check     emulator -accel-check and list AVDs
  all       everything above, in order

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\setup-android.ps1 -AcceptLicenses
#>
param(
  [ValidateSet('tools', 'packages', 'avd', 'check', 'all')] [string]$Stage = 'all',
  [string]$SdkRoot = 'Z:\Android\Sdk',
  [string]$AvdHome = 'Z:\Android\avd',
  [int]$Api = 34,
  [string]$AvdName = 'hrms_pixel',
  [switch]$AcceptLicenses
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is far faster without the progress bar
. (Join-Path $PSScriptRoot 'android-env.ps1') -SdkRoot $SdkRoot -AvdHome $AvdHome

$repoBase   = 'https://dl.google.com/android/repository/'
$sysImage   = "system-images;android-$Api;google_apis;x86_64"
$androidCli = Join-Path $SdkRoot 'cmdline-tools\latest\bin\android.exe'
$sdkmanager = Join-Path $SdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
$avdmanager = Join-Path $SdkRoot 'cmdline-tools\latest\bin\avdmanager.bat'
$emulator   = Join-Path $SdkRoot 'emulator\emulator.exe'

function Log($msg) { Write-Host ('[{0:HH:mm:ss}] {1}' -f (Get-Date), $msg) }

function Install-CmdlineTools {
  if (Test-Path $sdkmanager) { Log 'cmdline-tools already installed'; return }

  Log "Reading Google's SDK repository index ($($repoBase)repository2-3.xml)"
  [xml]$repo = (Invoke-WebRequest "$($repoBase)repository2-3.xml" -UseBasicParsing).Content
  $pkg = $repo.GetElementsByTagName('remotePackage') | Where-Object {
    $_.GetAttribute('path') -eq 'cmdline-tools;latest' -and
    $_.SelectSingleNode('channelRef').GetAttribute('ref') -eq 'channel-0'      # stable channel
  } | Select-Object -First 1
  if (-not $pkg) { throw 'Stable cmdline-tools;latest not found in the repository index' }

  $archive = $pkg.GetElementsByTagName('archive') |
    Where-Object { $_.SelectSingleNode('host-os').InnerText -eq 'windows' } | Select-Object -First 1
  $file = $archive.SelectSingleNode('complete/url').InnerText
  $sha1 = $archive.SelectSingleNode('complete/checksum').InnerText.ToUpper()
  $size = [long]$archive.SelectSingleNode('complete/size').InnerText

  $downloads = Join-Path (Split-Path $SdkRoot) 'downloads'
  New-Item -ItemType Directory -Force $downloads | Out-Null
  $zip = Join-Path $downloads $file
  if (-not (Test-Path $zip) -or (Get-FileHash $zip -Algorithm SHA1).Hash -ne $sha1) {
    Log ('Downloading {0} ({1:N1} MB)' -f $file, ($size / 1MB))
    Invoke-WebRequest "$repoBase$file" -OutFile $zip -UseBasicParsing
  }
  $hash = (Get-FileHash $zip -Algorithm SHA1).Hash
  if ($hash -ne $sha1) { throw "SHA-1 mismatch for $file (expected $sha1, got $hash)" }
  Log "SHA-1 verified ($sha1)"

  # Required layout: <sdk>\cmdline-tools\latest\{bin,lib,...}
  $unpack = Join-Path $downloads 'cmdline-tools-unpack'
  if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
  New-Item -ItemType Directory -Force $unpack | Out-Null
  tar -xf $zip -C $unpack
  if ($LASTEXITCODE) { throw "tar failed to unpack $zip" }
  New-Item -ItemType Directory -Force (Join-Path $SdkRoot 'cmdline-tools') | Out-Null
  Move-Item (Join-Path $unpack 'cmdline-tools') (Join-Path $SdkRoot 'cmdline-tools\latest')
  Remove-Item $unpack -Recurse -Force
  Log "cmdline-tools installed -> $SdkRoot\cmdline-tools\latest"
}

function Test-PackagesPresent {
  $imageDir = Join-Path $SdkRoot "system-images\android-$Api\google_apis\x86_64"
  (Test-Path (Join-Path $imageDir 'package.xml')) -and (Test-Path (Join-Path $imageDir 'system.img')) -and
  (Test-Path (Join-Path $SdkRoot 'emulator\emulator.exe')) -and (Test-Path (Join-Path $SdkRoot 'platform-tools\adb.exe'))
}

function Install-Packages {
  if (Test-PackagesPresent) { Log 'SDK packages already installed'; return }
  if (-not $AcceptLicenses) {
    throw ('Installing SDK packages requires accepting the Android SDK License Agreement ' +
           '(https://developer.android.com/studio/terms). Re-run with -AcceptLicenses once you agree.')
  }
  # sdkmanager.bat now forwards to the new Android CLI. Call android.exe directly: a .bat splits
  # "platforms;android-34" at every ';'. The new CLI writes package ids with '/'.
  $packages = @('platform-tools', 'emulator', "platforms/android-$Api", "system-images/android-$Api/google_apis/x86_64")
  Log "Installing $($packages -join ', ') (licence accepted via -AcceptLicenses)"
  & $androidCli sdk install @packages --no-metrics
  # android-cli.exe currently crashes on exit (0xC0000409 in ucrtbase) AFTER a successful install,
  # so judge success by what is on disk, not by the exit code.
  if (-not (Test-PackagesPresent)) { throw "android sdk install exited with $LASTEXITCODE and packages are missing" }
  if ($LASTEXITCODE) { Log "android.exe exited with $LASTEXITCODE (known crash on exit) - packages verified on disk" }
  Log 'SDK packages installed'
}

function New-HrmsAvd {
  if (Test-Path (Join-Path $AvdHome "$AvdName.avd")) { Log "AVD '$AvdName' already exists"; return }
  New-Item -ItemType Directory -Force $AvdHome | Out-Null
  Log "Creating AVD '$AvdName' (Pixel 7, $sysImage) in $AvdHome"
  # `android emulator create` is disabled on Windows (Android CLI known issue), so use avdmanager —
  # through cmd with the package id quoted, otherwise cmd splits it at each ';'.
  cmd /c "echo no| `"$avdmanager`" create avd --name $AvdName --package `"$sysImage`" --device pixel_7 --force"
  if ($LASTEXITCODE) { throw "avdmanager exited with $LASTEXITCODE" }

  # Sized for a 16 GB laptop; hardware keyboard on so you can type into the emulator from the PC.
  $ini = Join-Path $AvdHome "$AvdName.avd\config.ini"
  $overrides = [ordered]@{
    'hw.keyboard' = 'yes'; 'hw.ramSize' = '2048'; 'hw.gpu.enabled' = 'yes'; 'hw.gpu.mode' = 'auto'
    'disk.dataPartition.size' = '4G'
  }
  $kept = Get-Content $ini | Where-Object { -not $overrides.Contains(($_ -split '=', 2)[0].Trim()) }
  ($kept + ($overrides.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })) |
    Set-Content $ini -Encoding ascii
  Log "AVD created -> $ini"
}

function Test-Emulator {
  Log 'emulator -accel-check:'
  & $emulator -accel-check
  Log 'AVDs:'
  & $emulator -list-avds
}

switch ($Stage) {
  'tools'    { Install-CmdlineTools }
  'packages' { Install-Packages }
  'avd'      { New-HrmsAvd }
  'check'    { Test-Emulator }
  'all'      { Install-CmdlineTools; Install-Packages; New-HrmsAvd; Test-Emulator }
}
Log "Stage '$Stage' done"
