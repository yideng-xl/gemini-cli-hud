<div align="center">

# Gemini CLI HUD 💎

为 [Gemini CLI](https://github.com/google/gemini-cli) 打造的零干扰、基于标题栏的实时观测面板 (HUD)。

[![npm version](https://img.shields.io/npm/v/gemini-cli-hud.svg)](https://www.npmjs.com/package/gemini-cli-hud)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

*其他语言版本: [🇬🇧 English](README.md), [🇨🇳 简体中文](README.zh-CN.md).*

</div>

---

**Gemini CLI HUD** 是一个在你的 Gemini CLI 会话后台静默运行的实时状态监控器。它能为你提供 AI 代理内部运行状态的关键上下文，同时绝不让你的终端界面变得臃肿，也不会干扰你的标准输入。

## ✨ 核心特性

- **实时上下文使用量：** 随时查看当前 Context Window 的消耗百分比。
- **活动模型追踪：** 明确知道当前是哪个模型（例如 `gemini-2.0-flash`）在为你进行推理。
- **工具观测：** 监控 AI 代理在当前 Session 中调用了多少次外部工具。
- **极致零干扰：** 独家使用操作系统层面的“终端窗口标题栏” (OSC 0) 进行显示，确保你的打字、页面滚动以及历史记录 100% 保持原样，不受任何污染。

## 🚀 安装方法

1. **克隆本仓库：**
   ```bash
   git clone https://github.com/your-username/gemini-cli-hud.git
   cd gemini-cli-hud
   ```

2. **安装依赖并进行编译：**
   ```bash
   pnpm install
   pnpm run build
   ```

3. **安装到 Gemini CLI 的扩展目录：**
   ```bash
   bash install.sh
   ```

## 🛠 开发历程：为什么选择标题栏？（寻求社区帮助）

我们最初的宏大目标，是完美复刻类似于 Claude HUD 的体验——在终端界面的最底部悬浮一个粘性状态栏。然而，我们撞上了一堵名为“底层架构差异”的高墙（Gemini CLI 与原生 UI 应用程序的区别）。

以下是我们在这个过程中进行的尝试、它们失败的原因，以及为什么我们需要你的帮助：

- **尝试 1：`DECSTBM`（设置终端滚动区域）**
  我们尝试使用 ANSI 逃逸序列 (`DECSTBM`) 强行在终端底部划出两行保护区。
  *结果：* Gemini CLI 底层使用的 [Ink](https://github.com/vadimdemedes/ink) 渲染引擎完全无法感知这种外部的滚动区域变化。这导致了灾难性的屏幕撕裂、文字被错误覆盖以及光标乱跳。
  
- **尝试 2：后台守护进程 + 绝对坐标刷新**
  我们跑了一个后台 Node.js 守护进程，让它每 100 毫秒就把光标拉到底部 (`\x1b[H`) 画一次 HUD。
  *结果：* 严重的竞态条件 (Race conditions)。由于守护进程和 Gemini CLI 的 Ink 引擎在同时抢夺对 `/dev/tty` 的写入权，导致用户的回车键和正常打字输入经常被意外拦截或打断。

- **尝试 3：同步置顶渲染**
  我们把 HUD 移到了绝对的屏幕第一行 (`\x1b[1;1H`)，并且只在 Hook 被安全触发时才进行同步渲染。
  *结果：* 破坏了历史记录。随着终端内文字不断向上滚动，这根固定在第一行的 HUD 就像印章一样，硬生生地盖在了以往的聊天记录上，导致往回翻阅历史时全是烦人的“残影”。

### 原生集成 vs 外部挂载
**Claude HUD 为什么能完美贴底？** 因为 Anthropic 官方为 Claude Code 插件提供了一套原生的 `statusline API`。插件的数据是被直接注入到了主程序的 Ink 渲染树内部的。
**Gemini CLI HUD 只是一个外部 Hook。** 我们运行在一个完全独立的隔离进程 (`hook.js`) 中，不得不在“外部”与主程序的 Ink 引擎去抢夺终端屏幕的控制权，而这种争夺注定会导致渲染冲突。

### 期待你的方案！
在官方开放类似于 UI 注入/Statusline 的 API 之前，**操作系统的终端标题栏（OSC 0）**是我们目前能找到的唯一 100% 安全、完全零干扰的显示方案。

如果你是一位终端渲染的魔法师，知道如何在外挂模式下安全地在底部注入一行代码而不搞崩 Ink，或者你恰好就是 Gemini CLI 的官方开发者——请务必提交 PR 或提出 Issue！我们非常希望能和大家一起，把真正的“底部 HUD”带给所有用户。

## 💡 灵感来源

本项目的诞生深受由 [Jarrod Watts](https://github.com/jarrodwatts) 为 Anthropic Claude Code 制作的优秀插件 [Claude HUD](https://github.com/jarrodwatts/claude-hud) 的启发。我们渴望在 Gemini CLI 生态系统中，也能拥有同样优雅的可观测性体验！

## 👥 贡献者 (Contributors)

- **You (The Developer)** - 创作者与维护者
- **Gemini CLI (Gemini 2.0 Flash)** - AI 结对编程伙伴 & 联合架构师（当前方案实现与问题攻坚）
- **Claude 3.7 Sonnet** - AI 结对编程伙伴（早期架构探索）
