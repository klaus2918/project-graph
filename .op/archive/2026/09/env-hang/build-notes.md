# 本地打包与安装记录（build，2026-09-15）

## 前置条件核查

| 项                    | 结果                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node / pnpm           | v24.11.0 / 11.3.0（engines 要求 node>=26，仅有告警）                                                                                                             |
| Rust                  | cargo 1.95.0 / rustc 1.95.0 ✅                                                                                                                                   |
| MSVC（cl.exe / link） | 在位 ✅                                                                                                                                                          |
| **cmake**             | ❌ **缺失** —— `sentencepiece-sys` 的 build script 需要 cmake，首次 `pnpm build` 失败于 `failed to execute command: program not found / is cmake not installed?` |
| winget                | ❌ 不可用（本机无 App Installer）                                                                                                                                |

**缺口的处置（未改动用户 Python 环境）**：

```powershell
py -m pip install --target D:\mysoft\cmake-portable cmake   # 便携安装 cmake 4.4.3
# 真实可执行文件：D:\mysoft\cmake-portable\cmake\data\bin\cmake.exe
# （D:\mysoft\cmake-portable\bin\cmake.exe 是 pip 的 python 启动器壳，--target 安装下不可直接用）
```

## 打包命令

```powershell
$env:PATH = "D:\mysoft\cmake-portable\cmake\data\bin;" + $env:PATH
$env:TAURI_BUILD_ARGS = "--config D:\githup-workspace\project-graph\.op\changes\env-hang\tauri-build-local.json"
pnpm build   # = nx run-many -t build tauri:build（先 vite build，再 tauri build）
```

**为什么需要覆盖配置**：`app/src-tauri/tauri.conf.json` 里 `bundle.createUpdaterArtifacts: true` 且配了 updater 公钥，但本机没有 `TAURI_SIGNING_PRIVATE_KEY`。上一次构建（`.nx/cache/terminalOutputs/17645410126708641829:1121`）就是在**成功产出 NSIS 安装包之后**死在签名步骤（exit 1）。

`tauri-build-local.json` 内容仅为 `{"bundle":{"createUpdaterArtifacts":false}}`，即：本地测试不生成更新器签名产物，**不修改仓库里的任何配置文件**。

## 产物与安装结果

### 打包（进行中 → 见下方状态）

构建曾两次中断，原因与处置：

1. **cmake 缺失**（见上）→ 便携安装 cmake 后解决。
2. **构建进程被会话回收**：第二次构建在 11:32 被终止（`project-graph.exe` 时间戳仍是 2026/9/12，deps 只更新到 11:32:35），因为构建命令挂在当前对话的终端会话上，回合结束即被清理。
   → 改为**脱离会话**：`build-local.ps1` / `install-local.ps1` 由任务计划（schtasks）执行，输出实时落盘：
   - `PG-LocalBuild` → `build.log`
   - `PG-LocalInstall` → `install.log`（等到安装包时间戳刷新后自动 `/S` 静默安装）

   创建命令（可复用）：

   ```powershell
   schtasks /Create /TN "PG-LocalBuild"  /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\githup-workspace\project-graph\.op\changes\env-hang\build-local.ps1"  /SC ONCE /ST 23:59 /F /IT
   schtasks /Run    /TN "PG-LocalBuild"
   schtasks /Create /TN "PG-LocalInstall" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\githup-workspace\project-graph\.op\changes\env-hang\install-local.ps1" /SC ONCE /ST 23:59 /F /IT
   schtasks /Run    /TN "PG-LocalInstall"
   ```

### 脚本编码坑（已修）

`install-local.ps1` 首次执行 `Last Result: 1`：Windows PowerShell 5.1 把**无 BOM 的 UTF-8 脚本按 ANSI 读取**，脚本里的中文导致 `字符串缺少终止符` 解析失败。
→ 处置：`install-local.ps1` 改为**纯 ASCII**；`build-local.ps1` 保留中文注释但正常解析（如需绝对稳妥，也建议改 ASCII）。

### 状态（2026-09-15 12:20 实测：打包 ✅ / 安装 ✅）

| 项                         | 实测结果                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| 打包任务 `PG-LocalBuild`   | ✅ **exit 0**（12:14:11 启动 → 12:15:37 结束）                                                    |
| 前端 vite build            | ✅ 成功（13.61s，`app/dist` 已更新）                                                              |
| Rust 编译/链接             | ✅ `Finished release profile` in 59.60s；`target\release\project-graph.exe` = 2026/9/15 12:15:36  |
| NSIS 安装包                | ✅ 已产出：`Project Graph_0.0.0-dev_x64-setup.exe` = **2026/9/15 12:15:34**，9,997,252 字节       |
| 安装任务 `PG-LocalInstall` | ✅ `INSTALLER_EXIT: 0`，12:16:17 安装完成                                                         |
| 注册表版本                 | ✅ `DisplayVersion = 0.0.0-dev`（原 4.2.3 已被替换），`InstallLocation = D:\mysoft\Project Graph` |

**上一轮 exit 1 的复核结论**：12:03 那次失败是替换 `project-graph-ownership-helper.exe` 时的瞬时占用（`os error 5`）。12:10 时占用已释放，12:14 原样重跑即 exit 0，**无需任何代码或配置改动**。

#### 产物正确性核验（本轮修复确实在安装包里）

| 核验                         | 结果                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 源码修改时间 vs 构建时间     | 5 个修复文件最新为 10:15:01（`Controller.tsx`），早于 11:51 的前端构建与 12:15 的 Rust 打包 ✅                                                                 |
| 前端产物含 `stageRevision`   | `app/dist/assets/EdgeCollisionBoxGetter-BI_VwXZ8.js` 命中 `StageManager.stageRevision` 实现 ✅                                                                 |
| 大纲窗口不再轮询 `stageHash` | `OutlineWindow.tsx` 改为比较 `stageManager.stageRevision`；`stageHash` 仅保留在 `Project.tsx`（定义）与 `AutoSaveBackupService.tsx`（分钟级备份），符合预期 ✅ |
| 安装后的 exe vs 构建产物     | 字节级比对：仅 3 字节差异，位于 `__TAURI_BUNDLE_TYPE_VAR_UNK` → `__TAURI_BUNDLE_TYPE_VAR_NSS`，即 NSIS 打包阶段**正常的 bundle type 注入**，其余完全相同 ✅    |
| ownership-helper 哈希        | 安装目录与 target 目录 SHA256 一致 ✅                                                                                                                          |

> 说明：安装后的 `project-graph.exe` 与 target 里的 exe 哈希不同属正常现象——Tauri 打包时会用 `nsis` 覆写 bundle type 标记。**不要**误判为「装错了版本」。

#### 任务触发器（已处理）

两个计划任务原本带有 **2026-09-15 23:59** 的触发器；如不处理，会在今晚自行重跑构建并重装，覆盖正在测试的安装。现已**禁用触发器**（`Enabled=False`），任务保留为 Ready 状态，需要时仍可手动 `/Run`。

**建议的针对性验证步骤**（供人工执行）：

1. 反复「打开工程 → 关闭 → 再打开」5~10 次，任务管理器观察内存**不再单调上涨**（原 D1/D2：旧 Project 连带 150 份历史快照无法回收）；
2. 打开大纲窗口 → 放置 10 分钟 → 回来操作**仍然响应**（原 D3：每 300ms 全表 `serialize+md5` 已换成 O(1) 版本号）。

### 历史状态（2026-09-15 12:10 实测：打包 ❌）

| 项                         | 实测结果                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 打包任务 `PG-LocalBuild`   | 已结束，**exit 1**                                                                                                                                                         |
| 前端 vite build            | ✅ 成功（`built in 13.61s`，`app/dist` 已更新）                                                                                                                            |
| Rust 编译/链接             | ✅ 主程序已重链：`target\release\project-graph.exe` = 2026/9/15 12:03:48                                                                                                   |
| NSIS 安装包                | ❌ 未产出（仍是 2026/9/12 6:01:43）                                                                                                                                        |
| 失败点                     | `error: failed to remove file ...\project-graph-ownership-helper.exe` / `Caused by: 拒绝访问。(os error 5)` → 属于**文件被占用**导致的瞬时失败，不是 cmake、也不是签名问题 |
| 复核                       | 12:10 已无任何路径含 project-graph 的进程在跑；helper 文件属性正常（Archive/NotContentIndexed，非只读），说明占用已释放，**直接重跑打包即可**                              |
| 安装任务 `PG-LocalInstall` | 仍在等待（等待窗口 11:52 → 12:32），安装包一刷新就静默安装                                                                                                                 |

### 重跑打包（一条命令）

```powershell
$repo = "D:\githup-workspace\project-graph"
$env:PATH = "D:\mysoft\cmake-portable\cmake\data\bin;" + $env:PATH
$env:TAURI_BUILD_ARGS = "--config $repo\.op\changes\env-hang\tauri-build-local.json"
Set-Location $repo
pnpm build          # 或只跑 Tauri 部分：pnpm --filter @graphif/project-graph tauri:build
```

（本次已编译完的 crate 可复用，预计只需重链 ownership-helper + NSIS 打包，数分钟内出包。）

### 完成判据

- `app\src-tauri\target\release\bundle\nsis\Project Graph_0.0.0-dev_x64-setup.exe` 时间戳变成今天；
- `install.log` 出现 `INSTALLER_EXIT: 0` 与注册表回显；
- 注册表 `HKCU\...\Uninstall` 中 Project Graph 的 `DisplayVersion` 从 4.2.3 变为 0.0.0-dev（注意：Tauri 安装器可能先卸载旧版）。
