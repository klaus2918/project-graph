---
tasks:
  - id: 1
    title: "离线基准量化：serialize / msgpack.encode / zip / 附件 在 N=1k/5k/20k 上的分段耗时与体积，并确认 serialize 是否线性"
    status: done
    priority: high
    depends: []
    verify: auto
    end: ["pc"]
    design_tags: []
    design_contract: ""
    usage_step:
      ["仓库内用 vitest/node 跑基准（不启动 GUI）", "每段耗时 + serialize 后字节数 + zip 后字节数登记进 build-notes.md"]
  - id: 2
    title: "保存链路埋点：分段计时 + 规模口径（实体/关联/附件数、附件字节、zip 字节、最长主线程阻塞窗口），输出到应用缓存目录 save-timing.log 并弹对话框展示"
    status: done
    priority: high
    depends: [1]
    verify: auto
    end: ["pc"]
    design_tags: []
    design_contract: ""
    usage_step: ["单测覆盖计时汇总函数", "确认埋点仅在诊断期开启"]
  - id: 3
    title: "用户在大工程复现一次 Ctrl+S（含静置观察是否周期性冻结），agent 读取 save-timing.log 判定主导段"
    status: pending
    priority: high
    depends: [2]
    verify: manual
    end: ["pc"]
    design_tags: []
    design_contract: ""
    usage_step: ["打开较大 .prg", "按 Ctrl+S", "静置一段时间观察是否周期性无响应", "把日志交给 agent"]
  - id: 4
    title: "按数据定点削减：从候选清单（Worker 化 encode+zip / serialize 分片让出 / 附件增量 / 落盘分块 / stageRevision 替代 stageHash）选用手段，只动被证明为瓶颈的段"
    status: pending
    priority: high
    depends: [3]
    verify: auto
    end: ["pc"]
    design_tags: []
    design_contract: ""
    usage_step: ["确认目标段与预期收益后再改", "新增或更新单测覆盖新分支"]
  - id: 5
    title: "复测对比：同一工程、同一操作，改动前后数字对照写入 build-notes.md"
    status: pending
    priority: high
    depends: [4]
    verify: manual
    end: ["pc"]
    design_tags: []
    design_contract: ""
    usage_step: ["重跑离线基准", "用户再按一次 Ctrl+S 并读回日志"]
  - id: 6
    title: "埋点收敛（默认关闭或移除）+ type-check + 单测 + 改动文件 lint"
    status: pending
    priority: high
    depends: [5]
    verify: auto
    end: ["pc"]
    design_tags: []
    design_contract: ""
    usage_step: []
  - id: 7
    title: "用户在大工程上实测验收：Ctrl+S 期间可立即操作、可切换标签，最长无响应窗口低于约定阈值"
    status: pending
    priority: high
    depends: [6]
    verify: manual
    end: ["pc"]
    design_tags: []
    design_contract: ""
    usage_step: ["打开较大 .prg", "按 Ctrl+S", "立即切换标签并拖动画布，确认不再长时间无响应"]
---
