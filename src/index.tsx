import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOCKET_PATH = '/tmp/gemini-cli-hud.sock';

export interface ActionArgs {
  gemini: {
    ui: {
      statusLine: {
        draw: (text: string) => void;
      };
    };
  };
}

export async function action(args: any) {
  const { gemini } = args;
  
  // 确保守护进程正在运行
  await ensureDaemonRunning();

  if (gemini?.ui?.statusLine) {
    const model = "Gemini 1.5 Pro";
    const statusLine = `{magenta}[${model}]{/magenta} {gray}|{/gray} {yellow}HUD Active{/yellow}`;
    
    try {
      gemini.ui.statusLine.draw(statusLine);
    } catch (e) {
      // Ignore UI errors
    }
  }

  return { continue: true };
}

async function ensureDaemonRunning() {
  if (!fs.existsSync(SOCKET_PATH)) {
    // 守护进程未启动，启动它
    // 我们假设 daemon.js 在同一个目录下
    const daemonPath = path.join(__dirname, 'daemon.js');
    const out = fs.openSync('/tmp/gemini-cli-hud-daemon.log', 'a');
    
    const daemon = spawn('node', [daemonPath], {
      detached: true,
      stdio: ['ignore', out, out]
    });
    
    daemon.unref();
    
    // 等待 socket 创建
    let attempts = 0;
    while (!fs.existsSync(SOCKET_PATH) && attempts < 10) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
  }
}
