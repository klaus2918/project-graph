import { describe, expect, it } from "vitest";
import { formatSaveDiagnostics } from "@/core/service/dataFileService/saveTimingDiagnosticsFormat";

describe("保存耗时诊断文本", () => {
  it("展示总耗时、最长无响应窗口、规模口径与分段明细", () => {
    const text = formatSaveDiagnostics(
      {
        at: "2026-09-15T22:00:00.000Z",
        uri: "file:///D:/demo.prg",
        totalMs: 1234.5,
        longestBlockMs: 640,
        segments: [
          { name: "serialize", durationMs: 12.3, sinceStartMs: 12.3 },
          { name: "fs.write", durationMs: 600, sinceStartMs: 612.3 },
        ],
        scale: { entityCount: 30000, attachmentBytes: 20971520 },
      },
      "C:/logs/save-timing.log",
    );

    expect(text).toContain("总耗时：1234.5 ms");
    expect(text).toContain("最长无响应窗口：640 ms");
    expect(text).toContain("entityCount: 30000");
    expect(text).toContain("attachmentBytes: 20.00 MB");
    expect(text).toContain("fs.write: 600 ms（累计 612.3 ms）");
    expect(text).toContain("日志文件：C:/logs/save-timing.log");
  });
});
