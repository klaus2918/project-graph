# 15 Rust / Tauri 层

相关目录：`app/src-tauri/`

```text
src/
  lib.rs            # 应用装配：插件、命令注册、Linux/CEF 处理
  main.rs           # 入口（Windows release 隐藏控制台）
  cmd/
    mod.rs          # 模块汇总
    fs.rs           # 文件系统命令
    device.rs       # 设备 ID / 发行版
    shell.rs        # 执行外部命令
    mcp.rs          # MCP stdio 服务器管理（rmcp）
    paddle.rs       # PaddleOCR-VL 本地 OCR（aha crate）
capabilities/       # 权限能力（default / desktop）
tauri.conf.json     # 窗口、打包、插件、文件关联、更新器
Cargo.toml          # 依赖与平台条件
vendor/             # esaxx-rs（patch）、tauri-runtime-cef（Linux CEF）
gen/android/        # 移动端生成骨架
icons/ nsis/        # 打包资源
```

## 1. 职责边界

Rust 只承担：

- 文件系统批量/递归操作；
- 系统信息与设备标识；
- 外部命令执行；
- MCP stdio 子进程生命周期；
- 本地 OCR（PaddleOCR-VL）；
- 系统级集成：深链、全局快捷键、剪贴板、更新器、窗口状态、CLI。

其余业务全部在前端。Rust 命令内错误均转成 `Result<String, String>` 返回前端（禁止未捕获 panic 闪退）。

## 2. 命令清单（invoke_handler）

| 命令                                                                            | 模块   | 说明                                                                      |
| ------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `take_pending_open_files`                                                       | lib    | 取 macOS 双击产生的待打开文件队列                                         |
| `write_stdout / write_stderr / exit`                                            | lib    | CLI 模式输出/退出                                                         |
| `get_device_id`                                                                 | device | 平台相关设备 UUID（Windows CIM / macOS hardware UUID / Linux machine-id） |
| `get_distribution`                                                              | device | Linux 发行版 ID                                                           |
| `read_folder_structure`                                                         | fs     | 递归目录树（FolderEntry）                                                 |
| `exists / read_folder / read_folder_recursive`                                  | fs     | 目录与文件枚举                                                            |
| `delete_file / create_folder`                                                   | fs     | 文件删除/建目录                                                           |
| `read_text_file / read_file_base64`                                             | fs     | 文本/二进制读取                                                           |
| `write_text_file / write_file_base64`                                           | fs     | 文本/二进制写入                                                           |
| `run_command`                                                                   | shell  | 同步执行外部程序，返回 code/stdout/stderr                                 |
| `mcp_stdio_start / list_tools / call_tool / stop`                               | mcp    | MCP stdio 服务器管理（仅 desktop）                                        |
| `get_aha_directory / paddleocr_vl_1_6_model_exists / paddleocr_vl_1_6_generate` | paddle | OCR 模型路径/存在性/识别（桌面端）                                        |

## 3. MCP stdio 管理（mcp.rs）

- `McpStdioManager`：`HashMap<serverName, SharedClient>`，`rmcp` RoleClient + TokioChildProcess；
- `validate_config`：命令/参数/环境变量非空、禁止 NUL 字符；
- 工具调用走 JSON-RPC（rmcp），生命周期与调用均通过 Tauri state 管理；
- 前端 `AIMCPStdio.ts` 通过 invoke 对接（见第 10 篇）。

## 4. OCR（paddle.rs）

- 全局 `OnceLock<Mutex<Option<PaddleOCRVLGenerateModel>>>` 懒加载模型（`PaddleOCR-VL-1.6`）；
- `paddleocr_vl_1_6_generate`：读图 → 模型生成 → 清理 `<|LOC_n|>` 标记、处理 LaTeX 换行；
- AI 工具 `recognize_image` 调用它实现图片文字识别。

## 5. Tauri 插件与能力

注册插件：

```text
fs / store / http（unsafe-headers）/ dialog / os / shell / deep-link / clipboard-manager
devtools（debug）/ cli / process / system-info / window-state / updater / global-shortcut（desktop）
```

`capabilities/default.json`：主窗口与 proxy 窗口的权限集合（核心窗口操作、剪贴板、http 任意 URL、fs 全范围、shell open 任意、store/global-shortcut 等）；`desktop.json` 追加 cli/updater/window-state/system-info。

## 6. 窗口与打包配置（tauri.conf.json）

- 主窗口：无边框、透明、默认 1200×800、初始隐藏（前端就绪后显示）；
- 文件关联：`.prg`（MIME `application/vnd.project-graph`，Editor 角色）；
- 深链 scheme：`prg`；
- CLI 参数：path / output(-o) / size(-s)；
- 打包：NSIS（多语言安装器 + 下载 WebView2 bootstrapper）、rpm/deb/AppImage（Linux 打包 CEF runtime）、dmg/app；
- 更新器：`createUpdaterArtifacts` + 公钥 + 发布端点；
- `beforeBundleCommand` 执行 `collect-cef-linux.js` 收集 CEF 运行时。

## 7. Linux CEF 运行时

- `vendor/tauri-runtime-cef`：自研 Tauri runtime 适配层（ipc/protocol/runtime/subprocess/webview/window/app），让 Linux 使用 CEF 而非 WebKitGTK；
- `lib.rs`：Linux 下检测 NVIDIA 关闭 GL 线程优化；`dispatch_cef_subprocess` 在 Tauri 初始化前分流 CEF 子进程；
- `Cargo.toml` `[patch.crates-io]` 替换 `esaxx-rs` 为本地 vendor（aha 依赖）。

## 8. 移动端

- `#[cfg_attr(mobile, tauri::mobile_entry_point)]` 支持 Android/iOS；
- `gen/android/` 为 Tauri 生成的 Gradle 工程（RustPlugin 构建脚本）；
- 移动端未注册桌面插件（cli/updater/window-state/system-info 等条件编译）。

## 9. 发布脚本

- `app/scripts/tauri_build.js`：自定义 tauri build 包装（`tauri:build`）；
- `app/scripts/collect-cef-linux.js`：收集 CEF runtime 到打包目录；
- `app/scripts/sync-locales.ts`：OpenCC 生成 zh_TW。
