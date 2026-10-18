---
tasks:
  - id: 1
    title: "取证：应用侧文件系统抽象与 .prg 容器读写链路"
    status: done
    priority: high
    type: analysis
    verify: auto
    end: ["pc"]
    depends: []
    usage_step: [1]

  - id: 2
    title: "取证：CLI 契约、工具面与落盘语义"
    status: done
    priority: high
    type: analysis
    verify: auto
    end: ["pc"]
    depends: []
    usage_step: [1, 2]

  - id: 3
    title: "取证：应用内 AI 内置工具与 MCP 通道定位"
    status: done
    priority: medium
    type: analysis
    verify: auto
    end: ["pc"]
    depends: []
    usage_step: [3]

  - id: 4
    title: "取证：仓库内置 agent 操作与 AGENTS.md 约束"
    status: done
    priority: low
    type: analysis
    verify: auto
    end: ["pc"]
    depends: []
    usage_step: [3]

  - id: 5
    title: "产出分析报告 v1（容器格式 / 各通道定位 / 证据索引）"
    status: done
    priority: medium
    type: doc
    verify: manual
    end: ["pc"]
    depends: [1, 2, 3, 4]
    usage_step: [1]

  - id: 6
    title: "需求再对齐：目标确认为「用 agent 工具直接读写 .prg 内容」"
    status: done
    priority: high
    type: analysis
    verify: manual
    end: ["pc"]
    depends: [5]
    usage_step: [1, 2]

  - id: 7
    title: "实测：以 CLI 工具对 .prg 副本执行 读 → 改 → 复核（含 ownership helper / --allow-upgrade / 引用分配三条前置）"
    status: done
    priority: high
    type: test
    verify: auto
    end: ["pc"]
    depends: [6]
    usage_step: [2]

  - id: 8
    title: "产出分析报告 v2（可照抄命令 + 能力边界 + 风险）并同步 plan.md"
    status: done
    priority: high
    type: doc
    verify: manual
    end: ["pc"]
    depends: [7]
    usage_step: [1, 2]

  - id: 9
    title: "复核 analysis.md §5 待核验项（升级副作用 / 引用缓存 / 并发写入 / Node 26 回归）"
    status: pending
    priority: medium
    type: analysis
    verify: manual
    end: ["pc"]
    depends: [8]
    usage_step: []

  - id: 10
    title: "待用户决定：是否封装更顺手的入口（脚本 / MCP / 应用内工具）及是否授权对真实 .prg 写入"
    status: pending
    priority: high
    type: decision
    verify: manual
    end: ["pc"]
    depends: [8]
    usage_step: [2]

  - id: 11
    title: "学习 29 个图操作工具并产出《Agent 操作手册》tools-playbook.md，含链式调用实测"
    status: done
    priority: high
    type: doc
    verify: manual
    end: ["pc"]
    depends: [8]
    usage_step: [1, 2]

  - id: 12
    title: "固化为仓库技能：.agents/skills/operate-prg-project/SKILL.md（并在 AGENTS.md 技能清单登记）"
    status: done
    priority: high
    type: doc
    verify: manual
    end: ["pc"]
    depends: [11]
    usage_step: [1, 2]

  - id: 13
    title: "纳入 op-skills 管理：skills/operate-prg-project/SKILL.md + registry.yaml 注册 + 治理名单/README/分类文档同步 + validate 与 java-fs validate-text 通过"
    status: done
    priority: high
    type: doc
    verify: auto
    end: ["pc"]
    depends: [11]
    usage_step: [1, 2]

  - id: 14
    title: "多端同步 + cc-switch 注册：sync-skills.ps1 建 Junction（claude/codex/opencode/cc-switch/zcode/commandcode，jcode 已就绪）+ -Register 写 cc-switch 表"
    status: done
    priority: medium
    type: ops
    verify: auto
    end: ["pc"]
    depends: [13]
    usage_step: []

  - id: 15
    title: "移除项目内副本（.agents/skills/operate-prg-project + AGENTS.md 登记行），单一事实源＝op-skills"
    status: done
    priority: medium
    type: doc
    verify: manual
    end: ["pc"]
    depends: [14]
    usage_step: []

  - id: 16
    title: "cc-switch 表补齐：注册 frontend-design / op-deploy-prep / op-knowledge / op-orchestrate（现 28 条，仓库有但未注册＝无）"
    status: done
    priority: medium
    type: ops
    verify: auto
    end: ["pc"]
    depends: [14]
    usage_step: []

  - id: 17
    title: "待用户定：① cc-switch 9 条表行的删法（无对应技能，op-skills 无反注册脚本）② 真实 .prg 写入授权 ③ G1 五问"
    status: pending
    priority: high
    type: decision
    verify: manual
    end: ["pc"]
    depends: [16]
    usage_step: []

  - id: 18
    title: "修复 skills/op-000/scripts/sync-skills.ps1 的宪法路径解析（$repoConstitution 按仓库根解析），消除各端『全局宪法链接异常』误报；两处校验均通过"
    status: done
    priority: medium
    type: fix
    verify: auto
    end: ["pc"]
    depends: [16]
    usage_step: []

  - id: 19
    title: "知识沉淀：proj-op-skills 文档 + 时间线条目 + 知识库提交（6b294aa，未 push）；提交前扫描与 validate-text 均通过"
    status: done
    priority: high
    type: doc
    verify: auto
    end: ["pc"]
    depends: [18]
    usage_step: []

  - id: 20
    title: "归档：暂缓（前置未满足——tasks #17 未决、plan.md confirmed=false、phase 仍为 plan、无 verify-log.md）"
    status: pending
    priority: high
    type: ops
    verify: manual
    end: ["pc"]
    depends: [19]
    usage_step: []

  - id: 21
    title: "清理各端悬空 Junction：6 端共 40 个指向已吸收旧技能（docx / skill-creator / writing-skills 等）的失效链接；复查剩余 0"
    status: done
    priority: medium
    type: ops
    verify: auto
    end: ["pc"]
    depends: [16]
    usage_step: []

  - id: 22
    title: "op-design-extract 正文修复：补项目级沉淀路径与 <project-slug> 占位说明；op-000-validate --full 两条错误清零并全量通过"
    status: done
    priority: medium
    type: fix
    verify: auto
    end: ["pc"]
    depends: [16]
    usage_step: []

  - id: 23
    title: "主仓库提交（safe-git-write 全流程）：op-skills 2f0cea8（8 文件）、project-graph 1e0bd948（6 文件）；均未 push"
    status: done
    priority: high
    type: ops
    verify: auto
    end: ["pc"]
    depends: [22]
    usage_step: []
---
