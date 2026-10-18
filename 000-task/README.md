# Project Graph 架构文档

> 本文档集由对仓库 `D:\githup-workspace\project-graph` 的完整源码分析生成，按模块拆分，用于快速理解系统设计与定位代码。
>
> 生成日期：2026-08-02（分析基于当前工作区源码，随代码演进可能需要更新）

## 文档索引

| 编号 | 文档                                                   | 内容                                                                                |
| ---- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 01   | [架构总览](01-架构总览.md)                             | 系统定位、技术栈、分层架构、启动流程、模块依赖、核心设计模式                        |
| 02   | [应用壳与全局状态](02-应用壳与全局状态.md)             | `main.tsx` 启动引导、`App.tsx` 窗口外壳、Jotai 全局状态、CLI 模式                   |
| 03   | [标签页与工程生命周期](03-标签页与工程生命周期.md)     | `Tab`/`Project`/`ComponentTab`、服务加载系统、`TabWorkspace` 布局树                 |
| 04   | [舞台数据模型](04-舞台数据模型.md)                     | `StageObject` 继承体系、实体/关联/碰撞箱、`StageManager` 及具体管理器、相机、历史   |
| 05   | [渲染系统](05-渲染系统.md)                             | Canvas2D 三层渲染器、SVG/DOM/3D 渲染、渲染循环与视口变换                            |
| 06   | [控制与交互服务](06-控制与交互服务.md)                 | 控制器体系、鼠标/触摸/键盘、快捷键、纯键盘引擎、框选、自动布局                      |
| 07   | [文件系统与工程文件格式](07-文件系统与工程文件格式.md) | FileSystemProvider 抽象、`.prg` ZIP+MsgPack 格式、序列化、自动保存/备份、深链       |
| 08   | [数据生成服务](08-数据生成服务.md)                     | 导入引擎、导出引擎、自动计算、从文件夹生成、截图/缩略图、文本导入                   |
| 09   | [数据管理服务](09-数据管理服务.md)                     | 内容搜索、复制/粘贴、拖文件入舞台、图像工具、复杂度检测、智能工具                   |
| 10   | [AI 引擎](10-AI引擎.md)                                | AI 对话、工具集、MCP 集成、Skills 系统、会话记忆、请求追踪                          |
| 11   | [扩展系统](11-扩展系统.md)                             | 扩展包格式、Worker + Comlink 运行时、Host API、扩展实体、快捷键、CLI 工具链         |
| 12   | [反馈表现与主题](12-反馈表现与主题.md)                 | 特效引擎、舞台样式、颜色管理、音效、主题系统                                        |
| 13   | [协作与云服务](13-协作与云服务.md)                     | 多人协作、协议/传输、stageMap 差分、认证、遥测、特性开关                            |
| 14   | [子窗口系统与 UI 组件](14-子窗口系统与UI组件.md)       | 自研子窗口/标签布局、子窗口清单、菜单/命令面板、Plate 编辑器、shadcn/ui             |
| 15   | [Rust / Tauri 层](15-Rust-Tauri层.md)                  | Rust 命令、Tauri 插件、能力配置、打包、CEF/移动端                                   |
| 16   | [共享包](16-共享包.md)                                 | `@graphif/serializer`、`@graphif/shapes`、`@graphif/data-structures`、`extprg` 系列 |
| 17   | [工程化与开发规范](17-工程化与开发规范.md)             | pnpm + Nx、脚本、Lint/Test/类型检查、i18n、Agent 约束                               |

## 一句话架构

Project Graph 是一个 **React (TypeScript) + Tauri (Rust)** 的桌面节点图工具。所有业务逻辑集中在前端，以“标签页（Tab）→ 工程（Project）→ 服务（Service）→ 舞台（Stage）→ 渲染（Renderer）”为骨架：

```text
React 外壳 (App / TabWorkspace / 子窗口)
        │
        ▼
Tab (标签页生命周期 + 服务容器 + rAF 循环)
        │
        ▼
Project (一个 .prg 工程 = 一个舞台 + 全部业务服务)
        │
        ├── StageObject[]（节点 / 连线 / 分组 / 笔迹）
        ├── StageManager（舞台操作集合）
        ├── Controller（输入交互）
        ├── Renderer（Canvas2D 渲染）
        └── Service 群（AI / 导入导出 / 协作 / 特效 …）
        │
        ▼
Rust / Tauri（文件系统、系统命令、MCP stdio、OCR、深链）
```

## 仓库目录速览

```text
project-graph/
├── app/                    # 主应用（Vite + React + Tauri）
│   ├── src/
│   │   ├── core/           # 核心业务：Tab/Project、stage、render、service、extension
│   │   ├── components/     # 业务组件 + shadcn/ui + Plate 编辑器插件
│   │   ├── sub/            # 子窗口（悬浮/停靠面板）
│   │   ├── locales/        # i18n（en/zh_CN/zh_TW 自动/zh_TWC/id）
│   │   ├── themes/         # 内置主题 YAML
│   │   ├── state.tsx       # Jotai 全局状态
│   │   └── utils/          # 工具函数
│   └── src-tauri/          # Rust 层（命令、插件、打包配置、vendor）
├── packages/               # 共享库：serializer / shapes / data-structures / extprg*
├── docs/                   # 设计文档（superpowers 计划/规格）
└── docs-pg/                # 产品图（架构图、继承体系、决策日志等，.prg/.svg）
```
