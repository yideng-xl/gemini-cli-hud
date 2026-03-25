import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOCKET_PATH = '/tmp/gemini-cli-hud.sock';
const LOG_FILE = '/tmp/gemini-cli-hud-daemon.log';

async function runSimulation() {
  console.log('--- Starting HUD Simulation ---');

  // 1. 清理旧环境
  if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

  // 2. 启动守护进程
  const daemonPath = path.join(__dirname, '..', 'dist', 'daemon.js');
  console.log(`Starting daemon from ${daemonPath}...`);
  const daemon = spawn('node', [daemonPath], {
    detached: true,
    stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')]
  });
  daemon.unref();

  // 等待 Socket 启动
  let attempts = 0;
  while (!fs.existsSync(SOCKET_PATH) && attempts < 20) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }

  if (!fs.existsSync(SOCKET_PATH)) {
    console.error('Failed to start daemon: Socket not created.');
    process.exit(1);
  }
  console.log('Daemon is running.');

  // 3. 模拟 Hook 调用 - Token 使用情况
  console.log('Simulating AfterModel event (Usage)...');
  const hookPath = path.join(__dirname, '..', 'dist', 'hook.js');
  const usagePayload = JSON.stringify({
    llm_response: {
      usageMetadata: {
        totalTokenCount: 15200
      }
    }
  });
  
  spawnSync('node', [hookPath], { input: usagePayload });
  await new Promise(r => setTimeout(r, 500));

  // 4. 模拟 Hook 调用 - 工具调用
  console.log('Simulating AfterTool event (Bash)...');
  const toolPayload = JSON.stringify({
    tool_name: 'Bash'
  });
  spawnSync('node', [hookPath], { input: toolPayload });
  await new Promise(r => setTimeout(r, 500));

  console.log('Simulating AfterTool event (Read)...');
  const readPayload = JSON.stringify({
    tool_name: 'Read'
  });
  spawnSync('node', [hookPath], { input: readPayload });
  await new Promise(r => setTimeout(r, 500));

  // 5. 验证日志内容
  console.log('\n--- Simulation Output (Log Contents) ---');
  const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
  console.log(logContent);

  // 6. 检查状态
  if (logContent.includes('15200/1000000') && logContent.includes('Bash x1') && logContent.includes('Read x1')) {
    console.log('\n✅ SUCCESS: HUD updated correctly in simulation.');
  } else {
    console.log('\n❌ FAILURE: HUD did not reflect expected state.');
  }

  // 7. 清理
  process.kill(-daemon.pid!); 
  process.exit(0);
}

runSimulation().catch(console.error);
