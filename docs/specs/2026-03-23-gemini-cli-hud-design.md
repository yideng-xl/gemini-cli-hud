# Gemini CLI HUD 独立扩展设计规范 (2026-03-23)

## 1. 核心目标
构建一个独立、无感、自动运行的 Gemini CLI 终端状态栏（HUD），模仿 `claude-hud` 的交互体验，为用户提供实时 Token 使用率和工具活动监控。

## 2. 关键特性
- **独立性**：不依赖 `superpowers` 扩展，作为原生扩展运行在 `~/.gemini/extensions`。
- **自动加载**：利用 Gemini CLI 的扩展扫描机制，启动即运行。
- **实时监控**：挂钩核心事件流，抓取 Token 消耗和工具调用频次。
- **粘性 UI**：使用 Ink (React) 确保 HUD 始终位于终端底部，不干扰正常对话流。

## 3. 技术方案
- **UI 框架**：Ink (React for CLI)。
- **渲染控制**：定制化 `log-update` 逻辑，处理输出流冲突。
- **数据源**：拦截 Gemini CLI 内部状态或事件总线。

## 4. 视觉设计 (参考 claude-hud)
- **左侧**：[模型版本] | 工作空间 | 运行时间
- **中间**：Context 进度条 (已用% / 剩余% ) | Usage 进度条
- **右侧**：活跃文件数 | 工具调用统计 (Bash xN, Read xN, etc.)
