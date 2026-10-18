# 本地打包脚本（env-hang 变更产物）
#
# 用途：在开发机上产出可本地测试的 NSIS 安装包。
# 前置：便携 cmake —— D:\mysoft\cmake-portable\cmake\data\bin（sentencepiece-sys 需要）
# 说明：TAURI_BUILD_ARGS 只在本次进程内生效，不改仓库里的 tauri.conf.json。
# 用法：交给任务计划/WMI 脱离当前会话运行，输出实时写入 build.log。

$ErrorActionPreference = "Continue"

$repo = "D:\githup-workspace\project-graph"
$changeDir = Join-Path $repo ".op\changes\env-hang"
$log = Join-Path $changeDir "build.log"

Set-Location $repo
$env:PATH = "D:\mysoft\cmake-portable\cmake\data\bin;" + $env:PATH
$env:TAURI_BUILD_ARGS = "--config $(Join-Path $changeDir 'tauri-build-local.json')"

"=== BUILD START $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8
& pnpm build 2>&1 | ForEach-Object { "$_" | Out-File -FilePath $log -Encoding utf8 -Append }
"=== BUILD EXIT: $LASTEXITCODE @ $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8 -Append
