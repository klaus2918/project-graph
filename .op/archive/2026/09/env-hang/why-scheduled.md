# 为什么那两个任务带「定时」

> **一句话**：那个 23:59 不是有意排的班，是 `schtasks` 命令「必须填一个时间」逼出来的占位值。

---

## 先搞清：这两个任务是什么

它们不是代码里的东西，是 Windows「任务计划程序」里的两个条目（类似 Linux 的 cron）。存在的唯一理由：**让构建脱离对话终端**。

11:32 那次编译跑着跑着断了，因为构建挂在对话的终端会话上，回合结束就被回收杀掉。交给 Windows 后台服务跑，就跟对话没关系了，关掉窗口也照样跑完。

---

## 那个 23:59 是怎么来的

`schtasks /Create` 这个命令**不接受**「只创建任务、不要排期」。你只要建任务，它就必须同时给两个参数：

| 参数  | 含义                                 |
| ----- | ------------------------------------ |
| `/SC` | 频率（这里填 `ONCE`）                |
| `/ST` | 几点跑（**必须给一个时刻，不能空**） |

于是当时的写法是 `/SC ONCE /ST 23:59` —— 随手填了当天最后一个时刻凑参数，通过校验、把任务建出来。真正启动靠的是紧接着的手动 `/Run`。

**换句话说：23:59 从来没被指望过会触发，它只是命令行为了通过校验的填充物。**

---

## 证据：创建后 1 秒就手动跑了

```
11:51:13   任务创建完成（RegistrationInfo.Date）
              ↓
11:51:14   日志首行写入 BUILD START —— 即立刻手动 /Run
              ↓
11:52:02   第二个任务 PG-LocalInstall 同样方式创建并手动启动
              ↓
（整段时间内）23:59 这个时刻从未到达过，也从未靠它触发
```

两个时间只差 1 秒，就是「建完就手动跑」的铁证。

---

## 但风险是真的，不能放着不管

占位归占位，**任务计划程序是当真的**。只要今晚 23:59 电脑还开着，它就会真的把 `build-local.ps1` 拉起来跑一遍：

- 重新构建（几分钟，占满 CPU）
- 重新静默安装，**把你正在测试的 0.0.0-dev 覆盖掉**
- 安装脚本还会等到安装包时间戳刷新后自动开装，时机很难预料

结果就是：你测到一半，环境被替换了，之前测的数据全部作废。

---

## 已彻底清理（2026-09-15 12:54）

| 项                   | 状态                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------- |
| PG-LocalBuild        | ✅ **已删除**（不只是禁用）                                                               |
| PG-LocalInstall      | ✅ **已删除**                                                                             |
| 全量扫描 `PG-*` 任务 | ✅ 零残留（`Get-ScheduledTask` + `schtasks` 双通道确认）                                  |
| nx daemon 进程       | ✅ 已停止（构建残留的常驻加速进程，PID 145428）                                           |
| 应用内自动更新       | ✅ 安全 —— `checkUpdate` 无任何调用点，且打包产物中已被 tree-shake 剔除，不会覆盖本地版本 |

现在这套 0.0.0-dev 可以安心试用，**没有任何东西会自动改动它**。

### 如果以后要重新打包

两个任务很容易重建，脚本和文档都留在 `.op\changes\env-hang\`：

```powershell
schtasks /Create /TN "PG-LocalBuild"  /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\githup-workspace\project-graph\.op\changes\env-hang\build-local.ps1"  /SC ONCE /ST 23:59 /F /IT
schtasks /Run    /TN "PG-LocalBuild"
```

或者干脆直接在当前终端跑（会占用会话，别关窗口）：

```powershell
$env:PATH = "D:\mysoft\cmake-portable\cmake\data\bin;" + $env:PATH
$env:TAURI_BUILD_ARGS = "--config D:\githup-workspace\project-graph\.op\changes\env-hang\tauri-build-local.json"
pnpm build
```

---

## 顺带发现的第二个坑

`schtasks` 默认还会设 `DisallowStartIfOnBatteries=true` —— 笔记本一旦拔掉电源，任务就**拒绝启动**。

这次没影响到，因为全程都是手动 `/Run` 触发的，不经过电源策略。但下次靠触发器跑就会踩到这个坑。

---

## 怎么自己确认

命令查（或直接看任务计划程序的图形界面）：

```powershell
Export-ScheduledTask -TaskName 'PG-LocalBuild'
```

在输出里找这一段：

```xml
<Triggers>
  <TimeTrigger>
    <StartBoundary>2026-09-15T23:59:00+08:00</StartBoundary>
    <Enabled>false</Enabled>   <!-- 关键：已失效 -->
  </TimeTrigger>
</Triggers>
```

`Enabled` 是 `false` 就说明这个定时彻底哑了。
