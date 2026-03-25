#!/bin/bash

# Gemini CLI HUD 安装脚本
# 目标：将扩展部署到 ~/.gemini/extensions

EXT_NAME="gemini-cli-hud"
TARGET_DIR="$HOME/.gemini/extensions/$EXT_NAME"

echo "正在准备安装 $EXT_NAME..."

# 创建目标目录
mkdir -p "$TARGET_DIR"

# 复制文件到目标目录
if [ -d "dist" ]; then
    cp -R dist/* "$TARGET_DIR/"
    cp gemini-extension.json "$TARGET_DIR/"
    cp -R hooks "$TARGET_DIR/"
    echo "成功将扩展安装到 $TARGET_DIR"
else
    echo "错误：未发现 dist 目录，请先运行 pnpm run build"
    exit 1
fi

echo "------------------------------------------------"
echo "安装完成！"
echo "HUD 守护进程将在下一次运行 Gemini CLI 时自动启动。"
echo "日志文件位置: /tmp/gemini-cli-hud-daemon.log"
echo "------------------------------------------------"
