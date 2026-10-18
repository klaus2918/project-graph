# Local NSIS packaging helper for the save-freeze change.
#
# Purpose: produce a locally installable NSIS package for manual testing.
# Prerequisite: portable cmake at D:\mysoft\cmake-portable\cmake\data\bin (needed by sentencepiece-sys).
# Note: TAURI_BUILD_ARGS only affects this process; it does not modify the repo's tauri.conf.json.
# Usage: run detached (scheduled task) so the build survives the agent session; output goes to build.log.

$ErrorActionPreference = "Continue"

$repo = "D:\githup-workspace\project-graph"
$changeDir = Join-Path $repo ".op\changes\save-freeze"
$log = Join-Path $changeDir "build.log"

Set-Location $repo
$env:PATH = "D:\mysoft\cmake-portable\cmake\data\bin;" + $env:PATH
$env:TAURI_BUILD_ARGS = "--config $(Join-Path $changeDir 'tauri-build-local.json')"

"=== BUILD START $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8
& pnpm build 2>&1 | ForEach-Object { "$_" | Out-File -FilePath $log -Encoding utf8 -Append }
"=== BUILD EXIT: $LASTEXITCODE @ $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8 -Append
