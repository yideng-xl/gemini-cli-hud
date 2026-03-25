import net from 'net';
import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOCKET_PATH = '/tmp/gemini-cli-hud.sock';

async function main() {
  const input = await readStdin();
  if (!input) return;

  try {
    const data = JSON.parse(input);
    const event = transformEvent(data);
    
    if (event) {
      await ensureDaemonRunning();
      await sendToDaemon(event);
    }
  } catch (err) {
    // 忽略错误，确保不阻塞 CLI
  }

  // Hook 必须输出有效的 JSON 到 stdout
  console.log(JSON.stringify({ decision: 'allow' }));
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

async function sendToDaemon(event: any) {
  return new Promise((resolve) => {
    const client = net.createConnection(SOCKET_PATH, () => {
      client.write(JSON.stringify(event));
      client.end();
      resolve(true);
    });
    
    client.on('error', () => {
      resolve(false);
    });
  });
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    // 设置超时防止悬挂
    setTimeout(() => resolve(data), 500);
  });
}

function transformEvent(data: any): any {
  // 处理 AfterModel (Token 使用情况)
  if (data.llm_response && data.llm_response.usageMetadata) {
    return {
      type: 'usage',
      usedTokens: data.llm_response.usageMetadata.totalTokenCount,
      totalTokens: 1000000 
    };
  }

  // 处理 AfterTool (工具调用次数)
  if (data.tool_name) {
    return {
      type: 'tool',
      toolName: data.tool_name
    };
  }

  return null;
}

main();
