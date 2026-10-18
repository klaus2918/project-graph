# Local install helper for the save-freeze change.
#
# Waits for a freshly built NSIS installer, then installs it silently.
# Kept ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1 as ANSI,
# so non-ASCII text here can break parsing.

$ErrorActionPreference = "Continue"

$repo = "D:\githup-workspace\project-graph"
$changeDir = Join-Path $repo ".op\changes\save-freeze"
$log = Join-Path $changeDir "install.log"
$setup = Join-Path $repo "app\src-tauri\target\release\bundle\nsis\Project Graph_0.0.0-dev_x64-setup.exe"
$freshAfter = Get-Date "2026-09-15 19:05:00"

function Write-Log($message) {
  $message | Out-File -FilePath $log -Encoding utf8 -Append
}

"=== INSTALL WAIT START $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8

$deadline = (Get-Date).AddMinutes(40)
$fresh = $false
while ((Get-Date) -lt $deadline) {
  $file = Get-Item $setup -ErrorAction SilentlyContinue
  if ($file -and $file.LastWriteTime -gt $freshAfter) {
    $fresh = $true
    break
  }
  Start-Sleep -Seconds 20
}

if (-not $fresh) {
  Write-Log "TIMEOUT: installer was not refreshed, skip install"
  exit 2
}

$file = Get-Item $setup
Write-Log "INSTALLER: $($file.FullName)"
Write-Log "INSTALLER_SIZE: $($file.Length) bytes"
Write-Log "INSTALLER_TIME: $($file.LastWriteTime)"

$process = Start-Process -FilePath $setup -ArgumentList "/S" -Wait -PassThru
Write-Log "INSTALLER_EXIT: $($process.ExitCode)"

Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*, HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like "*Project Graph*" } |
  Select-Object DisplayName, DisplayVersion, InstallLocation |
  Format-List |
  Out-File -FilePath $log -Encoding utf8 -Append

foreach ($dir in @("D:\mysoft\Project Graph", (Join-Path $env:LOCALAPPDATA "Project Graph"))) {
  Write-Log "DIR_EXISTS: $dir -> $(Test-Path $dir)"
}

Write-Log "=== INSTALL DONE $(Get-Date -Format o) ==="
