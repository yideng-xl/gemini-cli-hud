# Gemini CLI HUD (Heads-Up Display)

一个为 [Gemini CLI](https://github.com/google/gemini-cli) 打造的、模仿 Claude-HUD 风格的终端状态栏扩展。

## 特性
- **实时监控**：动态展示 Token 消耗和上下文窗口进度。
- **工具统计**：统计当前会话中各工具（Bash, Read, etc.）的调用次数。
- **粘性 UI**：使用 [Ink](https://github.com/vadimdemedes/ink) 渲染，始终保持在终端底部。
- **独立无感**：作为原生扩展运行，不影响正常的对话流。

## 安装

### 1. 编译项目
确保你已安装 `pnpm`，然后运行：
```bash
pnpm install
pnpm run build
```

### 2. 一键安装
运行以下脚本将扩展部署到 `~/.gemini/extensions`：
```bash
./install.sh
```

## 工作原理
该扩展采用“守护进程 (Daemon) + 钩子 (Hooks)”架构：
1. **Hook 脚本**：Gemini CLI 在模型响应和工具执行后会触发。
2. **Daemon 进程**：通过 Unix Socket 接收 Hook 发送的数据，并负责 Ink UI 的常驻渲染。

## 开发与调试
- **日志**：`tail -f /tmp/gemini-cli-hud-daemon.log`
- **Socket**：`/tmp/gemini-cli-hud.sock`

## 许可证
MIT
