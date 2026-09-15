# 分析报告 v2：用 agent 工具直接读写 / 调整 `.prg` 文件内容

> 变更：`file-content-io` · 更新：2026-09-15 · 性质：**只读分析 + 一次隔离实测（在临时副本上，未动用户原文件）**
> v1 的方向偏了（写成了「应用自身/AI 怎么读写文件」）。v2 按用户澄清重写：目标是**对 `.prg` 这种工程文件，用 agent 工具直接读内容、直接改内容**。

---

## 0. 结论（已实测，不是推测）

**能。** 仓库自带 CLI 工具集就是给 agent 用的 `.prg` 操作接口，本机已实测跑通「读内容 → 改内容 → 再读确认已落盘」：

```
STEP1  get_all_nodes   → {"objects":[ n1 "spring boot", n2 "容器", e1 n1→n2, n3 "新节点", e2 n1→n3 ]}
STEP2  edit_text_node  → {"success":true,"ref":"n3","text":"Agent直接改的内容","size":{"width":204,"height":76}}
STEP3  get_all_nodes   → n3 文本已变成 "Agent直接改的内容"，size 76→204（auto 宽度重算）
```

文件层面（副本）：`1399 B → 2284 B`，`stage.msgpack 1230 B → 1400 B`，最后写入时间变为本次操作时间。用户原文件**未被改动**（1399 B，时间戳仍是 2026-04-08 08:09:08）。

要跑通需要三条前置，缺一条就失败（我都踩过）：

|  #  | 前置                                                            | 不做会怎样                                                                                                                                                                          |
| :-: | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  1  | `PROJECT_GRAPH_OWNERSHIP_HELPER_PATH` 指向原生 ownership helper | `OWNERSHIP_HELPER_UNAVAILABLE`（`app/src/cli/OwnershipHelper.ts:101-105`；本机可用二进制＝`app/src-tauri/target/release/project-graph-ownership-helper.exe`，已存在，无需重新编译） |
|  2  | 老工程加 `--allow-upgrade`                                      | `PROJECT_UPGRADE_REQUIRED`（`app/src/cli/ClosedProjectInvocation.ts:284-289`；升级只在内存完成，`:290-300`）                                                                        |
|  3  | 改之前先跑一次会「分配引用」的工具（如 `get_all_nodes`）        | `unknown_ref`：`n1/n2` 这类引用不是文件里存的，是运行时分配后缓存的；直接拿上次会话的引用去改会找不到                                                                               |

---

## 1. 可直接照抄的操作方式

```powershell
# 0) 一次性设置（当前会话）
$env:PROJECT_GRAPH_OWNERSHIP_HELPER_PATH="D:\githup-workspace\project-graph\app\src-tauri\target\release\project-graph-ownership-helper.exe"
$prg="D:\Note\project-graph\【尚硅谷】spring-boot注解开发-2026年4月8日.prg"

# 1) 看有哪些工具（29 个）
pnpm cli -- tool list

# 2) 看某个工具怎么传参
pnpm cli -- tool describe edit_text_node

# 3) 读内容（顺带把引用分配好）
pnpm cli -- tool invoke get_all_nodes --project $prg --input "{}" --allow-upgrade

# 4) 改内容（PowerShell 里 JSON 要写成 \" 形式，否则报 INVALID_JSON）
$input='{\"ref\":\"n3\",\"data\":{\"text\":\"要写入的新文本\"}}'
pnpm cli -- tool invoke edit_text_node --project $prg --input $input --allow-upgrade

# 5) 复核
pnpm cli -- tool invoke get_all_nodes --project $prg --input "{}" --allow-upgrade
```

Windows 上的两个坑（实测）：

- **JSON 引号**：PowerShell 5.1 会把参数里的 `"` 吃掉 → `INVALID_JSON`。用上方 `\"` 转义写法（cmd.exe / bash 里则用单引号包 JSON）。
- **Node 版本**：CLI 声明要求 Node ≥ 26，本机是 v24.11.0，会打印 `Unsupported engine` 警告但**功能正常**。
- 单次调用约 40–70 秒（启动 + 加载运行时 + 升级），批量改多个节点时要注意这个成本。

---

## 2. 「直接改内容」的能力边界（29 个工具的实际覆盖）

| 能做                      | 工具                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 读全量对象 / 单个对象详情 | `get_all_nodes`、`get_object_details`、`get_children`、`get_parents`、`check_connections`、`search_text_nodes_by_regex`                              |
| 建节点                    | `create_text_node`、`generate_node_tree_by_text`（按缩进文本一次建整棵树）、`expand_node_tree_from_node`、`breadth_expand_node`、`depth_expand_node` |
| 改节点                    | `edit_text_node`（文本/颜色/宽度）、`edit_image_node`、`batch_change_color`                                                                          |
| 连线                      | `create_edges`、`change_edge_text`                                                                                                                   |
| 删                        | `delete_node`、`delete_nodes`、`delete_all_nodes`                                                                                                    |
| 排版                      | `auto_layout_dag`、（选中态）`sort_selected_nodes_by_x/y`                                                                                            |
| 图片                      | `search_and_add_image_node`、`recognize_image`                                                                                                       |
| 需工程处于打开态          | `get_selected_nodes/refs`、`delete_selected_nodes`、`sort_selected_*`、`get_nodes_in_viewport`、`select_objects` → 否则 `PROJECT_MUST_BE_OPEN`       |

**做不到的（缺口）**：

1. 没有「读/写任意文本文件」的通用工具，也没有「按文本批量替换节点内容」的工具——只能逐个 `edit_text_node`。
2. 没有「新建 `.prg`」的工具；工程必须先存在（空舞台也不行）。要凭空造，只能自己拼 ZIP+msgpack（配方见 §4）。
3. 桌面应用正打开该文件时（Open 项目）：改动只留在应用内存、**不落盘**；且此时 CLI 走桥接而不是直接写文件。
4. 写入会以「当前运行时 schema」重写整个容器（实测 stage.msgpack 变大、整体重打包），不是原地文本修改。

---

## 3. 为什么只能用 CLI（其它通道的定位）

| 通道                                           | 对 `.prg` 的读写                                                   | 说明                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI（本报告主路径）**                        | **读 + 改，已实测**                                                | `packages/project-graph-cli`（bin `cli`）→ `app/src/cli/ProjectGraphCli.ts`；工具面＝应用内 AI 同一份内置工具目录（`ProjectGraphCli.ts:4` 导入 `BuiltInToolCliAdapter`）；Closed 项目原子写（tmp+rename，`ClosedProjectFileSystemProvider.ts:52-78`） |
| 应用内 AI                                      | 能改，但只在该应用里                                               | 29 个内置工具经 `AIToolsAdapter`/`BuiltInToolRegistry` 暴露给模型；`BuiltInToolCapability` 白名单无文件类取值，所以它改的是「打开的工程」而不是磁盘文件                                                                                               |
| MCP                                            | 能读写任意本地文件                                                 | 但要挂外部 `@modelcontextprotocol/server-filesystem`（stdio），且需信任确认 + 每次审批；这是给「应用内 AI 写文本文件」用的，不是 `.prg` 语义接口                                                                                                      |
| 直接改仓库源码的 agent 工具（Read/Write/Edit） | 不适用                                                             | `.prg` 是 ZIP + msgpack 二进制，文本工具改不了                                                                                                                                                                                                        |
| 应用自身的文件抽象                             | `FileSystemProvider`（`app/src/core/interfaces/Service.tsx:9-17`） | 应用内部用；draft / collab 两个实现 `write` 直接抛错                                                                                                                                                                                                  |

---

## 4. `.prg` 文件格式（agent 要理解的事实）

ZIP 容器，条目固定（实测用户文件 4 个条目）：

| 条目                                            | 内容                         | 实测长度              |
| ----------------------------------------------- | ---------------------------- | --------------------- |
| `stage.msgpack`                                 | 舞台对象数组（节点 / 连线）  | 1230 B（改后 1400 B） |
| `tags.msgpack`                                  | 标签数组                     | 1 B                   |
| `reference.msgpack`                             | 反向引用 `{sections, files}` | 18 B                  |
| `metadata.msgpack`                              | `PrgMetadata`（含 version）  | 15 B                  |
| `README.md` / `attachments/*` / `thumbnail.png` | 可选                         | 本例无                |

- 写入唯一出口：`Project.getFileContent()`（`app/src/core/Project.tsx:375-411`），msgpack 编码 + `ZipWriter`，压缩级别必须 `level: 0`（`:381-383`），另会写附件与缩略图。
- 读取：`parseProjectFile`（`app/src/core/ProjectFile.ts:31-75`），`LATEST_PROJECT_VERSION = "2.7.0"`（`:7`）。
- 谁持有文件：Rust ownership 锁，锁文件在 `%APPDATA%\liren.project-graph\project-ownership\<sha256>.lock`（`app/src/cli/ProjectGraphAppDataPath.ts:27-59`）；被应用占用时操作会拿不到锁。

---

## 5. 待核验 / 风险

1. **升级副作用**：带 `--allow-upgrade` 的**写操作**会把老工程按新 schema 重写（不可逆的格式变化，内容是等价的）。本报告只在副本上做了写操作。用户原文件是否要升级，需用户决定。
2. **引用缓存**：引用快照不写进 `.prg`（实测 `reference.msgpack` 未变），存在应用数据目录——换机器/清缓存后需重跑一次分配引用的工具。
3. **并发**：应用开着该文件时 CLI 走桥接（改动不落盘）；建议操作前确认应用未打开目标文件。
4. `metadata.msgpack` 在写回后仍是 15 B，说明本次写回未改变 metadata 结构；多次调用可能每次都要 `--allow-upgrade`，未逐一验证。
5. Node 版本不满足声明要求（v24 < 26），仅警告；未在 Node 26 上回归。

---

## 6. 证据索引

| 主题                  | 位置                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| 实测命令与输出        | 本文 §0/§1（同轮终端记录）                                                                                   |
| CLI 入口与工具面      | `packages/project-graph-cli/package.json:6-8`、`app/src/cli/ProjectGraphCli.ts:4/21/81-82`                   |
| 引用/工具契约         | `docs/agents/cli.md:3-37`                                                                                    |
| ownership helper 解析 | `app/src/cli/OwnershipHelper.ts:101-105/205-244`                                                             |
| 升级判定              | `app/src/cli/ClosedProjectInvocation.ts:243-305`                                                             |
| 原子写                | `app/src/cli/ClosedProjectFileSystemProvider.ts:25-78`                                                       |
| 锁文件位置            | `app/src/cli/ProjectGraphAppDataPath.ts:27-59`                                                               |
| 容器读写              | `app/src/core/ProjectFile.ts:7-75`、`app/src/core/Project.tsx:375-411`                                       |
| 内置工具目录          | `app/src/core/service/dataManageService/aiEngine/BuiltInToolRegistry.ts:16-35/143-536`                       |
| 应用文件抽象          | `app/src/core/interfaces/Service.tsx:9-17` + `FileSystemProvider{File,Draft,Collab}.tsx`                     |
| MCP 通道              | `app/src/core/service/dataManageService/aiEngine/AIMCPConfig.ts:100`、`app/src-tauri/src/cmd/mcp.rs:219-245` |
