// @vitest-environment jsdom

import { Vector } from "@graphif/data-structures";
import { Rectangle } from "@graphif/shapes";
import { describe, expect, it } from "vitest";
import { generateThumbnail } from "@/core/service/dataGenerateService/generateThumbnail";

/**
 * 只构造规模阈值判断需要的部分。
 * 真实的 Project 会连带拉起 UI 依赖树（Tauri API / CSS import），在单测环境不可用。
 */
function createProjectStub(entityCount: number, rectSize: number) {
  const entities = Array.from({ length: entityCount }, () => ({
    collisionBox: {
      getRectangle: () => new Rectangle(new Vector(0, 0), new Vector(rectSize, rectSize)),
    },
  }));
  return {
    stageManager: {
      getEntities: () => entities,
      getAssociations: () => [],
    },
  } as unknown as Parameters<typeof generateThumbnail>[0];
}

describe("generateThumbnail 规模降级", () => {
  it("实体数超过阈值时放弃本次缩略图，避免保存链路被整图渲染卡住", async () => {
    await expect(generateThumbnail(createProjectStub(2001, 100))).resolves.toBeUndefined();
  });

  it("内容包围盒超过阈值时放弃本次缩略图", async () => {
    await expect(generateThumbnail(createProjectStub(2, 30000))).resolves.toBeUndefined();
  });
});
