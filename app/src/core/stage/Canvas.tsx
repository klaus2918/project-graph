import { Project, service } from "@/core/Project";
import { Settings } from "@/core/service/Settings";
import { activeTabAtom, store } from "@/state";
import { Vector } from "@graphif/data-structures";

/**
 * 将Canvas标签和里面的ctx捏在一起封装成一个类
 */
@service("canvas")
export class Canvas {
  ctx: CanvasRenderingContext2D;
  private resizeObserver?: ResizeObserver;

  /**
   * 监听器统一保存为字段：注册与解绑必须是同一函数引用，否则 removeEventListener 会静默失败，
   * 关闭后的工程会被 window 上的闭包钉在内存里（舞台对象与历史快照都无法回收）。
   */
  private readonly handleMouseMove = () => {
    if (document.querySelector("[data-radix-popper-content-wrapper]")) {
      // workaround: 解决菜单栏弹出后鼠标移动到canvas区域，导致菜单自动关闭的问题
      return;
    }
    this.project.loop();
  };

  private readonly handleFocus = () => {
    this.element.blur();
  };

  private readonly handleWindowKeydown = (event: KeyboardEvent) => {
    // 在窗口层面拦截浏览器默认快捷键，避免触发系统/浏览器查找/搜索等行为
    // 必须在 shouldRedirectKeyboardEvent 判断之前执行，否则输入框聚焦时会被跳过
    const key = event.key;
    if (
      (event.ctrlKey && (key === "f" || key === "F" || key === "g" || key === "G" || key === "r" || key === "R")) ||
      key === "F3" ||
      key === "F5" ||
      key === "F7"
    ) {
      event.preventDefault();
    }
    if (!this.shouldRedirectKeyboardEvent()) return;
    if (this.project.isRunning) {
      this.element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: event.key,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
        }),
      );
    }
  };

  private readonly handleWindowKeyup = (event: KeyboardEvent) => {
    if (!this.shouldRedirectKeyboardEvent()) {
      this.project.controller.pressingKeySet.clear();
      return;
    }
    if (this.project.isRunning) {
      this.element.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: event.key,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
        }),
      );
    }
  };

  private readonly handleWindowBlur = () => {
    this.project.controller.pressingKeySet.clear();
  };

  private shouldRedirectKeyboardEvent(): boolean {
    return (
      store.get(activeTabAtom) === this.project &&
      !(
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true"
      )
    );
  }

  constructor(
    private readonly project: Project,
    public element: HTMLCanvasElement = document.createElement("canvas"),
  ) {
    element.tabIndex = -1;
    // 鼠标移动到画布上开始tick
    element.addEventListener("mousemove", this.handleMouseMove);
    // 重定向键盘事件
    element.addEventListener("focus", this.handleFocus);
    window.addEventListener("keydown", this.handleWindowKeydown);
    window.addEventListener("keyup", this.handleWindowKeyup);
    // 失焦时清空按下的按键
    window.addEventListener("blur", this.handleWindowBlur);
    this.ctx = element.getContext("2d")!;
    if (Settings.antialiasing === "disabled") {
      this.ctx.imageSmoothingEnabled = false;
    } else {
      this.ctx.imageSmoothingQuality = Settings.antialiasing;
    }
  }

  mount(wrapper: HTMLDivElement) {
    this.resizeObserver?.disconnect();
    wrapper.innerHTML = "";
    wrapper.appendChild(this.element);
    // 监听画布大小变化
    this.resizeObserver = new ResizeObserver(() => {
      this.project.renderer.resizeWindow(wrapper.clientWidth, wrapper.clientHeight);
    });
    this.resizeObserver.observe(wrapper);
  }

  clientToView(clientX: number, clientY: number) {
    const rect = this.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return new Vector(clientX - rect.left, clientY - rect.top);
    return new Vector(
      ((clientX - rect.left) * this.element.clientWidth) / rect.width,
      ((clientY - rect.top) * this.element.clientHeight) / rect.height,
    );
  }

  viewToClient(location: Vector) {
    const rect = this.element.getBoundingClientRect();
    const scale = this.viewToClientScale();
    return new Vector(rect.left + location.x * scale.x, rect.top + location.y * scale.y);
  }

  viewToClientScale() {
    const rect = this.element.getBoundingClientRect();
    return new Vector(
      this.element.clientWidth === 0 ? 1 : rect.width / this.element.clientWidth,
      this.element.clientHeight === 0 ? 1 : rect.height / this.element.clientHeight,
    );
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.element.removeEventListener("mousemove", this.handleMouseMove);
    this.element.removeEventListener("focus", this.handleFocus);
    window.removeEventListener("keydown", this.handleWindowKeydown);
    window.removeEventListener("keyup", this.handleWindowKeyup);
    window.removeEventListener("blur", this.handleWindowBlur);
    this.element.remove();
  }
}
