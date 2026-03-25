# Gemini CLI HUD 💎

A zero-interference, title-bar observability heads-up display (HUD) for [Gemini CLI](https://github.com/google/gemini-cli). 

*Read this in other languages: [English](#english), [简体中文](#简体中文).*

---

<a id="english"></a>
## English

Gemini CLI HUD provides real-time monitoring of your Gemini CLI sessions, including:
- **Active Model** (e.g., `gemini-2.0-flash`)
- **Context Usage** (Percentage of context window used)
- **Active Tools** (How many tools have been called)

Currently, the HUD is displayed elegantly in your **Terminal Window Title Bar** to ensure zero interference with your typing and output history.

### Inspiration
This project is heavily inspired by the amazing [Claude HUD](https://github.com/jarrodwatts/claude-hud) created by [Jarrod Watts](https://github.com/jarrodwatts) for Anthropic's Claude Code. We wanted that same level of observability for Gemini CLI!

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/gemini-cli-hud.git
   cd gemini-cli-hud
   ```
2. Install dependencies and build:
   ```bash
   pnpm install
   pnpm run build
   ```
3. Install to your Gemini extensions directory:
   ```bash
   bash install.sh
   ```

### The Journey: Why Title Bar and Not Bottom HUD? (A Call to the Community)

Our original goal was to perfectly replicate Claude HUD's behavior—a sticky status bar pinned to the bottom of the terminal. However, we ran into fundamental architectural differences between Gemini CLI and Claude Code. 

Here is what we tried, why it failed, and why we need your help:

#### Attempt 1: `DECSTBM` (Scrolling Margins)
We tried using ANSI escape sequences (`DECSTBM`) to reserve the bottom 2 rows of the terminal, protecting them from scrolling. 
**Why it failed:** Gemini CLI uses the [Ink](https://github.com/vadimdemedes/ink) rendering engine. `DECSTBM` resets the terminal's internal cursor state to `(1,1)`. Ink does not know the scrolling region changed, leading to massive screen corruption, overwritten text, and jumpy cursors.

#### Attempt 2: Background Daemon with Absolute Positioning
We ran a background Node.js daemon that saved the cursor (`\x1b7`), moved to the bottom (`\x1b[H`), drew the HUD, and restored the cursor (`\x1b8`) every 100ms.
**Why it failed:** Race conditions. Because the daemon and Gemini CLI's Ink engine were writing to `/dev/tty` simultaneously, the daemon's cursor jumps would often intercept the user's keystrokes, causing text inputs and the `Enter` key to behave erratically.

#### Attempt 3: Synchronous Top-Row Rendering
We moved the HUD to the absolute top row (`\x1b[1;1H`) and only rendered it synchronously during hook events (when Ink is temporarily paused).
**Why it failed:** While this stopped the cursor race conditions, it ruined the scroll history. As terminal text scrolled upwards, our HUD would overwrite actual chat history, leaving "ghosts" of the HUD stamped throughout the scrollback buffer.

#### The Core Difference: Native vs. External
**Claude HUD works perfectly** because Anthropic provides a native `statusline API` for Claude Code plugins. The plugin injects data directly into Claude Code's internal Ink render tree. The engine knows exactly how tall the UI is and renders the input box and HUD together safely.
**Gemini CLI HUD is an external hook.** Gemini CLI's hook system spawns an isolated script (`hook.js`). It is a "black box" relative to the main UI. We have to fight Ink for control of `/dev/tty`, and Ink always wins.

#### How You Can Help!
Until Google officially exposes a UI/statusline API for Gemini CLI extensions, the **Terminal Title Bar (OSC 0)** is the only 100% safe, zero-interference way to display stats. 

If you are a terminal wizard who knows a foolproof way to inject a sticky bottom row without breaking Ink, or if you work on Gemini CLI—please open an issue or submit a PR! We'd love to make the bottom HUD a reality.

### Contributors
- **You (The Developer)** - Creator and maintainer
- **Gemini CLI (Gemini 2.0 Flash)** - AI pair programmer & co-architect (Current implementation and problem-solving)
- **Claude 3.7 Sonnet** - AI pair programmer (Initial explorations)

---

<a id="简体中文"></a>
## 简体中文

为 [Gemini CLI](https://github.com/google/gemini-cli) 打造的零干扰、基于标题栏的实时观测面板 (HUD)。

Gemini CLI HUD 可以让你在会话期间实时监控：
- **当前运行模型**（如 `gemini-2.0-flash`）
- **上下文使用量**（百分比进度）
- **工具调用统计**（已调用的工具数量）

为了确保绝不干扰你的终端输入和滚动历史，目前该 HUD 优雅地显示在**终端窗口的标题栏**中。

### 灵感来源
本项目深受 [Jarrod Watts](https://github.com/jarrodwatts) 为 Anthropic Claude Code 制作的优秀插件 [Claude HUD](https://github.com/jarrodwatts/claude-hud) 的启发。我们希望在 Gemini CLI 上也能获得同样出色的可观测性！

### 安装方法

1. 克隆仓库：
   ```bash
   git clone https://github.com/your-username/gemini-cli-hud.git
   cd gemini-cli-hud
   ```
2. 安装依赖并编译：
   ```bash
   pnpm install
   pnpm run build
   ```
3. 安装到 Gemini 扩展目录：
   ```bash
   bash install.sh
   ```

### 开发历程：为什么放在标题栏而不是底部？（寻求社区帮助）

我们最初的目标是完美复刻 Claude HUD 的体验——在终端最底部悬浮一个状态栏。然而，由于 Gemini CLI 和 Claude Code 在插件架构上的根本差异，我们遇到了一系列技术壁垒。

以下是我们的尝试、失败原因，以及为什么我们需要你的帮助：

#### 尝试 1：`DECSTBM`（设置滚动区域）
我们尝试使用 ANSI 逃逸序列（`DECSTBM`）在终端底部强行预留两行，防止其被滚动内容覆盖。
**失败原因：** Gemini CLI 底层使用 [Ink](https://github.com/vadimdemedes/ink) 渲染引擎。`DECSTBM` 在某些终端下会将光标强制重置为 `(1,1)`，且 Ink 完全不知道屏幕高度被截断了。这导致了严重的屏幕错乱和光标乱跳。

#### 尝试 2：守护进程 + 绝对坐标刷新
我们引入了一个后台守护进程，每 100ms 使用 `\x1b7` 保存光标，跳到底部画图，再 `\x1b8` 恢复光标。
**失败原因：** 严重的 Race Condition（竞态条件）。因为守护进程和 Gemini 主程序的 Ink 引擎在同时向 `/dev/tty` 写入数据。守护进程频繁的光标跳跃会打断用户的打字输入，导致回车键和字符乱飞。

#### 尝试 3：同步置顶渲染
我们放弃了后台定时器，改为只在 Hook 触发时（此时 Ink 暂停渲染）向终端的第一行（`\x1b[1;1H`）同步绘制 HUD。
**失败原因：** 破坏了历史记录。虽然解决了打字乱跳的问题，但当终端内容向上滚动时，固定在第一行的 HUD 会像盖章一样，把历史聊天记录或代码直接覆盖掉，导致往回翻阅时全是 HUD 的“残影”。

#### 核心差异：原生集成 vs 外部挂载
**Claude HUD 为什么能完美贴底？** 因为 Anthropic 官方为插件提供了 `statusline API`。插件的数据被直接注入到了 Claude Code 内部的渲染树中。官方引擎统一计算高度，统一渲染输入框和状态栏，两者和谐共处。
**Gemini CLI 的局限：** 当前的 Hook 机制仅仅是触发一个外部的、孤立的 Node 脚本（`hook.js`）。我们必须在外部与主程序的 Ink 引擎“抢夺”屏幕的控制权，这注定会导致渲染冲突。

#### 期待你的方案！
在官方开放类似于 UI 注入的 API 之前，**操作系统的终端标题栏（OSC 0）**是唯一 100% 安全、零干扰的显示方案。

如果你是终端渲染的魔法师，知道如何在外挂模式下安全地在底部绘制 HUD 而不搞崩 Ink，或者你是 Gemini CLI 的开发者——请务必提交 PR 或 Issue！我们非常希望能把真正的底部 HUD 带给所有人。

### 贡献者 (Contributors)
- **You (The Developer)** - 创作者与维护者
- **Gemini CLI (Gemini 2.0 Flash)** - AI 结对编程伙伴 & 联合架构师（当前方案实现与问题攻坚）
- **Claude 3.7 Sonnet** - AI 结对编程伙伴（早期架构探索）

