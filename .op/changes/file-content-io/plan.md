---
change: file-content-io
type: feature
phase: plan
confirmed: false
confirmed_at: null
execution:
  allow_commit: false
  allow_push: false
  use_worktree: false
  browser_verification: none
  browser_screenshot_read: false
  parallel_mode: serial
  knowledge_search: true
  design_extract: off
---

# 方案：用 agent 工具直接读写 / 调整 `.prg` 工程文件内容

## 使用故事

1. 作为笔记库维护者，我要**不打开 Project Graph**，直接用 agent 工具读取 `D:\Note\project-graph\*.prg` 里的节点与连线内容。
2. 作为同一角色，我要让 agent 工具**直接写入**这些工程文件的内容（改文字、建节点、连线、删节点），改完落盘、可复核。
3. 作为在本仓库工作的编码 Agent，我要知道这条链路的前置条件（ownership helper、`--allow-upgrade`、引用分配）和参数坑（PowerShell JSON 引号），一次就能跑通。

## 方案概述

- 目标：打通并**实测**「agent 工具直接读写 `.prg` 内容」，把可用命令、前置条件、能力边界与风险写成文档。
- 主路径：仓库自带 CLI 工具集（`pnpm cli -- tool …`，29 个工具，同一份内置工具目录）。
- 交付物：`.op/changes/file-content-io/analysis.md`（v2，已产出）+ 本次实测记录（读 → 改 → 复核，含文件字节变化）。
- 边界：**不改任何源码 / 依赖 / 配置，不跑 build**；实测在系统临时目录的副本上进行，**不改动用户原始 `.prg`**。

## 关键决策

1. **主路径＝CLI 工具集**，不是 MCP。理由：CLI 的 29 个工具就是 `.prg` 语义接口（节点/连线/文本），且已实测可写；MCP 是「让应用内 AI 读写任意本地文件」的通道，和 `.prg` 语义无关。
2. **实测在副本上做**：复制用户文件到系统临时目录后再读写，避免未经许可改动用户笔记（实测后原文件字节数与时间戳均未变化）。
3. **明确三条前置**：ownership helper 路径（`PROJECT_GRAPH_OWNERSHIP_HELPER_PATH`）、`--allow-upgrade`、改之前先跑一次分配引用的工具。三条缺一即失败，均已在文档中写清现象。
4. **如实写出缺口**：没有通用文本文件读写工具、不能新建 `.prg`、Open 项目不落盘、写操作会按新 schema 重写整个容器。

## 阻塞项

G1 六问（按 op-plan §3）：

|  #  | 问题             | 状态             | 值 / 建议值                                                                                                                    |
| :-: | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
|  1  | 目标与成功标准   | 已答（本轮澄清） | 用 agent 工具直接读、直接改 `.prg` 文件内容；标准＝命令可复现、改动可复核                                                      |
|  2  | 边界与「不做项」 | **未答**         | 建议：只读分析 + 副本实测；不改源码 / 依赖 / 配置；不 build；不动用户原文件                                                    |
|  3  | 反例 / 失败场景  | **未答**         | 建议：报 `OWNERSHIP_HELPER_UNAVAILABLE` / `PROJECT_UPGRADE_REQUIRED` / `unknown_ref` / `INVALID_JSON` 即失败（四类现象已记录） |
|  4  | 验收口径         | **未答**         | 建议：由用户按 analysis.md §1 跑一遍读 + 一次改，确认结果符合预期                                                              |
|  5  | 影响面           | **未答**         | 建议：仅变更目录内文档；如后续对真实 `.prg` 操作，影响面＝目标工程文件本身（写操作会重打包容器）                               |
|  6  | 回滚方式         | **未答**         | 建议：文档变更删除即可；对 `.prg` 的写操作回滚＝用同目录 `{文件名}_backup_{时间戳}.prg` 或操作前自己复制备份                   |

新增待决项（本轮浮现）：是否要把这套操作封装成更顺手的入口（例如仓库内脚本 / MCP server / 应用内工具），以及是否授权对**真实** `.prg` 执行写操作。

## 术语表（G2）

| 术语                  | 含义                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `.prg`                | Project Graph 工程文件：ZIP 容器，内含 `stage/tags/reference/metadata.msgpack`（+ 可选 README/附件/缩略图） |
| agent 工具            | 这里的 29 个内置工具（节点/连线/文本/颜色/布局/图片/选择/视口），经 CLI 或应用内 AI 调用                    |
| Closed / Open Project | CLI 术语：未被应用打开（直接读写磁盘文件） / 已被应用打开（改动只留内存，不落盘）                           |
| ownership helper      | Rust 侧文件锁助手进程，CLI 直接操作 `.prg` 的前提                                                           |
| 引用（ref）           | `n1` / `e1` 这类运行时对象引用，非持久化在文件内，需先分配                                                  |

## 验证策略（G3）

- 档位：**人工验证**（本轮已由 agent 在副本上完成一次端到端实测，用户可按命令复现）。
- 核验点：① `tool list` 出 29 个工具；② `get_all_nodes` 能读出该 `.prg` 的 5 个对象；③ `edit_text_node` 后再次 `get_all_nodes` 能看到新文本；④ 原文件字节数与时间戳不变（只在副本上写）。
- 未验证项见 analysis.md §5，不得当作结论引用。

## 方案自检（G4）

1. **假设清单**：① 假设用户要的是「磁盘上的 `.prg` 文件」而非「应用内打开的工程」；② 假设本机 `target/release/project-graph-ownership-helper.exe` 属于本仓库同一构建产物。两项均已用实测行为印证，但仍属假设。
2. **遗漏场景**：应用正打开目标文件（Open 项目不落盘）、引用缓存在应用数据目录、Node 版本不满足声明要求——已登记在 §5。
3. **前后矛盾**：v1 结论「应用内 AI 无文件能力、只能靠 MCP」与「CLI 可写 `.prg`」不矛盾（分属应用内 AI 与外部 agent 两条通道），v2 已分别限定。
4. **术语一致性**：统一使用「agent 工具」「引用」「Closed/Open Project」「ownership helper」。
5. **外部依赖**：无新增外部依赖；MCP 方案仍属仓库外 npx 包（本次未采用）。
6. **回退路径**：文档删除即回退；对 `.prg` 的写操作以副本/备份为回退手段。
