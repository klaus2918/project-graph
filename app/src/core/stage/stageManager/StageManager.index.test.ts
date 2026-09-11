// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

/**
 * 舞台对象层用一套最小类层级替代。
 * 原因：真实的 TextNode / Section 会经 Renderer → KeyBindsUI → shortcutKeysRegister
 * 拉进整个 UI 依赖树（含 CSS import、Tauri API），在 jsdom 单测环境不可用。
 * 这里只需要“类型层级 + uuid + 几何字段”，算法本身与具体类实现无关。
 */
const stageObjects = vi.hoisted(() => {
  class StageObject {}
  class Entity extends StageObject {}
  class ConnectableEntity extends Entity {}
  class Association extends StageObject {}
  class ConnectableAssociation extends Association {
    associationList: ConnectableEntity[] = [];
    get source(): ConnectableEntity {
      return this.associationList[0];
    }
    set source(value: ConnectableEntity) {
      this.associationList[0] = value;
    }
    get target(): ConnectableEntity {
      return this.associationList[1];
    }
    set target(value: ConnectableEntity) {
      this.associationList[1] = value;
    }
  }
  class Edge extends ConnectableAssociation {}
  class LineEdge extends Edge {
    private _shiftingIndex = 0;
    uuid: string = crypto.randomUUID();
    unknown = false;
    sourceRectangleRate = Vector.getZero();
    targetRectangleRate = Vector.getZero();
    // 真实构造签名是 (project, options)；这里只需要接住端点列表与端点比率，让 updateReferences 能读到
    constructor(
      _project?: unknown,
      options?: { associationList?: ConnectableEntity[]; sourceRectangleRate?: Vector; targetRectangleRate?: Vector },
    ) {
      super();
      if (options?.associationList) {
        this.associationList = options.associationList;
      }
      if (options?.sourceRectangleRate) {
        this.sourceRectangleRate = options.sourceRectangleRate;
      }
      if (options?.targetRectangleRate) {
        this.targetRectangleRate = options.targetRectangleRate;
      }
    }
    get shiftingIndex(): number {
      return this._shiftingIndex;
    }
    set shiftingIndex(value: number) {
      this._shiftingIndex = value;
    }
  }
  class CubicCatmullRomSplineEdge extends Edge {}
  class ArcEdge extends Edge {}
  class MultiTargetUndirectedEdge extends ConnectableAssociation {}
  class SyncAssociation extends Association {}
  class Section extends ConnectableEntity {
    uuid: string = crypto.randomUUID();
    children: Entity[] = [];
    text = "";
    isCollapsed = false;
    locked = false;
    moveToCalls: unknown[] = [];
    adjustLocationAndSize() {}
    adjustChildrenStateByCollapse() {}
    moveTo(location: unknown) {
      this.moveToCalls.push(location);
    }
    rename(text: string) {
      this.text = text;
    }
    constructor(_project?: unknown, options?: { text?: string; children?: Entity[] }) {
      super();
      if (options?.text !== undefined) {
        this.text = options.text;
      }
      if (options?.children) {
        this.children = options.children;
      }
    }
  }
  class TextNode extends ConnectableEntity {
    uuid: string = crypto.randomUUID();
    text = "";
    collisionBox!: CollisionBox;
    moveToCalls: unknown[] = [];
    forceAdjustSizeCalls = 0;
    moveTo(location: unknown) {
      this.moveToCalls.push(location);
    }
    forceAdjustSizeByText() {
      this.forceAdjustSizeCalls++;
    }
    rename(text: string) {
      this.text = text;
    }
    constructor(
      _project?: unknown,
      options?: { uuid?: string; text?: string; collisionBox?: unknown; color?: unknown; details?: unknown },
    ) {
      super();
      if (options?.uuid) {
        this.uuid = options.uuid;
      }
      if (options?.text !== undefined) {
        this.text = options.text;
      }
      if (options?.collisionBox) {
        this.collisionBox = options.collisionBox as never;
      }
    }
  }
  class ImageNode extends ConnectableEntity {
    isBackground = false;
  }
  class ConnectPoint extends ConnectableEntity {}
  class UrlNode extends ConnectableEntity {}
  class SvgNode extends ConnectableEntity {}
  class LatexNode extends ConnectableEntity {}
  class PenStroke extends Entity {}
  return {
    StageObject,
    Entity,
    ConnectableEntity,
    Association,
    ConnectableAssociation,
    Edge,
    LineEdge,
    CubicCatmullRomSplineEdge,
    ArcEdge,
    MultiTargetUndirectedEdge,
    SyncAssociation,
    Section,
    TextNode,
    ImageNode,
    ConnectPoint,
    UrlNode,
    SvgNode,
    LatexNode,
    PenStroke,
  };
});

vi.mock("@/core/Project", () => ({
  Project: class Project {},
  ProjectState: { Saved: "saved", Unsaved: "unsaved" },
  service: (id: string) => (target: { id?: string }) => {
    target.id = id;
    return target;
  },
}));
vi.mock("@/core/service/Settings", () => ({ Settings: { showDebug: false } }));
vi.mock("@/core/service/feedbackService/SoundService", () => ({
  SoundService: { play: { associationAdjustSoundFile() {} } },
}));
vi.mock("@/core/service/feedbackService/effectEngine/concrete/EntityShrinkEffect", () => ({
  EntityShrinkEffect: class EntityShrinkEffect {},
}));
vi.mock("@/core/service/feedbackService/effectEngine/concrete/PenStrokeDeletedEffect", () => ({
  PenStrokeDeletedEffect: class PenStrokeDeletedEffect {},
}));
vi.mock("sonner", () => ({ toast: { error() {}, warning() {} } }));
// TreeImporter 用到 MonoStack（@graphif/data-structures 真实实现可用），但它的 import 语句
// 会被 vitest 正常解析；这里只屏蔽会牵出 UI 依赖的模块。
vi.mock("@/core/service/dataGenerateService/stageImportEngine/BaseImporter", () => ({
  BaseImporter: class BaseImporter {
    constructor(protected readonly project: unknown) {}
  },
}));
// DetailsManager 会经 platejs 拉入整套编辑器依赖，单测环境不可用；导入器测试只关心节点/连线数量
vi.mock("@/core/stage/stageObject/tools/entityDetailsManager", () => ({
  DetailsManager: {
    markdownToDetails: (text: string) => [{ type: "p", children: [{ text }] }],
    detailsToMarkdown: () => "",
    mergeDetails: (list: unknown[]) => list,
  },
}));

vi.mock("@/core/stage/stageObject/abstract/StageObject", () => ({ StageObject: stageObjects.StageObject }));
vi.mock("@/core/stage/stageObject/abstract/StageEntity", () => ({ Entity: stageObjects.Entity }));
vi.mock("@/core/stage/stageObject/abstract/ConnectableEntity", () => ({
  ConnectableEntity: stageObjects.ConnectableEntity,
}));
vi.mock("@/core/stage/stageObject/abstract/Association", () => ({
  Association: stageObjects.Association,
  ConnectableAssociation: stageObjects.ConnectableAssociation,
}));
vi.mock("@/core/stage/stageObject/association/Edge", () => ({ Edge: stageObjects.Edge }));
vi.mock("@/core/stage/stageObject/association/LineEdge", () => ({ LineEdge: stageObjects.LineEdge }));
vi.mock("@/core/stage/stageObject/association/CubicCatmullRomSplineEdge", () => ({
  CubicCatmullRomSplineEdge: stageObjects.CubicCatmullRomSplineEdge,
}));
vi.mock("@/core/stage/stageObject/association/ArcEdge", () => ({ ArcEdge: stageObjects.ArcEdge }));
vi.mock("@/core/stage/stageObject/association/MutiTargetUndirectedEdge", () => ({
  MultiTargetUndirectedEdge: stageObjects.MultiTargetUndirectedEdge,
}));
vi.mock("@/core/stage/stageObject/association/SyncAssociation", () => ({
  SyncAssociation: stageObjects.SyncAssociation,
}));
vi.mock("@/core/stage/stageObject/entity/Section", () => ({ Section: stageObjects.Section }));
vi.mock("@/core/stage/stageObject/entity/TextNode", () => ({ TextNode: stageObjects.TextNode }));
vi.mock("@/core/stage/stageObject/entity/ImageNode", () => ({ ImageNode: stageObjects.ImageNode }));
vi.mock("@/core/stage/stageObject/entity/ConnectPoint", () => ({ ConnectPoint: stageObjects.ConnectPoint }));
vi.mock("@/core/stage/stageObject/entity/UrlNode", () => ({ UrlNode: stageObjects.UrlNode }));
vi.mock("@/core/stage/stageObject/entity/SvgNode", () => ({ SvgNode: stageObjects.SvgNode }));
vi.mock("@/core/stage/stageObject/entity/LatexNode", () => ({ LatexNode: stageObjects.LatexNode }));
vi.mock("@/core/stage/stageObject/entity/PenStroke", () => ({ PenStroke: stageObjects.PenStroke }));

import { CollisionBox } from "@/core/stage/stageObject/collisionBox/collisionBox";
import { ConnectNodeSmartTools } from "@/core/service/dataManageService/connectNodeSmartTools";
import { GraphImporter } from "@/core/service/dataGenerateService/stageImportEngine/GraphImporter";
import { MarkdownImporter } from "@/core/service/dataGenerateService/stageImportEngine/MarkdownImporter";
import { MermaidImporter } from "@/core/service/dataGenerateService/stageImportEngine/MermaidImporter";
import { TreeImporter } from "@/core/service/dataGenerateService/stageImportEngine/TreeImporter";
import { Vector } from "@graphif/data-structures";
import { Rectangle } from "@graphif/shapes";
import { StageManager } from "./StageManager";
import { NodeConnector } from "./concreteMethods/StageNodeConnector";
import { StageObjectIndex } from "./StageObjectIndex";

type FakeNode = InstanceType<typeof stageObjects.TextNode> & {
  uuid: string;
  unknown: boolean;
  isSelected: boolean;
  parentSection: unknown;
  sectionDepth: number;
  nearestLockedAncestorSection: unknown;
  isHiddenBySectionCollapse: boolean;
  collisionBox: CollisionBox;
};

/** 用 Object.create 造“没有构造函数副作用”的实例，instanceof 判定仍然成立 */
function fakeNode(uuid: string, ctor: { prototype: object } = stageObjects.TextNode): FakeNode {
  const node = Object.create(ctor.prototype) as FakeNode;
  node.uuid = uuid;
  node.unknown = false;
  node.isSelected = false;
  node.parentSection = null;
  node.sectionDepth = 0;
  node.nearestLockedAncestorSection = null;
  node.isHiddenBySectionCollapse = false;
  node.collisionBox = new CollisionBox([new Rectangle(Vector.getZero(), Vector.same(10))]);
  return node;
}

function fakeSection(uuid: string) {
  const section = fakeNode(uuid, stageObjects.Section) as FakeNode & { children: unknown[] };
  section.children = [];
  return section;
}

function fakeEdge(uuid: string, source: FakeNode, target: FakeNode, unknown = false) {
  const edge = Object.create(stageObjects.LineEdge.prototype) as InstanceType<typeof stageObjects.LineEdge> & {
    uuid: string;
    unknown: boolean;
    sourceRectangleRate: Vector;
    targetRectangleRate: Vector;
  };
  edge.uuid = uuid;
  edge.unknown = unknown;
  // 记录端点读取次数：旧实现是“实体 × 关系”二重循环，每次都会读 edge.source，
  // 因此读取次数会随规模平方级增长。用作不依赖计时的复杂度回归信号。
  const associationList: unknown[] = [source, target];
  let sourceReadCount = 0;
  let targetReadCount = 0;
  Object.defineProperty(edge, "sourceReadCount", {
    configurable: true,
    get: () => sourceReadCount,
  });
  Object.defineProperty(edge, "targetReadCount", {
    configurable: true,
    get: () => targetReadCount,
  });
  Object.defineProperty(edge, "source", {
    configurable: true,
    get() {
      sourceReadCount++;
      return associationList[0];
    },
    set(value: unknown) {
      associationList[0] = value;
    },
  });
  Object.defineProperty(edge, "target", {
    configurable: true,
    get() {
      targetReadCount++;
      return associationList[1];
    },
    set(value: unknown) {
      associationList[1] = value;
    },
  });
  edge.sourceRectangleRate = Vector.same(0.5);
  edge.targetRectangleRate = Vector.same(0.5);
  return edge as typeof edge & { sourceReadCount: number; targetReadCount: number };
}

/**
 * 历史管理器桩：与真实 HistoryManager 语义一致——
 * 作用域内 recordStep 只挂起，退出时合并为一条；作用域外立即记录。
 */
function createHistoryStub() {
  let depth = 0;
  let pending = false;
  const recordStepCalls: number[] = [];
  return {
    recordStep: () => {
      if (depth > 0) {
        pending = true;
        return;
      }
      recordStepCalls.push(1);
    },
    runHistoryBatch: <T>(operation: () => T): T => {
      if (depth > 0) return operation();
      depth++;
      try {
        return operation();
      } finally {
        depth--;
        if (pending) {
          pending = false;
          recordStepCalls.push(1);
        }
      }
    },
    get recordStepCount() {
      return recordStepCalls.length;
    },
  };
}

function createManager() {
  const historyBatchCalls: number[] = [];
  const recordStepCalls: number[] = [];
  const historyStub = createHistoryStub();
  const project = {
    stage: [] as unknown[],
    stageManager: undefined as unknown,
    historyManager: {
      recordStep: () => {
        recordStepCalls.push(1);
        historyStub.recordStep();
      },
      runHistoryBatch: <T>(operation: () => T): T => {
        historyBatchCalls.push(1);
        return historyStub.runHistoryBatch(operation);
      },
    },
  };
  const manager = new StageManager(project as never);
  project.stageManager = manager;
  return { manager, project, historyBatchCalls, recordStepCalls };
}

describe("StageObjectIndex", () => {
  it("按类型分桶，并保持 uuid 首次出现优先", () => {
    const index = new StageObjectIndex();
    const first = fakeNode("dup");
    const second = fakeNode("dup");
    const section = fakeSection("section-1");
    const edge = fakeEdge("edge-1", first, section as FakeNode);

    index.ensure([first, section, edge, second] as never);

    expect(index.textNodes).toEqual([first, second]);
    expect(index.sections).toEqual([section]);
    expect(index.entities).toEqual([first, section, second]);
    expect(index.associations).toEqual([edge]);
    expect(index.lineEdges).toEqual([edge]);
    expect(index.connectableEntities).toEqual([first, section, second]);
    expect(index.byUuid.get("dup")).toBe(first);
  });

  it("中间元素被原地替换（长度与首尾都不变）时索引也会重建", () => {
    const index = new StageObjectIndex();
    const a = fakeNode("a");
    const b = fakeNode("b");
    const b2 = fakeNode("b2");
    const c = fakeNode("c");
    const stage = [a, b, c];
    index.ensure(stage as never);
    expect(index.byUuid.has("b")).toBe(true);

    // 只替换中间元素：长度 3、首尾引用都没变，仅靠“首尾指纹”会漏检
    stage[1] = b2;
    index.ensure(stage as never);

    expect(index.byUuid.has("b")).toBe(false);
    expect(index.byUuid.get("b2")).toBe(b2);
    expect(index.textNodes).toEqual([a, b2, c]);
  });

  it("在数组被 push / splice / 整体替换后自动重建", () => {
    const index = new StageObjectIndex();
    const a = fakeNode("a");
    const b = fakeNode("b");
    const stage = [a];

    index.ensure(stage as never);
    expect(index.textNodes).toEqual([a]);

    stage.push(b);
    index.ensure(stage as never);
    expect(index.textNodes).toEqual([a, b]);

    stage.splice(0, 1);
    index.ensure(stage as never);
    expect(index.textNodes).toEqual([b]);
    expect(index.byUuid.has("a")).toBe(false);

    // 整个数组被替换（例如撤销/重做、协作快照回放）时也要重建
    const replaced = [a];
    index.ensure(replaced as never);
    expect(index.textNodes).toEqual([a]);
  });
});

describe("GraphImporter 批量导入（端到端）", () => {
  it("解析关系行时逐条插入也只刷新一次引用", () => {
    const { manager, project } = createManager();
    const mutable = project as unknown as Record<string, unknown>;
    mutable.nodeConnector = new NodeConnector(mutable as never);
    mutable.historyManager = createHistoryStub();

    const spy = vi.spyOn(manager, "updateReferences");
    new GraphImporter(mutable as never).import(["A --> B", "B -标签-> C", "D"].join("\n"));

    // A、B、C、D 四个节点 + 两条连线
    expect(manager.getTextNodes().length).toBe(4);
    expect(manager.getLineEdges().length).toBe(2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("解析出错时不吞异常，且已插入内容保留在舞台上（部分导入语义）", () => {
    const { manager, project } = createManager();
    const mutable = project as unknown as Record<string, unknown>;
    mutable.nodeConnector = new NodeConnector(mutable as never);
    mutable.historyManager = createHistoryStub();

    const importer = new GraphImporter(mutable as never);
    expect(() => importer.import(["A --> B", "A --> B --> C"].join("\n"))).toThrow("应该只有两个名称");

    // 第一行已插入的内容保留（与批量化之前一致）
    expect(manager.getTextNodes().length).toBe(2);
    expect(manager.getLineEdges().length).toBe(1);
  });
});

describe("MarkdownImporter 批量导入（端到端）", () => {
  it("按标题层级建节点树并只刷新一次引用", () => {
    const { manager, project } = createManager();
    const mutable = project as unknown as Record<string, unknown>;
    const layoutCalls: unknown[] = [];
    mutable.autoAlign = {
      autoLayoutSelectedFastTreeMode: (root: unknown) => layoutCalls.push(root),
    };
    mutable.historyManager = createHistoryStub();

    const spy = vi.spyOn(manager, "updateReferences");
    new MarkdownImporter(mutable as never).import(["# 一级", "## 二级", "### 三级"].join("\n"));

    // root + 三个标题节点
    expect(manager.getTextNodes().length).toBe(4);
    // root→一级、一级→二级、二级→三级 共三条连线（与 TreeImporter 一致，root 也是父亲）
    expect(manager.getLineEdges().length).toBe(3);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(layoutCalls.length).toBe(1);
  });
});

describe("MermaidImporter 批量导入（端到端）", () => {
  function createMermaidProject() {
    const { manager, project } = createManager();
    const mutable = project as unknown as Record<string, unknown>;
    mutable.nodeConnector = new NodeConnector(mutable as never);
    mutable.historyManager = createHistoryStub();
    mutable.sectionInOutManager = {
      attachEntityToSection: (child: FakeNode, section: FakeNode & { children: unknown[] }) => {
        if (!section.children.includes(child)) {
          section.children.push(child);
        }
      },
    };
    return { manager, mutable };
  }

  it("subgraph 嵌套时先建好 Section 树再布局，全程只刷新两次引用", () => {
    const { manager, mutable } = createMermaidProject();
    const spy = vi.spyOn(manager, "updateReferences");

    new MermaidImporter(mutable as never).import(
      ["graph TD", "subgraph 组A", "A[节点A]", "end", "B[节点B]", "A --> B"].join("\n"),
    );

    // 组A 是 Section，A、B 是文本节点
    expect(manager.getSections().length).toBe(1);
    expect(manager.getTextNodes().length).toBe(2);
    expect(manager.getLineEdges().length).toBe(1);
    // 布局阶段需要看到 Section 树，因此批量插入后、布局前过一次引用（这就是本用例要锁定的行为）
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("平铺节点只刷新一次引用", () => {
    const { manager, mutable } = createMermaidProject();
    const spy = vi.spyOn(manager, "updateReferences");

    new MermaidImporter(mutable as never).import(["graph TD", "A[节点A] --> B[节点B]"].join("\n"));

    expect(manager.getTextNodes().length).toBe(2);
    expect(manager.getLineEdges().length).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("StageManager 索引与引用刷新", () => {
  it("updateReferences 仍能把 unknown 占位边解析为真实实体", () => {
    const { manager } = createManager();
    const real = fakeNode("node-1");
    manager.add(real as never, true);

    const placeholder = fakeNode("node-1");
    placeholder.unknown = true;
    const edge = fakeEdge("edge-1", placeholder, real, true);

    manager.add(edge as never, true);
    expect(edge.source).toBe(placeholder);

    manager.updateReferences();
    expect(edge.source).toBe(real);
  });

  it("按 uuid 查询、存在性判断与类型查询保持一致", () => {
    const { manager } = createManager();
    const node = fakeNode("n1");
    const section = fakeSection("s1");
    const edge = fakeEdge("e1", node, section as FakeNode);
    manager.add(node as never, true);
    manager.add(section as never, true);
    manager.add(edge as never, true);

    expect(manager.get("n1")).toBe(node);
    expect(manager.get("missing")).toBeUndefined();
    expect(manager.isEntityExists("n1")).toBe(true);
    expect(manager.isEntityExists("missing")).toBe(false);
    expect(manager.contains(node as never)).toBe(true);
    expect(manager.getTextNodeByUUID("n1")).toBe(node);
    expect(manager.getTextNodeByUUID("s1")).toBeNull();
    expect(manager.getConnectableEntityByUUID("n1")).toBe(node);
    expect(manager.getSections()).toEqual([section]);
    expect(manager.getLineEdges()).toEqual([edge]);
    expect(manager.isSectionByUUID("s1")).toBe(true);
    expect(manager.getEntitiesByUUIDs(["n1", "s1"])).toEqual([node, section]);
  });

  it("updateReferences 的端点访问次数随规模线性增长（复杂度回归守门）", () => {
    const EDGE_COUNT = 200;
    const { manager } = createManager();
    const nodes = Array.from({ length: EDGE_COUNT + 1 }, (_, i) => fakeNode(`n${i}`));
    const edges = Array.from({ length: EDGE_COUNT }, (_, i) => fakeEdge(`e${i}`, nodes[i], nodes[i + 1]));
    for (const node of nodes) {
      manager.add(node as never, true);
    }
    for (const edge of edges) {
      manager.add(edge as never, true);
    }

    manager.updateReferences();

    const sourceReads = edges.reduce((sum, edge) => sum + edge.sourceReadCount, 0);
    // 旧实现的二重循环会读取“实体数 × 边数”次（201 × 200 ≈ 4 万次），
    // 线性实现只读常量级次数；留 4 倍余量后依然能挡住退回非线性的改动。
    expect(sourceReads).toBeLessThanOrEqual(EDGE_COUNT * 4);
  });

  it("add(obj, true) 跳过引用刷新，供批量导入使用", () => {
    const { manager } = createManager();
    const spy = vi.spyOn(manager, "updateReferences");

    manager.add(fakeNode("a") as never, true);
    manager.add(fakeNode("b") as never, true);
    // 批量阶段不刷新：这是导入器把 O(N³) 降下来的前提
    expect(spy).not.toHaveBeenCalled();

    // 默认行为不变：不传第二参仍然是插入后立即刷新
    manager.add(fakeNode("c") as never);
    expect(spy).toHaveBeenCalledTimes(1);

    // 批量结束后显式补一次，索引与舞台一致
    manager.updateReferences();
    expect(manager.getEntities().length).toBe(3);
    expect(manager.get("c")).toBeDefined();
  });

  it("connectEntityFast 支持批量模式，默认行为不变", () => {
    const { manager, project } = createManager();
    const connector = new NodeConnector(project as never);
    const a = fakeNode("a");
    const b = fakeNode("b");
    manager.add(a as never, true);
    manager.add(b as never, true);

    const spy = vi.spyOn(manager, "updateReferences");
    connector.connectEntityFast(a as never, b as never, "", true);
    expect(spy).not.toHaveBeenCalled();

    connector.connectEntityFast(a as never, b as never);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(manager.getAssociations().length).toBe(2);
  });

  it("runBatch 在作用域内只刷新一次，嵌套时由最外层统一刷新", () => {
    const { manager, historyBatchCalls } = createManager();
    const spy = vi.spyOn(manager, "updateReferences");

    manager.runBatch(() => {
      manager.add(fakeNode("a") as never);
      manager.add(fakeNode("b") as never);
      manager.runBatch(() => {
        manager.add(fakeNode("c") as never);
      });
      manager.add(fakeNode("d") as never);
    });

    // 4 次插入 + 1 次嵌套作用域，总共只刷新 1 次
    expect(spy).toHaveBeenCalledTimes(1);
    expect(manager.getEntities().length).toBe(4);
    // 作用域退出后引用已是最新
    expect(manager.get("d")).toBeDefined();
    // 同时把"合并历史"的职责委托给 HistoryManager（真实合并逻辑由其自身单测覆盖）
    expect(historyBatchCalls.length).toBe(1);
  });

  it("逐条 add（不在作用域内）不会触发历史合并", () => {
    const { manager, historyBatchCalls, recordStepCalls } = createManager();
    manager.add(fakeNode("a") as never);
    manager.updateReferences();

    expect(historyBatchCalls.length).toBe(0);
    expect(recordStepCalls.length).toBe(0);
  });

  it("runBatch 遇到异常时仍会刷新，且把异常继续抛出", () => {
    const { manager } = createManager();
    const spy = vi.spyOn(manager, "updateReferences");

    expect(() =>
      manager.runBatch(() => {
        manager.add(fakeNode("a") as never);
        throw new Error("导入第 3 行出错");
      }),
    ).toThrow("导入第 3 行出错");

    expect(spy).toHaveBeenCalledTimes(1);
    // 抛错前已插入的对象仍在舞台上（与批量化之前的部分导入语义一致）
    expect(manager.getEntities().length).toBe(1);
    // 作用域状态已复位：后续普通 add 仍会正常刷新
    spy.mockClear();
    manager.add(fakeNode("b") as never);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(manager.getEntities().length).toBe(2);
  });

  it("背景图过滤语义保持不变（索引分桶后运行时字段仍在调用处判定）", () => {
    const { manager } = createManager();
    const normalImage = fakeNode("img-normal", stageObjects.ImageNode) as FakeNode & { isBackground: boolean };
    const backgroundImage = fakeNode("img-bg", stageObjects.ImageNode) as FakeNode & { isBackground: boolean };
    const textNode = fakeNode("text-1");
    backgroundImage.isBackground = true;
    normalImage.isBackground = false;
    for (const node of [normalImage, backgroundImage, textNode]) {
      manager.add(node as never, true);
    }

    // getConnectableEntity：排除背景图，但保留普通图片与文本节点
    expect(manager.getConnectableEntity()).toEqual([normalImage, textNode]);
    // 索引分桶本身不做过滤，背景图仍在桶里
    expect(manager.getImageNodes()).toEqual([normalImage, backgroundImage]);

    // 运行时把 isBackground 改掉后，查询结果必须立即跟随变化（不能是被索引缓存的旧值）
    backgroundImage.isBackground = false;
    expect(manager.getConnectableEntity()).toEqual([normalImage, backgroundImage, textNode]);

    // getConnectableEntityByUUID：背景图不参与连线
    backgroundImage.isBackground = true;
    expect(manager.getConnectableEntityByUUID("img-bg")).toBeNull();
    expect(manager.getConnectableEntityByUUID("img-normal")).toBe(normalImage);
    expect(manager.getConnectableEntityByUUID("text-1")).toBe(textNode);

    // getSelectedEntities：选中背景图时不应被算作选中实体
    backgroundImage.isSelected = true;
    textNode.isSelected = true;
    expect(manager.getSelectedEntities()).toEqual([textNode]);
  });

  it("updateReferences 的多重边散开：几何组内按 uuid 对称分配 shiftingIndex", () => {
    const { manager } = createManager();
    const a = fakeNode("node-a");
    const b = fakeNode("node-b");
    manager.add(a as never, true);
    manager.add(b as never, true);

    // 同一几何组的 4 条同向边（端点比率相同）
    const edges = ["e1", "e2", "e3", "e4"].map((uuid) => fakeEdge(uuid, a, b));
    for (const edge of edges) {
      manager.add(edge as never, true);
    }
    manager.updateReferences();

    // count=4 → [-2, -1, 1, 2]，且按 uuid 字典序分配（与插入顺序无关）
    expect(edges.map((edge) => edge.shiftingIndex)).toEqual([-2, -1, 1, 2]);
  });

  it("多重边散开：奇数条含 0，双向边归入同一几何组，自环恒为 0", () => {
    const { manager } = createManager();
    const a = fakeNode("node-a");
    const b = fakeNode("node-b");
    const c = fakeNode("node-c");
    for (const node of [a, b, c]) {
      manager.add(node as never, true);
    }

    // 奇数条：count=3 → [-1, 0, 1]
    const three = ["f1", "f2", "f3"].map((uuid) => fakeEdge(uuid, a, b));
    for (const edge of three) {
      manager.add(edge as never, true);
    }
    // A→B 与 B→A 端点比率相同，应落入同一几何组（count=2 → [-1, 1]）
    const forward = fakeEdge("g1", a, c);
    const backward = fakeEdge("g2", c, a);
    manager.add(forward as never, true);
    manager.add(backward as never, true);
    // 自环
    const selfLoop = fakeEdge("h1", b, b);
    manager.add(selfLoop as never, true);

    manager.updateReferences();

    expect(three.map((edge) => edge.shiftingIndex)).toEqual([-1, 0, 1]);
    expect([forward.shiftingIndex, backward.shiftingIndex]).toEqual([-1, 1]);
    expect(selfLoop.shiftingIndex).toBe(0);
  });

  it("多重边散开：端点比率不同则分属不同几何组，各自为 0", () => {
    const { manager } = createManager();
    const a = fakeNode("node-a");
    const b = fakeNode("node-b");
    manager.add(a as never, true);
    manager.add(b as never, true);

    const edgeCenter = fakeEdge("k1", a, b);
    const edgeLeft = fakeEdge("k2", a, b);
    edgeLeft.sourceRectangleRate = new Vector(0.01, 0.5);
    manager.add(edgeCenter as never, true);
    manager.add(edgeLeft as never, true);

    manager.updateReferences();

    // 两者几何组不同 → 各自 count=1 → 都是 0
    expect(edgeCenter.shiftingIndex).toBe(0);
    expect(edgeLeft.shiftingIndex).toBe(0);
  });

  it("逐条 add 不会退化成灾难级耗时（性能烟测）", () => {
    const N = 600;
    const { manager } = createManager();
    const nodes = Array.from({ length: N }, (_, i) => fakeNode(`n${i}`));

    const start = performance.now();
    for (let i = 0; i < N; i++) {
      manager.add(nodes[i] as never);
      if (i > 0) {
        manager.add(fakeEdge(`e${i}`, nodes[i - 1], nodes[i]) as never);
      }
    }
    const elapsed = performance.now() - start;

    expect(manager.getEntities().length).toBe(N);
    // 实测：线性实现约 0.6s，旧的非线性实现约 17s。
    // 上限刻意宽松以适配慢速 CI，只为挡住灾难级回归；精确的复杂度守卫见上方用例。
    expect(elapsed).toBeLessThan(10_000);
  });
});

describe("ConnectNodeSmartTools 批量连线（端到端）", () => {
  it("全连接只刷新一次引用，并生成 k×(k-1) 条连线", () => {
    const { manager, project } = createManager();
    const K = 12;
    const nodes = Array.from({ length: K }, (_, i) => fakeNode(`n${i}`));
    for (const node of nodes) {
      manager.add(node as never, true);
    }
    const mutable = project as unknown as Record<string, unknown>;
    mutable.historyManager = createHistoryStub();
    mutable.graphMethods = { isConnected: () => true };
    mutable.nodeConnector = {
      connectConnectableEntity: (from: FakeNode, to: FakeNode) => {
        manager.add(fakeEdge(`e-${from.uuid}-${to.uuid}`, from, to) as never);
      },
    };
    for (const node of nodes) {
      node.isSelected = true;
    }

    const spy = vi.spyOn(manager, "updateReferences");
    ConnectNodeSmartTools.connectAll(mutable as never);

    expect(manager.getLineEdges().length).toBe(K * (K - 1));
    // 旧实现会做 K×(K-1) 次全量刷新（k=40、1500 节点场景实测 5.2s），现在只刷新 1 次
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("全连接只产生一条历史（真实连线器每条边都会记历史）", () => {
    const { manager, project } = createManager();
    const K = 12;
    const nodes = Array.from({ length: K }, (_, i) => fakeNode(`n${i}`));
    for (const node of nodes) {
      manager.add(node as never, true);
    }
    const historyStub = createHistoryStub();
    const mutable = project as unknown as Record<string, unknown>;
    mutable.historyManager = historyStub;
    mutable.graphMethods = { isConnected: () => true };
    // 模拟真实 NodeConnector.connectConnectableEntity：加边 + 记历史（与 StageManager.connectEntity 一致）
    mutable.nodeConnector = {
      connectConnectableEntity: (from: FakeNode, to: FakeNode) => {
        manager.add(fakeEdge(`h-${from.uuid}-${to.uuid}`, from, to) as never);
        (
          mutable.historyManager as {
            recordStep: () => void;
          }
        ).recordStep();
      },
    };
    for (const node of nodes) {
      node.isSelected = true;
    }

    ConnectNodeSmartTools.connectAll(mutable as never);

    expect(manager.getLineEdges().length).toBe(K * (K - 1));
    // 关键：132 次 recordStep 被合并成 1 条历史（这曾导致大工程下卡死十几秒）
    expect(historyStub.recordStepCount).toBe(1);
  });
});

describe("TreeImporter 批量导入（端到端）", () => {
  it("导入过程中只刷新一次引用，且节点/连线数量正确", () => {
    const { manager, project } = createManager();
    const layoutCalls: unknown[] = [];
    const mutableProject = project as unknown as Record<string, unknown>;
    mutableProject.autoLayoutFastTree = {
      autoLayoutFastTreeMode: (root: unknown) => layoutCalls.push(root),
    };
    const spy = vi.spyOn(manager, "updateReferences");

    const importer = new TreeImporter(mutableProject as never);
    importer.import(["a", "  b", "  c", "    d"].join("\n"), 2, Vector.getZero());

    // 4 行文本 → 1 个 root + 4 个内容节点
    expect(manager.getTextNodes().length).toBe(5);
    // 每一行与其父节点之间一条连线 → 4 条
    expect(manager.getLineEdges().length).toBe(4);
    // 整批导入只在末尾刷新一次（旧实现是每插入一个对象刷新一次，共 9 次）
    expect(spy).toHaveBeenCalledTimes(1);
    expect(layoutCalls.length).toBe(1);
  });
});
