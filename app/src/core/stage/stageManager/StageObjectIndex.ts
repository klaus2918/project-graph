import { Association } from "@/core/stage/stageObject/abstract/Association";
import { ConnectableEntity } from "@/core/stage/stageObject/abstract/ConnectableEntity";
import { StageObject } from "@/core/stage/stageObject/abstract/StageObject";
import { Entity } from "@/core/stage/stageObject/abstract/StageEntity";
import { ArcEdge } from "@/core/stage/stageObject/association/ArcEdge";
import { CubicCatmullRomSplineEdge } from "@/core/stage/stageObject/association/CubicCatmullRomSplineEdge";
import { Edge } from "@/core/stage/stageObject/association/Edge";
import { LineEdge } from "@/core/stage/stageObject/association/LineEdge";
import { MultiTargetUndirectedEdge } from "@/core/stage/stageObject/association/MutiTargetUndirectedEdge";
import { SyncAssociation } from "@/core/stage/stageObject/association/SyncAssociation";
import { ConnectPoint } from "@/core/stage/stageObject/entity/ConnectPoint";
import { ImageNode } from "@/core/stage/stageObject/entity/ImageNode";
import { LatexNode } from "@/core/stage/stageObject/entity/LatexNode";
import { PenStroke } from "@/core/stage/stageObject/entity/PenStroke";
import { Section } from "@/core/stage/stageObject/entity/Section";
import { SvgNode } from "@/core/stage/stageObject/entity/SvgNode";
import { TextNode } from "@/core/stage/stageObject/entity/TextNode";
import { UrlNode } from "@/core/stage/stageObject/entity/UrlNode";

/**
 * 舞台对象容器索引。
 *
 * 舞台数据本身仍然存放在 `project.stage` 这个普通数组里，本类只是它的“派生视图”：
 * 一次性遍历舞台，按类型分桶并建立 uuid → 对象的映射，把原来每次调用都要
 * `stage.filter(x => x instanceof Xxx)` 的 O(N) 扫描、以及 `stage.find(x => x.uuid === id)`
 * 的 O(N) 线性查找，降为 O(1) 取桶 / 查表。
 *
 * 失效策略（廉价指纹）：
 * `stage` 的引用、长度、首/中/尾三个位置的元素，任一变化都会触发整体重建。
 * 首中尾三点采样而不是只看首尾，是因为“长度不变、首尾也不变、只替换中间元素”
 * 这种原地替换曾经能骗过索引（已用测试锁住）。
 * 现有代码对舞台的所有变更方式（`push` / `splice` / `length = 0` / 整体重新赋值）
 * 都会命中其中之一，因此即使将来有人绕过 StageManager 直接改数组，索引也会自动自愈。
 *
 * 已知边界：理论上可以用“长度、首、中、尾四项全部相同”的协同替换骗过索引。
 * 目前仓库内不存在这种写法（已全量检索：无 `stage[i] =` 原地写），
 * 若将来出现，应改为显式的版本号/增量通知，而不是继续加采样点。
 *
 * 注意：分桶只依据“类型”这一类静态属性；
 * 任何依赖运行时可变字段（如 `ImageNode.isBackground`）的过滤都必须在调用方做，
 * 否则会出现索引与真实状态不一致的问题。
 */
export class StageObjectIndex {
  private source: StageObject[] | null = null;
  private sourceLength = -1;
  private sourceFirst: StageObject | null = null;
  private sourceMiddle: StageObject | null = null;
  private sourceLast: StageObject | null = null;

  /**
   * 索引重建次数（单调递增）。
   * 对外作为 O(1) 的「舞台结构是否变化」信号使用：
   * 一旦有人绕过 StageManager 直接改数组，指纹会触发重建，计数随之增加。
   */
  private rebuildCount = 0;

  get revision(): number {
    return this.rebuildCount;
  }

  /** uuid → 舞台对象，重复 uuid 时保留先出现的那个（与原 `stage.find` 语义一致） */
  readonly byUuid = new Map<string, StageObject>();
  private readonly entityByUuid = new Map<string, Entity>();
  private readonly connectableEntityByUuid = new Map<string, ConnectableEntity>();

  /** 全部实体（不含关系） */
  readonly entities: Entity[] = [];
  /** 全部可连接实体（含作为背景图的 ImageNode，调用方按需过滤） */
  readonly connectableEntities: ConnectableEntity[] = [];
  readonly associations: Association[] = [];
  readonly edges: Edge[] = [];
  readonly lineEdges: LineEdge[] = [];
  readonly crEdges: CubicCatmullRomSplineEdge[] = [];
  readonly arcEdges: ArcEdge[] = [];
  readonly multiTargetUndirectedEdges: MultiTargetUndirectedEdge[] = [];
  readonly syncAssociations: SyncAssociation[] = [];
  readonly sections: Section[] = [];
  readonly textNodes: TextNode[] = [];
  readonly imageNodes: ImageNode[] = [];
  readonly connectPoints: ConnectPoint[] = [];
  readonly urlNodes: UrlNode[] = [];
  readonly penStrokes: PenStroke[] = [];
  readonly svgNodes: SvgNode[] = [];
  readonly latexNodes: LatexNode[] = [];

  /** 必要时重建，O(1) 判断 + 摊还 O(N) 重建 */
  ensure(stage: StageObject[]): void {
    const length = stage.length;
    if (length === 0) {
      if (this.source !== stage || this.sourceLength !== 0) {
        this.rebuild(stage);
      }
      return;
    }
    const middleIndex = length >> 1;
    if (
      this.source === stage &&
      this.sourceLength === length &&
      this.sourceFirst === stage[0] &&
      this.sourceMiddle === stage[middleIndex] &&
      this.sourceLast === stage[length - 1]
    ) {
      return;
    }
    this.rebuild(stage);
  }

  private rebuild(stage: StageObject[]): void {
    this.rebuildCount++;
    this.source = stage;
    this.sourceLength = stage.length;
    this.sourceFirst = stage.length > 0 ? stage[0] : null;
    this.sourceMiddle = stage.length > 0 ? stage[stage.length >> 1] : null;
    this.sourceLast = stage.length > 0 ? stage[stage.length - 1] : null;

    this.byUuid.clear();
    this.entityByUuid.clear();
    this.connectableEntityByUuid.clear();
    this.entities.length = 0;
    this.connectableEntities.length = 0;
    this.associations.length = 0;
    this.edges.length = 0;
    this.lineEdges.length = 0;
    this.crEdges.length = 0;
    this.arcEdges.length = 0;
    this.multiTargetUndirectedEdges.length = 0;
    this.syncAssociations.length = 0;
    this.sections.length = 0;
    this.textNodes.length = 0;
    this.imageNodes.length = 0;
    this.connectPoints.length = 0;
    this.urlNodes.length = 0;
    this.penStrokes.length = 0;
    this.svgNodes.length = 0;
    this.latexNodes.length = 0;

    for (const object of stage) {
      if (!this.byUuid.has(object.uuid)) {
        this.byUuid.set(object.uuid, object);
      }
      if (object instanceof Entity) {
        if (!this.entityByUuid.has(object.uuid)) {
          this.entityByUuid.set(object.uuid, object);
        }
        this.entities.push(object);
        if (object instanceof ConnectableEntity) {
          if (!this.connectableEntityByUuid.has(object.uuid)) {
            this.connectableEntityByUuid.set(object.uuid, object);
          }
          this.connectableEntities.push(object);
        }
        if (object instanceof Section) {
          this.sections.push(object);
        } else if (object instanceof TextNode) {
          this.textNodes.push(object);
        } else if (object instanceof ImageNode) {
          this.imageNodes.push(object);
        } else if (object instanceof ConnectPoint) {
          this.connectPoints.push(object);
        } else if (object instanceof UrlNode) {
          this.urlNodes.push(object);
        } else if (object instanceof PenStroke) {
          this.penStrokes.push(object);
        } else if (object instanceof SvgNode) {
          this.svgNodes.push(object);
        } else if (object instanceof LatexNode) {
          this.latexNodes.push(object);
        }
      } else if (object instanceof Association) {
        this.associations.push(object);
        if (object instanceof SyncAssociation) {
          this.syncAssociations.push(object);
        } else if (object instanceof MultiTargetUndirectedEdge) {
          this.multiTargetUndirectedEdges.push(object);
        } else if (object instanceof Edge) {
          this.edges.push(object);
          if (object instanceof LineEdge) {
            this.lineEdges.push(object);
          } else if (object instanceof CubicCatmullRomSplineEdge) {
            this.crEdges.push(object);
          } else if (object instanceof ArcEdge) {
            this.arcEdges.push(object);
          }
        }
      }
    }
  }

  getEntityByUuid(uuid: string): Entity | undefined {
    return this.entityByUuid.get(uuid);
  }

  getConnectableEntityByUuid(uuid: string): ConnectableEntity | undefined {
    return this.connectableEntityByUuid.get(uuid);
  }
}
