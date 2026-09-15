# 29 个图操作工具 · Agent 操作手册

> 变更：`file-content-io` · 2026-09-15 · 目的：让 agent（含本会话）**学会并会做**对这 29 个工具的调用，从而直接读写 `.prg` 工程内容。
> 依据：`BuiltInToolRegistry.ts:143-536`（定义与入参 schema）、`BuiltInToolExecutors.tsx`（执行语义，逐行读过）、实测（见 `analysis.md` §0）。
> **已纳入 op-skills 统一管理**：`D:\githup-workspace\op-skills\skills\operate-prg-project\SKILL.md`（已注册 `op-000/registry.yaml`、通过 op-000 校验与 java-fs validate-text，并同步 Junction 到 claude/codex/jcode/opencode/cc-switch/zcode/commandcode 七个端）；本手册为变更内留存版。项目内 `.agents/skills/` 副本已按用户决定移除。

---

## 0. 调用方式与环境

```powershell
$env:PROJECT_GRAPH_OWNERSHIP_HELPER_PATH="D:\githup-workspace\project-graph\app\src-tauri\target\release\project-graph-ownership-helper.exe"
$prg="<目标 .prg 绝对路径>"
pnpm cli -- tool list                                          # 29 个工具 + 入参 JSON Schema
pnpm cli -- tool describe <tool>                               # 单工具 schema
pnpm cli -- tool invoke <tool> --project $prg --input "{}" --allow-upgrade
```

- 一次调用 = 一个独立进程，**引用不跨调用保留**，所以「先读、后写」是硬规则。
- 成功：stdout 恰好一个 JSON；失败：stdout 空 + stderr 一个 `{code,message}`，退出码非 0。
- 单次 40–70 秒（启动 + 加载 + 升级），批量改多个节点要预算时间。
- PowerShell 5.1 里 JSON 必须转义成 `\"`，否则 `INVALID_JSON`；cmd/bash 用单引号。
- 目标文件被桌面应用打开时（Open Project）走桥接，**改动不落盘**；要落盘就关掉应用。

---

## 1. 心智模型

- 舞台 = 对象（`TextNode` / `ImageNode` / `Section`）+ 关联（`Edge` 连线）。
- **引用 `n1` / `e1` 是运行时分配的，不写在文件里**；`get_all_nodes` 等「返回引用」的工具会分配并缓存它们。
- 写操作走事务语义：`atomic`（删节点）/ `rollback-on-error`（改文本、改图片）/ `partial-success`（批量改色、建连线、扩展节点）/ `non-transactional`（建文本节点、自动排版）。
- Closed 项目：**执行成功后才落盘**（原子写：临时文件 + rename）。

---

## 2. 工具总览（29 个）

### 读（8）

| 工具                                       | 入参              | 返回                                                                     | 要点                           |
| ------------------------------------------ | ----------------- | ------------------------------------------------------------------------ | ------------------------------ |
| `get_all_nodes`                            | `{}`              | `{objects:[{ref,type,position,size,text?,color,sourceRef?,targetRef?}]}` | **万能入口**；顺带分配全部引用 |
| `get_object_details`                       | `{refs:[]}`       | 对象详情数组                                                             | 拿单个对象的完整信息           |
| `search_text_nodes_by_regex`               | `{regex}`         | `[{text,ref}]`                                                           | 文本节点正则搜索；会分配引用   |
| `get_children`                             | `{ref}`           | `[{text,ref}]`                                                           | 按连线取第一层子节点           |
| `get_parents`                              | `{ref}`           | `[{text,ref}]`                                                           | 按连线取父节点                 |
| `check_connections`                        | `{pairs:[[a,b]]}` | `[{fromRef,toRef,connected}]`                                            | 是否直接相连                   |
| `get_selected_nodes` / `get_selected_refs` | `{}`              | 选中对象详情 / 引用                                                      | **需 Open 工程**               |

### 建（5）

| 工具                         | 入参                                  | 返回                             | 要点                                                                                                         |
| ---------------------------- | ------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `create_text_node`           | `{text, color?, width?, sizeAdjust?}` | `{success,ref,size,sizeAdjust}`  | 落在**当前视野中心**；`width` 只能配 `sizeAdjust:"manual"`，manual 必须给 `width`；不填默认 auto             |
| `breadth_expand_node`        | `{ref, texts:[]}`                     | `{results:[{text,ref,success}]}` | 给源节点**批量加一层子节点**并在右侧 100px 排布（间距 60）+ 自动连线；**一次调用建多个**，比反复 create 划算 |
| `depth_expand_node`          | `{ref, texts:[]}`                     | `{results:[...]}`                | 从根节点**链式**建节点（间距 150）+ 依次连线；中途失败即停                                                   |
| `generate_node_tree_by_text` | `{text}`                              | 无返回                           | 按缩进（**每层 2 空格**）整棵树生成；不返回引用                                                              |
| `expand_node_tree_from_node` | `{ref, text}`                         | 导入结果                         | 在指定节点下按缩进文本生成子树                                                                               |

### 改（4）

| 工具                 | 入参                                                      | 返回                                     | 要点                                                                                                             |
| -------------------- | --------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `edit_text_node`     | `{ref, data:{text?,color?,width?,sizeAdjust?}}`           | `{success,ref,text,size,sizeAdjust}`     | 至少给一个字段，否则 `no_changes`；auto 模式会**重算尺寸**（实测宽度 76→204）；`width` 只能 manual；失败自动回滚 |
| `edit_image_node`    | `{ref, data:{displaySize?:{basis,value}, isBackground?}}` | `{success,ref,displaySize,isBackground}` | 缩放限 0.1–10 倍；`basis` = width/height/longest_edge                                                            |
| `batch_change_color` | `{refs:[], color:[R,G,B,A]}`                              | `{changedCount}`                         | 节点与连线都能改；A 为 0–1                                                                                       |
| `change_edge_text`   | `{edgeRef, text}`                                         | `{success}`                              | 改连线上的文字                                                                                                   |

### 连线（1）

| 工具           | 入参                                   | 返回                                              | 要点                                                                                 |
| -------------- | -------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `create_edges` | `{edges:[{sourceRef,targetRef,text}]}` | `[{sourceRef,targetRef,success,edgeRef?,error?}]` | **部分成功**：逐条独立，看每条的 `success`；`text` 是必填字段（不写内容也要传 `""`） |

### 删（4）

| 工具                    | 入参        | 返回                                         | 要点             |
| ----------------------- | ----------- | -------------------------------------------- | ---------------- |
| `delete_node`           | `{ref}`     | `{deletedNodeCount,deletedAssociationCount}` | 连带删掉其连线   |
| `delete_nodes`          | `{refs:[]}` | 同上                                         | 批量             |
| `delete_selected_nodes` | `{}`        | 同上                                         | **需 Open 工程** |
| `delete_all_nodes`      | `{}`        | `{deletedEntities,deletedAssociations}`      | 清空舞台         |

### 排版（3）

| 工具                                 | 入参                                  | 返回            | 要点                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto_layout_dag`                    | `{refs:[]}`（≥2）                     | `{success,...}` | 前置很硬：无重复引用、非 Section 的可连接节点、**同一父 Section 层级**、`refs` 内至少 1 条有向连线、整体构成 DAG；否则 `duplicate_refs`/`unsupported_node_type`/`mixed_containers`/`no_internal_edges`/`not_dag` |
| `sort_selected_nodes_by_x` / `_by_y` | `{current_order:[],desired_order:[]}` | —               | 按选中节点的文本顺序重排；两组元素必须完全一致；**需 Open 工程**                                                                                                                                                 |

### 图片（2）

| 工具                        | 入参                                              | 返回     | 要点                                                     |
| --------------------------- | ------------------------------------------------- | -------- | -------------------------------------------------------- |
| `search_and_add_image_node` | `{query, preferredOrientation?, maxDisplaySize?}` | —        | 联网搜 Openverse 并建 ImageNode；不返回 URL/附件 ID/坐标 |
| `recognize_image`           | `{ref, prompt}`                                   | 文字描述 | 需附件与模型能力；对 ImageNode 或含图的 Section          |

### 选中 / 视口（2）

`select_objects {refs, clearOthers}`（必填 `clearOthers`）、`get_nodes_in_viewport {}` —— 均**需 Open 工程**。

---

## 3. 推荐调用序列（照做即可）

### A. 改一个已有节点的文本（最短路径）

```
1) get_all_nodes  --input "{}"                        # 拿到 n? 引用
2) edit_text_node --input '{"ref":"n3","data":{"text":"新文本"}}'
3) get_all_nodes                                      # 复核
```

### B. 在一个节点下长出一棵子树（一次调用建多节点 + 连线）

```
1) get_all_nodes
2) breadth_expand_node --input '{"ref":"n1","texts":["A","B","C"]}'     # 一层子节点 + 自动连线
   或 depth_expand_node  --input '{"ref":"n1","texts":["A","B","C"]}'   # 链式
   或 expand_node_tree_from_node --input '{"ref":"n1","text":"A\n  A1\n  A2"}'  # 按缩进建树
3) auto_layout_dag --input '{"refs":["n1","n5","n6","n7"]}'              # 需要 ≥1 条内部连线
4) get_all_nodes                                                         # 复核
```

### C. 从零搭一小张图

```
1) get_all_nodes                                  # 分配引用（此时可能为空）
2) create_text_node --input '{"text":"根"}'        # 落视野中心，返回 ref
3) create_text_node --input '{"text":"子"}'        # 第二个会重叠，靠 4) 排版
4) create_edges     --input '{"edges":[{"sourceRef":"n1","targetRef":"n2","text":""}]}'
5) auto_layout_dag  --input '{"refs":["n1","n2"]}'
6) get_all_nodes
```

> 注意：`auto_layout_dag` 之后不要再用 `edit_text_node` 改宽度（会破坏排版），要么改完再排版。

### D. 批量改文字 + 改色

```
1) get_all_nodes                                  # 或 search_text_nodes_by_regex 缩小范围
2) 逐个 edit_text_node（没有批量替换工具，只能循环）
3) batch_change_color --input '{"refs":["n1","n2"],"color":[255,0,0,1]}'
```

---

## 4. 错误码速查

| 错误码                                                       | 含义 / 处理                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `OWNERSHIP_HELPER_UNAVAILABLE`                               | 没设 `PROJECT_GRAPH_OWNERSHIP_HELPER_PATH` 或路径不对                                             |
| `PROJECT_UPGRADE_REQUIRED`                                   | 旧 schema，加 `--allow-upgrade`                                                                   |
| `PROJECT_VERSION_UNSUPPORTED`                                | 工程版本比运行时新（用新版应用）                                                                  |
| `unknown_ref`（details.ref）                                 | 引用不存在/已失效——先跑 `get_all_nodes` 重新分配                                                  |
| `PROJECT_MUST_BE_OPEN`                                       | 该工具需要应用打开此工程（选中/视口类）                                                           |
| `PROJECT_BUSY` / `PROJECT_NOT_FOUND` / `PROJECT_LOAD_FAILED` | 被其他进程持有 / 文件不存在 / 解析失败                                                            |
| `INVALID_JSON`                                               | `--input` 不是合法 JSON（PowerShell 引号没转义）                                                  |
| `INVALID_COMMAND`                                            | 参数顺序错：`tool invoke <tool> --project <path> --input <JSON> [--allow-upgrade]`                |
| `CANCELLED`                                                  | SIGINT/SIGTERM，退出码 130，Closed 项目不会留下半成品                                             |
| 工具内错误                                                   | `wrong_node_type`、`no_changes`、`invalid_size_mode`、`missing_width`、`not_dag` 等（见各工具行） |

---

## 5. 已知限制（能力缺口）

1. 无「通用文本文件读写」工具；无「按文本批量替换节点内容」——只能逐条 `edit_text_node`。
2. 无「新建 `.prg`」工具：工程必须先存在（要么应用里新建，要么自己拼 ZIP+msgpack）。
3. 写操作会按当前 schema **整体重打包**容器（不可逆格式升级）；操作前请备份。
4. `create_text_node` 落点是「视野中心」，Closed 项目下多次创建会叠在一起，需靠 `auto_layout_dag` / `breadth_expand_node` 定位。
5. 选中类 / 视口类工具在 Closed 项目下不可用（选它是 Open 才有意义）。
