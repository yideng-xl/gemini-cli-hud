import { jsx as _jsx } from "react/jsx-runtime";
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
// 强制输出到终端 TTY
const tty = fs.createWriteStream('/dev/tty');
// 在启动时清屏并重置光标（可选，为了测试）
// tty.write('\x1b[2J\x1b[0;0H'); 
const { rerender } = render(_jsx(HUD, { state: interceptor.getState(), model: model, workspace: workspace }), { stdout: tty, debug: true });
const server = net.createServer((socket) => {
    socket.on('data', (data) => {
        try {
            const event = JSON.parse(data.toString());
            interceptor.processEvent(event);
            rerender(_jsx(HUD, { state: interceptor.getState(), model: model, workspace: workspace }));
        }
        catch (err) {
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
