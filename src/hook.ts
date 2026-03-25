/**
 * Gemini CLI HUD — Hook entry point
 *
 * Invoked by Gemini CLI for each hook event (SessionStart, AfterModel, AfterTool).
 * Responsibilities:
 *   1. Ensure the HUD daemon is running
 *   2. Forward the event to the daemon via Unix socket
 *   3. Return {"continue": true} to Gemini CLI on stdout
 */

import fs   from 'fs';
import net  from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const SOCKET_PATH  = '/tmp/gemini-cli-hud.sock';
const DAEMON_FILE  = path.join(__dirname, 'daemon.js');

// ─── Daemon lifecycle ────────────────────────────────────────────────────────

async function ensureDaemon(): Promise<void> {
  if (fs.existsSync(SOCKET_PATH)) return;          // already running
  if (!fs.existsSync(DAEMON_FILE)) return;          // not built yet

  const child = spawn(process.execPath, [DAEMON_FILE], {
    stdio: 'ignore',
  });
  child.unref();

  // Wait up to 2s for the socket to appear
  for (let i = 0; i < 20; i++) {
    await new Promise<void>(r => setTimeout(r, 100));
    if (fs.existsSync(SOCKET_PATH)) return;
  }
}

// ─── Socket communication ────────────────────────────────────────────────────

function logHook(msg: string) {
  try {
    fs.appendFileSync('/tmp/gemini-hook-debug.log', `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

async function sendEvent(event: Record<string, unknown>): Promise<void> {
  return new Promise<void>((resolve) => {
    logHook(`Sending event: ${event['hook_event_name']}`);
    const client = net.createConnection(SOCKET_PATH, () => {
      client.write(JSON.stringify(event));
      client.end(); // Half-close, finish writing
    });
    
    let reply = '';
    client.on('data', (d) => { reply += d.toString(); });
    client.on('end', () => {
      logHook(`Received reply: ${reply}`);
      let titleToSet = '';
      try {
        const res = JSON.parse(reply) as { title?: string };
        if (res.title) {
          titleToSet = res.title;
          const seq = `\x1b]0;${res.title}\x07`;
          try {
            logHook('Attempting to write to /dev/tty directly');
            fs.writeFileSync('/dev/tty', seq);
            logHook('Successfully wrote to /dev/tty');
          } catch (e) {
            logHook(`Failed to write to /dev/tty: ${e}. Trying stderr.`);
            process.stderr.write(seq);
          }
        }
      } catch (e) {
        logHook(`Parse or process error: ${e}`);
      }
      resolve();
    });
    
    client.on('error', (e) => {
      logHook(`Socket error: ${e}`);
      resolve();
    });
    
    setTimeout(() => {
      logHook('Socket timeout');
      resolve();
    }, 500);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  return new Promise<string>((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (c: string) => { data += c; });
    process.stdin.on('end',  ()           => resolve(data));
    setTimeout(() => resolve(data), 1_000);
  });
}

async function main(): Promise<void> {
  const raw = await readStdin();

  let event: Record<string, unknown> = {};
  try {
    if (raw.trim()) event = JSON.parse(raw) as Record<string, unknown>;
  } catch { /* not JSON — pass empty event so daemon gets a heartbeat */ }

  try {
    await ensureDaemon();
    await sendEvent(event);
  } catch { /* never block Gemini CLI */ }

  // Gemini CLI requires a valid JSON response on stdout
  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
});
