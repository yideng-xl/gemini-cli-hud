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
import { spawn }         from 'child_process';

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

async function sendEvent(event: Record<string, unknown>): Promise<void> {
  return new Promise<void>((resolve) => {
    const client = net.createConnection(SOCKET_PATH, () => {
      client.write(JSON.stringify(event));
      client.end();
    });
    client.on('close', resolve);
    client.on('error', resolve);
    // Bail out if socket is unresponsive
    setTimeout(resolve, 500);
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
