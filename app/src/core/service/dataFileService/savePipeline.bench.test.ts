// @vitest-environment jsdom

import { Encoder } from "@msgpack/msgpack";
import { id, serializable, serialize } from "@graphif/serializer";
import { BlobReader, Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

/**
 * 保存链路离线基准（诊断用，非回归测试）。
 * 为什么需要它：第一轮在「各段耗时占比未量化」的前提下改了保存链路，用户实测仍卡死。
 * 这里先把 serialize / msgpack 编码 / zip 打包 / 附件的耗时按实体数打出来，再决定改哪里。
 *
 * 为什么用代理类而不是 TextNode 本体：真实实体类会连带拉起 UI 依赖树（Tauri API / CSS import），
 * 单测环境不可用（同 StageManager.index.test.ts 的取舍）。代理类保留真实的装饰器与嵌套结构，
 * 足以量出序列化器本身的常数成本与线性度。
 */

class BenchVector {
  @serializable
  x = 0;
  @serializable
  y = 0;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

class BenchShape {
  @serializable
  location = new BenchVector();
  @serializable
  size = new BenchVector(100, 50);
}

class BenchCollisionBox {
  @serializable
  shapes: BenchShape[] = [new BenchShape()];
}

class BenchTextNode {
  @id
  @serializable
  uuid: string;
  @serializable
  text = "benchmark text node content";
  @serializable
  collisionBox = new BenchCollisionBox();

  constructor(uuid: string) {
    this.uuid = uuid;
  }
}

class BenchEdge {
  @id
  @serializable
  uuid: string;
  @serializable
  sourceRectangleRate = new BenchVector(0.5, 0.5);
  @serializable
  targetRectangleRate = new BenchVector(0.5, 0.5);

  constructor(uuid: string) {
    this.uuid = uuid;
  }
}

type SaveMetrics = {
  entityCount: number;
  serializeMs: number;
  encodeMs: number;
  zipStageMs: number;
  zipThumbnailMs: number;
  closeMs: number;
  getDataMs: number;
  serializedBytes: number;
  encodedBytes: number;
  zipBytes: number;
};

const encoder = new Encoder();
const perEntityResults: { entityCount: number; serializeMsPerEntity: number }[] = [];

function buildStage(entityCount: number) {
  const nodes: BenchTextNode[] = [];
  for (let index = 0; index < entityCount; index++) {
    nodes.push(new BenchTextNode(`node-${index}`));
  }
  const edges: BenchEdge[] = [];
  for (let index = 0; index < Math.floor(entityCount / 2); index++) {
    edges.push(new BenchEdge(`edge-${index}`));
  }
  return [...nodes, ...edges];
}

async function measureSavePipeline(entityCount: number): Promise<SaveMetrics> {
  const stage = buildStage(entityCount);

  const t0 = performance.now();
  const serialized = serialize(stage);
  const t1 = performance.now();
  const encoded = encoder.encode(serialized);
  const t2 = performance.now();

  const uwriter = new Uint8ArrayWriter();
  const writer = new ZipWriter(uwriter, { level: 0 });
  const t3 = performance.now();
  await writer.add("stage.msgpack", new Uint8ArrayReader(encoded), { level: 0 });
  const t4 = performance.now();
  await writer.add("thumbnail.png", new BlobReader(new Blob([new Uint8Array(200 * 1024)])), { level: 0 });
  const t5 = performance.now();
  await writer.close();
  const t6 = performance.now();
  const zipBytes = (await uwriter.getData()).byteLength;
  const t7 = performance.now();

  const metrics: SaveMetrics = {
    entityCount: stage.length,
    serializeMs: t1 - t0,
    encodeMs: t2 - t1,
    zipStageMs: t4 - t3,
    zipThumbnailMs: t5 - t4,
    closeMs: t6 - t5,
    getDataMs: t7 - t6,
    serializedBytes: JSON.stringify(serialized).length,
    encodedBytes: encoded.byteLength,
    zipBytes,
  };
  perEntityResults.push({ entityCount: stage.length, serializeMsPerEntity: metrics.serializeMs / stage.length });
  console.log(
    `[save-bench] N=${stage.length} serialize=${metrics.serializeMs.toFixed(1)}ms encode=${metrics.encodeMs.toFixed(1)}ms ` +
      `zip(stage)=${metrics.zipStageMs.toFixed(1)}ms zip(thumbnail200KB)=${metrics.zipThumbnailMs.toFixed(1)}ms ` +
      `close=${metrics.closeMs.toFixed(1)}ms getData=${metrics.getDataMs.toFixed(1)}ms | ` +
      `serialized=${(metrics.serializedBytes / 1024 / 1024).toFixed(2)}MB encoded=${(metrics.encodedBytes / 1024 / 1024).toFixed(2)}MB zip=${(metrics.zipBytes / 1024 / 1024).toFixed(2)}MB`,
  );
  return metrics;
}

describe("保存链路离线基准", () => {
  it("预热：小规模先跑一遍，避免把 JIT 预热成本算进 1k 档", async () => {
    await measureSavePipeline(500);
    perEntityResults.length = 0;
    expect(perEntityResults).toHaveLength(0);
  });

  it("N=1000", async () => {
    const metrics = await measureSavePipeline(1000);
    expect(metrics.serializedBytes).toBeGreaterThan(0);
  });

  it("N=5000", async () => {
    const metrics = await measureSavePipeline(5000);
    expect(metrics.serializedBytes).toBeGreaterThan(0);
  });

  it("N=20000 且序列化耗时应随规模线性增长", async () => {
    const metrics = await measureSavePipeline(20000);
    expect(metrics.serializedBytes).toBeGreaterThan(0);
    const smallest = perEntityResults[0];
    expect(perEntityResults.length).toBe(3);
    // 线性度校验：20k 档的「单实体序列化耗时」不应比 1k 档高 4 倍以上（超过即说明存在超线性开销）
    expect(perEntityResults[2].serializeMsPerEntity).toBeLessThanOrEqual(smallest.serializeMsPerEntity * 4);
  });

  it("zip 打包 20MB 附件的耗时", async () => {
    const uwriter = new Uint8ArrayWriter();
    const writer = new ZipWriter(uwriter, { level: 0 });
    const attachment = new Blob([new Uint8Array(20 * 1024 * 1024)]);
    const t0 = performance.now();
    await writer.add("attachments/bench.bin", new BlobReader(attachment), { level: 0 });
    const attachmentMs = performance.now() - t0;
    const t1 = performance.now();
    await writer.close();
    const zipBytes = (await uwriter.getData()).byteLength;
    const closeMs = performance.now() - t1;
    console.log(
      `[save-bench] 附件 20MB：blob→zip=${attachmentMs.toFixed(1)}ms close+getData=${closeMs.toFixed(1)}ms zip=${(zipBytes / 1024 / 1024).toFixed(2)}MB`,
    );
    expect(zipBytes).toBeGreaterThan(20 * 1024 * 1024);
  });
});
