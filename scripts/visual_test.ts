import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOCKET_PATH = '/tmp/gemini-cli-hud.sock';
const LOG_FILE = '/tmp/gemini-cli-hud-daemon.log';

async function runTest() {
  console.log('--- Starting HUD Visual Test ---');

  if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

  const daemonPath = path.join(__dirname, '..', 'dist', 'daemon.js');
  const daemon = spawn('node', [daemonPath], {
    detached: true,
    stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')]
  });
  daemon.unref();

  while (!fs.existsSync(SOCKET_PATH)) {
    await new Promise(r => setTimeout(r, 100));
  }
  console.log('Daemon is running. Look at the bottom of your terminal!');

  const hookPath = path.join(__dirname, '..', 'dist', 'hook.js');

  const sendEvent = (payload: any) => {
    spawnSync('node', [hookPath], { input: JSON.stringify(payload) });
  };

  // Simulate startup
  sendEvent({ hook_event_name: 'SessionStart' });
  await new Promise(r => setTimeout(r, 1000));

  // Simulate token usage increasing
  for (let i = 1; i <= 5; i++) {
    console.log(`Update ${i}: Sending token usage...`);
    sendEvent({
      hook_event_name: 'AfterModel',
      llm_request: { model: 'models/gemini-2.0-flash' },
      llm_response: { usageMetadata: { totalTokenCount: i * 150000 } }
    });
    
    if (i % 2 === 0) {
      sendEvent({ hook_event_name: 'AfterTool', tool_name: 'Bash' });
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('Test finished. Daemon will stay alive for 10 more seconds...');
  await new Promise(r => setTimeout(r, 10000));
  
  process.kill(-daemon.pid!); 
  console.log('Daemon stopped.');
}

runTest().catch(console.error);
