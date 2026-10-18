# Local dev-mode launcher for the save-freeze change.
# Purpose: run the app from source (with the save-timing instrumentation) so the user can reproduce Ctrl+S.
# ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1 as ANSI, so non-ASCII text here can break parsing.
#
# Note: tauri.conf.json has an empty beforeDevCommand, so `tauri dev` waits for an external Vite server
# on http://localhost:1420/; this script starts Vite first and then attaches tauri dev.

$ErrorActionPreference = "Continue"

$repo = "D:\githup-workspace\project-graph"
$app = Join-Path $repo "app"
$changeDir = Join-Path $repo ".op\changes\save-freeze"
$log = Join-Path $changeDir "dev.log"
$viteLog = Join-Path $changeDir "dev-vite.log"

Set-Location $app
$env:PATH = "D:\mysoft\cmake-portable\cmake\data\bin;" + $env:PATH

"=== DEV START $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8

Start-Process -FilePath "pnpm.cmd" -ArgumentList @("dev") -WorkingDirectory $app -WindowStyle Hidden `
  -RedirectStandardOutput $viteLog -RedirectStandardError "$viteLog.err"

$deadline = (Get-Date).AddMinutes(3)
$ready = $false
while ((Get-Date) -lt $deadline) {
  $listening = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue
  if ($listening) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 3
}
"=== VITE READY: $ready @ $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8 -Append

& pnpm tauri:dev 2>&1 | ForEach-Object { "$_" | Out-File -FilePath $log -Encoding utf8 -Append }
"=== DEV EXIT: $LASTEXITCODE @ $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8 -Append
