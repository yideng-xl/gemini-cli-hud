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
const SESSION_ID   = process.ppid || process.pid;  // Gemini CLI's PID
const SOCKET_PATH  = `/tmp/gemini-cli-hud-${SESSION_ID}.sock`;
const DAEMON_FILE  = path.join(__dirname, 'daemon.js');

// ─── Daemon lifecycle ────────────────────────────────────────────────────────

async function ensureDaemon(): Promise<void> {
  if (fs.existsSync(SOCKET_PATH)) return;          // already running
  if (!fs.existsSync(DAEMON_FILE)) return;          // not built yet

  const child = spawn(process.execPath, [DAEMON_FILE, SOCKET_PATH], {
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
      const termSize = getTerminalSize();
      client.write(JSON.stringify({ ...event, _termCols: termSize.cols, _termRows: termSize.rows }));
      client.end(); // Half-close, finish writing
    });
    
    let reply = '';
    client.on('data', (d) => { reply += d.toString(); });
    client.on('end', () => {
      try {
        const res = JSON.parse(reply) as { title?: string; bar?: string[] };

        // Set terminal title via OSC 0
        if (res.title) {
          const seq = `\x1b]0;${res.title}\x07`;
          try {
            fs.writeFileSync('/dev/tty', seq);
          } catch {
            process.stderr.write(seq);
          }
        }

        // Render bottom HUD bar
        if (res.bar && res.bar.length > 0) {
          renderHUD(res.bar);
        }
      } catch { /* ignore malformed reply */ }
      resolve();
    });

    client.on('error', () => resolve());

    setTimeout(() => resolve(), 500);
  });
}

// ─── Session cleanup ────────────────────────────────────────────────────────

function cleanupHUD(): void {
  // Reset DECSTBM scroll region and clear HUD area
  try {
    const { rows } = getTerminalSize();
    let seq = '\x1b7';     // save cursor
    seq += '\x1b[r';       // reset scroll region to full terminal
    // Clear bottom rows where HUD was
    for (let i = rows - 3; i <= rows; i++) {
      seq += `\x1b[${i};1H\x1b[2K`;
    }
    seq += '\x1b8';        // restore cursor
    fs.writeFileSync('/dev/tty', seq);
  } catch { /* ignore */ }

  // Remove socket file to signal daemon to exit
  try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
}

// ─── Terminal rendering ─────────────────────────────────────────────────────

function getTerminalSize(): { rows: number; cols: number } {
  try {
    const out = execSync('stty size </dev/tty 2>/dev/null', {
      encoding: 'utf8',
      timeout: 500,
    }).trim();
    const [r, c] = out.split(' ').map(Number);
    if (r > 4 && c > 20) return { rows: r, cols: c };
  } catch {}
  return { rows: 24, cols: 80 };
}

function renderHUD(bar: string[]): void {
  const { rows } = getTerminalSize();
  const hudHeight = bar.length;
  const scrollBottom = rows - hudHeight;

  if (scrollBottom < 4) return; // terminal too small

  let seq = '';
  seq += '\x1b7';                                // DECSC: save cursor
  seq += '\x1b[r';                               // Reset scroll region (clear old)
  // Clear all rows from new HUD position to bottom
  for (let i = scrollBottom + 1; i <= rows; i++) {
    seq += `\x1b[${i};1H\x1b[2K`;
  }
  seq += `\x1b[1;${scrollBottom}r`;              // DECSTBM: set scroll region

  for (let i = 0; i < bar.length; i++) {
    seq += `\x1b[${scrollBottom + 1 + i};1H`;   // CUP: move to HUD row
    seq += bar[i];
  }

  seq += '\x1b8';                                // DECRC: restore cursor

  try {
    fs.writeFileSync('/dev/tty', seq);
  } catch { /* ignore tty write errors */ }
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
    if (event['hook_event_name'] === 'SessionEnd') {
      cleanupHUD();
    } else {
      await ensureDaemon();
      await sendEvent(event);
    }
  } catch { /* never block Gemini CLI */ }

  // Gemini CLI requires a valid JSON response on stdout
  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
});
