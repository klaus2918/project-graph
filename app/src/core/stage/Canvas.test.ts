// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/service/Settings", () => ({
  Settings: { antialiasing: "disabled" },
}));

// Canvas 只把 Project 当类型、把 service 当装饰器用；真实模块会经渲染链拉入 CSS 与 Tauri 依赖，
// 在单测环境不可加载（Unknown file extension ".css"），因此这里只提供最小替身。
vi.mock("@/core/Project", () => ({
  Project: class Project {},
  service: () => (target: unknown) => target,
}));

vi.mock("@/state", () => ({
  store: { get: () => undefined },
  activeTabAtom: {},
}));

import { Canvas } from "@/core/stage/Canvas";

const fakeContext = { imageSmoothingEnabled: true } as unknown as CanvasRenderingContext2D;

function createFakeProject() {
  return {
    loop: vi.fn(),
    isRunning: false,
    controller: { pressingKeySet: new Set<string>() },
  };
}

function createCanvas() {
  const element = document.createElement("canvas");
  vi.spyOn(element, "getContext").mockReturnValue(fakeContext);
  return new Canvas(createFakeProject() as never, element);
}

/**
 * dispose 必须按“同一函数引用”解绑事件监听器。
 * 否则关闭后的工程会被 window / canvas 元素上的闭包钉住无法回收，
 * 内存随会话内开关工程的次数单调上涨（表现为用一段时间后假死）。
 */
describe("Canvas 事件监听器生命周期", () => {
  it("dispose 会用同一引用解绑 window 与元素上的监听器", () => {
    const windowAdd = vi.spyOn(window, "addEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const elementAdd = vi.spyOn(HTMLCanvasElement.prototype, "addEventListener");
    const elementRemove = vi.spyOn(HTMLCanvasElement.prototype, "removeEventListener");

    const windowAddBefore = windowAdd.mock.calls.length;
    const windowRemoveBefore = windowRemove.mock.calls.length;
    const elementAddBefore = elementAdd.mock.calls.length;
    const elementRemoveBefore = elementRemove.mock.calls.length;

    const canvas = createCanvas();
    canvas.dispose();

    const addedWindow = windowAdd.mock.calls.slice(windowAddBefore);
    const removedWindow = windowRemove.mock.calls.slice(windowRemoveBefore);
    const addedElement = elementAdd.mock.calls.slice(elementAddBefore);
    const removedElement = elementRemove.mock.calls.slice(elementRemoveBefore);

    // 构造函数注册：window 上 keydown / keyup / blur，元素上 mousemove / focus
    expect(addedWindow.length).toBe(3);
    expect(addedElement.length).toBe(2);

    for (const [type, listener] of addedWindow) {
      expect(
        removedWindow.some(([removedType, removedListener]) => removedType === type && removedListener === listener),
      ).toBe(true);
    }
    for (const [type, listener] of addedElement) {
      expect(
        removedElement.some(([removedType, removedListener]) => removedType === type && removedListener === listener),
      ).toBe(true);
    }
  });

  it("反复创建并销毁时，window 上的监听器净增为 0", () => {
    const windowAdd = vi.spyOn(window, "addEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");

    const windowAddBefore = windowAdd.mock.calls.length;
    const windowRemoveBefore = windowRemove.mock.calls.length;

    for (let i = 0; i < 3; i++) {
      createCanvas().dispose();
    }

    // 每个画布注册 3 个 window 监听器，销毁后净增必须为 0
    expect(windowAdd.mock.calls.length - windowAddBefore).toBe(9);
    expect(windowRemove.mock.calls.length - windowRemoveBefore).toBe(9);
  });
});
