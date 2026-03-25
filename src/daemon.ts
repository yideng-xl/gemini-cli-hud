/**
 * Gemini CLI HUD — Daemon process (v3: DECSTBM bottom overlay)
 *
 * Uses DECSTBM to reserve the bottom 2 terminal rows for the HUD.
 * Gemini CLI's content and Ink UI scroll within the region above.
 * When content fills the screen, the HUD is right below Gemini's UI.
 */

import fs   from 'fs';
import net  from 'net';
import path from 'path';
import { execSync } from 'child_process';

const SOCKET_PATH = '/tmp/gemini-cli-hud.sock';
const LOG_FILE = '/tmp/gemini-hud-debug.log';
const HUD_HEIGHT = 2;
const MAX_LOG_SIZE = 50 * 1024; // 50KB

// Get workspace name from CWD
const workspace = path.basename(process.cwd());

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_SIZE) {
      fs.truncateSync(LOG_FILE, 0);
    }
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* ignore */ }
}

// Context window sizes by model prefix (tokens)
const MODEL_CONTEXT: Record<string, number> = {
  'gemini-2.0-flash-exp': 1_000_000,
  'gemini-2.0-flash':     1_000_000,
  'gemini-2.0-pro':       2_000_000,
  'gemini-1.5-pro':       2_000_000,
  'gemini-1.5-flash':     1_000_000,
  'gemini-flash':         1_000_000,
  'gemini-pro':           2_000_000,
};

interface HUDState {
  model: string;
  tokens: { used: number; total: number };
  tools: Record<string, number>;
  sessionStart: number;
  lastUpdated: number;
}

let state: HUDState = {
  model: 'gemini-2.0-flash',
  tokens: { used: 0, total: 1_000_000 },
  tools: {},
  sessionStart: Date.now(),
  lastUpdated: Date.now(),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getContextSize(model: string): number {
  const m = model.toLowerCase();
  for (const [prefix, size] of Object.entries(MODEL_CONTEXT)) {
    if (m.includes(prefix)) return size;
  }
  return 1_000_000;
}

function getTerminalSize(): { rows: number; cols: number } {
  try {
    const out = execSync('stty size </dev/tty 2>/dev/null', {
      encoding: 'utf8',
      timeout: 500,
    }).trim();
    const parts = out.split(' ');
    const r = parseInt(parts[0], 10);
    const c = parseInt(parts[1], 10);
    if (r > 4 && c > 20) return { rows: r, cols: c };
  } catch { /* fall through */ }
  return { rows: 24, cols: 80 };
}

function formatElapsed(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

function createProgressBar(pct: number, width: number): string {
  const fullBlocks = Math.floor((pct / 100) * width);
  const partials = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
  const remainder = ((pct / 100) * width) - fullBlocks;
  const partialIdx = Math.floor(remainder * 8);
  
  const bar = '█'.repeat(fullBlocks) + 
              (fullBlocks < width ? partials[partialIdx] : '') + 
              ' '.repeat(Math.max(0, width - fullBlocks - 1));
  
  // Apply colors based on usage
  let color = '\x1b[32m'; // Green
  if (pct > 70) color = '\x1b[33m'; // Yellow
  if (pct > 90) color = '\x1b[31m'; // Red
  
  return `${color}${bar}\x1b[0m`;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function buildTitle(): string {
  const { used, total } = state.tokens;
  const pct   = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const short = state.model.replace(/^models\//, '').replace(/-preview$|-latest$/, '');
  const toolCount = Object.values(state.tools).reduce((a, b) => a + b, 0);
  return `💎 ${short} | ${pct}% | ${toolCount} tools`;
}

// ─── Event processing ───────────────────────────────────────────────────────

function processEvent(event: Record<string, unknown>): void {
  const name = event['hook_event_name'] as string | undefined;
  state.lastUpdated = Date.now();

  switch (name) {
    case 'SessionStart':
      state.tools        = {};
      state.tokens.used  = 0;
      state.sessionStart = Date.now();
      break;

    case 'AfterModel': {
      const req   = event['llm_request']  as Record<string, unknown> | undefined;
      const res   = event['llm_response'] as Record<string, unknown> | undefined;
      const usage = res?.['usageMetadata'] as Record<string, number>  | undefined;

      if (req?.['model']) {
        state.model        = req['model'] as string;
        state.tokens.total = getContextSize(state.model);
      }
      if (usage?.['totalTokenCount']) {
        state.tokens.used = usage['totalTokenCount'];
      } else if (usage?.['promptTokenCount']) {
        state.tokens.used = usage['promptTokenCount'];
      }
      break;
    }

    case 'AfterTool': {
      const toolName = event['tool_name'] as string | undefined;
      if (toolName) {
        state.tools[toolName] = (state.tools[toolName] ?? 0) + 1;
      }
      break;
    }
  }
}

// ─── Socket server ──────────────────────────────────────────────────────────

if (fs.existsSync(SOCKET_PATH)) {
  try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
}

const server = net.createServer((socket) => {
  let buf = '';
  socket.on('data',  (d) => { buf += d.toString(); });
  socket.on('error', () => { /* ignore client errors */ });
  socket.on('end',   ()  => {
    try {
      const event = JSON.parse(buf) as Record<string, unknown>;
      processEvent(event);
      
      const title = buildTitle();
      socket.write(JSON.stringify({ title }));
      socket.end();
    } catch { /* ignore malformed JSON */ }
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
    server.listen(SOCKET_PATH);
  }
});

server.listen(SOCKET_PATH);

// ─── Graceful shutdown ──────────────────────────────────────────────────────

function shutdown(): void {
  server.close();
  try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
process.on('uncaughtException', (e) => {
  log(`Uncaught: ${e}`);
});
