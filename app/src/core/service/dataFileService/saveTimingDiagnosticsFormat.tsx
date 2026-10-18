/**
 * 保存耗时诊断的纯文本格式化（单独成文件的原因：诊断模块本身会 import Tauri API 与 UI 组件，
 * 在单测环境无法加载，把纯函数拆出来后才能被单测直接覆盖）。
 */

export type SaveSegment = {
  /** 刚结束的那一步 */
  name: string;
  durationMs: number;
  sinceStartMs: number;
};

export type SaveDiagnosticsRecord = {
  at: string;
  uri: string;
  totalMs: number;
  longestBlockMs: number;
  segments: SaveSegment[];
  scale: Record<string, number>;
};

export function roundSaveTimingMs(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatSaveDiagnostics(record: SaveDiagnosticsRecord, logPath: string): string {
  const scaleLines = Object.entries(record.scale)
    .map(([key, value]) => `  ${key}: ${key.endsWith("Bytes") ? `${(value / 1024 / 1024).toFixed(2)} MB` : value}`)
    .join("\n");
  const segmentLines = record.segments
    .map((segment) => `  ${segment.name}: ${segment.durationMs} ms（累计 ${segment.sinceStartMs} ms）`)
    .join("\n");
  return [
    `总耗时：${record.totalMs} ms`,
    `最长无响应窗口：${record.longestBlockMs} ms`,
    `工程规模：`,
    scaleLines || "  （无）",
    `分段耗时：`,
    segmentLines,
    `日志文件：${logPath}`,
  ].join("\n");
}
