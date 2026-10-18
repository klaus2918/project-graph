# 执行记录：save-freeze（Ctrl+S 保存大工程卡死）

## 1. 根因（静态定位，任务 1）

Ctrl+S 保存链路全部在主线程同步执行，成本与工程规模成正比：

| #   | 位置                                                                  | 同步重活                                                                     |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | `Project.tsx` `getFileContent`                                        | `serialize(this.stage)` 全量序列化                                           |
| 2   | 同上                                                                  | `encoder.encode(...)` msgpack 全量编码                                       |
| 3   | 同上                                                                  | Zip 打包（`level: 0`）+ `uwriter.getData()` 全量拼接                         |
| 4   | `generateThumbnail.tsx`                                               | 相机拉到全图（缩放极小 → 剔除失效、逐实体全画）+ `sleep(200)` + `toBlob` PNG |
| 5   | `shortcutKeysRegister.tsx` saveFile → `historyManager.clearHistory()` | **又一次 `serialize(project.stage)`**（两种历史模式实现相同）                |

## 2. 修改内容（4 个源文件 + 1 个新增测试）

| 文件                                                                              | 改动                                                                                                                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/src/core/Project.tsx`                                                        | 新增 `lastSavedStageSnapshot` 字段；`getFileContent` 产出快照时同时缓存，供同一次保存的下游复用                                                         |
| `app/src/core/stage/stageManager/StageHistoryManager.tsx`                         | `clearHistory(snapshot?)`：抽象签名 + 两种实现 + 门面透传；传入快照时直接复用，不传时行为与原来完全一致                                                 |
| `app/src/core/service/controlService/shortcutKeysEngine/shortcutKeysRegister.tsx` | saveFile：复用 `lastSavedStageSnapshot`；保存中忽略重入（`isSaving` 守卫）；保存前先让出一次事件循环并显示「正在保存文件…」，结束 dismiss               |
| `app/src/core/service/dataGenerateService/generateThumbnail.tsx`                  | 新增规模阈值（实体数 > 2000 或内容包围盒最长边 > 20000 则本次不生成缩略图）；记录并**恢复**渲染循环状态（原来无条件 `pause()`，保存后画布可能不再重绘） |
| `app/src/core/service/dataGenerateService/generateThumbnail.test.ts`              | 新增 2 用例：超实体数阈值、超包围盒阈值 → 返回 undefined                                                                                                |

## 3. 验证结果

| 项               | 命令                                                                                                                  | 结果                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 单测（新增）     | `pnpm --filter @graphif/project-graph exec vitest run src/core/service/dataGenerateService/generateThumbnail.test.ts` | **2 passed**（19:00:03，耗时 3.46s）                 |
| type-check       | `pnpm --filter @graphif/project-graph type-check`                                                                     | **exit 0**（`tsc --noEmit` 无输出）                  |
| lint（改动文件） | `eslint` 5 个文件                                                                                                     | **exit 0，0 problem**（先用 `--fix` 归一行尾，见下） |
| 人工验收         | 大工程 Ctrl+S 后是否立即可操作                                                                                        | 待用户实测（任务 8）                                 |

> 环境备注：工作区 `core.autocrlf=true` 且无 `.gitattributes`，1212 个受跟踪文件里 1099 个工作区为 CRLF，直接对 CRLF 文件跑 prettier 会刷 `Delete ␍`（首次 lint 报 5362 条，全是这一类）。已对本变更 5 个文件跑 `eslint --fix` 归一到 LF；`git diff --stat` 仍是 47+/10-，无 EOL 噪音进入 diff。

## 4. 偏离记录

1. **任务 1 口径变更**：原计划「加分段计时量化各段耗时」，实际改为**静态定位**（逐段读源码确认调用点与成本来源），未加临时计时代码。原因：一次性诊断代码需再加一轮改动与回滚，而 5 段重活的必要性在源码层面已可直接判定；副作用是「各段耗时占比」仍未有实测数据。
2. **缩略图阈值取值（2000 / 20000）未标定**：计划中的阻塞项 B1 未取得用户给出的大工程量级，先取保守默认值；若实测仍卡或缩略图刷新过于保守，需要按真实规模调整。
3. 历史模式两种实现的改动是**同一处逻辑**（TimeEfficient 与 MemoryEfficient 各自持有 `initialStage`），未做抽象合并，避免扩大改动面。

## 5. 关联发现（本次未改，登记待办）

- `app/src/core/service/dataGenerateService/generateScreenshot.tsx:68-70` 有同样的 `project.loop() → pause()` 模式，且同样不恢复原状态；导出截图后画布可能停止重绘（与本次冻结无关，但同源）。
- `generateThumbnail` 中 `await sleep(200)` 是固定等待，占保存链路的固定 200ms；未处理（相对整体耗时次要）。
- 保存链路仍在主线程：本轮只做了「去重复 + 降级 + 反馈」，未引入 Worker；若大工程仍需更彻底的无阻塞，需要单独立项。

---

# 第二轮（2026-09-15 晚）：先量化，再定点削减

起因：用户实测第一轮修复（19:28 构建已安装）后反馈「**仍卡死，无明显改善**」，第一轮假设失效。方案已回 op-plan 重写并重新确认（plan.md 第二轮，confirmed_at 2026-09-15T22:11:52+08:00）。

## 6. 离线基准：CPU 管线不是主导成本（任务 1）

- 基准文件：`app/src/core/service/dataFileService/savePipeline.bench.test.ts`
  （用带真实装饰器的代理类；真实 `TextNode` 会拉起整个 UI 依赖树，单测环境不可用——同 `StageManager.index.test.ts` 的取舍）
- 命令：`pnpm --filter @graphif/project-graph exec vitest run src/core/service/dataFileService/savePipeline.bench.test.ts`
- 结果（Node 24 / V8，本机；规模为对象总数 = 节点 + 边）：

| 规模       | serialize | encode  | zip(stage)           | zip(200KB 图) | close  | getData | 合计    | zip 体积 |
| ---------- | --------- | ------- | -------------------- | ------------- | ------ | ------- | ------- | -------- |
| 1,500      | 2.7 ms    | 8.4 ms  | 3.5 ms               | 3.1 ms        | 0.3 ms | 0.1 ms  | ≈18 ms  | 0.43 MB  |
| 7,500      | 19.2 ms   | 13.0 ms | 9.8 ms               | 2.2 ms        | 0.4 ms | 0.3 ms  | ≈45 ms  | 1.38 MB  |
| 30,000     | 58.3 ms   | 47.0 ms | 39.4 ms              | 4.9 ms        | 1.1 ms | 1.4 ms  | ≈152 ms | 4.93 MB  |
| 附件 20 MB | —         | —       | 173.5 ms（blob→zip） | —             | 8.7 ms | —       | ≈182 ms | 20.00 MB |

- 序列化线性：单实体 1.8 µs（1,500 档）→ 1.9 µs（30,000 档），未出现超线性；附件约 8.7 ms/MB。
- **结论：即使 3 万对象，整条 CPU 管线（serialize + encode + zip + getData）也只有约 150 ms。** 纯 CPU 段无法解释「数秒到数十秒」的冻结，除非工程规模达百万对象量级或附件体量达数百 MB。
- 取证重点因此转向真实环境：`fs.write`（Tauri IPC + 落盘）、保存期缩略图（画布渲染）、渲染循环暂停/恢复、以及**主线程是否真的被占满**。
- 偏离记录：任务 1 原计划「N=1k/5k/20k + 用户真实 .prg」，实际用代理类 + 合成规模，未取用户文件（B4 降级为可选）；代理类的字段结构与真实实体有差异（真实实体字段更多、可能含大量非整数坐标触发 `toFixed(2)`），故这里的绝对值是**下限**，用于判断量级而非精确值。

## 7. 应用内埋点（任务 2）

新增 `app/src/core/service/dataFileService/saveTimingDiagnostics.tsx`：

- 分段标记：serialize / encode:stage / zip:各 entry / thumbnail / zip:close / zip:getData / fs.write / clearHistory / addRecentFile / total；
- 规模口径：实体数、关联数、附件数、附件字节、编码后字节、zip 字节、缩略图字节；
- 用 `requestAnimationFrame` 实际间隔统计**最长无响应窗口**，用于区分「主线程被占满」与「只是画布没重绘」；
- 每次手动保存追加一行 JSON 到 `<appCacheDir>/save-timing.log`，并弹对话框展示（含「复制」按钮）。自动保存/自动备份只写日志、不弹窗，且用独立的 `appendSaveDiagnosticLog`，避免与手动保存争夺同一个单例。

接入点：`Project.getFileContent`（各段 + 规模口径）、`Project.save`（fs.write）、`shortcutKeysRegister` saveFile（start/finish/clearHistory/addRecentFile）、`AutoSaveBackupService`（autoBackup.stageHash、autoBackup.total、autoSave.total）。

偏离记录：

1. `AutoSaveBackupService.autoSave` 里 `this.project.save(...)` 补了 `await`——否则量到的是「发起保存」而不是「保存完成」；该 await 不改变自动保存的行为语义。
2. 纯文本格式化拆到 `saveTimingDiagnosticsFormat.tsx`：诊断模块 import 了 Tauri API 与 UI 组件（`Dialog` → … → `Settings` → plugin-store），在 vitest 里加载会因 `invoke` 缺失而失败；把纯函数拆出来后由新增的 `saveTimingDiagnostics.test.ts` 覆盖（对应任务 2 的「单测覆盖计时汇总函数」）。

验证：新增单测 1 passed（`saveTimingDiagnostics.test.ts`）；`pnpm --filter @graphif/project-graph type-check` exit 0；7 个改动文件 eslint 0 problem（先 `--fix` 归一行尾，同第一轮环境备注）；`git diff --stat` 无 EOL 噪音。

## 8. 待用户执行（任务 3）

需要在带埋点的构建上复现一次「大工程 Ctrl+S」，取回 `save-timing.log` 后判定主导段。构建/运行由用户执行（`AGENTS.md` 禁止 Agent 跑构建命令；`PG-LocalBuild`/`PG-LocalInstall` 计划任务在 env-hang 归档时已清理）。

启动脚本与实测环境备注：

| 文件                                        | 说明                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `.op\changes\save-freeze\dev-local.ps1`     | dev 模式启动：先起 Vite（`app` 目录 `pnpm dev`），待 1420 端口就绪后再 `pnpm tauri:dev`；日志 `dev.log` / `dev-vite.log` |
| `.op\changes\save-freeze\build-local.ps1`   | 发布版打包（复用第一轮脚本；需要 cmake 在 PATH 前置、`tauri-build-local.json` 关闭更新器产物）                           |
| `.op\changes\save-freeze\install-local.ps1` | 静默安装（安装前需先关掉正在运行的 Project Graph，否则文件占用会导致替换失败）                                           |

Agent 侧限制（本轮实测）：命令由沙箱托管，`Start-Process` 起的常驻进程与 `Invoke-CimMethod Win32_Process Create` 起的进程都无法跨回合存活；`schtasks /create` 被拦（exit -1，任务未创建成功）。因此「起 GUI 应用 + 按 Ctrl+S」必须由用户在自己的终端执行。

为什么先走 dev 模式：`tauri.conf.json` 的 `beforeDevCommand` 为空，dev 只需 Vite + `tauri dev`，不涉及打包/安装与文件占用，取证最快；IPC、落盘、画布渲染这几条嫌疑路径在 dev 与发布版一致。发布版打包安装留作最终验收（任务 7）。
