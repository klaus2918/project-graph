---
tasks:
  - id: 1
    title: "Canvas 监听器字段化，dispose() 中用同一引用解绑 window keydown/keyup/blur 与元素监听"
    status: done
    priority: high
    verify: auto
    end: ["pc"]
    depends: []
    usage_step: [1, 3]
  - id: 2
    title: "Controller.dispose() 修正解绑引用（注册与解绑使用同一份已绑定函数）"
    status: done
    priority: high
    verify: auto
    end: ["pc"]
    depends: []
    usage_step: [1]
  - id: 3
    title: "StageManager 暴露 O(1) 舞台版本号（索引重建 / 引用刷新时递增，读取时经廉价指纹保证新鲜）"
    status: done
    priority: high
    verify: auto
    end: ["pc"]
    depends: []
  - id: 4
    title: "OutlineWindow 去掉 300ms 全量 stageHash 轮询，改为比较舞台版本号后再 refresh"
    status: done
    priority: high
    verify: auto
    end: ["pc"]
    depends: [3]
    usage_step: [2, 3]
  - id: 5
    title: "回归用例：dispose 后监听器以同一引用被解绑、window 监听计数不随工程开关增长、版本号语义"
    status: done
    priority: high
    verify: auto
    end: ["pc"]
    depends: [1, 2, 3]
  - id: 6
    title: "核验 CollabTransport.pingTimer 与 MouseLocation.init() 是否漏清理/重复注册（是则修，否只记录）"
    status: done
    priority: medium
    verify: auto
    end: ["pc"]
    depends: []
  - id: 7
    title: "全量类型检查（type-check skill）+ 相关单测回归，回写 tasks 进度"
    status: done
    priority: high
    verify: auto
    end: ["pc"]
    depends: [4, 5, 6]
---

# 任务清单：当前环境卡死问题处理（env-hang）

方案见同目录 `plan.md`（长会话累积型退化 → 空闲后假死）。约束：`execution_mode: constrained`，`allow_commit: false` / `allow_push: false`（**执行期间未做任何 git 写操作**），未改交互行为与视觉设计、未改文件格式与备份语义。

## 执行记录（2026-09-15）

| #   | 结果                                    | 改动/证据                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ✅ 完成                                 | `app/src/core/stage/Canvas.tsx`：`keydown`/`keyup`/`blur`/`mousemove`/`focus` 处理器改为类字段（`handleMouseMove`/`handleFocus`/`handleWindowKeydown`/`handleWindowKeyup`/`handleWindowBlur`），`shouldRedirectKeyboardEvent()` 提为私有方法；`dispose()` 用同一引用 `removeEventListener` 后移除元素 |
| 2   | ✅ 完成                                 | `app/src/core/service/controlService/controller/Controller.tsx`：新增 `boundKeydown`…`boundPointerleave` 9 个已绑定字段，注册与 `dispose()` 全部改用它们（不再重新 `bind`）                                                                                                                           |
| 3   | ✅ 完成                                 | `app/src/core/stage/stageManager/StageObjectIndex.ts`：新增 `rebuildCount` / `revision`，`rebuild()` 内自增；`StageManager.tsx`：新增 `referenceRefreshCount` 与 `get stageRevision()`（= 引用刷新次数 + 索引重建次数，读取时经 `this.index` 确认新鲜度）                                             |
| 4   | ✅ 完成                                 | `app/src/sub/OutlineWindow.tsx`：300ms 轮询由 `project.stageHash` 改为 `project.stageManager.stageRevision`，不再为判重序列化整个舞台；`stageHash` 保留给分钟级自动备份                                                                                                                               |
| 5   | ✅ 完成                                 | 新增 `app/src/core/stage/Canvas.test.ts`（jsdom，2 用例：同一引用解绑 / 反复创建销毁后 window 监听净增为 0）；`StageManager.index.test.ts` 新增 5 用例（版本号稳定、add 后递增、绕过 StageManager 直接改数组也递增、批量作用域后可感知、删除后递增）                                                  |
| 6   | ✅ 完成（核验结果：均非泄漏，无需改动） | `CollabTransport.ts:89-95`：`ws.onclose` 中 `clearInterval(pingTimer)`，且 `connect()` 先 `disconnect()`；`MouseLocation.tsx:9` 的全局 `pointermove` 仅在 `main.tsx:118` 调用一次 `init()`，不随工程重复注册                                                                                          |
| 7   | ✅ 完成                                 | `pnpm --filter @graphif/project-graph type-check` 通过（exit 0）；`vitest run` 6 个相关文件 59 passed / 1 skipped；本次改动文件无新增 lint 问题（CRLF 报错为仓库既有环境现象，未改动文件 `app/src/core/Tab.tsx` 同样存在）                                                                            |

## 未做项（保持原样，已登记）

- 历史快照按字节裁剪（`StageHistoryManager` / `historySize` 默认 150）；
- `AIWindow` 每 300ms 的 `getSelectedEntities()` 轮询；
- Tauri 侧 `listen` / `unlisten` 配对核查；WebView2 自身内存行为；
- 上一轮排查发现的 `F1`（逐帧整表拷贝）/`F2`（`getConnectableEntity` 双份全量扫描）/`F3`（自动计算写入未批量化）微优化。
