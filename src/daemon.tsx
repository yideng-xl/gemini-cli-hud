import React from 'react';
import { render } from 'ink';
import net from 'net';
import fs from 'fs';
import { HUD } from './components/HUD.js';
import { Interceptor } from './interceptor.js';

const SOCKET_PATH = '/tmp/gemini-cli-hud.sock';
const model = process.argv[2] || 'gemini-2.0-flash';
const workspace = process.argv[3] || 'gemini-cli-hud';

const interceptor = new Interceptor();

// 清理旧的 Socket 文件
if (fs.existsSync(SOCKET_PATH)) {
  fs.unlinkSync(SOCKET_PATH);
}

const { rerender } = render(
  <HUD state={interceptor.getState()} model={model} workspace={workspace} />
);

const server = net.createServer((socket) => {
  socket.on('data', (data) => {
    try {
      const event = JSON.parse(data.toString());
      interceptor.processEvent(event);
      rerender(<HUD state={interceptor.getState()} model={model} workspace={workspace} />);
    } catch (err) {
      // 忽略非法 JSON
    }
  });
});

server.listen(SOCKET_PATH, () => {
  console.error(`HUD Daemon started on ${SOCKET_PATH}`);
});

// 优雅退出处理
process.on('SIGINT', () => {
  server.close();
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }
  process.exit();
});

process.on('SIGTERM', () => {
  server.close();
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }
  process.exit();
});
