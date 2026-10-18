import { appCacheDir, join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Dialog } from "@/components/ui/dialog";
import {
  formatSaveDiagnostics,
  roundSaveTimingMs,
  type SaveDiagnosticsRecord,
  type SaveSegment,
} from "./saveTimingDiagnosticsFormat";

/**
 * 保存链路耗时诊断（诊断期临时埋点，取证完成后移除，见 tasks.md 任务 6）。
 * 为什么落盘而不是 console：用户看不到控制台，agent 也读不到应用内输出；
 * 而「哪一段慢」只能取自真实环境（Tauri 写文件、画布渲染、渲染循环暂停），不能由离线基准外推。
 * 为什么单独记录「最长无响应窗口」：如果各段之和远小于冻结时长，说明冻结不在这些段里，
 * 靠 requestAnimationFrame 的实际间隔才能区分「主线程被占满」与「只是画布没重绘」。
 */

const LOG_FILE_NAME = "save-timing.log";

class SaveTimingDiagnostics {
  private active = false;
  private startedAt = 0;
  private lastMarkAt = 0;
  private segments: SaveSegment[] = [];
  private scale: Record<string, number> = {};
  private longestBlockMs = 0;
  private lastFrameAt = 0;
  private rafHandle = -1;

  public start(): void {
    this.active = true;
    this.startedAt = performance.now();
    this.lastMarkAt = this.startedAt;
    this.lastFrameAt = this.startedAt;
    this.segments = [];
    this.scale = {};
    this.longestBlockMs = 0;
    const frame = (timestamp: number) => {
      this.longestBlockMs = Math.max(this.longestBlockMs, timestamp - this.lastFrameAt);
      this.lastFrameAt = timestamp;
      this.rafHandle = requestAnimationFrame(frame);
    };
    this.rafHandle = requestAnimationFrame(frame);
  }

  /** 记录「上一个标记到此刻」的耗时，名字描述刚结束的那一步 */
  public mark(name: string): void {
    if (!this.active) return;
    const now = performance.now();
    this.segments.push({
      name,
      durationMs: roundSaveTimingMs(now - this.lastMarkAt),
      sinceStartMs: roundSaveTimingMs(now - this.startedAt),
    });
    this.lastMarkAt = now;
  }

  public setScale(key: string, value: number): void {
    if (!this.active) return;
    this.scale[key] = value;
  }

  public async finish(uri: string, options: { showDialog: boolean }): Promise<void> {
    if (!this.active) return;
    this.mark("total");
    this.active = false;
    if (this.rafHandle !== -1) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = -1;
    }
    const record: SaveDiagnosticsRecord = {
      at: new Date().toISOString(),
      uri,
      totalMs: this.segments[this.segments.length - 1]?.sinceStartMs ?? 0,
      longestBlockMs: roundSaveTimingMs(this.longestBlockMs),
      segments: this.segments,
      scale: this.scale,
    };
    const logPath = await join(await appCacheDir(), LOG_FILE_NAME);
    await writeTextFile(logPath, `${JSON.stringify(record)}\n`, { append: true });
    if (!options.showDialog) return;
    const text = formatSaveDiagnostics(record, logPath);
    const pressed = await Dialog.buttons("保存耗时诊断", text, [
      { id: "copy", label: "复制" },
      { id: "ok", label: "确定" },
    ]);
    if (pressed === "copy") {
      await navigator.clipboard.writeText(text);
    }
  }
}

/** 给不共享上面这个单例的场景（自动保存/自动备份）单独记一条，避免与手动保存互相覆盖 */
export async function appendSaveDiagnosticLog(payload: Record<string, unknown>): Promise<void> {
  const logPath = await join(await appCacheDir(), LOG_FILE_NAME);
  await writeTextFile(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n`, { append: true });
}

const diagnostics = new SaveTimingDiagnostics();

export function startSaveDiagnostics(): void {
  diagnostics.start();
}

export function markSaveSegment(name: string): void {
  diagnostics.mark(name);
}

export function setSaveScale(key: string, value: number): void {
  diagnostics.setScale(key, value);
}

export function finishSaveDiagnostics(
  uri: string,
  options: { showDialog: boolean } = { showDialog: true },
): Promise<void> {
  return diagnostics.finish(uri, options);
}
