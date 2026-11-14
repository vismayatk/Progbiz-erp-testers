<#
  Session-only environment for the Android toolchain. Dot-source it in a terminal:
      . .\tools\android-env.ps1
  Nothing is written to your user/system environment; closing the terminal undoes it.
#>
param(
  [string]$SdkRoot = 'Z:\Android\Sdk',
  [string]$AvdHome = 'Z:\Android\avd'
)

$env:ANDROID_HOME     = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:ANDROID_AVD_HOME = $AvdHome   # keep the multi-GB AVD off C: (only ~9 GB free)

# The machine-wide JAVA_HOME points at ...\jdk-25.0.2\bin (one level too deep), which makes
# sdkmanager.bat/avdmanager.bat fail with "JAVA_HOME is set to an invalid directory".
if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'java.exe'))) {
  $env:JAVA_HOME = Split-Path $env:JAVA_HOME
}

$add = @("$SdkRoot\platform-tools", "$SdkRoot\emulator", "$SdkRoot\cmdline-tools\latest\bin")
$env:Path = (($add + ($env:Path -split ';')) | Where-Object { $_ } | Select-Object -Unique) -join ';'
