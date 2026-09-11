import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  unwatch: vi.fn(),
  watch: vi.fn(),
}));
const serializer = vi.hoisted(() => ({
  serialize: vi.fn(() => []),
  deserialize: vi.fn(() => []),
}));

vi.mock("@/core/Project", () => ({
  Project: class Project {},
  ProjectState: { Saved: "saved", Unsaved: "unsaved" },
  service: (id: string) => (target: { id?: string }) => {
    target.id = id;
    return target;
  },
}));
vi.mock("@/core/service/Settings", () => ({
  Settings: {
    historyManagerMode: "memoryEfficient",
    historySize: 100,
    showDebug: false,
    watch: settings.watch,
  },
}));
vi.mock("@graphif/serializer", () => serializer);

import { HistoryManager } from "./StageHistoryManager";

function createManager() {
  return new HistoryManager({ stage: [], emit: vi.fn(), projectState: "saved" } as never);
}

describe("HistoryManager cleanup", () => {
  beforeEach(() => {
    settings.unwatch.mockReset();
    settings.watch.mockReset().mockImplementation((_key, callback) => {
      callback("memoryEfficient");
      return settings.unwatch;
    });
  });

  it("unsubscribes from Settings when the acquired service is disposed", () => {
    const manager = createManager();
    const dispose = (manager as unknown as { dispose?: () => void }).dispose;

    expect(dispose).toBeTypeOf("function");
    dispose?.call(manager);
    expect(settings.unwatch).toHaveBeenCalledOnce();
  });
});

describe("HistoryManager 批量作用域", () => {
  beforeEach(() => {
    serializer.serialize.mockClear();
    serializer.deserialize.mockClear();
    // 用 timeEfficient 模式：每次真实记录恰好一次全量序列化，便于精确断言
    settings.watch.mockReset().mockImplementation((_key, callback) => {
      callback("timeEfficient");
      return settings.unwatch;
    });
  });

  it("作用域内的多次 recordStep 合并为一条历史（只序列化一次）", () => {
    const manager = createManager();
    // 构造两个 manager 时各序列化一次初始舞台
    const baseline = serializer.serialize.mock.calls.length;

    manager.runHistoryBatch(() => {
      manager.recordStep();
      manager.recordStep();
      manager.recordStep();
    });

    // 3 次调用只产生 1 次真实记录
    expect(serializer.serialize.mock.calls.length - baseline).toBe(1);
  });

  it("嵌套作用域仍只提交一次", () => {
    const manager = createManager();
    const baseline = serializer.serialize.mock.calls.length;

    manager.runHistoryBatch(() => {
      manager.recordStep();
      manager.runHistoryBatch(() => {
        manager.recordStep();
      });
      manager.recordStep();
    });

    expect(serializer.serialize.mock.calls.length - baseline).toBe(1);
  });

  it("作用域外仍逐步记录（行为不变）", () => {
    const manager = createManager();
    const baseline = serializer.serialize.mock.calls.length;

    manager.recordStep();
    manager.recordStep();

    expect(serializer.serialize.mock.calls.length - baseline).toBe(2);
  });

  it("作用域内没有发生 recordStep 时不产生多余历史", () => {
    const manager = createManager();
    const baseline = serializer.serialize.mock.calls.length;

    manager.runHistoryBatch(() => {
      // 什么都没做
    });

    expect(serializer.serialize.mock.calls.length - baseline).toBe(0);
  });

  it("作用域内抛异常时仍提交已发生的改动，且异常继续抛出", () => {
    const manager = createManager();
    const baseline = serializer.serialize.mock.calls.length;

    expect(() =>
      manager.runHistoryBatch(() => {
        manager.recordStep();
        throw new Error("批量中途失败");
      }),
    ).toThrow("批量中途失败");

    expect(serializer.serialize.mock.calls.length - baseline).toBe(1);
    // 状态已复位：后续正常记录不受影响
    const afterBatch = serializer.serialize.mock.calls.length;
    manager.recordStep();
    expect(serializer.serialize.mock.calls.length - afterBatch).toBe(1);
  });
});
